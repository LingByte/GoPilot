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
import { setMonacoProjectConfig } from './monacoProject';
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
  restoreSession: (openPaths: string[], activePath?: string) => Promise<void>;
};

type EditorWorkspaceProps = {
  onSessionChange?: (session: { openPaths: string[]; activePath: string | null }) => void;
  recentProjects?: string[];
  onOpenRecentProject?: (path: string) => void;
  projectRoot?: string;
};

function getFileName(path: string) {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

async function resolveAliasCandidates(spec: string, rules: Array<{ prefix: string; targetPrefixAbs: string }>) {
  for (const r of rules) {
    if (spec === r.prefix || spec.startsWith(r.prefix + '/')) {
      const rest = spec === r.prefix ? '' : spec.slice(r.prefix.length + 1);
      const raw = rest ? joinPath2(r.targetPrefixAbs, rest) : r.targetPrefixAbs;
      return [
        raw,
        `${raw}.ts`,
        `${raw}.tsx`,
        `${raw}.js`,
        `${raw}.jsx`,
        `${raw}.json`,
        joinPath2(raw, 'index.ts'),
        joinPath2(raw, 'index.tsx'),
        joinPath2(raw, 'index.js'),
        joinPath2(raw, 'index.jsx'),
      ];
    }
  }
  return [] as string[];
}

function inferLanguage(path: string) {
  const lower = path.toLowerCase();
  const base = lower.split(/[/\\]/).pop() ?? lower;
  if (base === 'dockerfile' || base.endsWith('.dockerfile')) return 'dockerfile';
  if (base === 'makefile') return 'makefile';

  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'typescript';
  if (lower.endsWith('.js') || lower.endsWith('.jsx') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return 'javascript';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.scss')) return 'scss';
  if (lower.endsWith('.less')) return 'less';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  if (lower.endsWith('.xml')) return 'xml';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown';
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return 'yaml';
  if (lower.endsWith('.toml')) return 'toml';
  if (lower.endsWith('.ini') || lower.endsWith('.cfg') || lower.endsWith('.conf')) return 'ini';

  if (lower.endsWith('.go')) return 'go';
  if (lower.endsWith('.rs')) return 'rust';
  if (lower.endsWith('.java')) return 'java';
  if (lower.endsWith('.kt') || lower.endsWith('.kts')) return 'kotlin';
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.rb')) return 'ruby';
  if (lower.endsWith('.php')) return 'php';
  if (lower.endsWith('.cs')) return 'csharp';
  if (lower.endsWith('.c')) return 'c';
  if (lower.endsWith('.h')) return 'c';
  if (lower.endsWith('.cpp') || lower.endsWith('.cc') || lower.endsWith('.cxx') || lower.endsWith('.hpp') || lower.endsWith('.hh') || lower.endsWith('.hxx')) return 'cpp';

  if (lower.endsWith('.sh') || lower.endsWith('.bash') || lower.endsWith('.zsh') || lower.endsWith('.fish')) return 'shell';
  if (lower.endsWith('.ps1') || lower.endsWith('.psm1') || lower.endsWith('.psd1')) return 'powershell';
  if (lower.endsWith('.bat') || lower.endsWith('.cmd')) return 'bat';

  if (lower.endsWith('.sql')) return 'sql';
  if (lower.endsWith('.graphql') || lower.endsWith('.gql')) return 'graphql';
  if (lower.endsWith('.dockerignore')) return 'plaintext';
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

function dirnamePath(p: string) {
  const parts = p.split(/[/\\]/);
  parts.pop();
  return parts.join(p.includes('\\') ? '\\' : '/');
}

function joinPath2(dir: string, child: string) {
  const sep = dir.includes('\\') ? '\\' : '/';
  const d = dir.endsWith(sep) ? dir.slice(0, -1) : dir;
  const c = child.startsWith('/') || child.startsWith('\\') ? child.slice(1) : child;
  return normalizePath(`${d}${sep}${c}`);
}

function normalizePath(p: string) {
  const usesBackslash = p.includes('\\');
  const sep = usesBackslash ? '\\' : '/';
  const parts = p.replace(/\\/g, '/').split('/');
  const stack: string[] = [];

  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (stack.length > 0 && stack[stack.length - 1] !== '..') stack.pop();
      else stack.push('..');
      continue;
    }
    stack.push(part);
  }

  const joined = stack.join(sep);
  return usesBackslash ? joined : joined;
}

function normalizeTsconfigPathValue(v: string) {
  if (!v) return v;
  if (v.startsWith('./')) return v.slice(2);
  if (v.startsWith('.\\')) return v.slice(2);
  return v;
}

function isScriptLike(lang: string) {
  return ['javascript', 'typescript'].includes(lang);
}

function extractImports(source: string) {
  const out = new Set<string>();
  const re = /(?:import|export)\s+(?:[^'"\n]+\s+from\s+)?["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const spec = (m[1] ?? m[2] ?? '').trim();
    if (!spec) continue;
    out.add(spec);
  }
  return Array.from(out);
}

async function ensureMonacoModel(filePath: string, content: string) {
  const monaco = await import('monaco-editor');
  const uri = monaco.Uri.file(filePath);
  const existing = monaco.editor.getModel(uri);
  if (existing) return;
  const language = inferLanguage(filePath);
  monaco.editor.createModel(content, language, uri);
}

async function ensureMonacoModelFromDisk(filePath: string) {
  const text = await readText(filePath);
  await ensureMonacoModel(filePath, text);
  return text;
}

async function preloadImportGraph(opts: {
  entryPath: string;
  entrySource: string;
  language: string;
  projectRoot?: string;
  aliasRules: Array<{ prefix: string; targetPrefixAbs: string }>;
  visited: Set<string>;
  maxFiles: number;
}) {
  if (!isScriptLike(opts.language)) return;
  if (opts.visited.size >= opts.maxFiles) return;

  const key = normalizePath(opts.entryPath);
  if (opts.visited.has(key)) return;
  opts.visited.add(key);

  const baseDir = dirnamePath(opts.entryPath);
  const specs = extractImports(opts.entrySource);

  for (const spec of specs) {
    let candidates: string[] = [];
    if (spec.startsWith('.')) {
      candidates = await resolveImportFile(baseDir, spec);
    } else if (opts.projectRoot && (spec.startsWith('@/') || spec.startsWith('@'))) {
      candidates = await resolveAliasCandidates(spec, opts.aliasRules);
    } else {
      continue;
    }

    if (candidates.length === 0) continue;

    for (const c of candidates) {
      const candidatePath = normalizePath(c);
      if (opts.visited.has(candidatePath)) {
        break;
      }

      try {
        const importedText = await ensureMonacoModelFromDisk(candidatePath);
        const importedLang = inferLanguage(candidatePath);
        await preloadImportGraph({
          entryPath: candidatePath,
          entrySource: importedText,
          language: importedLang,
          projectRoot: opts.projectRoot,
          aliasRules: opts.aliasRules,
          visited: opts.visited,
          maxFiles: opts.maxFiles,
        });
        break;
      } catch {
        continue;
      }
    }

    if (opts.visited.size >= opts.maxFiles) return;
  }
}

async function preloadImportsForFile(opts: {
  filePath: string;
  source: string;
  language: string;
  projectRoot?: string;
  aliasRules: Array<{ prefix: string; targetPrefixAbs: string }>;
}) {
  if (!isScriptLike(opts.language)) return;

  const visited = new Set<string>();
  await preloadImportGraph({
    entryPath: opts.filePath,
    entrySource: opts.source,
    language: opts.language,
    projectRoot: opts.projectRoot,
    aliasRules: opts.aliasRules,
    visited,
    maxFiles: 200,
  });
}

async function preloadImportsForOpenTabs(opts: {
  tabs: Array<{ path: string; value: string; language: string }>;
  projectRoot?: string;
  aliasRules: Array<{ prefix: string; targetPrefixAbs: string }>;
}) {
  for (const t of opts.tabs) {
    try {
      await preloadImportsForFile({
        filePath: t.path,
        source: t.value,
        language: t.language,
        projectRoot: opts.projectRoot,
        aliasRules: opts.aliasRules,
      });
    } catch {
      continue;
    }
  }
}

async function resolveImportFile(baseDir: string, spec: string) {
  const raw = joinPath2(baseDir, spec);
  const candidates = [
    raw,
    `${raw}.ts`,
    `${raw}.tsx`,
    `${raw}.js`,
    `${raw}.jsx`,
    `${raw}.json`,
    joinPath2(raw, 'index.ts'),
    joinPath2(raw, 'index.tsx'),
    joinPath2(raw, 'index.js'),
    joinPath2(raw, 'index.jsx'),
  ];
  return candidates;
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

const EditorWorkspace = forwardRef<EditorWorkspaceHandle, EditorWorkspaceProps>(function EditorWorkspace(
  { onSessionChange, recentProjects, onOpenRecentProject, projectRoot }: EditorWorkspaceProps,
  ref,
) {
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
  const aliasRulesRef = useRef<Array<{ prefix: string; targetPrefixAbs: string }>>([]);
  const projectRootRef = useRef<string>('');

  useEffect(() => {
    projectRootRef.current = projectRoot ?? '';
  }, [projectRoot]);

  useEffect(() => {
    if (!projectRoot) {
      aliasRulesRef.current = [];
      return;
    }

    void (async () => {
      try {
        const tryPaths = [joinPath2(projectRoot, 'tsconfig.json'), joinPath2(projectRoot, 'jsconfig.json')];
        let raw: string | null = null;
        for (const p of tryPaths) {
          try {
            raw = await readText(p);
            if (raw) break;
          } catch {
            continue;
          }
        }
        if (!raw) {
          aliasRulesRef.current = [{ prefix: '@', targetPrefixAbs: normalizePath(projectRoot) }];

          try {
            setMonacoProjectConfig({
              baseUrl: (await import('monaco-editor')).Uri.file(normalizePath(projectRoot)).toString(true),
              paths: { '@/*': ['*'] },
              projectRootAbs: normalizePath(projectRoot),
              sourceRootAbs: normalizePath(joinPath2(projectRoot, 'src')),
            });
          } catch {
            // ignore
          }
          return;
        }

        const json = JSON.parse(raw) as any;
        const baseUrl = typeof json?.compilerOptions?.baseUrl === 'string' ? String(json.compilerOptions.baseUrl) : '.';
        const pathsObj = json?.compilerOptions?.paths && typeof json.compilerOptions.paths === 'object' ? json.compilerOptions.paths : null;
        const rules: Array<{ prefix: string; targetPrefixAbs: string }> = [];
        if (pathsObj) {
          for (const key of Object.keys(pathsObj)) {
            const arr = pathsObj[key];
            if (!Array.isArray(arr) || typeof arr[0] !== 'string') continue;
            const target = normalizeTsconfigPathValue(arr[0] as string);
            if (!key.endsWith('/*') || !target.endsWith('/*')) continue;
            const prefix = key.slice(0, -2);
            const targetPrefix = target.slice(0, -2);
            const abs = normalizePath(joinPath2(joinPath2(projectRoot, baseUrl), targetPrefix));
            rules.push({ prefix, targetPrefixAbs: abs });
          }
        }

        // Fallback alias when config doesn't declare @/*: treat @ as project root
        if (!rules.some((r) => r.prefix === '@')) {
          rules.push({ prefix: '@', targetPrefixAbs: normalizePath(projectRoot) });
        }
        aliasRulesRef.current = rules;

        // Also inform Monaco TS about baseUrl/paths so diagnostics can resolve aliases.
        try {
          const monaco = await import('monaco-editor');
          const baseAbs = normalizePath(joinPath2(projectRoot, baseUrl));
          const paths: Record<string, string[]> = {};
          if (pathsObj) {
            for (const key of Object.keys(pathsObj)) {
              const arr = pathsObj[key];
              if (!Array.isArray(arr)) continue;
              paths[key] = (arr.filter((x) => typeof x === 'string') as string[]).map(normalizeTsconfigPathValue);
            }
          }
          if (!paths['@/*']) {
            paths['@/*'] = ['*'];
          }
          setMonacoProjectConfig({
            baseUrl: monaco.Uri.file(baseAbs).toString(true),
            paths,
            projectRootAbs: normalizePath(projectRoot),
            sourceRootAbs: normalizePath(joinPath2(projectRoot, 'src')),
          });
        } catch {
          // ignore
        }

        // Re-preload imports for already-open files (session restore may open tabs before alias rules are ready).
        try {
          const openTabs = tabsRef.current
            .filter((t) => isScriptLike(t.language))
            .map((t) => ({ path: t.path, value: t.value, language: t.language }));
          void preloadImportsForOpenTabs({
            tabs: openTabs,
            projectRoot: projectRootRef.current,
            aliasRules: aliasRulesRef.current,
          });
        } catch {
          // ignore
        }
      } catch {
        aliasRulesRef.current = [];
      }
    })();
  }, [projectRoot]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    if (!onSessionChange) return;
    const active = tabs.find((t) => t.id === activeId) ?? null;
    onSessionChange({
      openPaths: tabs.map((t) => t.path).filter(Boolean),
      activePath: active?.path ?? null,
    });
  }, [activeId, onSessionChange, tabs]);

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeId) ?? null, [tabs, activeId]);

  const updateTab = useCallback((id: string, patch: Partial<TabState>) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const revealInExplorer = useCallback((path: string) => {
    try {
      if (typeof window === 'undefined') return;
      window.dispatchEvent(new CustomEvent('gopilot:revealInExplorer', { detail: { path } }));
    } catch {
      // ignore
    }
  }, []);

  const openFile = useCallback(async (path: string) => {
    const existing = tabsRef.current.find((t) => t.path === path);
    if (existing) {
      setActiveId(existing.id);
      revealInExplorer(path);
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

    revealInExplorer(path);

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

      try {
        await preloadImportsForFile({
          filePath: path,
          source: content,
          language,
          projectRoot: projectRootRef.current,
          aliasRules: aliasRulesRef.current,
        });
      } catch {
        // ignore
      }
    } catch {
      const msg = `Failed to read file.\n${path}\n\nPossible causes:\n- Tauri FS scope/permissions do not allow this path\n- The file is binary or encoded in an unsupported format`;
      setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, value: msg, savedValue: msg, viewerId: 'binary', readOnly: true } : t)));
    }
  }, []);

  const restoreSession = useCallback(
    async (openPaths: string[], activePath?: string) => {
      const uniq = Array.from(new Set((openPaths ?? []).filter(Boolean)));
      for (const p of uniq) {
        await openFile(p);
      }
      if (activePath) {
        const t = tabsRef.current.find((x) => x.path === activePath);
        if (t) setActiveId(t.id);
      }
    },
    [openFile, revealInExplorer],
  );

  const openFileAt = useCallback(
    async (path: string, line: number, column?: number) => {
      await openFile(path);

      revealInExplorer(path);

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

  useImperativeHandle(ref, () => ({ openFile, openFileAt, saveActive, restoreSession }), [openFile, openFileAt, saveActive, restoreSession]);

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
          <div className="h-full flex items-center justify-center">
            <div className="w-[520px] max-w-[92%]">
              <div className="text-sm font-medium text-gray-700 mb-2">Recent Projects</div>
              {Array.isArray(recentProjects) && recentProjects.length > 0 ? (
                <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                  {recentProjects.slice(0, 12).map((p) => (
                    <button
                      key={p}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 active:bg-gray-100 border-b border-gray-100 last:border-b-0"
                      onClick={() => onOpenRecentProject?.(p)}
                      title={p}
                    >
                      <div className="truncate text-gray-800">{p}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500">No recent projects.</div>
              )}

              <div className="mt-4 text-xs text-gray-400">Open a file from Explorer to start editing.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default EditorWorkspace;
