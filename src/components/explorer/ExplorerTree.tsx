import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  FileCode2,
  FileCog,
  FileJson,
  FilePlus,
  FileTerminal,
  FileText,
  Package,
  BookText,
  FolderOpen,
} from 'lucide-react';

type TreeNode = {
  path: string;
  name: string;
  kind: 'dir' | 'file';
  children?: TreeNode[];
  loaded?: boolean;
};

export type ExplorerTreeProps = {
  onOpenFile?: (path: string) => void;
  rootPath?: string;
  onRootPathChange?: (path: string) => void;
};

const EXPLORER_ROOT_KEY = 'gopilot.explorer.rootPath';

function sortNodes(nodes: TreeNode[]) {
  return [...nodes].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function getNameFromPath(path: string) {
  return path.split(/[\\/]/).filter(Boolean).slice(-1)[0] || path;
}

function isAbsolutePath(p: string) {
  return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\') || p.startsWith('/');
}

function joinPath(parent: string, child: string) {
  const sep = parent.includes('\\') ? '\\' : '/';
  const p = parent.endsWith('\\') || parent.endsWith('/') ? parent.slice(0, -1) : parent;
  const c = child.startsWith('\\') || child.startsWith('/') ? child.slice(1) : child;
  return p + sep + c;
}

function dirname(p: string) {
  const parts = p.split(/[/\\]/).filter(Boolean);
  if (parts.length <= 1) return '';
  const sep = p.includes('\\') ? '\\' : '/';
  const prefix = /^[a-zA-Z]:/.test(p) ? parts[0] + sep : p.startsWith(sep) ? sep : '';
  return prefix + parts.slice(1, -1).join(sep);
}

function getExt(p: string) {
  const base = p.split(/[/\\]/).pop() ?? p;
  const idx = base.lastIndexOf('.');
  return idx >= 0 ? base.slice(idx + 1).toLowerCase() : '';
}

function getBaseName(p: string) {
  return (p.split(/[/\\]/).pop() ?? p).toLowerCase();
}

function DockerWhaleIcon() {
  return (
    <svg viewBox="0 0 64 64" className="w-4 h-4" aria-label="Dockerfile" role="img">
      <path
        fill="#2496ED"
        d="M8 34h6v-6H8v6zm8 0h6v-6h-6v6zm8 0h6v-6h-6v6zm8 0h6v-6h-6v6zm8 0h6v-6h-6v6zm8 0h6v-6h-6v6z"
      />
      <path
        fill="#2496ED"
        d="M10 36c1 10 9 18 21 18 13 0 22-7 25-16 2 .2 4-.7 6-3-1-3-4-4-7-4h-3c-1-4-4-6-8-6h-2v6H10v5z"
      />
      <circle cx="48" cy="38" r="2" fill="#0B3A5A" />
    </svg>
  );
}

function HtmlIcon() {
  return (
    <svg viewBox="0 0 64 64" className="w-4 h-4" aria-label="HTML" role="img">
      <path fill="#E34F26" d="M12 4h40l-4 45-16 11-16-11-4-45z" />
      <path fill="#EF652A" d="M32 56l13-9 3-38H32v47z" />
      <path fill="#FFF" d="M32 20H22l1 12h9V20zm0 22l-6-2-.4-5H20l.8 10 11.2 4V42z" />
      <path fill="#FFF" d="M32 32h8l-.7 8-7.3 2v7l11.2-4 1.8-23H32v10z" />
    </svg>
  );
}

function CssIcon() {
  return (
    <svg viewBox="0 0 64 64" className="w-4 h-4" aria-label="CSS" role="img">
      <path fill="#1572B6" d="M12 4h40l-4 45-16 11-16-11-4-45z" />
      <path fill="#1B73BA" d="M32 56l13-9 3-38H32v47z" />
      <path fill="#FFF" d="M32 20H22l1 12h9V20zm0 22l-6-2-.4-5H20l.8 10 11.2 4V42z" />
      <path fill="#FFF" d="M32 32h8l-.5 5-7.5 2v7l11.2-4 1.5-17H32v7z" />
    </svg>
  );
}

function JsIcon() {
  return (
    <svg viewBox="0 0 64 64" className="w-4 h-4" aria-label="JavaScript" role="img">
      <rect x="6" y="6" width="52" height="52" rx="6" fill="#F7DF1E" />
      <path
        fill="#111111"
        d="M26 46c1 2 3 4 6 4 2 0 4-1 4-3 0-2-1-3-4-4l-2-1c-4-2-7-4-7-9 0-5 4-9 10-9 4 0 7 1 9 5l-5 3c-1-2-2-3-4-3-2 0-3 1-3 3 0 2 1 3 4 4l2 1c5 2 8 4 8 10 0 6-5 10-12 10-7 0-11-3-13-8l5-3z"
      />
    </svg>
  );
}

function TsIcon() {
  return (
    <svg viewBox="0 0 64 64" className="w-4 h-4" aria-label="TypeScript" role="img">
      <rect x="6" y="6" width="52" height="52" rx="6" fill="#3178C6" />
      <path
        fill="#FFFFFF"
        d="M18 28h28v6H35v22h-7V34H18v-6zm34 12c-1-2-3-3-5-3-2 0-3 1-3 2 0 2 2 3 4 4l1 1c4 2 7 4 7 8 0 5-4 8-10 8-5 0-9-2-11-6l5-3c1 2 3 3 5 3 2 0 4-1 4-3 0-2-2-3-4-4l-1-1c-4-2-7-4-7-8 0-4 3-8 10-8 4 0 7 1 9 5l-4 3z"
      />
    </svg>
  );
}

function ReactIcon() {
  return (
    <svg viewBox="0 0 64 64" className="w-4 h-4" aria-label="React" role="img">
      <circle cx="32" cy="32" r="5" fill="#61DAFB" />
      <g fill="none" stroke="#61DAFB" strokeWidth="3">
        <ellipse cx="32" cy="32" rx="26" ry="10" />
        <ellipse cx="32" cy="32" rx="26" ry="10" transform="rotate(60 32 32)" />
        <ellipse cx="32" cy="32" rx="26" ry="10" transform="rotate(120 32 32)" />
      </g>
    </svg>
  );
}

function GoIcon() {
  return (
    <svg viewBox="0 0 64 64" className="w-4 h-4" aria-label="Go" role="img">
      <rect x="4" y="10" width="56" height="44" rx="10" fill="#00ADD8" />
      <path
        d="M18 38c0-7 5-12 14-12 5 0 9 1 12 3l-3 5c-2-1-5-2-9-2-5 0-8 2-8 6s3 6 8 6c3 0 5-.5 7-1v-3h-7v-5h14v12c-3 2-8 3-14 3-9 0-14-5-14-12z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

function RustIcon() {
  return (
    <svg viewBox="0 0 64 64" className="w-4 h-4" aria-label="Rust" role="img">
      <circle cx="32" cy="32" r="28" fill="#000000" />
      <g fill="#FFFFFF">
        <path d="M32 12l3 6 7-1-1 7 6 3-6 3 1 7-7-1-3 6-3-6-7 1 1-7-6-3 6-3-1-7 7 1 3-6z" opacity="0.9" />
        <circle cx="32" cy="32" r="7" fill="#000000" />
        <circle cx="32" cy="32" r="4" fill="#FFFFFF" />
      </g>
    </svg>
  );
}

function JavaIcon() {
  return (
    <svg viewBox="0 0 64 64" className="w-4 h-4" aria-label="Java" role="img">
      <path d="M22 44c0 6 6 8 10 8s10-2 10-8H22z" fill="#2563EB" />
      <path d="M24 30c0-8 16-8 16 0 0 7-4 12-8 12s-8-5-8-12z" fill="#60A5FA" />
      <path d="M34 16c3 3-3 5 0 8" stroke="#EF4444" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M28 18c3 3-3 5 0 8" stroke="#EF4444" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function renderFileIcon(path: string) {
  const base = getBaseName(path);
  const e = getExt(path);

  if (base === 'dockerfile' || base.endsWith('.dockerfile')) return <DockerWhaleIcon />;
  if (base === 'cargo.toml') return <RustIcon />;
  if (base === 'cargo.lock') return <RustIcon />;
  if (base === 'package.json') return <Package className="w-4 h-4 text-emerald-700" />;
  if (base === 'package-lock.json') return <Package className="w-4 h-4 text-emerald-700" />;
  if (base === 'pnpm-lock.yaml' || base === 'yarn.lock' || base === 'bun.lockb') return <Package className="w-4 h-4 text-emerald-700" />;
  if (base === 'readme.md' || base === 'readme.markdown') return <BookText className="w-4 h-4 text-indigo-700" />;
  if (base === '.gitignore' || base === '.gitattributes' || base === '.gitmodules') return <FileCog className="w-4 h-4 text-gray-600" />;
  if (base === 'license' || base === 'license.md' || base === 'license.txt') return <FileText className="w-4 h-4 text-gray-700" />;

  if (e === 'md' || e === 'markdown') return <FileText className="w-4 h-4 text-sky-600" />;
  if (e === 'json') return <FileJson className="w-4 h-4 text-amber-600" />;
  if (e === 'yml' || e === 'yaml') return <FileText className="w-4 h-4 text-purple-600" />;
  if (e === 'toml' || e === 'ini' || e === 'cfg' || e === 'conf') return <FileCog className="w-4 h-4 text-gray-500" />;
  if (e === 'sh' || e === 'bash' || e === 'zsh' || e === 'fish' || e === 'ps1' || e === 'bat' || e === 'cmd') {
    return <FileTerminal className="w-4 h-4 text-emerald-600" />;
  }

  if (e === 'html' || e === 'htm') return <HtmlIcon />;
  if (e === 'css' || e === 'scss' || e === 'less') return <CssIcon />;

  if (e === 'ts') return <TsIcon />;
  if (e === 'tsx') return <ReactIcon />;
  if (e === 'js' || e === 'mjs' || e === 'cjs') return <JsIcon />;
  if (e === 'jsx') return <ReactIcon />;
  if (e === 'go') return <GoIcon />;
  if (e === 'rs') return <RustIcon />;
  if (e === 'java' || e === 'kt' || e === 'kts') return <JavaIcon />;
  if (e === 'py' || e === 'rb' || e === 'php' || e === 'cs') return <FileCode2 className="w-4 h-4 text-indigo-600" />;
  if (e === 'c' || e === 'h' || e === 'cc' || e === 'cpp' || e === 'cxx' || e === 'hpp' || e === 'hh' || e === 'hxx') {
    return <FileCode2 className="w-4 h-4 text-teal-600" />;
  }

  return <FileIcon className="w-4 h-4 text-gray-400" />;
}

function normalizeEntryPath(parentPath: string, entryPath: string) {
  if (!entryPath) return '';
  if (isAbsolutePath(entryPath)) return entryPath;
  return joinPath(parentPath, entryPath);
}

function fromDirEntry(entry: any, parentPath: string): TreeNode {
  const path: string = normalizeEntryPath(parentPath, entry.path ?? '');
  const name: string = entry.name ?? '';
  const isDir = Array.isArray(entry.children);
  return {
    name: name || getNameFromPath(path),
    path,
    kind: isDir ? 'dir' : 'file',
    children: isDir ? [] : undefined,
    loaded: !isDir,
  };
}

export default function ExplorerTree({ onOpenFile, rootPath: controlledRootPath, onRootPathChange }: ExplorerTreeProps) {
  const [rootPath, setRootPath] = useState<string>('');
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [loadingDirs, setLoadingDirs] = useState<Record<string, boolean>>({});

  const effectiveRootPath = controlledRootPath ?? rootPath;
  const setEffectiveRootPath = useCallback(
    (p: string) => {
      if (onRootPathChange) {
        onRootPathChange(p);
      } else {
        setRootPath(p);
      }
    },
    [onRootPathChange],
  );

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => ({ ...prev, [path]: !prev[path] }));
  }, []);

  const openFolder = useCallback(async () => {
    setError('');
    try {
      const dialog = await import('@tauri-apps/api/dialog');
      const selected = await dialog.open({ directory: true, multiple: false });
      if (!selected) return;
      const p = Array.isArray(selected) ? selected[0] : selected;
      setEffectiveRootPath(p);
    } catch {
      setError('Open folder is only available in the Tauri desktop app.');
    }
  }, [setEffectiveRootPath]);

  const openFile = useCallback(async () => {
    setError('');
    try {
      const dialog = await import('@tauri-apps/api/dialog');
      const selected = await dialog.open({ directory: false, multiple: false });
      if (!selected) return;
      const p = Array.isArray(selected) ? selected[0] : selected;

      if (!effectiveRootPath && controlledRootPath === undefined) {
        const parent = dirname(p);
        if (parent) setEffectiveRootPath(parent);
      }

      onOpenFile?.(p);
    } catch {
      setError('Open file is only available in the Tauri desktop app.');
    }
  }, [controlledRootPath, effectiveRootPath, onOpenFile, setEffectiveRootPath]);

  useEffect(() => {
    if (controlledRootPath !== undefined) return;
    const saved = localStorage.getItem(EXPLORER_ROOT_KEY);
    if (saved) {
      setRootPath(saved);
    }
  }, [controlledRootPath]);

  useEffect(() => {
    if (effectiveRootPath) {
      localStorage.setItem(EXPLORER_ROOT_KEY, effectiveRootPath);
    } else {
      localStorage.removeItem(EXPLORER_ROOT_KEY);
    }
  }, [effectiveRootPath]);

  useEffect(() => {
    const load = async () => {
      if (!effectiveRootPath) {
        setTree(null);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const fs = await import('@tauri-apps/api/fs');
        const entries = await fs.readDir(effectiveRootPath, { recursive: false });
        const built: TreeNode = {
          path: effectiveRootPath,
          name: getNameFromPath(effectiveRootPath),
          kind: 'dir',
          loaded: true,
          children: sortNodes(entries.map((e) => fromDirEntry(e, effectiveRootPath))),
        };
        setTree(built);
        setExpanded({ [effectiveRootPath]: true });
      } catch {
        setError('Failed to read directory.');
        setTree(null);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [effectiveRootPath]);

  const ensureDirLoaded = useCallback(async (dirPath: string) => {
    if (!tree) return;
    const isLoading = loadingDirs[dirPath];
    if (isLoading) return;

    const findNode = (node: TreeNode): TreeNode | null => {
      if (node.path === dirPath) return node;
      if (!node.children) return null;
      for (const c of node.children) {
        const found = findNode(c);
        if (found) return found;
      }
      return null;
    };

    const target = findNode(tree);
    if (!target || target.kind !== 'dir') return;
    if (target.loaded) return;

    setLoadingDirs((prev) => ({ ...prev, [dirPath]: true }));
    try {
      const fs = await import('@tauri-apps/api/fs');
      const entries = await fs.readDir(dirPath, { recursive: false });

      const update = (node: TreeNode): TreeNode => {
        if (node.path === dirPath) {
          return {
            ...node,
            loaded: true,
            children: sortNodes(entries.map((e) => fromDirEntry(e, dirPath))),
          };
        }
        if (!node.children) return node;
        return { ...node, children: node.children.map(update) };
      };

      setTree((prev) => (prev ? update(prev) : prev));
    } catch {
      setError('Failed to read directory.');
    } finally {
      setLoadingDirs((prev) => {
        const next = { ...prev };
        delete next[dirPath];
        return next;
      });
    }
  }, [tree, loadingDirs]);

  const headerTitle = useMemo(() => {
    if (!effectiveRootPath) return 'Explorer';
    return effectiveRootPath.split(/[\\/]/).filter(Boolean).slice(-1)[0] || 'Explorer';
  }, [effectiveRootPath]);

  const renderNode = useCallback(
    (node: TreeNode, depth: number) => {
      const isExpanded = !!expanded[node.path];
      const paddingLeft = 8 + depth * 12;
      const isDirLoading = !!loadingDirs[node.path];

      if (node.kind === 'dir') {
        return (
          <div key={node.path}>
            <button
              type="button"
              className="w-full flex items-center gap-1.5 py-1 text-left hover:bg-gray-100"
              style={{ paddingLeft }}
              onClick={() => {
                toggle(node.path);
                void ensureDirLoaded(node.path);
              }}
              title={node.path}
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-500" />
              )}
              <span className="text-sm text-gray-700 truncate">{node.name}</span>
              {isDirLoading ? (
                <span
                  className="ml-2 w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"
                  aria-label="Loading"
                />
              ) : null}
            </button>
            {isExpanded && node.children ? (
              <div>
                {node.loaded && node.children.length === 0 ? (
                  <div
                    className="py-1 text-xs text-gray-400"
                    style={{ paddingLeft: paddingLeft + 24 }}
                  >
                    Empty
                  </div>
                ) : null}
                {node.children.map((c) => renderNode(c, depth + 1))}
              </div>
            ) : null}
          </div>
        );
      }

      return (
        <button
          key={node.path}
          type="button"
          className="w-full flex items-center gap-2 py-1 text-left hover:bg-gray-100"
          style={{ paddingLeft: paddingLeft + 16 }}
          onClick={() => onOpenFile?.(node.path)}
          title={node.path}
        >
          {renderFileIcon(node.path)}
          <span className="text-sm text-gray-700 truncate">{node.name}</span>
        </button>
      );
    },
    [expanded, loadingDirs, onOpenFile, toggle, ensureDirLoaded],
  );

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="h-10 px-3 flex items-center justify-between border-b border-gray-200">
        <div className="text-sm font-medium text-gray-800 truncate">{headerTitle}</div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={openFile}
            className="p-1.5 rounded-md hover:bg-gray-100 active:bg-gray-200"
            aria-label="Open File"
            title="Open File"
          >
            <FilePlus className="w-4 h-4 text-gray-600" />
          </button>
          <button
            type="button"
            onClick={openFolder}
            className="p-1.5 rounded-md hover:bg-gray-100 active:bg-gray-200"
            aria-label="Open Folder"
            title="Open Folder"
          >
            <FolderOpen className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      {error ? <div className="p-3 text-xs text-red-600">{error}</div> : null}
      {loading ? <div className="p-3 text-xs text-gray-500">Loading...</div> : null}

      <div className="flex-1 min-h-0 overflow-auto">
        {tree ? renderNode(tree, 0) : <div className="p-3 text-xs text-gray-500">No folder opened.</div>}
      </div>
    </div>
  );
}
