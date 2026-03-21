import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import TabsBar, { type EditorTab } from '@/components/editor/TabsBar';
import FileViewer from '@/components/viewers/FileViewer';
import {
  audioMime,
  imageMime,
  isAudioPath,
  isImagePath,
  isMarkdownPath,
  isPdfPath,
  isVideoPath,
  pdfMime,
  videoMime,
} from '@/components/viewers/defaultRenderers';
import { applyPdfAnnotations } from '@/components/viewers/PdfEditorViewer';
import ContextMenu, { type ContextMenuItem } from '@/components/layouts/ContextMenu';

const WORKSPACE_TABS_KEY = 'gopilot.workspace.openFiles';
const WORKSPACE_ACTIVE_KEY = 'gopilot.workspace.activeFile';

type TabState = {
  id: string;
  path: string;
  title: string;
  language: string;
  value: string;
  savedValue: string;
  viewerId: 'text' | 'markdown' | 'image' | 'audio' | 'pdf' | 'video' | 'binary';
  assetUrl?: string;
  readOnly: boolean;
  reveal?: {
    line: number;
    column?: number;
  };
};

export type EditorWorkspaceHandle = {
  openFile: (path: string) => Promise<void>;
  openFileAt: (path: string, line: number, column?: number) => Promise<void>;
  saveActive: () => Promise<void>;
};

function getFileName(path: string) {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function inferLanguage(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'typescript';
  if (lower.endsWith('.js') || lower.endsWith('.jsx')) return 'javascript';
  if (lower.endsWith('.go')) return 'go';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.html')) return 'html';
  if (lower.endsWith('.md')) return 'markdown';
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return 'yaml';
  return 'plaintext';
}

function binaryMime(path: string) {
  if (isImagePath(path)) return imageMime(path);
  if (isAudioPath(path)) return audioMime(path);
  if (isPdfPath(path)) return pdfMime(path);
  if (isVideoPath(path)) return videoMime(path);
  return 'application/octet-stream';
}

async function readBytes(path: string) {
  const fs = await import('@tauri-apps/api/fs');
  return await fs.readBinaryFile(path);
}

function bytesToAssetUrl(bytes: Uint8Array, mime: string) {
  const copy = new Uint8Array(bytes);
  const blob = new Blob([copy.buffer], { type: mime });
  return URL.createObjectURL(blob);
}

function decodeText(bytes: Uint8Array) {
  // BOM detection
  if (bytes.length >= 2) {
    // UTF-16 LE BOM
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    }
    // UTF-16 BE BOM
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    }
  }

  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }

  // Heuristic: lots of NUL bytes -> likely UTF-16LE without BOM (common on Windows redirects)
  let nulCount = 0;
  const sampleLen = Math.min(bytes.length, 2048);
  for (let i = 0; i < sampleLen; i++) {
    if (bytes[i] === 0) nulCount++;
  }
  if (sampleLen > 0 && nulCount / sampleLen > 0.2) {
    return new TextDecoder('utf-16le').decode(bytes);
  }

  return new TextDecoder('utf-8').decode(bytes);
}

async function readText(path: string) {
  const bytes = await readBytes(path);
  return decodeText(bytes);
}

async function writeText(path: string, content: string) {
  const fs = await import('@tauri-apps/api/fs');
  await fs.writeFile({ path, contents: content });
}

async function writeBytes(path: string, bytes: Uint8Array) {
  const fs = await import('@tauri-apps/api/fs');
  await fs.writeBinaryFile({ path, contents: bytes });
}

const EMPTY_PDF_EDIT_STATE = JSON.stringify({ version: 1, annotations: [] });

