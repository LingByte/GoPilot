import { useCallback, useEffect, useMemo, useState } from 'react';
import GitCommitGraph from '@/components/ui/GitCommitGraph';

type GitBranch = {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
};

type GitStatusItem = {
  path: string;
  status: string;
  isStaged: boolean;
};

type GitGraphLine = {
  graph: string;
  hash: string;
  message: string;
  author: string;
  timestamp: number;
  refs: string;
};

export default function GitPanel({ rootPath }: { rootPath: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isRepo, setIsRepo] = useState(false);
  const [currentBranch, setCurrentBranch] = useState<string>('');
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [statusItems, setStatusItems] = useState<GitStatusItem[]>([]);
  const [graphLines, setGraphLines] = useState<GitGraphLine[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Record<string, boolean>>({});
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [localExpanded, setLocalExpanded] = useState(false);
  const [remoteExpanded, setRemoteExpanded] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');

  const refresh = useCallback(async () => {
    if (!rootPath) {
      setIsRepo(false);
      setCurrentBranch('');
      setBranches([]);
      setStatusItems([]);
      setGraphLines([]);
      setSelectedPaths({});
      setError('');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { invoke } = await import('@tauri-apps/api/tauri');

      const repo = await invoke<boolean>('is_git_repository', { path: rootPath });
      setIsRepo(!!repo);
      if (!repo) {
        setCurrentBranch('');
        setBranches([]);
        setStatusItems([]);
        setGraphLines([]);
        setSelectedPaths({});
        return;
      }

      const current = await invoke<string | null>('git_current_branch', { path: rootPath });
      setCurrentBranch(current ?? '');

      const raw = await invoke<any[]>('git_branches', { path: rootPath });
      const list: GitBranch[] = Array.isArray(raw)
        ? raw
            .map((x) => ({
              name: typeof x?.name === 'string' ? x.name : '',
              isCurrent: !!x?.isCurrent,
              isRemote: !!x?.isRemote,
            }))
            .filter((x) => x.name)
        : [];
      setBranches(list);

      const rawStatus = await invoke<any[]>('git_status', { path: rootPath });
      const statusList: GitStatusItem[] = Array.isArray(rawStatus)
        ? rawStatus
            .map((x) => ({
              path: typeof x?.path === 'string' ? x.path : '',
              status: typeof x?.status === 'string' ? x.status : '',
              isStaged: !!x?.isStaged,
            }))
            .filter((x) => x.path)
        : [];
      setStatusItems(statusList);

      const rawGraph = await invoke<any>('git_branch_graph', { path: rootPath });
      const rawLines = rawGraph?.lines;
      const graph: GitGraphLine[] = Array.isArray(rawLines)
        ? rawLines
            .map((x) => ({
              graph: typeof x?.graph === 'string' ? x.graph : '',
              hash: typeof x?.hash === 'string' ? x.hash : '',
              message: typeof x?.message === 'string' ? x.message : '',
              author: typeof x?.author === 'string' ? x.author : '',
              timestamp: typeof x?.timestamp === 'number' ? x.timestamp : 0,
              refs: typeof x?.refs === 'string' ? x.refs : '',
            }))
            .filter((x) => x.hash)
        : [];
      setGraphLines(graph);
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : e?.message ? String(e.message) : 'Failed to load git info.';
      setError(msg);
      setIsRepo(false);
      setCurrentBranch('');
      setBranches([]);
      setStatusItems([]);
      setGraphLines([]);
      setSelectedPaths({});
    } finally {
      setLoading(false);
    }
  }, [rootPath]);

  const runAction = useCallback(
    async (fn: (invoke: <T>(cmd: string, args?: any) => Promise<T>) => Promise<void>) => {
      if (!rootPath) return;
      setActionBusy(true);
      setActionError('');
      try {
        const { invoke } = await import('@tauri-apps/api/tauri');
        await fn(invoke);
        await refresh();
      } catch (e: any) {
        const msg = typeof e === 'string' ? e : e?.message ? String(e.message) : 'Action failed.';
        setActionError(msg);
      } finally {
        setActionBusy(false);
      }
    },
    [refresh, rootPath],
  );

  const checkoutBranch = useCallback(
    async (name: string) => {
      await runAction(async (invoke) => {
        await invoke('git_checkout', { path: rootPath, branch: name });
      });
    },
    [runAction, rootPath],
  );

  const createBranch = useCallback(async () => {
    const name = window.prompt('New branch name');
    if (!name) return;
    await runAction(async (invoke) => {
      await invoke('git_create_branch', { path: rootPath, branch: name });
    });
  }, [runAction, rootPath]);

  const pull = useCallback(async () => {
    await runAction(async (invoke) => {
      await invoke('git_pull', { path: rootPath });
    });
  }, [runAction, rootPath]);

  const push = useCallback(async () => {
    await runAction(async (invoke) => {
      await invoke('git_push', { path: rootPath });
    });
  }, [runAction, rootPath]);

  const stagePaths = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return;
      await runAction(async (invoke) => {
        await invoke('git_add', { path: rootPath, files: paths });
      });
    },
    [runAction, rootPath],
  );

  const commitStaged = useCallback(async () => {
    const msg = commitMessage.trim();
    if (!msg) return;
    await runAction(async (invoke) => {
      await invoke('git_commit', { path: rootPath, message: msg });
    });
    setCommitMessage('');
  }, [commitMessage, runAction, rootPath]);

  const commitAm = useCallback(async () => {
    const msg = commitMessage.trim();
    if (!msg) return;
    const safeMsg = msg.replace(/\r?\n/g, ' ').replace(/"/g, "'");
    await runAction(async (invoke) => {
      await invoke('execute_command', {
        command: `git commit -am "${safeMsg}"`,
        working_dir: rootPath,
      });
    });
    setCommitMessage('');
  }, [commitMessage, runAction, rootPath]);

  const commit = useCallback(async () => {
    const message = window.prompt('Commit message');
    if (!message) return;
    await runAction(async (invoke) => {
      await invoke('git_commit', { path: rootPath, message });
    });
  }, [runAction, rootPath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const localBranches = useMemo(() => branches.filter((b) => !b.isRemote), [branches]);
  const remoteBranches = useMemo(() => branches.filter((b) => b.isRemote), [branches]);

  const currentLocal = useMemo(
    () => localBranches.find((b) => b.isCurrent) ?? localBranches.find((b) => b.name === currentBranch) ?? null,
    [currentBranch, localBranches],
  );

  const matchedRemote = useMemo(() => {
    const name = currentLocal?.name || currentBranch;
    if (!name) return null;
    const candidate1 = `origin/${name}`;
    const found1 = remoteBranches.find((b) => b.name === candidate1);
    if (found1) return found1;
    const found2 = remoteBranches.find((b) => b.name.endsWith(`/${name}`));
    return found2 ?? null;
  }, [currentBranch, currentLocal?.name, remoteBranches]);

  const staged = useMemo(() => statusItems.filter((s) => s.isStaged), [statusItems]);
  const unstaged = useMemo(() => statusItems.filter((s) => !s.isStaged), [statusItems]);
  const selectedList = useMemo(
    () => Object.keys(selectedPaths).filter((p) => selectedPaths[p]),
    [selectedPaths],
  );

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="h-10 px-3 flex items-center justify-between border-b border-gray-200">
        <div className="text-sm font-medium text-gray-800">Git</div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="text-xs px-2 py-1 rounded hover:bg-gray-100 active:bg-gray-200"
            onClick={() => void pull()}
            disabled={loading || actionBusy || !isRepo}
            title="git pull"
          >
            Pull
          </button>
          <button
            type="button"
            className="text-xs px-2 py-1 rounded hover:bg-gray-100 active:bg-gray-200"
            onClick={() => void push()}
            disabled={loading || actionBusy || !isRepo}
            title="git push"
          >
            Push
          </button>
          <button
            type="button"
            className="text-xs px-2 py-1 rounded hover:bg-gray-100 active:bg-gray-200"
            onClick={() => void createBranch()}
            disabled={loading || actionBusy || !isRepo}
            title="git checkout -b"
          >
            New
          </button>
          <button
            type="button"
            className="text-xs px-2 py-1 rounded hover:bg-gray-100 active:bg-gray-200"
            onClick={() => void commit()}
            disabled={loading || actionBusy || !isRepo}
            title="git commit"
          >
            Commit
          </button>
          <button
            type="button"
            className="text-xs px-2 py-1 rounded hover:bg-gray-100 active:bg-gray-200"
            onClick={() => void refresh()}
            disabled={loading || actionBusy}
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? <div className="p-3 text-xs text-red-600 whitespace-pre-wrap">{error}</div> : null}
      {actionError ? <div className="p-3 text-xs text-red-600 whitespace-pre-wrap">{actionError}</div> : null}

      {!rootPath ? (
        <div className="p-3 text-xs text-gray-500">Open a folder to view Git info.</div>
      ) : loading ? (
        <div className="p-3 text-xs text-gray-500">Loading...</div>
      ) : !isRepo ? (
        <div className="p-3 text-xs text-gray-500">No Git repository found in this folder.</div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="p-3">
            <button
              type="button"
              className="w-full flex items-center justify-between text-xs font-medium text-gray-700 mb-2"
              onClick={() => setLocalExpanded((v) => !v)}
            >
              <div>Local</div>
              <div className="text-[11px] text-gray-500">{localExpanded ? 'Collapse' : 'Expand'}</div>
            </button>
            {localBranches.length === 0 ? (
              <div className="text-xs text-gray-500">—</div>
            ) : (
              <div className="space-y-1">
                {(localExpanded ? localBranches : currentLocal ? [currentLocal] : localBranches.slice(0, 1)).map((b) => (
                  <button
                    key={`local:${b.name}`}
                    type="button"
                    className={
                      'w-full flex items-center justify-between px-2 py-1 rounded text-left ' +
                      (b.isCurrent ? 'bg-blue-50' : 'hover:bg-gray-100 active:bg-gray-200')
                    }
                    onClick={() => void checkoutBranch(b.name)}
                    disabled={actionBusy}
                    title="git checkout"
                  >
                    <div className={"text-sm truncate " + (b.isCurrent ? 'text-blue-700 font-medium' : 'text-gray-800')}>
                      {b.name}
                    </div>
                    {b.isCurrent ? <div className="text-[10px] text-blue-700">CURRENT</div> : null}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="p-3 border-t border-gray-200">
            <button
              type="button"
              className="w-full flex items-center justify-between text-xs font-medium text-gray-700 mb-2"
              onClick={() => setRemoteExpanded((v) => !v)}
            >
              <div>Remote</div>
              <div className="text-[11px] text-gray-500">{remoteExpanded ? 'Collapse' : 'Expand'}</div>
            </button>
            {remoteBranches.length === 0 ? (
              <div className="text-xs text-gray-500">—</div>
            ) : (
              <div className="space-y-1">
                {(remoteExpanded
                  ? remoteBranches
                  : matchedRemote
                    ? [matchedRemote]
                    : remoteBranches.slice(0, 1)
                ).map((b) => (
                  <button
                    key={`remote:${b.name}`}
                    type="button"
                    className="w-full flex items-center justify-between px-2 py-1 rounded text-left hover:bg-gray-100 active:bg-gray-200"
                    onClick={() => void checkoutBranch(b.name)}
                    disabled={actionBusy}
                    title="git checkout"
                  >
                    <div className="text-sm truncate text-gray-800">{b.name}</div>
                    <div className="text-[10px] text-gray-500">REMOTE</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="p-3 border-t border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium text-gray-700">Status</div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="text-[11px] px-2 py-1 rounded hover:bg-gray-100 active:bg-gray-200"
                  onClick={() => void stagePaths(unstaged.map((s) => s.path))}
                  disabled={actionBusy || unstaged.length === 0}
                  title="git add -A (for unstaged list)"
                >
                  Stage All
                </button>
                <button
                  type="button"
                  className="text-[11px] px-2 py-1 rounded hover:bg-gray-100 active:bg-gray-200"
                  onClick={() => void stagePaths(selectedList)}
                  disabled={actionBusy || selectedList.length === 0}
                  title="git add (selected)"
                >
                  Stage Selected
                </button>
              </div>
            </div>

            {statusItems.length === 0 ? (
              <div className="text-xs text-gray-500">Working tree clean.</div>
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="text-[11px] text-gray-500 mb-1">Staged</div>
                  {staged.length === 0 ? (
                    <div className="text-xs text-gray-400">—</div>
                  ) : (
                    <div className="space-y-1">
                      {staged.map((s) => (
                        <div key={`staged:${s.path}`} className="flex items-center justify-between">
                          <div className="text-xs text-green-700">{s.status}</div>
                          <div className="text-xs text-gray-800 truncate ml-2 flex-1" title={s.path}>
                            {s.path}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-[11px] text-gray-500 mb-1">Unstaged</div>
                  {unstaged.length === 0 ? (
                    <div className="text-xs text-gray-400">—</div>
                  ) : (
                    <div className="space-y-1">
                      {unstaged.map((s) => {
                        const checked = !!selectedPaths[s.path];
                        return (
                          <button
                            key={`unstaged:${s.path}`}
                            type="button"
                            className={
                              'w-full flex items-center gap-2 px-2 py-1 rounded text-left ' +
                              (checked ? 'bg-gray-100' : 'hover:bg-gray-50 active:bg-gray-100')
                            }
                            onClick={() =>
                              setSelectedPaths((p) => ({
                                ...p,
                                [s.path]: !p[s.path],
                              }))
                            }
                          >
                            <input type="checkbox" checked={checked} readOnly />
                            <div className="text-xs text-yellow-700 w-20 shrink-0">{s.status}</div>
                            <div className="text-xs text-gray-800 truncate" title={s.path}>
                              {s.path}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-gray-200">
            <div className="text-xs font-medium text-gray-700 mb-2">Graph</div>
            {graphLines.length === 0 ? (
              <div className="text-xs text-gray-500">—</div>
            ) : (
              <GitCommitGraph
                lines={graphLines.map((l) => ({
                  graph: l.graph,
                  hash: l.hash,
                  message: l.message,
                  refs: l.refs,
                  timestamp: l.timestamp,
                }))}
              />
            )}
          </div>

          <div className="p-3 border-t border-gray-200">
            <div className="text-xs font-medium text-gray-700 mb-2">Commit</div>
            <div className="flex items-center gap-2">
              <input
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="message..."
                className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded"
                disabled={actionBusy}
              />
              <button
                type="button"
                className="text-xs px-2 py-1 rounded hover:bg-gray-100 active:bg-gray-200"
                onClick={() => void commitStaged()}
                disabled={actionBusy || !commitMessage.trim()}
                title="git commit (staged)"
              >
                Commit
              </button>
              <button
                type="button"
                className="text-xs px-2 py-1 rounded hover:bg-gray-100 active:bg-gray-200"
                onClick={() => void commitAm()}
                disabled={actionBusy || !commitMessage.trim()}
                title="git commit -am"
              >
                -am
              </button>
            </div>
            <div className="text-[11px] text-gray-500 mt-1">
              Stage files using the checkboxes above.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
