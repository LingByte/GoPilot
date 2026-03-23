import { useCallback, useEffect, useMemo, useState } from 'react';
import GitCommitGraph from '@/components/ui/GitCommitGraph';
import Modal from '@/components/ui/Modal';
import { RefreshCw } from 'lucide-react';

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
  const [remoteMenuOpen, setRemoteMenuOpen] = useState(false);
  const [graphExpanded, setGraphExpanded] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [commitAiBusy, setCommitAiBusy] = useState(false);
  const [commitAiError, setCommitAiError] = useState('');
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
        // Prefer porcelain v2 (stable) for ahead/behind
        const porcelain = await invoke<string>('execute_command', {
          command: 'git status --porcelain=2 --branch',
          working_dir: rootPath,
        });
        const lines = String(porcelain || '').split(/\r?\n/);
        const abLine = lines.find((l) => l.startsWith('# branch.ab')) ?? '';
        const abMatch = abLine.match(/#\s+branch\.ab\s+\+(\d+)\s+\-(\d+)/);
        if (abMatch) {
          setAheadBy(Number(abMatch[1]) || 0);
          setBehindBy(Number(abMatch[2]) || 0);
        } else {
          // Fallback: parse `git status -sb`
          const sb = await invoke<string>('execute_command', {
            command: 'git status -sb',
            working_dir: rootPath,
          });
          const firstLine = String(sb || '').split(/\r?\n/)[0] ?? '';
          const aheadMatch = firstLine.match(/\[.*?ahead\s+(\d+).*?\]/);
          const behindMatch = firstLine.match(/\[.*?behind\s+(\d+).*?\]/);
          setAheadBy(aheadMatch ? Number(aheadMatch[1]) || 0 : 0);
          setBehindBy(behindMatch ? Number(behindMatch[1]) || 0 : 0);
        }
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

  const generateCommitMessageWithAi = useCallback(async () => {
    if (!rootPath) return;
    if (commitAiBusy) return;

    setCommitAiBusy(true);
    setCommitAiError('');
    try {
      const { invoke } = await import('@tauri-apps/api/tauri');

      const stagedLocal = statusItems.filter((s) => s.isStaged);
      const unstagedLocal = statusItems.filter((s) => !s.isStaged);

      const changedPaths = [...unstagedLocal.map((s) => s.path), ...stagedLocal.map((s) => s.path)].filter(Boolean);
      const uniquePaths = Array.from(new Set(changedPaths));
      if (uniquePaths.length === 0) {
        setCommitAiError('没有检测到改动文件');
        return;
      }

      const MAX_FILES = 20;
      const MAX_CHARS = 12000;
      let buf = '';
      let usedFiles = 0;
      let truncated = false;

      for (const file of uniquePaths.slice(0, MAX_FILES)) {
        let diff: any = null;
        try {
          diff = await invoke<any>('git_diff', { path: rootPath, file });
        } catch {
          diff = null;
        }

        const additions = diff?.additions ?? '';
        const deletions = diff?.deletions ?? '';
        const hunks = Array.isArray(diff?.hunks) ? diff.hunks : [];
        let diffText = '';
        for (const h of hunks) {
          const lines = Array.isArray(h?.lines) ? h.lines : [];
          for (const ln of lines) {
            const t = String(ln?.type || 'context');
            const content = String(ln?.content ?? '');
            const prefix = t === 'added' ? '+' : t === 'deleted' ? '-' : ' ';
            diffText += prefix + content + '\n';
            if (diffText.length > 2000) {
              diffText += '...(diff truncated)\n';
              break;
            }
          }
          if (diffText.includes('...(diff truncated)')) break;
        }

        const chunk = `### ${file}\n+${additions} -${deletions}\n\n${diffText}\n`;
        if (buf.length + chunk.length > MAX_CHARS) {
          truncated = true;
          break;
        }
        buf += chunk;
        usedFiles++;
      }

      if (uniquePaths.length > usedFiles) truncated = true;

      const aiConfig = await invoke<any>('ai_get_config');
      const model = typeof aiConfig?.model === 'string' && aiConfig.model.trim() ? aiConfig.model : 'gpt-3.5-turbo';

      const stagedList = stagedLocal.map((s) => `${s.status}\t${s.path}`).join('\n');
      const unstagedList = unstagedLocal.map((s) => `${s.status}\t${s.path}`).join('\n');

      const system = `你是 GoPilot 的 Git commit message 生成助手。请根据提供的改动信息生成一个高质量、信息全面、符合 Conventional Commits 的 commit message。

输出格式要求（严格）：
- 只输出 commit message 纯文本，不要解释、不要 markdown、不要代码块
- 第一行必须是 Conventional Commits header：<type>(<scope>): <subject> 或 <type>: <subject>
  - type 必须从：feat, fix, refactor, perf, docs, test, chore, build, ci, style, revert 里选
  - scope 可选（建议从模块/目录名归纳，如 git, ai, terminal, editor, explorer 等），没有就省略括号
  - subject 必须是具体内容，禁止出现占位符/模板：禁止使用 <subject>、<scope>、"scope: xxx" 这种模板段落
  - subject 使用英文小写开头（除专有名词），尽量 <= 72 字符
- 如有必要，可以追加 body（空一行后），用条目列出关键改动点（每条以 - 开头）
- 如有 BREAKING CHANGE：在 footer（空一行后）写 BREAKING CHANGE: ...，并在 type 后加 !（如 feat!: ...）

内容要求：
- 必须覆盖最重要的用户可感知变化与关键技术改动
- 如果改动包含 bug 修复，要明确修复点
- 如果改动只是格式/依赖/构建/工具链，也要选对 type（例如 chore/build/ci/style）
- 如果信息不足，做最合理的概括，但不要编造不存在的功能

示例（只作为格式参考，不要照抄）：
fix(terminal): ensure unique session id to prevent duplicated prompt
- use uuid v4 for terminal sessions
- debounce resize events to reduce prompt redraw`;

      const user = `项目路径：${rootPath}\n当前分支：${currentBranch || '(unknown)'}\n\n改动文件总数：${uniquePaths.length}${truncated ? '（diff 已截断/压缩）' : ''}\n\nStaged files（将被提交）:\n${stagedList || '(none)'}\n\nUnstaged files（未暂存，但可能也相关）:\n${unstagedList || '(none)'}\n\nDiff（摘要/截断，按文件分组）：\n${buf}`;

      const resp = await invoke<any>('ai_chat', {
        request: {
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.2,
          max_tokens: 320,
          stream: false,
        },
      });

      const text =
        resp?.choices?.[0]?.message?.content != null ? String(resp.choices[0].message.content) : '';

      const cleaned = String(text || '')
        .replace(/```[a-zA-Z]*\n?/g, '')
        .replace(/```/g, '')
        .replace(/\r\n/g, '\n')
        .trim();

      const lines = cleaned
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      const allowedTypes = ['feat', 'fix', 'refactor', 'perf', 'docs', 'test', 'chore', 'build', 'ci', 'style', 'revert'] as const;
      type AllowedType = (typeof allowedTypes)[number];
      const headerRe = /^(feat|fix|refactor|perf|docs|test|chore|build|ci|style|revert)(\([^)]+\))?(!)?:\s+.+/i;
      const templateGarbageRe = /^(scope\s*:|<subject>|<scope>|<type>|<.*?>)$/i;

      const inferScopeFromPaths = (paths: string[]): string => {
        const joined = paths.join('\n');
        const knownScopes = ['git', 'ai', 'terminal', 'editor', 'explorer'] as const;
        for (const s of knownScopes) {
          if (new RegExp(`(^|/)${s}(/|$)`, 'i').test(joined)) return s;
        }
        const first = paths[0] || '';
        const m = first.match(/^(?:src\/)?([^\/]+)/i);
        const raw = (m?.[1] || '').toLowerCase();
        if (!raw) return 'app';
        if (raw === 'components') return 'ui';
        return raw.replace(/[^a-z0-9_-]+/g, '').slice(0, 32) || 'app';
      };

      const inferTypeFromPaths = (paths: string[]): AllowedType => {
        const joined = paths.join('\n').toLowerCase();
        if (/(package\.json|pnpm-lock|package-lock|yarn\.lock|vite\.config|tauri\.conf)/.test(joined)) return 'build';
        if (/(readme\.md|\.md$)/.test(joined)) return 'docs';
        if (/(test|__tests__|\.spec\.|\.test\.)/.test(joined)) return 'test';
        return 'chore';
      };

      const sanitizeSubject = (s: string): string => {
        let out = (s || '').trim();
        out = out.replace(/^[-*\s]+/, '').trim();
        out = out.replace(/^"|"$/g, '').trim();
        out = out.replace(/<[^>]+>/g, '').trim();
        out = out.replace(/^(scope\s*:|type\s*:|subject\s*:)/i, '').trim();
        if (!out || /^(todo|tbd|n\/a)$/i.test(out)) return '';
        // Lowercase first char when it's a letter.
        out = out.replace(/^([A-Z])/, (m) => m.toLowerCase());
        // Keep it reasonably short.
        if (out.length > 72) out = out.slice(0, 72).trim();
        return out;
      };

      const coerceHeader = (candidate: string, paths: string[]): string => {
        const fallbackType = inferTypeFromPaths(paths);
        const fallbackScope = inferScopeFromPaths(paths);

        const raw = String(candidate || '').trim();
        // Try exact conventional header first.
        if (headerRe.test(raw)) {
          const m = raw.match(/^(feat|fix|refactor|perf|docs|test|chore|build|ci|style|revert)(\([^)]+\))?(!)?:\s+(.+)$/i);
          const type = (m?.[1] || fallbackType).toLowerCase() as AllowedType;
          const scope = (m?.[2] || '').trim();
          const bang = (m?.[3] || '').trim();
          const subject = sanitizeSubject(m?.[4] || '') || 'update changes';
          return `${type}${scope}${bang}: ${subject}`;
        }

        // Try to extract a type from free-form output.
        const typeMatch = raw.match(/\b(feat|fix|refactor|perf|docs|test|chore|build|ci|style|revert)\b/i);
        const type = ((typeMatch?.[1] || fallbackType) as string).toLowerCase() as AllowedType;

        // Try to extract a scope like "(scope)".
        const scopeMatch = raw.match(/\(([^)]+)\)/);
        const extractedScope = (scopeMatch?.[1] || '').trim();
        const scope = extractedScope
          ? extractedScope.replace(/[^a-z0-9_-]+/gi, '').slice(0, 32)
          : fallbackScope;

        // Try to extract subject part after ':'
        const afterColon = raw.includes(':') ? raw.split(':').slice(1).join(':') : raw;
        const subject = sanitizeSubject(afterColon) || 'update changes';

        return `${type}${scope ? `(${scope})` : ''}: ${subject}`;
      };

      let headerLine = lines.find((l) => headerRe.test(l)) ?? '';
      if (!headerLine) {
        // Try to salvage: sometimes model outputs template blocks or headings first.
        headerLine = lines.find((l) => !templateGarbageRe.test(l) && /:/.test(l)) ?? '';
      }

      // Remove common template prefixes like "feat(feature)" / "scope: xxx" lines.
      headerLine = headerLine
        .replace(/^\s*(type\s*:|scope\s*:|subject\s*:)/i, '')
        .trim();

      // Always coerce into a valid Conventional Commits header to avoid blocking user.
      const coercedHeader = coerceHeader(headerLine || lines[0] || '', uniquePaths);
      headerLine = coercedHeader;

      const bodyLines: string[] = [];
      let inBody = false;
      for (const l of lines) {
        if (!inBody) {
          if (l === headerLine) inBody = true;
          continue;
        }
        if (/^breaking change\s*:/i.test(l)) {
          bodyLines.push(l);
          continue;
        }
        if (l.startsWith('- ')) {
          bodyLines.push(l);
          continue;
        }
      }

      const next = [headerLine, bodyLines.length ? '' : null, bodyLines.length ? bodyLines.join('\n') : null]
        .filter((x) => x != null)
        .join('\n')
        .trim();

      if (!next) {
        setCommitAiError('AI 未返回 commit message');
        return;
      }
      setCommitMessage(next);
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : e?.message ? String(e.message) : 'AI 生成失败';
      setCommitAiError(msg);
    } finally {
      setCommitAiBusy(false);
    }
  }, [commitAiBusy, rootPath, statusItems]);

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

  useEffect(() => {
    if (!remoteMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      // close on outside click
      if (!el.closest('[data-git-remote-menu]')) {
        setRemoteMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [remoteMenuOpen]);

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="h-10 px-3 flex items-center justify-between border-b border-gray-200">
        <div className="text-sm font-medium text-gray-800">Git</div>
        <div className="relative" data-git-remote-menu>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="p-1 rounded hover:bg-gray-100 active:bg-gray-200 disabled:opacity-50"
              onClick={() => void refresh()}
              disabled={loading || actionBusy}
              title="Refresh"
            >
              <RefreshCw className={(loading ? 'animate-spin ' : '') + 'w-4 h-4 text-gray-600'} />
            </button>
            <div className="text-[11px] text-gray-500">Remote</div>
            <div className="text-[11px] text-gray-800 font-mono max-w-[160px] truncate" title={matchedRemote?.name || '—'}>
              {matchedRemote?.name || '—'}
            </div>
            <button
              type="button"
              className="text-[11px] text-gray-500 hover:text-gray-800"
              onClick={() => setRemoteMenuOpen((v) => !v)}
              disabled={actionBusy || remoteBranches.length === 0}
              title="Expand remotes"
            >
              {remoteMenuOpen ? 'Collapse' : 'Expand'}
            </button>
          </div>

          {remoteMenuOpen && (
            <div className="absolute right-0 top-9 w-[320px] max-h-[50vh] overflow-auto bg-white border border-gray-200 rounded shadow-lg z-50">
              <div className="px-2 py-2 text-[11px] text-gray-500 border-b border-gray-100">Remote Branches</div>
              <div className="p-2 space-y-1">
                {remoteBranches.map((b) => (
                  <button
                    key={`remote-menu:${b.name}`}
                    type="button"
                    className="w-full flex items-center justify-between px-2 py-1 rounded text-left hover:bg-gray-50 active:bg-gray-100"
                    onClick={() => {
                      setRemoteMenuOpen(false);
                      openCreateFromRemote(b.name);
                    }}
                    disabled={actionBusy}
                    title="Create tracking branch"
                  >
                    <div className="text-xs text-gray-800 truncate font-mono" title={b.name}>
                      {b.name}
                    </div>
                    <div className="text-[10px] text-gray-500">REMOTE</div>
                  </button>
                ))}
              </div>
            </div>
          )}
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
            <div className="text-xs font-medium text-gray-700 mb-2">Commit</div>
            <div className="space-y-2">
              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="message..."
                className="w-full text-xs px-2 py-1 border border-gray-200 rounded resize-y min-h-[64px] max-h-40"
                disabled={actionBusy || commitAiBusy}
              />

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-xs px-2 py-1 rounded hover:bg-gray-100 active:bg-gray-200"
                  onClick={() => void commitAll()}
                  disabled={actionBusy || !commitMessage.trim()}
                  title="git add -A && git commit"
                >
                  Commit
                </button>
                <button
                  type="button"
                  className="text-xs px-2 py-1 rounded hover:bg-gray-100 active:bg-gray-200"
                  onClick={() => void generateCommitMessageWithAi()}
                  disabled={actionBusy || commitAiBusy || (!unstaged.length && !staged.length)}
                  title="AI 生成 commit message"
                >
                  {commitAiBusy ? 'AI...' : 'AI'}
                </button>
              </div>

              {commitAiError ? <div className="text-[11px] text-red-600 whitespace-pre-wrap">{commitAiError}</div> : null}

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
                    <div className="space-y-1 max-h-60 overflow-auto pr-1">
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
                    <div className="space-y-1 max-h-60 overflow-auto pr-1">
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
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium text-gray-700">Graph</div>
              <button
                type="button"
                className="text-[11px] text-gray-500 hover:text-gray-800"
                onClick={() => setGraphExpanded((v) => !v)}
                disabled={graphLines.length === 0}
              >
                {graphExpanded ? 'Collapse' : 'Expand'}
              </button>
            </div>

            {graphLines.length === 0 ? (
              <div className="text-xs text-gray-500">—</div>
            ) : graphExpanded ? (
              <GitCommitGraph lines={graphLines} />
            ) : (
              <div className="text-xs text-gray-500"></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

