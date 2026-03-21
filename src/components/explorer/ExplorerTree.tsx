import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, File as FileIcon, FolderOpen } from 'lucide-react';

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
          <FileIcon className="w-4 h-4 text-gray-400" />
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

      {error ? <div className="p-3 text-xs text-red-600">{error}</div> : null}
      {loading ? <div className="p-3 text-xs text-gray-500">Loading...</div> : null}

      <div className="flex-1 min-h-0 overflow-auto">
        {tree ? renderNode(tree, 0) : <div className="p-3 text-xs text-gray-500">No folder opened.</div>}
      </div>
    </div>
  );
}