const EditorWorkspace = forwardRef<EditorWorkspaceHandle>(function EditorWorkspace(_props, ref) {
  const [tabs, setTabs] = useState<TabState[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ctx, setCtx] = useState<{ open: boolean; x: number; y: number; tabId: string | null }>({
    open: false,
    x: 0,
    y: 0,
    tabId: null,
  });
  const tabsRef = useRef<TabState[]>([]);
  const restoreActivePathRef = useRef<string>('');

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeId) ?? null, [tabs, activeId]);

  const updateTab = useCallback((id: string, patch: Partial<TabState>) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const openFile = useCallback(async (path: string) => {
    const existing = tabsRef.current.find((t) => t.path === path);
    if (existing) {
      setActiveId(existing.id);
      return;
    }

    const id = `tab_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const title = getFileName(path);
    const language = inferLanguage(path);

    if (isImagePath(path) || isAudioPath(path) || isPdfPath(path) || isVideoPath(path)) {
      try {
        const bytes = await readBytes(path);
        const url = bytesToAssetUrl(bytes, binaryMime(path));
        const viewerId: TabState['viewerId'] = isImagePath(path)
          ? 'image'
          : isAudioPath(path)
            ? 'audio'
            : isPdfPath(path)
              ? 'pdf'
              : 'video';

        const isPdf = viewerId === 'pdf';
        setTabs((prev) => [
          ...prev,
          {
            id,
            path,
            title,
            language: 'plaintext',
            value: isPdf ? EMPTY_PDF_EDIT_STATE : '',
            savedValue: isPdf ? EMPTY_PDF_EDIT_STATE : '',
            viewerId,
            assetUrl: url,
            readOnly: isPdf ? false : true,
          },
        ]);
        setActiveId(id);
        return;
      } catch {
        const msg = `Failed to load asset preview.\n${path}\n\nPossible causes:\n- Tauri FS scope/permissions do not allow this path (restart tauri:dev after changing scope)\n- File is too large or unsupported format`;
        setTabs((prev) => [
          ...prev,
          {
            id,
            path,
            title,
            language: 'plaintext',
            value: msg,
            savedValue: msg,
            viewerId: 'binary',
            readOnly: true,
          },
        ]);
        setActiveId(id);
        return;
      }
    }

    // insert tab immediately so UI responds fast
    const initialViewerId: TabState['viewerId'] = isMarkdownPath(path) ? 'markdown' : 'text';
    setTabs((prev) => [
      ...prev,
      {
        id,
        path,
        title,
        language,
        value: '',
        savedValue: '',
        viewerId: initialViewerId,
        readOnly: false,
      },
    ]);

    // if we are restoring a previous session, restore the active tab selection
    if (restoreActivePathRef.current && restoreActivePathRef.current === path) {
      setActiveId(id);
    } else {
      setActiveId(id);
    }

    try {
      const content = await readText(path);
      setTabs((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                value: content,
                savedValue: content,
                viewerId: isMarkdownPath(path) ? 'markdown' : 'text',
                readOnly: false,
              }
            : t,
        ),
      );
    } catch {
      const msg = `Failed to read file.\n${path}\n\nPossible causes:\n- Tauri FS scope/permissions do not allow this path\n- The file is binary or encoded in an unsupported format`;
      setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, value: msg, savedValue: msg, viewerId: 'binary', readOnly: true } : t)));
    }
  }, []);

  const openFileAt = useCallback(
    async (path: string, line: number, column?: number) => {
      await openFile(path);

      const wantedLine = Math.max(1, Number(line) || 1);
      const wantedCol = Math.max(1, Number(column ?? 1) || 1);

      // Wait a tick for tab state to materialize.
      for (let i = 0; i < 20; i++) {
        const tab = tabsRef.current.find((t) => t.path === path);
        if (tab) {
          setTabs((prev) =>
            prev.map((t) =>
              t.id === tab.id
                ? {
                    ...t,
                    reveal: {
                      line: wantedLine,
                      column: wantedCol,
                    },
                  }
                : t,
            ),
          );
          return;
        }
        await new Promise((r) => setTimeout(r, 30));
      }
    },
    [openFile],
  );

  useEffect(() => {
    const active = tabs.find((t) => t.id === activeId);
    if (active) {
      localStorage.setItem(WORKSPACE_ACTIVE_KEY, active.path);
    } else {
      localStorage.removeItem(WORKSPACE_ACTIVE_KEY);
    }
    const paths = tabs.map((t) => t.path);
    localStorage.setItem(WORKSPACE_TABS_KEY, JSON.stringify(paths));
  }, [tabs, activeId]);

  useEffect(() => {
    const raw = localStorage.getItem(WORKSPACE_TABS_KEY);
    const activePath = localStorage.getItem(WORKSPACE_ACTIVE_KEY) ?? '';
    if (!raw) return;

    let paths: string[] = [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        paths = parsed.filter((p) => typeof p === 'string');
      }
    } catch {
      return;
    }

    if (paths.length === 0) return;

    restoreActivePathRef.current = activePath;

    (async () => {
      for (const p of paths) {
        await openFile(p);
      }

      // if activePath existed but wasn't opened (e.g. missing from list), try opening it
      if (activePath && !paths.includes(activePath)) {
        await openFile(activePath);
      }

      restoreActivePathRef.current = '';
    })();
  }, [openFile]);

  const saveActive = useCallback(async () => {
    if (!activeTab) return;
    if (activeTab.value === activeTab.savedValue) return;

    if (activeTab.viewerId === 'pdf') {
      try {
        const bytes = await readBytes(activeTab.path);
        const state = JSON.parse(activeTab.value) as { version: 1; annotations: unknown[] };
        const nextBytes = await applyPdfAnnotations(bytes, state as any);
        await writeBytes(activeTab.path, nextBytes);

        // Refresh preview assetUrl after saving
        const url = bytesToAssetUrl(nextBytes, pdfMime(activeTab.path));
        // Revoke old URL
        if (activeTab.assetUrl && activeTab.assetUrl.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(activeTab.assetUrl);
          } catch {
            // ignore
          }
        }

        updateTab(activeTab.id, { savedValue: activeTab.value, assetUrl: url });
      } catch {
        return;
      }
      return;
    }

    try {
      await writeText(activeTab.path, activeTab.value);
      updateTab(activeTab.id, { savedValue: activeTab.value });
    } catch {
      return;
    }
  }, [activeTab, updateTab]);

  const saveTab = useCallback(
    async (tab: TabState) => {
      if (tab.value === tab.savedValue) return;
      if (tab.viewerId === 'pdf') {
        const bytes = await readBytes(tab.path);
        const state = JSON.parse(tab.value) as { version: 1; annotations: unknown[] };
        const nextBytes = await applyPdfAnnotations(bytes, state as any);
        await writeBytes(tab.path, nextBytes);
        const url = bytesToAssetUrl(nextBytes, pdfMime(tab.path));
        if (tab.assetUrl && tab.assetUrl.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(tab.assetUrl);
          } catch {
            // ignore
          }
        }
        updateTab(tab.id, { savedValue: tab.value, assetUrl: url });
        return;
      }
      await writeText(tab.path, tab.value);
      updateTab(tab.id, { savedValue: tab.value });
    },
    [updateTab],
  );

  const saveAll = useCallback(async () => {
    for (const t of tabsRef.current) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await saveTab(t);
      } catch {
        // ignore
      }
    }
  }, [saveTab]);

  const closeAll = useCallback(() => {
    // revoke asset urls
    for (const t of tabsRef.current) {
      if (t.assetUrl && t.assetUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(t.assetUrl);
        } catch {
          // ignore
        }
      }
    }
    setTabs([]);
    setActiveId(null);
  }, []);

  const closeOthers = useCallback((keepId: string) => {
    setTabs((prev) => {
      const keep = prev.find((t) => t.id === keepId);
      for (const t of prev) {
        if (t.id !== keepId && t.assetUrl && t.assetUrl.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(t.assetUrl);
          } catch {
            // ignore
          }
        }
      }
      const next = keep ? [keep] : [];
      setActiveId(keep ? keep.id : null);
      return next;
    });
  }, []);

  const openContextMenu = useCallback((args: { id: string | null; x: number; y: number }) => {
    setCtx({ open: true, x: args.x, y: args.y, tabId: args.id });
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx < 0) return prev;

      const closing = prev[idx];
      if (closing?.assetUrl && closing.assetUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(closing.assetUrl);
        } catch {
          // ignore
        }
      }

      const next = prev.filter((t) => t.id !== id);
      if (activeId === id) {
        const candidate = next[idx - 1] ?? next[idx] ?? null;
        setActiveId(candidate?.id ?? null);
      }
      return next;
    });
  }, [activeId]);

  const ctxItems: ContextMenuItem[] = useMemo(() => {
    const tab = tabs.find((t) => t.id === ctx.tabId) ?? null;
    const dirty = tab ? tab.value !== tab.savedValue : false;
    const globalItems: ContextMenuItem[] = [
      {
        id: 'save_all',
        label: 'Save All',
        disabled: tabs.length === 0,
        onClick: () => {
          void saveAll();
        },
      },
      {
        id: 'close_all',
        label: 'Close All',
        disabled: tabs.length === 0,
        onClick: () => {
          closeAll();
        },
      },
    ];

    if (!ctx.tabId) {
      return globalItems;
    }

    return [
      {
        id: 'save',
        label: 'Save',
        disabled: !tab || !dirty,
        onClick: () => {
          if (!tab) return;
          void saveTab(tab);
        },
      },
      ...globalItems,
      {
        id: 'close',
        label: 'Close',
        disabled: !tab,
        onClick: () => {
          if (!tab) return;
          closeTab(tab.id);
        },
      },
      {
        id: 'close_others',
        label: 'Close Others',
        disabled: !tab || tabs.length <= 1,
        onClick: () => {
          if (!tab) return;
          closeOthers(tab.id);
        },
      },
    ];
  }, [tabs, ctx.tabId, closeAll, closeOthers, closeTab, saveAll, saveTab]);

  const onChangeValue = useCallback((value: string) => {
    if (!activeTab) return;
    updateTab(activeTab.id, { value });
  }, [activeTab, updateTab]);

  const editorTabs: EditorTab[] = useMemo(
    () =>
      tabs.map((t) => ({
        id: t.id,
        path: t.path,
        title: t.title,
        isDirty: t.value !== t.savedValue,
      })),
    [tabs],
  );

  useImperativeHandle(ref, () => ({ openFile, openFileAt, saveActive }), [openFile, openFileAt, saveActive]);

  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>();
  useEffect(() => {
    keyHandlerRef.current = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveActive();
      }
    };
  }, [saveActive]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => keyHandlerRef.current?.(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <TabsBar
        tabs={editorTabs}
        activeId={activeId}
        onActivate={setActiveId}
        onClose={closeTab}
        onContextMenu={openContextMenu}
      />

      <ContextMenu
        open={ctx.open}
        x={ctx.x}
        y={ctx.y}
        items={ctxItems}
        onClose={() => setCtx((p) => ({ ...p, open: false, tabId: null }))}
      />

      <div className="flex-1 min-h-0">
        {activeTab ? (
          <FileViewer
            tab={{
              id: activeTab.id,
              path: activeTab.path,
              title: activeTab.title,
              language: activeTab.language,
              viewerId: activeTab.viewerId,
              readOnly: activeTab.readOnly,
              value: activeTab.value,
              reveal: activeTab.reveal,
            }}
            assetUrl={activeTab.assetUrl}
            onChange={onChangeValue}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-gray-500">
            Open a file from Explorer.
          </div>
        )}
      </div>
    </div>
  );
});

export default EditorWorkspace;
