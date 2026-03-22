import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { loadInstalledExtensions, type InstalledExtension, upsertInstalledExtension } from '@/extensions/store';

type VsixManifest = {
  name?: string;
  displayName?: string;
  description?: string;
  version?: string;
  publisher?: string;
  main?: string;
};

async function pickVsixFile(): Promise<string> {
  // Prefer existing backend command if present.
  try {
    const { invoke } = await import('@tauri-apps/api/tauri');
    const p = await invoke<string | null>('open_file_dialog');
    return p ?? '';
  } catch {
    const dialog = await import('@tauri-apps/api/dialog');
    const selected = await dialog.open({
      title: 'Install Extension (.vsix)',
      multiple: false,
      filters: [{ name: 'VSIX', extensions: ['vsix'] }],
    });
    return typeof selected === 'string' ? selected : '';
  }
}

type OpenVsxSearchResult = {
  namespace: string;
  name: string;
  version: string;
  displayName?: string;
  description?: string;
  iconUrl?: string;
};

async function openVsxGetVsixUrl(namespace: string, name: string): Promise<{ url: string; version: string }> {
  const url = `https://open-vsx.org/api/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch extension failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as any;

  // Open VSX currently returns a single extension object with:
  // - version: string
  // - files.download: vsix url
  // - downloads.universal: vsix url (fallback)
  const version = typeof json?.version === 'string' ? json.version : '';
  const direct = typeof json?.files?.download === 'string' ? json.files.download : '';
  const universal = typeof json?.downloads?.universal === 'string' ? json.downloads.universal : '';
  const vsixUrl = direct || universal;
  if (!vsixUrl) throw new Error('VSIX file not found');
  return { url: vsixUrl, version };
}

async function downloadVsixToTemp(url: string, filename: string) {
  const { invoke } = await import('@tauri-apps/api/tauri');
  const path = await import('@tauri-apps/api/path');
  const fs = await import('@tauri-apps/api/fs');
  const appData = await path.appDataDir();
  const tempDir = await path.join(appData, 'temp');
  await fs.createDir(tempDir, { recursive: true });
  const savePath = await path.join(tempDir, filename);
  await invoke('download_file', { url, savePath });
  return savePath;
}

async function extractVsixToExtensionsDir(vsixPath: string, extId: string) {
  const { invoke } = await import('@tauri-apps/api/tauri');
  const path = await import('@tauri-apps/api/path');
  const fs = await import('@tauri-apps/api/fs');
  const appData = await path.appDataDir();
  const extsDir = await path.join(appData, 'extensions');
  await fs.createDir(extsDir, { recursive: true });
  const destDir = await path.join(extsDir, extId);
  await fs.createDir(destDir, { recursive: true });
  await invoke('extract_vsix', { vsixPath, destDir });
  return destDir;
}

function ExtensionIcon({
  namespace,
  name,
  label,
  iconUrl,
}: {
  namespace: string;
  name: string;
  label: string;
  iconUrl?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initial = (label || name || '?').trim().slice(0, 1).toUpperCase();
  const url =
    (iconUrl && iconUrl.trim()) ||
    `https://open-vsx.org/api/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/latest/file/icon.png`;

  if (failed) {
    return (
      <div className="w-8 h-8 rounded border border-gray-200 bg-gray-100 text-gray-700 flex items-center justify-center text-xs font-medium shrink-0">
        {initial}
      </div>
    );
  }

  return (
    <img
      src={url}
      className="w-8 h-8 rounded border border-gray-200 bg-white shrink-0 object-cover"
      alt=""
      crossOrigin="anonymous"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

async function readVsixManifest(vsixPath: string): Promise<VsixManifest> {
  const fs = await import('@tauri-apps/api/fs');
  const bytes = await fs.readBinaryFile(vsixPath);
  const zip = await JSZip.loadAsync(bytes);

  const pkg = zip.file('extension/package.json') ?? zip.file('package.json');
  if (!pkg) {
    throw new Error('VSIX missing package.json');
  }
  const content = await pkg.async('string');
  return JSON.parse(content) as VsixManifest;
}

export default function ExtensionsPanel() {
  const [installed, setInstalled] = useState<InstalledExtension[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OpenVsxSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [page, setPage] = useState(0);
  const lastRequestIdRef = useRef(0);
  const [installingId, setInstallingId] = useState('');
  const [selectedInstalledId, setSelectedInstalledId] = useState('');
  const [selectedManifest, setSelectedManifest] = useState<VsixManifest | null>(null);

  useEffect(() => {
    setInstalled(loadInstalledExtensions());
  }, []);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    setSearching(true);
    setError('');
    try {
      const rid = ++lastRequestIdRef.current;
      const url = `https://open-vsx.org/api/-/search?query=${encodeURIComponent(q)}&size=20&offset=${page * 20}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Search failed: ${res.status} ${res.statusText}`);
      const json = (await res.json()) as any;
      const items = Array.isArray(json?.extensions) ? json.extensions : [];
      const list: OpenVsxSearchResult[] = items
        .map((x: any) => ({
          namespace: typeof x?.namespace === 'string' ? x.namespace : '',
          name: typeof x?.name === 'string' ? x.name : '',
          version: typeof x?.version === 'string' ? x.version : '',
          displayName: typeof x?.displayName === 'string' ? x.displayName : undefined,
          description: typeof x?.description === 'string' ? x.description : undefined,
          iconUrl: typeof x?.files?.icon === 'string' ? x.files.icon : undefined,
        }))
        .filter((x: any) => x.namespace && x.name && x.version);
      if (rid !== lastRequestIdRef.current) return;
      setResults(list);
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : e?.message ? String(e.message) : 'Search failed.';
      setError(msg);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [page, query]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void runSearch();
    }, 250);
    return () => window.clearTimeout(t);
  }, [query, page, runSearch]);

  useEffect(() => {
    // default load first page on enter
    void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const installFromStore = useCallback(async (r: OpenVsxSearchResult) => {
    const installingKey = `${r.namespace}.${r.name}`;
    if (installingId === installingKey) return;
    setInstallingId(installingKey);
    setBusy(true);
    setError('');
    try {
      const { url, version } = await openVsxGetVsixUrl(r.namespace, r.name);
      const fileName = `${r.namespace}.${r.name}-${version || r.version}.vsix`;
      const vsixPath = await downloadVsixToTemp(url, fileName);

      const manifest = await readVsixManifest(vsixPath);
      const name = (manifest.name ?? r.name).trim();
      const publisher = (manifest.publisher ?? r.namespace).trim();
      const id = `${publisher}.${name}`;
      const installDir = await extractVsixToExtensionsDir(vsixPath, id);
      const ext: InstalledExtension = {
        id,
        name,
        publisher,
        displayName: (manifest.displayName ?? r.displayName ?? name).trim(),
        description: (manifest.description ?? r.description ?? '').trim(),
        version: (manifest.version ?? version ?? r.version ?? '0.0.0').trim(),
        installedAt: Date.now(),
        vsixPath,
        installDir,
        main: typeof manifest.main === 'string' ? manifest.main : undefined,
        enabled: true,
      };
      const next = upsertInstalledExtension(ext);
      setInstalled(next);

      setSelectedInstalledId(ext.id);
      setSelectedManifest(manifest);

      try {
        window.dispatchEvent(new CustomEvent('extensions-installed-changed'));
      } catch {
        // ignore
      }
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : e?.message ? String(e.message) : 'Failed to install extension.';
      setError(msg);
    } finally {
      setBusy(false);
      setInstallingId('');
    }
  }, [installingId]);

  const installFromVsix = useCallback(async () => {
    setError('');
    setBusy(true);
    try {
      const vsixPath = await pickVsixFile();
      if (!vsixPath) {
        setError('No VSIX selected.');
        return;
      }

      const manifest = await readVsixManifest(vsixPath);
      const name = (manifest.name ?? '').trim();
      const publisher = (manifest.publisher ?? '').trim();
      if (!name || !publisher) {
        throw new Error('Invalid extension manifest: missing name/publisher');
      }
      const id = `${publisher}.${name}`;
      const installDir = await extractVsixToExtensionsDir(vsixPath, id);

      const ext: InstalledExtension = {
        id,
        name,
        publisher,
        displayName: (manifest.displayName ?? name).trim(),
        description: (manifest.description ?? '').trim(),
        version: (manifest.version ?? '0.0.0').trim(),
        installedAt: Date.now(),
        vsixPath,
        installDir,
        main: typeof manifest.main === 'string' ? manifest.main : undefined,
        enabled: true,
      };

      const next = upsertInstalledExtension(ext);
      setInstalled(next);
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : e?.message ? String(e.message) : 'Failed to install extension.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  }, []);

  const list = useMemo(() => installed, [installed]);

  useEffect(() => {
    if (selectedInstalledId) return;
    if (installed.length === 0) return;
    setSelectedInstalledId(installed[0]!.id);
  }, [installed, selectedInstalledId]);

  useEffect(() => {
    if (!selectedInstalledId) return;
    const ext = installed.find((x) => x.id === selectedInstalledId);
    if (!ext?.vsixPath) {
      setSelectedManifest(null);
      return;
    }
    let disposed = false;
    (async () => {
      try {
        const manifest = await readVsixManifest(ext.vsixPath!);
        if (!disposed) setSelectedManifest(manifest);
      } catch {
        if (!disposed) setSelectedManifest(null);
      }
    })();
    return () => {
      disposed = true;
    };
  }, [installed, selectedInstalledId]);

  const selectedInstalled = useMemo(
    () => list.find((x) => x.id === selectedInstalledId) ?? null,
    [list, selectedInstalledId],
  );

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="h-10 px-3 flex items-center justify-between border-b border-gray-200">
        <div className="text-sm font-medium text-gray-800">Extensions</div>
        <button
          type="button"
          className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
          onClick={() => void installFromVsix()}
          disabled={busy}
        >
          {busy ? (
            <span className="inline-flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-white/60 border-t-white rounded-full animate-spin" />
              Installing...
            </span>
          ) : (
            'Install from VSIX'
          )}
        </button>
      </div>

      <div className="p-3 border-b border-gray-200">
        <div className="text-[11px] text-gray-500 mb-1">Marketplace (Open VSX)</div>
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search extensions…"
            className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded"
          />
        </div>

        {searching ? <div className="text-xs text-gray-500 mt-2">Searching…</div> : null}

        <div className="mt-2 flex items-center justify-between">
          <div className="text-[11px] text-gray-500">Page {page + 1}</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Prev
            </button>
            <button
              type="button"
              className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
              disabled={results.length < 20}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>

        {results.length > 0 ? (
          <div className="mt-2 space-y-1 max-h-[45vh] overflow-auto pr-1">
            {results.map((r) => (
              <div key={`${r.namespace}.${r.name}`} className="border border-gray-200 rounded px-2 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex items-start gap-2">
                    <ExtensionIcon
                      namespace={r.namespace}
                      name={r.name}
                      label={r.displayName ?? `${r.namespace}.${r.name}`}
                      iconUrl={r.iconUrl}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-gray-900 truncate" title={`${r.namespace}.${r.name}`}>
                        {r.displayName ?? `${r.namespace}.${r.name}`}
                      </div>
                      <div className="text-[11px] text-gray-500 truncate">{r.namespace}.{r.name}  v{r.version}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
                    onClick={() => void installFromStore(r)}
                    disabled={busy || installingId === `${r.namespace}.${r.name}`}
                  >
                    {installingId === `${r.namespace}.${r.name}` ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="w-3 h-3 border-2 border-white/60 border-t-white rounded-full animate-spin" />
                        Installing...
                      </span>
                    ) : (
                      'Install'
                    )}
                  </button>
                </div>
                {r.description ? <div className="mt-1 text-xs text-gray-700 line-clamp-2">{r.description}</div> : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {error ? <div className="p-3 text-xs text-red-600 whitespace-pre-wrap">{error}</div> : null}

      <div className="flex-1 min-h-0 flex">
        <div className="w-72 min-w-72 border-r border-gray-200 overflow-auto">
          <div className="p-2">
            <div className="text-[11px] text-gray-500 mb-2">Installed</div>
            {list.length === 0 ? (
              <div className="p-1 text-xs text-gray-500">No extensions installed.</div>
            ) : (
              <div className="space-y-2">
                {list.map((e) => {
                  const active = e.id === selectedInstalledId;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      className={
                        'w-full text-left border border-gray-200 rounded p-2 ' +
                        (active ? 'bg-gray-50' : 'hover:bg-gray-50 active:bg-gray-100')
                      }
                      onClick={() => {
                        setSelectedInstalledId(e.id);
                      }}
                      title={e.id}
                    >
                      <div className="text-sm text-gray-900 font-medium truncate">{e.displayName}</div>
                      <div className="text-[11px] text-gray-500 truncate">{e.id}  v{e.version}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0 overflow-auto">
          {selectedInstalled ? (
            <div className="p-3">
              <div className="text-sm font-medium text-gray-900">{selectedInstalled.displayName}</div>
              <div className="text-[11px] text-gray-500 mt-1">{selectedInstalled.id}  v{selectedInstalled.version}</div>
              {selectedInstalled.description ? <div className="mt-3 text-xs text-gray-700">{selectedInstalled.description}</div> : null}

              <div className="mt-4 grid grid-cols-1 gap-2">
                <div className="text-[11px] text-gray-500">Publisher</div>
                <div className="text-xs text-gray-800">{selectedInstalled.publisher}</div>

                {selectedInstalled.vsixPath ? (
                  <>
                    <div className="text-[11px] text-gray-500">VSIX Path</div>
                    <div className="text-xs text-gray-800 break-words">{selectedInstalled.vsixPath}</div>
                  </>
                ) : null}

                {selectedManifest ? (
                  <>
                    <div className="text-[11px] text-gray-500">Manifest</div>
                    <pre className="text-[11px] whitespace-pre-wrap break-words border border-gray-200 rounded p-2 bg-gray-50 text-gray-700">
                      {JSON.stringify(selectedManifest, null, 2)}
                    </pre>
                  </>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="p-3 text-xs text-gray-500">Select an installed extension to view details.</div>
          )}
        </div>
      </div>
    </div>
  );
}
