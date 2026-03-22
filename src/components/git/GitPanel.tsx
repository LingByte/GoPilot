import { useCallback, useEffect, useMemo, useState } from 'react';
import GitCommitGraph from '@/components/ui/GitCommitGraph';
import Modal from '@/components/ui/Modal';

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

export default function GitPanel({
  rootPath,
  onOutput,
}: {
  rootPath: string;
  onOutput?: (title: string, text: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isRepo, setIsRepo] = useState(false);
  const [currentBranch, setCurrentBranch] = useState<string>('');
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [statusItems, setStatusItems] = useState<GitStatusItem[]>([]);
  const [graphLines, setGraphLines] = useState<GitGraphLine[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Record<string, boolean>>({});
  const [selectedStagedPaths, setSelectedStagedPaths] = useState<Record<string, boolean>>({});
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [localExpanded, setLocalExpanded] = useState(false);
  const [remoteExpanded, setRemoteExpanded] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [aheadBy, setAheadBy] = useState(0);
  const [behindBy, setBehindBy] = useState(0);

  const [createLocalOpen, setCreateLocalOpen] = useState(false);
  const [createLocalName, setCreateLocalName] = useState('');
  const [createRemoteOpen, setCreateRemoteOpen] = useState(false);
  const [createRemoteName, setCreateRemoteName] = useState('');
  const [createRemoteLocalName, setCreateRemoteLocalName] = useState('');

  const [diffOpen, setDiffOpen] = useState(false);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState('');
  const [diffFile, setDiffFile] = useState('');
  const [diffData, setDiffData] = useState<any>(null);

  const openDiff = useCallback(
    async (file: string) => {
      if (!rootPath || !file) return;
      setDiffOpen(true);
      setDiffFile(file);
      setDiffLoading(true);
      setDiffError('');
      setDiffData(null);

      try {
        const { invoke } = await import('@tauri-apps/api/tauri');
        const res = await invoke<any>('git_diff', { path: rootPath, file });
        setDiffData(res);
      } catch (e: any) {
        const msg = typeof e === 'string' ? e : e?.message ? String(e.message) : 'Failed to load diff.';
        setDiffError(msg);
      } finally {
        setDiffLoading(false);
      }
    },
    [rootPath],
  );

  const refresh = useCallback(async () => {
    if (!rootPath) {
      setIsRepo(false);
      setCurrentBranch('');
      setBranches([]);
      setStatusItems([]);
      setGraphLines([]);
      setSelectedPaths({});
      setSelectedStagedPaths({});
      setAheadBy(0);
      setBehindBy(0);
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
        setSelectedStagedPaths({});
        setAheadBy(0);
        setBehindBy(0);
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

      try {
        const sb = await invoke<string>('execute_command', {
          command: 'git status -sb',
          working_dir: rootPath,
        });
        const firstLine = String(sb || '').split(/\r?\n/)[0] ?? '';
        const aheadMatch = firstLine.match(/\[.*?ahead\s+(\d+).*?\]/);
        const behindMatch = firstLine.match(/\[.*?behind\s+(\d+).*?\]/);
        setAheadBy(aheadMatch ? Number(aheadMatch[1]) || 0 : 0);
        setBehindBy(behindMatch ? Number(behindMatch[1]) || 0 : 0);
      } catch {
        setAheadBy(0);
        setBehindBy(0);
      }
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : e?.message ? String(e.message) : 'Failed to load git info.';
      setError(msg);
      setIsRepo(false);
      setCurrentBranch('');
      setBranches([]);
      setStatusItems([]);
      setGraphLines([]);
      setSelectedPaths({});
      setSelectedStagedPaths({});
      setAheadBy(0);
      setBehindBy(0);
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
        setSelectedPaths({});
        setSelectedStagedPaths({});
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

  const openCreateLocal = useCallback(() => {
    setCreateLocalName('');
    setCreateLocalOpen(true);
  }, []);

  const submitCreateLocal = useCallback(async () => {
    const name = createLocalName.trim();
    if (!name) return;
    await runAction(async (invoke) => {
      await invoke('git_create_branch', { path: rootPath, branch: name });
      await invoke('git_checkout', { path: rootPath, branch: name });
    });
    setCreateLocalOpen(false);
    setCreateLocalName('');
  }, [createLocalName, runAction, rootPath]);

  const openCreateFromRemote = useCallback(
    (remoteName: string) => {
      const guessed = remoteName.includes('/') ? remoteName.split('/').slice(1).join('/') : remoteName;
      setCreateRemoteName(remoteName);
      setCreateRemoteLocalName(guessed);
      setCreateRemoteOpen(true);
    },
    [],
  );

  const submitCreateFromRemote = useCallback(async () => {
    const remoteName = createRemoteName.trim();
    const localName = createRemoteLocalName.trim();
    if (!remoteName || !localName) return;
    await runAction(async (invoke) => {
      await invoke('execute_command', {
        command: `git checkout -b "${localName.replace(/"/g, "'")}" --track "${remoteName.replace(/"/g, "'")}"`,
        working_dir: rootPath,
      });
    });
    setCreateRemoteOpen(false);
    setCreateRemoteName('');
    setCreateRemoteLocalName('');
  }, [createRemoteLocalName, createRemoteName, runAction, rootPath]);
  const stagePaths = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return;
      await runAction(async (invoke) => {
        await invoke('git_add', { path: rootPath, files: paths });
      });
    },
    [runAction, rootPath],
  );

  const unstagePaths = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return;
      const args = paths.map((p) => `"${String(p).replace(/"/g, "'")}"`).join(' ');
      await runAction(async (invoke) => {
        await invoke('execute_command', {
          command: `git reset HEAD -- ${args}`,
          working_dir: rootPath,
        });
      });
    },
    [runAction, rootPath],
  );

  const pull = useCallback(async () => {
    onOutput?.('git pull', 'START');
    try {
      let out = '';
      await runAction(async (invoke) => {
        out = (await invoke<string>('git_pull', { path: rootPath })) ?? '';
      });
      onOutput?.('git pull', out || 'DONE');
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : e?.message ? String(e.message) : 'Git pull failed.';
      onOutput?.('git pull', `ERROR: ${msg}`);
    }
  }, [onOutput, rootPath, runAction]);

  const push = useCallback(async () => {
    onOutput?.('git push', 'START');
    try {
      let out = '';
      await runAction(async (invoke) => {
        out = (await invoke<string>('git_push', { path: rootPath })) ?? '';
      });
      onOutput?.('git push', out || 'DONE');
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : e?.message ? String(e.message) : 'Git push failed.';
      onOutput?.('git push', `ERROR: ${msg}`);
    }
  }, [onOutput, rootPath, runAction]);

  const commitAll = useCallback(async () => {
    const msg = commitMessage.trim();
    if (!msg) return;
    const safeMsg = msg.replace(/\r?\n/g, ' ').replace(/"/g, "'");
    await runAction(async (invoke) => {
      await invoke('execute_command', {
        command: 'git add -A',
        working_dir: rootPath,
      });
      await invoke('git_commit', { path: rootPath, message: safeMsg });
    });
    setCommitMessage('');
  }, [commitMessage, runAction, rootPath]);

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
  const selectedStagedList = useMemo(
    () => Object.keys(selectedStagedPaths).filter((p) => selectedStagedPaths[p]),
    [selectedStagedPaths],
  );

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="h-10 px-3 flex items-center justify-between border-b border-gray-200">
        <div className="text-sm font-medium text-gray-800">Git</div>
        <div />
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
          <Modal
            open={createLocalOpen}
            title="Create Branch"
            onClose={() => setCreateLocalOpen(false)}
            footer={
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="text-xs px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50"
                  onClick={() => setCreateLocalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
                  onClick={() => void submitCreateLocal()}
                  disabled={actionBusy || !createLocalName.trim()}
                >
                  Create
                </button>
              </div>
            }
          >
            <div className="text-[11px] text-gray-500 mb-1">Branch name</div>
            <input
              value={createLocalName}
              onChange={(e) => setCreateLocalName(e.target.value)}
              placeholder="feature/my-work"
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded"
              disabled={actionBusy}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitCreateLocal();
              }}
            />
          </Modal>

          <Modal
            open={diffOpen}
            title={diffFile ? `Diff: ${diffFile}` : 'Diff'}
            onClose={() => setDiffOpen(false)}
            widthClassName="w-[720px]"
            footer={
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-gray-500">
                  {diffData?.additions != null || diffData?.deletions != null
                    ? `+${diffData?.additions ?? 0}  -${diffData?.deletions ?? 0}`
                    : ''}
                </div>
                <button
                  type="button"
                  className="text-xs px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50"
                  onClick={() => setDiffOpen(false)}
                >
                  Close
                </button>
              </div>
            }
          >
            {diffLoading ? (
              <div className="text-xs text-gray-500">Loading...</div>
            ) : diffError ? (
              <div className="text-xs text-red-600 whitespace-pre-wrap">{diffError}</div>
            ) : !diffData ? (
              <div className="text-xs text-gray-500">—</div>
            ) : (
              <div className="text-xs font-mono overflow-auto">
                {Array.isArray(diffData?.hunks) && diffData.hunks.length > 0 ? (
                  <div className="space-y-3">
                    {diffData.hunks.map((h: any, idx: number) => (
                      <div key={idx} className="border border-gray-200 rounded">
                        <div className="px-2 py-1 text-[11px] text-gray-600 bg-gray-50 border-b border-gray-200">
                          @@ -{h?.oldStart ?? 0},{h?.oldLines ?? 0} +{h?.newStart ?? 0},{h?.newLines ?? 0} @@
                        </div>
                        <div className="px-2 py-1 overflow-auto">
                          {(h?.lines ?? []).map((ln: any, i: number) => {
                            const t = String(ln?.type || 'context');
                            const content = String(ln?.content ?? '');
                            const prefix = t === 'added' ? '+' : t === 'deleted' ? '-' : ' ';
                            const cls =
                              t === 'added'
                                ? 'text-green-700'
                                : t === 'deleted'
                                  ? 'text-red-700'
                                  : 'text-gray-700';
                            return (
                              <div key={i} className={cls + ' whitespace-pre'}>
                                {prefix}
                                {content}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500">No diff.</div>
                )}
              </div>
            )}
          </Modal>

          <Modal
            open={createRemoteOpen}
            title="Create Tracking Branch"
            onClose={() => setCreateRemoteOpen(false)}
            footer={
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="text-xs px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50"
                  onClick={() => setCreateRemoteOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
                  onClick={() => void submitCreateFromRemote()}
                  disabled={actionBusy || !createRemoteLocalName.trim()}
                >
                  Create
                </button>
              </div>
            }
          >
            <div className="text-[11px] text-gray-500 mb-1">Remote</div>
            <div className="text-sm text-gray-800 mb-3 font-mono">{createRemoteName || '—'}</div>
            <div className="text-[11px] text-gray-500 mb-1">Local branch name</div>
            <input
              value={createRemoteLocalName}
              onChange={(e) => setCreateRemoteLocalName(e.target.value)}
              placeholder="feature/my-work"
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded"
              disabled={actionBusy}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitCreateFromRemote();
              }}
            />
          </Modal>

          <div className="p-3">
            <div className="w-full flex items-center justify-between mb-2">
              <button
                type="button"
                className="text-xs font-medium text-gray-700"
                onClick={() => setLocalExpanded((v) => !v)}
              >
                Local
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-[11px] text-gray-500 hover:text-gray-700"
                  onClick={() => openCreateLocal()}
                  disabled={actionBusy}
                  title="Create new local branch"
                >
                  Add
                </button>
                <button
                  type="button"
                  className="text-[11px] text-gray-500 hover:text-gray-700"
                  onClick={() => setLocalExpanded((v) => !v)}
                >
                  {localExpanded ? 'Collapse' : 'Expand'}
                </button>
              </div>
            </div>
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
            <div className="w-full flex items-center justify-between mb-2">
              <button
                type="button"
                className="text-xs font-medium text-gray-700"
                onClick={() => setRemoteExpanded((v) => !v)}
              >
                Remote
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-[11px] text-gray-500 hover:text-gray-700"
                  onClick={() => {
                    if (matchedRemote) openCreateFromRemote(matchedRemote.name);
                  }}
                  disabled={actionBusy || !matchedRemote}
                  title={matchedRemote ? 'Create local branch tracking this remote' : 'No matching remote'}
                >
                  Add
                </button>
                <button
                  type="button"
                  className="text-[11px] text-gray-500 hover:text-gray-700"
                  onClick={() => setRemoteExpanded((v) => !v)}
                >
                  {remoteExpanded ? 'Collapse' : 'Expand'}
                </button>
              </div>
            </div>
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
            <div className="text-xs font-medium text-gray-700 mb-2">Commit</div>
            <div className="space-y-2">
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
                  onClick={() => void commitAll()}
                  disabled={actionBusy || !commitMessage.trim()}
                  title="git add -A && git commit"
                >
                  Commit
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-xs px-2 py-1 rounded hover:bg-gray-100 active:bg-gray-200"
                  onClick={() => void pull()}
                  disabled={actionBusy}
                  title="git pull"
                >
                  Pull{behindBy > 0 ? ` ↓${behindBy}` : ''}
                </button>
                {aheadBy > 0 ? (
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded hover:bg-gray-100 active:bg-gray-200"
                    onClick={() => void push()}
                    disabled={actionBusy}
                    title="git push"
                  >
                    Push{` ↑${aheadBy}`}
                  </button>
                ) : null}
              </div>
            </div>
            <div className="text-[11px] text-gray-500 mt-1">Commit will stage all changes (git add -A).</div>
          </div>

          <div className="p-3 border-t border-gray-200">
            <div className="flex items-center justify-between mb-2">
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
                <button
                  type="button"
                  className="text-[11px] px-2 py-1 rounded hover:bg-gray-100 active:bg-gray-200"
                  onClick={() => void unstagePaths(selectedStagedList)}
                  disabled={actionBusy || selectedStagedList.length === 0}
                  title="git reset HEAD -- <selected>"
                >
                  Unstage Selected
                </button>
                <button
                  type="button"
                  className="text-[11px] px-2 py-1 rounded hover:bg-gray-100 active:bg-gray-200"
                  onClick={() => void unstagePaths(staged.map((s) => s.path))}
                  disabled={actionBusy || staged.length === 0}
                  title="git reset HEAD -- <all staged>"
                >
                  Unstage All
                </button>
              </div>
            </div>

            {statusItems.length === 0 ? (
              <div className="text-xs text-gray-500">Working tree clean.</div>
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="text-[11px] text-gray-500 mb-1">Changes</div>
                  {unstaged.length === 0 ? (
                    <div className="text-xs text-gray-400">—</div>
                  ) : (
                    <div className="space-y-1">
                      {unstaged.map((s) => {
                        const checked = !!selectedPaths[s.path];
                        return (
                          <div
                            key={`unstaged:${s.path}`}
                            className={
                              'w-full flex items-center gap-2 px-2 py-1 rounded text-left cursor-pointer ' +
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
                            <div className="text-xs text-gray-800 truncate flex-1" title={s.path}>
                              {s.path}
                            </div>
                            <button
                              type="button"
                              className="text-[11px] px-2 py-0.5 rounded border border-gray-200 hover:bg-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                void openDiff(s.path);
                              }}
                              disabled={actionBusy}
                              title="View diff"
                            >
                              Diff
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-[11px] text-gray-500 mb-1">Staged</div>
                  {staged.length === 0 ? (
                    <div className="text-xs text-gray-400">—</div>
                  ) : (
                    <div className="space-y-1">
                      {staged.map((s) => {
                        const checked = !!selectedStagedPaths[s.path];
                        return (
                          <div
                            key={`staged:${s.path}`}
                            className={
                              'w-full flex items-center gap-2 px-2 py-1 rounded text-left cursor-pointer ' +
                              (checked ? 'bg-gray-100' : 'hover:bg-gray-50 active:bg-gray-100')
                            }
                            onClick={() =>
                              setSelectedStagedPaths((p) => ({
                                ...p,
                                [s.path]: !p[s.path],
                              }))
                            }
                          >
                            <input type="checkbox" checked={checked} readOnly />
                            <div className="text-xs text-green-700 w-20 shrink-0">{s.status}</div>
                            <div className="text-xs text-gray-800 truncate flex-1" title={s.path}>
                              {s.path}
                            </div>
                            <button
                              type="button"
                              className="text-[11px] px-2 py-0.5 rounded border border-gray-200 hover:bg-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                void openDiff(s.path);
                              }}
                              disabled={actionBusy}
                              title="View diff"
                            >
                              Diff
                            </button>
                          </div>
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
        </div>
      )}
    </div>
  );
}
