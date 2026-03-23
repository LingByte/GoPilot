import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Sparkles, Code, FileText, CheckCircle, AlertTriangle, Settings, Plus, Clock, ArrowLeft, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';
import { ConversationProvider, useConversation } from '../../contexts/ConversationContext';

type FileRef = {
  path: string;
  displayPath: string;
};

function flattenDirectoryTree(nodes: any[], rootPath: string) {
  const out: Array<{ path: string; displayPath: string }> = [];
  const excludedDirNames = new Set([
    'node_modules',
    'target',
    'dist',
    'build',
    '.git',
    '.next',
    '.turbo',
    '.cache',
    '.idea',
    '.vscode',
  ]);

  const walk = (xs: any[]) => {
    for (const n of xs ?? []) {
      const p = typeof n?.path === 'string' ? n.path : '';
      const t = typeof n?.type === 'string' ? n.type : (typeof n?.entry_type === 'string' ? n.entry_type : '');
      const isDir = t === 'directory' || Array.isArray(n?.children);
      if (isDir) {
        const name = typeof n?.name === 'string' && n.name ? String(n.name) : (p ? String(p).split(/[\\/]/).filter(Boolean).slice(-1)[0] : '');
        if (name && excludedDirNames.has(name)) {
          continue;
        }
        if (Array.isArray(n?.children)) walk(n.children);
        continue;
      }
      if (!p) continue;
      const rel = p.startsWith(rootPath) ? p.slice(rootPath.length).replace(/^\//, '') : p;
      out.push({ path: p, displayPath: rel || p });
    }
  };

  walk(nodes);
  out.sort((a, b) => a.displayPath.localeCompare(b.displayPath));
  return out;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegExp(glob: string) {
  // Minimal glob support: *, **, ?
  // - '*' matches any chars except '/'
  // - '**' matches any chars including '/'
  // - '?' matches one char except '/'
  const g = String(glob ?? '').trim();
  if (!g) return null;
  const parts: string[] = [];
  let i = 0;
  while (i < g.length) {
    const ch = g[i];
    if (ch === '*') {
      const next = g[i + 1];
      if (next === '*') {
        parts.push('[\\s\\S]*');
        i += 2;
        continue;
      }
      parts.push('[^/]*');
      i += 1;
      continue;
    }
    if (ch === '?') {
      parts.push('[^/]');
      i += 1;
      continue;
    }
    parts.push(escapeRegExp(ch));
    i += 1;
  }
  return new RegExp('^' + parts.join('') + '$', 'i');
}

function matchAnyGlob(path: string, globs: string[] | undefined) {
  const p = String(path ?? '');
  if (!globs || !globs.length) return false;
  for (const g of globs) {
    const re = globToRegExp(g);
    if (re && re.test(p)) return true;
  }
  return false;
}

function filterPathsByGlob(
  paths: Array<{ path: string; displayPath: string }>,
  opts: { includeGlobs?: string[]; excludeGlobs?: string[] },
) {
  const include = Array.isArray(opts.includeGlobs) ? opts.includeGlobs.filter(Boolean) : [];
  const exclude = Array.isArray(opts.excludeGlobs) ? opts.excludeGlobs.filter(Boolean) : [];
  return paths.filter((it) => {
    const rel = it.displayPath;
    if (exclude.length && matchAnyGlob(rel, exclude)) return false;
    if (include.length) return matchAnyGlob(rel, include);
    return true;
  });
}

type AiEditItem = {
  path: string;
  newText: string;
};

type AiToolCall = {
  id?: string;
  tool: 'read_file' | 'search_workspace' | 'write_file' | 'execute_command' | 'scan_project';
  args?: any;
};

type AiActionPayload = {
  edits?: AiEditItem[];
  tool_calls?: AiToolCall[];
};

function detectDocsSaveIntent(text: string) {
  const s = String(text ?? '');
  if (!s) return { wantsSave: false, docPath: '' };
  const m = s.match(/docs\/[A-Za-z0-9_./-]+\.md/i);
  const docPath = m?.[0] ? String(m[0]) : '';
  const wantsSave = /保存到|保存为|写入\s*docs\//.test(s) || (!!docPath && /保存|写入|生成/.test(s));
  return { wantsSave, docPath };
}

function detectScanProjectIntent(text: string) {
  const s = String(text ?? '');
  if (!s.trim()) return { wantsScan: false, targetDoc: '' };
  const wantsScan = /扫描(整个|全部)?项目|scan\s+(the\s+)?project|scan\s+all\s+files|扫描全部文件/i.test(s);
  if (!wantsScan) return { wantsScan: false, targetDoc: '' };
  const m = s.match(/docs\/[A-Za-z0-9_./-]+\.md/i);
  if (m?.[0]) return { wantsScan: true, targetDoc: String(m[0]) };
  if (/summaryall\.md/i.test(s)) return { wantsScan: true, targetDoc: 'docs/summaryall.md' };
  return { wantsScan: true, targetDoc: 'docs/summaryall.md' };
}

function isAbsolutePath(p: string) {
  return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\') || p.startsWith('/');
}

function joinPath(parent: string, child: string) {
  if (!parent) return child;
  const sep = parent.includes('\\') ? '\\' : '/';
  const p = parent.endsWith('\\') || parent.endsWith('/') ? parent.slice(0, -1) : parent;
  const c = child.startsWith('\\') || child.startsWith('/') ? child.slice(1) : child;
  return p + sep + c;
}

function normalizeRelativePath(p: string) {
  const s = String(p ?? '').trim();
  if (!s) return '';
  // Treat leading '/' as a mistake from the model and coerce to project-relative.
  const noLeading = s.startsWith('/') ? s.slice(1) : s;
  // Remove './'
  const noDot = noLeading.startsWith('./') ? noLeading.slice(2) : noLeading;
  return noDot;
}

function safeResolveScopePath(rootPath: string, scopePath: string) {
  const s = normalizeRelativePath(scopePath);
  if (!s) return rootPath;
  if (s.includes('..')) return rootPath;
  return joinPath(rootPath, s);
}

function isDocsPath(p: string) {
  const s = normalizeRelativePath(p).toLowerCase();
  return s === 'docs' || s.startsWith('docs/');
}

function extractFirstJsonObject(raw: string): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';

  // Prefer a ```json ...``` code fence if present
  const jsonFenceMatch = s.match(/```json\s*([\s\S]*?)\s*```/i);
  if (jsonFenceMatch?.[1]) {
    return jsonFenceMatch[1].trim();
  }

  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) {
    return s.slice(first, last + 1).trim();
  }

  // Allow users/models to paste a JSON fragment like: "edit_path": "...", "content": "..."
  if (s.includes('"edit_path"') || s.includes('"editPath"')) {
    return `{${s.replace(/^,+|,+$/g, '').trim()}}`;
  }
  return '';
}

function stripFirstJsonObject(raw: string): string {
  const s = String(raw ?? '');
  if (!s.trim()) return s;

  const jsonFenceMatch = s.match(/```json\s*([\s\S]*?)\s*```/i);
  if (jsonFenceMatch?.[0]) {
    return s.replace(jsonFenceMatch[0], '').trim();
  }

  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) {
    return (s.slice(0, first) + s.slice(last + 1)).trim();
  }
  return s.trim();
}

function tryParseActionsFromAssistant(content: string): AiActionPayload | null {
  const candidate = extractFirstJsonObject(content);
  if (!candidate) return null;
  try {
    const parsed = JSON.parse(candidate) as any;
    if (!parsed || typeof parsed !== 'object') return null;

    // Back-compat: accept legacy single-edit shape.
    const legacyPath =
      typeof parsed.edit_path === 'string'
        ? parsed.edit_path
        : typeof parsed.editPath === 'string'
          ? parsed.editPath
          : '';
    const legacyContent = typeof parsed.content === 'string' ? parsed.content : '';
    if (legacyPath && legacyContent) {
      return {
        edits: [{ path: legacyPath, newText: legacyContent }],
        tool_calls: [],
      };
    }

    const edits: AiEditItem[] = Array.isArray(parsed.edits)
      ? parsed.edits
          .filter((e: any) => e && typeof e.path === 'string' && typeof e.newText === 'string')
          .map((e: any) => ({ path: String(e.path), newText: String(e.newText) }))
      : [];

    const toolCalls: AiToolCall[] = Array.isArray(parsed.tool_calls)
      ? parsed.tool_calls
          .filter((c: any) => c && typeof c.tool === 'string')
          .map((c: any) => ({
            id: typeof c.id === 'string' ? c.id : undefined,
            tool: String(c.tool),
            args: c.args,
          }))
          .filter((c: any) => c.tool)
      : [];

    if (edits.length === 0 && toolCalls.length === 0) return null;
    return { edits: edits.length ? edits : undefined, tool_calls: toolCalls.length ? toolCalls : undefined };
  } catch {
    return null;
  }
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// AI 面板内部组件（使用会话上下文）
const AIPanelInner: React.FC<{ rootPath?: string }> = ({ rootPath }) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'decompose'>('chat');
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);

  const [fileRefs, setFileRefs] = useState<FileRef[]>([]);
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [filePickerQuery, setFilePickerQuery] = useState('');
  const [filePickerItems, setFilePickerItems] = useState<FileRef[]>([]);
  const [filePickerBusy, setFilePickerBusy] = useState(false);
  const fileIndexLoadedRef = useRef<string>('');

  const [appliedByMsgId, setAppliedByMsgId] = useState<Record<string, Record<string, boolean>>>({});

  const [pendingCommandsByMsgId, setPendingCommandsByMsgId] = useState<
    Record<string, Array<{ id: string; command: string; cwd?: string; status: 'pending' | 'running' | 'done' | 'error'; output?: string }>>
  >({});

  const pendingCommandMetaRef = useRef<
    Map<string, { msgId: string; cmdId: string; command: string; startedAt: number }>
  >(new Map());

  const commandOutputBufRef = useRef<Map<string, string>>(new Map());

  const promptedForActionsRef = useRef<Set<string>>(new Set());

  const executedToolCallIdsRef = useRef<Set<string>>(new Set());

  const { 
    createConversation,
    conversations,
    currentConversation,
    loadConversation,
    sendMessage,
    cancelCurrentSend,
    deleteConversation,
    isLoading: isConversationLoading
  } = useConversation();

  const TypingIndicator = () => (
    <div className="flex items-center gap-1" aria-label="AI typing">
      <style>{`@keyframes aiDotPulse {0%{transform:translateY(0);opacity:.45} 30%{transform:translateY(-3px);opacity:1} 60%{transform:translateY(0);opacity:.45} 100%{transform:translateY(0);opacity:.45}}`}</style>
      <div className="w-2 h-2 bg-gray-400 rounded-full" style={{ animation: 'aiDotPulse 1s infinite' }} />
      <div className="w-2 h-2 bg-gray-400 rounded-full" style={{ animation: 'aiDotPulse 1s infinite', animationDelay: '0.12s' }} />
      <div className="w-2 h-2 bg-gray-400 rounded-full" style={{ animation: 'aiDotPulse 1s infinite', animationDelay: '0.24s' }} />
    </div>
  );

  // 检查 AI 配置
  const checkAIConfig = async () => {
    try {
      const config = await invoke('ai_get_config');
      console.log('AI 配置检查结果:', config);
      if (!config) {
        setIsConfigured(false);
      } else {
        setIsConfigured(true);
      }
    } catch (error) {
      console.error('配置检查错误:', error);
      setIsConfigured(false);
    }
  };

  useEffect(() => {
    checkAIConfig();
  }, []);

  // 创建新会话
  const handleNewConversation = async () => {
    try {
      const conversationId = await createConversation('新的对话');
      await loadConversation(conversationId);
      setShowHistory(false);
    } catch (error) {
      console.error('创建会话失败:', error);
    }
  };

  // 选择会话
  const handleSelectConversation = async (id: string) => {
    try {
      await loadConversation(id);
      setShowHistory(false);
    } catch (error) {
      console.error('加载会话失败:', error);
    }
  };

  // 删除会话
  const handleDeleteConversation = async (id: string) => {
    try {
      await deleteConversation(id);
    } catch (error) {
      console.error('删除会话失败:', error);
    }
  };

  const canReferenceFiles = Boolean(rootPath && rootPath.trim());

  const filteredPickerItems = useMemo(() => {
    const q = filePickerQuery.trim().toLowerCase();
    if (!q) return filePickerItems;
    return filePickerItems.filter((it) => it.displayPath.toLowerCase().includes(q));
  }, [filePickerItems, filePickerQuery]);

  const resolveEditPath = useMemo(() => {
    return (p: string) => {
      const raw = String(p ?? '').trim();
      if (!raw) return '';
      if (isAbsolutePath(raw)) return raw;
      if (!rootPath) return raw;
      return joinPath(rootPath, raw);
    };
  }, [rootPath]);

  const loadProjectFilesFromIndex = useCallback(async () => {
    if (!rootPath) return false;
    const indexPath = `${rootPath}/.pilot/file_index.json`;
    setFilePickerBusy(true);
    try {
      const { invoke } = await import('@tauri-apps/api/tauri');
      const content = (await invoke('read_file', { path: indexPath })) as string;
      const parsed = JSON.parse(String(content || '')) as any;
      const files = Array.isArray(parsed?.files) ? parsed.files : [];
      const out: FileRef[] = files
        .map((x: any) => ({
          path: typeof x?.path === 'string' ? x.path : '',
          displayPath: typeof x?.displayPath === 'string' ? x.displayPath : '',
        }))
        .filter((x: FileRef) => x.path && x.displayPath);
      out.sort((a, b) => a.displayPath.localeCompare(b.displayPath));
      setFilePickerItems(out);
      fileIndexLoadedRef.current = rootPath;
      return true;
    } catch {
      return false;
    } finally {
      setFilePickerBusy(false);
    }
  }, [rootPath]);

  const loadProjectFiles = async () => {
    if (!rootPath) return;
    setFilePickerBusy(true);
    try {
      const entries = await invoke<any[]>('read_directory_tree', { path: rootPath, maxDepth: 8 });
      const out: FileRef[] = [];
      const excludedDirNames = new Set([
        'node_modules',
        'target',
        'dist',
        'build',
        '.git',
        '.next',
        '.turbo',
        '.cache',
        '.idea',
        '.vscode',
      ]);
      const walk = (nodes: any[]) => {
        for (const n of nodes ?? []) {
          const p = typeof n?.path === 'string' ? n.path : '';
          const t = typeof n?.type === 'string' ? n.type : (typeof n?.entry_type === 'string' ? n.entry_type : '');
          const isDir = t === 'directory' || Array.isArray(n?.children);
          if (isDir) {
            const name = typeof n?.name === 'string' && n.name ? String(n.name) : (p ? String(p).split(/[\\/]/).filter(Boolean).slice(-1)[0] : '');
            if (name && excludedDirNames.has(name)) {
              continue;
            }
            if (Array.isArray(n?.children)) walk(n.children);
            continue;
          }
          if (!p) continue;
          const rel = rootPath && p.startsWith(rootPath) ? p.slice(rootPath.length).replace(/^\//, '') : p;
          out.push({ path: p, displayPath: rel || p });
        }
      };
      walk(entries);
      out.sort((a, b) => a.displayPath.localeCompare(b.displayPath));
      setFilePickerItems(out);
    } catch (e) {
      console.error('Failed to load project files for reference:', e);
      setFilePickerItems([]);
    } finally {
      setFilePickerBusy(false);
    }
  };

  const toggleFileRef = (ref: FileRef) => {
    setFileRefs((prev) => {
      const exists = prev.some((x) => x.path === ref.path);
      if (exists) return prev.filter((x) => x.path !== ref.path);
      return [...prev, ref];
    });
  };

  const buildAiContentWithRefs = async (raw: string) => {
    const base = raw.trim();
    if (!base) return '';
    if (!fileRefs.length) return base;

    const MAX_FILE_CHARS = 12000;
    const blocks: string[] = [];
    for (const r of fileRefs) {
      try {
        const text = await invoke<any>('read_file', { path: r.path });
        const s = typeof text === 'string' ? text : String(text ?? '');
        const truncated = s.length > MAX_FILE_CHARS;
        const body = truncated ? s.slice(0, MAX_FILE_CHARS) : s;
        blocks.push(`--- FILE: ${r.displayPath}${truncated ? ' (TRUNCATED)' : ''} ---\n${body}`);
      } catch (e) {
        blocks.push(`--- FILE: ${r.displayPath} (FAILED TO READ) ---`);
        console.error('Failed to read referenced file:', r.path, e);
      }
    }

    return (
      'You are editing a codebase. The user referenced these files. Use them as context.\n' +
      'Always reply in normal human language first (explain what you will change and why).\n' +
      'You DO have tools to inspect the local repository. Do NOT ask the user to paste `tree` output.\n' +
      'Tools available:\n' +
      '- scan_project: list files in a scope and stream batches of file excerpts (use this to scan the whole project).\n' +
      '- search_workspace: grep-like search; when query is "*" it lists files in a scope.\n' +
      '- read_file: read a file; can use offset/limit for large files via args.offset/args.limit.\n' +
      '- write_file / edits: write docs under docs/**.\n' +
      '- execute_command: propose a shell command (requires user confirmation).\n' +
      'If you want to perform actions, append a single JSON object at the END of your response inside a ```json code block with schema:\n' +
      '{"edits": [{"path": string, "newText": string}], "tool_calls": [{"id": string, "tool": "read_file"|"search_workspace"|"write_file"|"execute_command"|"scan_project", "args": object}]}.\n' +
      '- "edits" are full-file rewrites (newText is the entire file content).\n' +
      '- "write_file" tool writes a file at args.path with args.content. Prefer writing docs to docs/*.md.\n' +
      '- "execute_command" proposes a shell command; it will require explicit user confirmation before running.\n' +
      'IMPORTANT: If the user asks you to "write a summary doc" / "generate documentation" / "save to docs/*.md", you MUST include the JSON edits/write_file that actually writes the docs file. Do NOT claim you saved a file unless you included the JSON block that writes it.\n' +
      'Paths should be relative to the project root when possible.\n' +
      'Do not output multiple JSON blocks; output at most one JSON code block.\n\n' +
      blocks.join('\n\n') +
      '\n\n--- USER MESSAGE ---\n' +
      base
    );
  };

  const sendToolResult = useCallback(
    async (summary: string, result: any) => {
      const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      const content = `TOOL RESULT\n${summary}\n\n${text}`;
      await sendMessage(content, { displayContent: summary });
    },
    [sendMessage],
  );

  const applyEdit = useCallback(
    async (msgId: string, edit: AiEditItem) => {
      const rel = normalizeRelativePath(edit.path);
      if (!isDocsPath(rel)) {
        // Safety: only allow auto-writes into docs/**.
        await sendToolResult(`write blocked: ${edit.path}`, 'Only docs/** is allowed for auto-write.');
        return;
      }

      const abs = resolveEditPath(rel);
      if (!abs) return;
      if (!rootPath) return;
      await invoke('write_file_scoped', { rootPath, path: rel, content: edit.newText });
      setAppliedByMsgId((prev) => {
        const byEdit = prev[msgId] ?? {};
        return { ...prev, [msgId]: { ...byEdit, [edit.path]: true } };
      });
    },
    [resolveEditPath, rootPath, sendToolResult],
  );

  const ensurePendingCommand = useCallback((msgId: string, cmd: { id: string; command: string; cwd?: string }) => {
    setPendingCommandsByMsgId((prev) => {
      const list = prev[msgId] ?? [];
      if (list.some((x) => x.id === cmd.id)) return prev;
      return {
        ...prev,
        [msgId]: [...list, { ...cmd, status: 'pending' }],
      };
    });
  }, []);

  const executeToolCalls = useCallback(
    async (msgId: string, toolCalls: AiToolCall[], edits?: AiEditItem[]) => {
      if (!rootPath) return;

      // Auto-apply edits (auto write) once.
      if (Array.isArray(edits) && edits.length) {
        const applied = appliedByMsgId[msgId] ?? {};
        for (const e of edits) {
          if (applied[e.path]) continue;
          // Only apply once per path per message.
          void applyEdit(msgId, e);
        }
      }

      for (const call of toolCalls) {
        const callId = call.id || `${msgId}_${call.tool}_${JSON.stringify(call.args ?? {})}`;
        if (executedToolCallIdsRef.current.has(callId)) continue;
        executedToolCallIdsRef.current.add(callId);

        try {
          if (call.tool === 'read_file') {
            const p = normalizeRelativePath(String(call.args?.path ?? ''));
            if (!p) continue;
            const offset = call.args?.offset != null ? Number(call.args.offset) : undefined;
            const limit = call.args?.limit != null ? Number(call.args.limit) : undefined;
            if (offset != null || limit != null) {
              const out = await invoke<string>('read_file_range_scoped', {
                rootPath,
                path: p,
                offset: offset != null && !Number.isNaN(offset) ? offset : undefined,
                limit: limit != null && !Number.isNaN(limit) ? limit : undefined,
              });
              const suffix = ` (offset=${offset ?? 1}, limit=${limit ?? 400})`;
              await sendToolResult(`read_file: ${p}${suffix}`, String(out ?? ''));
            } else {
              const abs = resolveEditPath(p);
              if (!abs) continue;
              const out = await invoke<string>('read_file', { path: abs });
              await sendToolResult(`read_file: ${p}`, String(out ?? ''));
            }
            continue;
          }

          if (call.tool === 'search_workspace') {
            const q = String(call.args?.query ?? '').trim();
            const maxResults = call.args?.max_results != null ? Number(call.args.max_results) : 200;
            const scopePathArg = typeof call.args?.path === 'string' ? String(call.args.path).trim() : '';
            const includeGlobs = Array.isArray(call.args?.include_globs) ? call.args.include_globs.map((x: any) => String(x)) : undefined;
            const excludeGlobs = Array.isArray(call.args?.exclude_globs) ? call.args.exclude_globs.map((x: any) => String(x)) : undefined;
            if (!q) continue;
            if (q === '*' || q === 'all_files') {
              const scopeAbs = safeResolveScopePath(rootPath, scopePathArg);
              const entries = (await invoke('read_directory_tree', { path: scopeAbs, maxDepth: 12 })) as any[];
              const scoped = flattenDirectoryTree(entries, scopeAbs).map((it) => {
                const abs = it.path;
                const relToRoot = abs.startsWith(rootPath) ? abs.slice(rootPath.length).replace(/^\//, '') : it.displayPath;
                return { path: abs, displayPath: relToRoot || it.displayPath };
              });
              const filtered = filterPathsByGlob(scoped, { includeGlobs, excludeGlobs });
              await sendToolResult(
                `list_files: ${scopePathArg || rootPath}`,
                filtered.slice(0, Number.isFinite(maxResults) ? Math.max(1, maxResults) : 200),
              );
              continue;
            }

            // Note: backend search_workspace currently expects a path root; we scope it by passing the directory.
            const scopeAbs = safeResolveScopePath(rootPath, scopePathArg);
            const out = await invoke<any[]>('search_workspace', { path: scopeAbs, query: q, maxResults });
            await sendToolResult(`search_workspace: ${q}`, out ?? []);
            continue;
          }

          if (call.tool === 'scan_project') {
            const scopePathArg = typeof call.args?.path === 'string' ? String(call.args.path).trim() : '';
            const includeGlobs = Array.isArray(call.args?.include_globs) ? call.args.include_globs.map((x: any) => String(x)) : undefined;
            const excludeGlobs = Array.isArray(call.args?.exclude_globs) ? call.args.exclude_globs.map((x: any) => String(x)) : undefined;
            const batchSize = call.args?.batch_size != null ? Math.max(1, Number(call.args.batch_size)) : 10;
            const maxFiles = call.args?.max_files != null ? Math.max(1, Number(call.args.max_files)) : 200;
            const maxDepth = call.args?.max_depth != null ? Math.max(1, Number(call.args.max_depth)) : 12;
            const maxLinesPerFile = call.args?.max_lines_per_file != null ? Math.max(20, Number(call.args.max_lines_per_file)) : 260;
            const targetPathRaw = typeof call.args?.target_path === 'string' ? String(call.args.target_path).trim() : '';
            const targetPath = isDocsPath(targetPathRaw) ? normalizeRelativePath(targetPathRaw) : 'docs/project_summary.md';

            const scopeAbs = safeResolveScopePath(rootPath, scopePathArg);
            const entries = (await invoke('read_directory_tree', { path: scopeAbs, maxDepth })) as any[];
            const scoped = flattenDirectoryTree(entries, scopeAbs).map((it) => {
              const abs = it.path;
              const relToRoot = abs.startsWith(rootPath) ? abs.slice(rootPath.length).replace(/^\//, '') : it.displayPath;
              return { path: abs, displayPath: relToRoot || it.displayPath };
            });
            const filtered = filterPathsByGlob(scoped, { includeGlobs, excludeGlobs }).slice(0, maxFiles);

            await sendToolResult(`scan_project: discovered_files (${scopePathArg || rootPath})`, {
              total: filtered.length,
              scope: scopePathArg || '',
              include_globs: includeGlobs ?? [],
              exclude_globs: excludeGlobs ?? [],
              target_path: targetPath,
            });

            const batches: Array<Array<{ path: string; displayPath: string }>> = [];
            for (let i = 0; i < filtered.length; i += batchSize) {
              batches.push(filtered.slice(i, i + batchSize));
            }

            for (let bi = 0; bi < batches.length; bi++) {
              const batch = batches[bi] ?? [];
              const filePayload: Array<{ path: string; excerpt: string; truncated: boolean }> = [];
              for (const f of batch) {
                try {
                  const excerpt = await invoke<string>('read_file_range_scoped', {
                    rootPath,
                    path: f.displayPath,
                    offset: 1,
                    limit: maxLinesPerFile,
                  });
                  const ex = String(excerpt ?? '');
                  const truncated = ex.split('\n').length >= maxLinesPerFile;
                  filePayload.push({ path: f.displayPath, excerpt: ex, truncated });
                } catch (e: any) {
                  const msg = typeof e === 'string' ? e : e?.message ? String(e.message) : 'read failed';
                  filePayload.push({ path: f.displayPath, excerpt: `FAILED TO READ: ${msg}`, truncated: false });
                }
              }

              await sendToolResult(
                `scan_project_batch ${bi + 1}/${batches.length} (${scopePathArg || rootPath})`,
                {
                  batch_index: bi + 1,
                  batch_total: batches.length,
                  files: filePayload,
                  instruction:
                    `Summarize these files and incrementally update the project documentation. Write your incremental summary into ${targetPath} using a JSON edits block (edits[{path,newText}]). You may also create additional module docs under docs/** (e.g. docs/frontend.md, docs/backend.md) but keep ${targetPath} as the main index.`,
                },
              );
            }

            await sendToolResult(`scan_project: done (${scopePathArg || rootPath})`, { total_files: filtered.length });
            continue;
          }

          if (call.tool === 'write_file') {
            const p = normalizeRelativePath(String(call.args?.path ?? ''));
            const c = String(call.args?.content ?? '');
            if (!p) continue;
            if (!isDocsPath(p)) {
              await sendToolResult(`write_file blocked: ${p}`, 'Only docs/** is allowed for auto-write.');
              continue;
            }
            await invoke('write_file_scoped', { rootPath, path: p, content: c });
            await sendToolResult(`write_file: ${p}`, 'OK');
            continue;
          }

          if (call.tool === 'execute_command') {
            const command = String(call.args?.command ?? '').trim();
            const cwd = typeof call.args?.cwd === 'string' && call.args.cwd.trim() ? String(call.args.cwd) : rootPath;
            if (!command) continue;
            ensurePendingCommand(msgId, { id: callId, command, cwd });
            continue;
          }
        } catch (e: any) {
          const msg = typeof e === 'string' ? e : e?.message ? String(e.message) : 'Tool failed';
          await sendToolResult(`${call.tool} failed`, msg);
        }
      }
    },
    [applyEdit, appliedByMsgId, ensurePendingCommand, resolveEditPath, rootPath, sendToolResult],
  );

  useEffect(() => {
    let unlistenOut: null | (() => void) = null;
    let unlistenEnd: null | (() => void) = null;

    const attach = async () => {
      unlistenOut = await listen<any>('command-output', (event) => {
        const payload = (event as any)?.payload as any;
        const pid = typeof payload?.process_id === 'string' ? payload.process_id : '';
        if (!pid) return;
        const meta = pendingCommandMetaRef.current.get(pid);
        if (!meta) return;
        const line = typeof payload?.line === 'string' ? payload.line : String(payload?.line ?? '');
        const isErr = !!payload?.is_error;

        const prev = commandOutputBufRef.current.get(pid) || '';
        const next = prev + (line ? (line + '\n') : '') + (isErr ? '' : '');
        commandOutputBufRef.current.set(pid, next);

        setPendingCommandsByMsgId((p) => {
          const list = p[meta.msgId] ?? [];
          return {
            ...p,
            [meta.msgId]: list.map((x) => (x.id === meta.cmdId ? { ...x, output: next } : x)),
          };
        });
      });

      unlistenEnd = await listen<any>('command-end', (event) => {
        const payload = (event as any)?.payload as any;
        const pid = typeof payload?.process_id === 'string' ? payload.process_id : '';
        if (!pid) return;
        const meta = pendingCommandMetaRef.current.get(pid);
        if (!meta) return;

        const exitCode = typeof payload?.exit_code === 'number' ? payload.exit_code : Number(payload?.exit_code ?? -1);
        const out = commandOutputBufRef.current.get(pid) || '';
        pendingCommandMetaRef.current.delete(pid);
        commandOutputBufRef.current.delete(pid);

        setPendingCommandsByMsgId((p) => {
          const list = p[meta.msgId] ?? [];
          return {
            ...p,
            [meta.msgId]: list.map((x) =>
              x.id === meta.cmdId
                ? { ...x, status: exitCode === 0 ? 'done' : 'error', output: out || `exit ${exitCode}` }
                : x,
            ),
          };
        });

        void sendToolResult(`execute_command: ${meta.command} (exit=${exitCode})`, out || `exit ${exitCode}`);
      });
    };

    void attach();
    return () => {
      try {
        unlistenOut?.();
        unlistenEnd?.();
      } catch {
        // ignore
      }
    };
  }, [sendToolResult]);

  useEffect(() => {
    const conv = currentConversation;
    if (!conv) return;
    for (const m of conv.messages) {
      if (m.role !== 'assistant') continue;
      const payload = tryParseActionsFromAssistant(String(m.content ?? ''));
      if (!payload) {
        const { wantsSave, docPath } = detectDocsSaveIntent(String(m.content ?? ''));
        if (!wantsSave) continue;
        if (promptedForActionsRef.current.has(m.id)) continue;
        promptedForActionsRef.current.add(m.id);
        const target = docPath || 'docs/summary.md';
        void sendMessage(
          `You said you will save a markdown doc but you did not include executable actions. Please do ONE of the following:
1) Call tool scan_project to scan the repository (exclude node_modules/target/dist/.git/.pilot), OR
2) Output exactly ONE \`\`\`json block at the end with schema {"edits": [{"path": "${target}", "newText": "..."}], "tool_calls": []}.

Rules:
- Use path/newText fields (NOT edit_path/content).
- Write only under docs/**.
- Do not truncate the JSON.
`,
          { displayContent: `Please provide JSON edits to write ${target}` },
        );
        continue;
      }
      const toolCalls = Array.isArray(payload.tool_calls) ? payload.tool_calls : [];
      const edits = Array.isArray(payload.edits) ? payload.edits : undefined;
      if (toolCalls.length || (edits && edits.length)) {
        void executeToolCalls(m.id, toolCalls, edits);
      }
    }
  }, [currentConversation, executeToolCalls]);

  const buildDisplayContentWithRefs = (raw: string) => {
    const base = raw.trim();
    if (!fileRefs.length) return base;
    const list = fileRefs.map((r) => `@${r.displayPath}`).join('\n');
    return `${base}\n\nReferenced files:\n${list}`;
  };

  // 发送消息
  const handleSendMessage = async () => {
    if (!input.trim() || isConversationLoading) return;

    const messageContent = input.trim();
    setInput(''); // 立即清空输入框

    try {
      // Natural-language auto-trigger for scanning the whole project.
      // This runs scan_project directly (read-only) and then asks the model to write docs.
      const scanIntent = detectScanProjectIntent(messageContent);
      if (scanIntent.wantsScan) {
        if (!rootPath || !rootPath.trim()) {
          await sendMessage(
            'Cannot scan the project because no project root is selected. Please open/select a project root first (so I know what to scan), then retry the scan request.',
            { displayContent: '请先选择/打开项目根目录后再扫描（当前 rootPath 为空）' },
          );
          return;
        }

        const target = isDocsPath(scanIntent.targetDoc) ? normalizeRelativePath(scanIntent.targetDoc) : 'docs/summaryall.md';
        const msgId = `auto_scan_${Date.now()}_${Math.random().toString(16).slice(2)}`;

        const aiContent = await buildAiContentWithRefs(
          `You must generate a comprehensive project architecture summary.

I will now scan the repository and send you TOOL RESULT batches (file excerpts).
IMPORTANT: Do NOT answer yet. Wait until you receive TOOL RESULT batches before writing the docs.

After you receive them, write the main doc to ${target} and optionally split module docs under docs/**.

Rules:
- Use only JSON edits to write docs (edits[{path,newText}]).
- Do not ask the user to paste tree output.
`,
        );
        await sendMessage(aiContent, { displayContent: messageContent });

        await executeToolCalls(msgId, [
          {
            tool: 'scan_project',
            args: {
              path: '',
              exclude_globs: ['**/node_modules/**', '**/target/**', '**/dist/**', '**/.git/**', '**/.pilot/**'],
              batch_size: 12,
              max_files: 400,
              max_lines_per_file: 220,
              target_path: target,
            },
          },
        ]);
        return;
      }

      // Allow power users to paste an action payload directly without waiting for the model.
      const raw = messageContent;
      const normalized = raw.startsWith('json') ? raw.slice(4).trim() : raw;
      const directPayload = tryParseActionsFromAssistant(normalized);
      if (directPayload) {
        const msgId = `manual_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const toolCalls = Array.isArray(directPayload.tool_calls) ? directPayload.tool_calls : [];
        const edits = Array.isArray(directPayload.edits) ? directPayload.edits : undefined;
        await executeToolCalls(msgId, toolCalls, edits);
        return;
      }

      const aiContent = await buildAiContentWithRefs(messageContent);
      const displayContent = buildDisplayContentWithRefs(messageContent);
      await sendMessage(aiContent, { displayContent });
    } catch (error) {
      console.error('发送消息失败:', error);
    }
  };

  const handleKeyPress = (e: any) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (activeTab === 'chat') {
        void handleSendMessage();
      } else if (activeTab === 'decompose') {
        void decomposeRequirement();
      }
    }
  };

  // 确保 activeTab 类型正确
  const isChatTab = activeTab === 'chat';
  const isDecomposeTab = activeTab === 'decompose';

  const handleStop = () => {
    cancelCurrentSend();
  };

  // 如果显示历史记录
  if (showHistory) {
    return (
      <div className="flex flex-col h-full bg-white">
        {/* 头部 */}
        <div className="flex items-center gap-3 p-3 border-b border-gray-200">
          <button
            onClick={() => setShowHistory(false)}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h3 className="font-semibold text-gray-900">会话历史</h3>
        </div>

        {/* 会话列表 */}
        <div className="flex-1 overflow-y-auto p-3">
          {conversations.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <Clock className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">还没有会话历史</p>
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  onClick={() => handleSelectConversation(conversation.id)}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    currentConversation?.id === conversation.id
                      ? 'bg-blue-100 border border-blue-200'
                      : 'bg-white hover:bg-gray-50 border border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-gray-900 truncate">
                        {conversation.title}
                      </h4>
                      <p className="text-xs text-gray-500 mt-1">
                        {conversation.messages.length} 条消息 · {new Date(conversation.updated_at * 1000).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteConversation(conversation.id);
                      }}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <Settings className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 如果 AI 未配置，显示配置提示
  if (isConfigured === false) {
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-amber-500" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">AI 服务未配置</h3>
            <p className="text-gray-600 mb-4">
              请先配置 AI 服务才能使用聊天功能。
            </p>
            <div className="text-left bg-gray-50 p-4 rounded-lg">
              <p className="text-sm font-medium text-gray-900 mb-2">配置步骤：</p>
              <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                <li>在 <code className="bg-gray-200 px-1 rounded">src-tauri/.env</code> 文件中添加配置</li>
                <li>重启应用</li>
                <li>重新尝试</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 如果还在检查配置中，显示加载状态
  if (isConfigured === null) {
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm">正在检查 AI 配置...</p>
          </div>
        </div>
      </div>
    );
  }

  // 原有的任务拆解功能（保持不变）
  const decomposeRequirement = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      console.log('🔍 开始任务拆解:', input);
      
      // 1. 分析需求
      console.log('📋 步骤1: 分析需求');
      const requirement = await invoke('analyze_requirement', {
        requirementText: input,
        projectContext: {
          project_root: '',
          project_type: 'web',
          tech_stack: ['rust', 'typescript', 'react'],
          existing_files: [],
          dependencies: []
        }
      });
      console.log('✅ 需求分析结果:', requirement);

      // 2. 拆解任务
      console.log('📋 步骤2: 拆解任务');
      const tasks = await invoke('simple_decompose_requirement', {
        requirement: requirement
      });
      console.log('✅ 任务拆解结果:', tasks);

      // 格式化任务拆解结果
      const taskList = tasks as any[];
      let taskContent = `📋 **任务拆解结果**\n\n`;
      
      taskList.forEach((task, index) => {
        taskContent += `## 任务 ${index + 1}: ${task.title}\n`;
        taskContent += `- **类型**: ${task.task_type}\n`;
        taskContent += `- **优先级**: ${task.priority}\n`;
        taskContent += `- **预估时间**: ${task.estimated_time} 分钟\n`;
        taskContent += `- **描述**: ${task.description}\n`;
        taskContent += `- **需要文件**: ${task.required_files.join(', ')}\n`;
        taskContent += `- **验收标准**: ${task.acceptance_criteria.join(', ')}\n\n`;
      });

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: taskContent,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('❌ 任务拆解错误:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ **任务拆解失败**

抱歉，任务拆解时出现错误。

🔍 **错误详情**：
\`\`\`
${error}
\`\`\`

💡 **可能原因**：
- 需求描述不够清晰
- 后端服务异常
- 网络连接问题

📝 **建议**：
请尝试更详细地描述您的需求，例如：
- "创建一个用户管理系统，包括登录、注册、权限管理"
- "开发一个电商后台，包含商品管理、订单处理、数据统计"

请重新尝试或修改需求描述。`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 标题栏 - 带新建和历史按钮 */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">AI Assistant</h3>
        </div>
        <div className="flex items-center gap-2">
          {isChatTab && (
            <>
              <button
                onClick={handleNewConversation}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                title="新建会话"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowHistory(true)}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                title="会话历史"
              >
                <Clock className="w-4 h-4" />
              </button>
            </>
          )}
          {!isConfigured && (
            <div className="flex items-center gap-1 text-amber-600">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-xs">未配置</span>
            </div>
          )}
          {isConfigured && (
            <div className="flex items-center gap-1 text-green-600">
              <CheckCircle className="w-4 h-4" />
              <span className="text-xs">已连接</span>
            </div>
          )}
          <button
            onClick={checkAIConfig}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            title="重新检查配置"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 标签页 */}
      <div className="flex border-b border-gray-200">
        <button
          className={`flex-1 px-3 py-2 text-sm font-medium ${
            isChatTab
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
          onClick={() => setActiveTab('chat')}
        >
          <div className="flex items-center justify-center gap-2">
            <Sparkles className="w-4 h-4" />
            AI 聊天
          </div>
        </button>
        <button
          className={`flex-1 px-3 py-2 text-sm font-medium ${
            isDecomposeTab
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
          onClick={() => setActiveTab('decompose')}
        >
          <div className="flex items-center justify-center gap-2">
            <FileText className="w-4 h-4" />
            任务拆解
          </div>
        </button>
      </div>

      {/* 主内容区域 */}
      {isChatTab ? (
        // AI 聊天界面
        <>
          {/* 当前会话信息 */}
          {currentConversation && (
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
              <p className="text-sm font-medium text-gray-900 truncate">
                {currentConversation.title}
              </p>
              <p className="text-xs text-gray-500">
                {currentConversation.messages.length} 条消息
              </p>
            </div>
          )}

          {/* 消息列表 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {!currentConversation ? (
              <div className="text-center text-gray-500 py-8">
                <Bot className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm">点击右上角 + 创建新会话开始对话</p>
              </div>
            ) : currentConversation.messages.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <Bot className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm">开始与 GoPilot 代码助手对话吧！</p>
              </div>
            ) : (
              currentConversation.messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {message.role === 'assistant' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-blue-600" />
                    </div>
                  )}
                  
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <div className="text-sm">
                      {message.role === 'assistant' ? (
                        <div className="prose prose-sm max-w-none">
                          {(() => {
                            const payload = tryParseActionsFromAssistant(String(message.content ?? ''));
                            if (!payload) return null;
                            const applied = appliedByMsgId[message.id] ?? {};
                            const pendingCmds = pendingCommandsByMsgId[message.id] ?? [];
                            const totalEdits = Array.isArray(payload.edits) ? payload.edits.length : 0;
                            const appliedCount = Array.isArray(payload.edits)
                              ? payload.edits.reduce((acc, e) => acc + (applied[e.path] ? 1 : 0), 0)
                              : 0;
                            const hasPendingEdits = totalEdits > 0 && appliedCount < totalEdits;
                            return (
                              <div className="mb-2 rounded-md border border-blue-200 bg-blue-50 p-2">
                                {Array.isArray(payload.edits) && payload.edits.length ? (
                                  <>
                                    <div className="text-xs font-medium text-blue-800 mb-1">Edits (auto-applied)</div>
                                    {hasPendingEdits ? (
                                      <div className="text-[11px] text-blue-700 mb-1">Applying…</div>
                                    ) : null}
                                    <div className="flex flex-col gap-1">
                                      {payload.edits.map((e, idx) => {
                                        const done = Boolean(applied[e.path]);
                                        return (
                                          <div key={e.path + '_' + idx} className="flex items-center justify-between gap-2">
                                            <div className="text-[11px] text-blue-900 truncate" title={e.path}>
                                              {e.path}
                                            </div>
                                            <div
                                              className={
                                                'text-[11px] px-2 py-1 rounded border ' +
                                                (done
                                                  ? 'border-green-200 bg-green-50 text-green-700'
                                                  : 'border-gray-200 bg-white text-gray-500')
                                              }
                                              title={done ? 'Applied' : 'Pending'}
                                            >
                                              {done ? 'Applied' : 'Pending'}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </>
                                ) : null}

                                {pendingCmds.length ? (
                                  <>
                                    <div className="text-xs font-medium text-blue-800 mt-2 mb-1">Commands (confirm to run)</div>
                                    <div className="flex flex-col gap-1">
                                      {pendingCmds.map((c) => (
                                        <div key={c.id} className="flex items-center justify-between gap-2">
                                          <div className="min-w-0 flex-1">
                                            <div className="text-[11px] text-blue-900 truncate" title={c.command}>
                                              $ {c.command}
                                            </div>
                                            {c.output ? (
                                              <div className="mt-1 text-[11px] text-gray-700 whitespace-pre-wrap break-words">
                                                {c.output}
                                              </div>
                                            ) : null}
                                          </div>
                                          <button
                                            type="button"
                                            className={
                                              'text-[11px] px-2 py-1 rounded border ' +
                                              (c.status === 'pending'
                                                ? 'border-blue-200 bg-white text-blue-700 hover:bg-blue-50'
                                                : c.status === 'running'
                                                  ? 'border-gray-200 bg-gray-50 text-gray-500'
                                                  : c.status === 'done'
                                                    ? 'border-green-200 bg-green-50 text-green-700'
                                                    : 'border-red-200 bg-red-50 text-red-700')
                                            }
                                            disabled={c.status !== 'pending'}
                                            onClick={async () => {
                                              if (c.status !== 'pending') return;
                                              setPendingCommandsByMsgId((prev) => {
                                                const list = prev[message.id] ?? [];
                                                return {
                                                  ...prev,
                                                  [message.id]: list.map((x) => (x.id === c.id ? { ...x, status: 'running' } : x)),
                                                };
                                              });
                                              try {
                                                const pid = `cmd_${Date.now()}_${Math.random().toString(16).slice(2)}`;
                                                pendingCommandMetaRef.current.set(pid, {
                                                  msgId: message.id,
                                                  cmdId: c.id,
                                                  command: c.command,
                                                  startedAt: Date.now(),
                                                });
                                                commandOutputBufRef.current.set(pid, '');
                                                await invoke('execute_command_stream', {
                                                  command: c.command,
                                                  working_dir: c.cwd || rootPath || undefined,
                                                  processId: pid,
                                                });
                                              } catch (e: any) {
                                                const msg = typeof e === 'string' ? e : e?.message ? String(e.message) : 'Command failed';
                                                setPendingCommandsByMsgId((prev) => {
                                                  const list = prev[message.id] ?? [];
                                                  return {
                                                    ...prev,
                                                    [message.id]: list.map((x) => (x.id === c.id ? { ...x, status: 'error', output: msg } : x)),
                                                  };
                                                });
                                                await sendToolResult(`execute_command failed: ${c.command}`, msg);
                                              }
                                            }}
                                            title={c.status === 'pending' ? 'Run' : c.status}
                                          >
                                            {c.status === 'pending'
                                              ? 'Run'
                                              : c.status === 'running'
                                                ? 'Running'
                                                : c.status === 'done'
                                                  ? 'Done'
                                                  : 'Error'}
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  </>
                                ) : null}
                              </div>
                            );
                          })()}
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeHighlight]}
                            components={{
                              code: ({node, className, children, ...props}: any) => {
                                const match = /language-(\w+)/.exec(className || '')
                                const isInline = !props['data-inline'] && !className?.includes('language-')
                                return !isInline && match ? (
                                  <pre className="bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto">
                                    <code className={className} {...props}>
                                      {children}
                                    </code>
                                  </pre>
                                ) : (
                                  <code className="bg-gray-200 text-gray-800 px-1 py-0.5 rounded text-sm" {...props}>
                                    {children}
                                  </code>
                                )
                              },
                              pre: ({children}) => (
                                <pre className="bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto">
                                  {children}
                                </pre>
                              ),
                              blockquote: ({children}) => (
                                <blockquote className="border-l-4 border-blue-500 pl-4 italic text-gray-600">
                                  {children}
                                </blockquote>
                              ),
                              table: ({children}) => (
                                <div className="overflow-x-auto">
                                  <table className="min-w-full border-collapse border border-gray-300">
                                    {children}
                                  </table>
                                </div>
                              ),
                              th: ({children}) => (
                                <th className="border border-gray-300 bg-gray-100 px-4 py-2 text-left font-semibold">
                                  {children}
                                </th>
                              ),
                              td: ({children}) => (
                                <td className="border border-gray-300 px-4 py-2">
                                  {children}
                                </td>
                              ),
                            }}
                          >
                            {(() => {
                              const payload = tryParseActionsFromAssistant(String(message.content ?? ''));
                              if (!payload) return message.content;
                              const stripped = stripFirstJsonObject(String(message.content ?? ''));
                              return stripped || 'Applying actions…';
                            })()}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap">{message.content}</div>
                      )}
                    </div>
                    <div className="text-xs opacity-70 mt-1">
                      {new Date(message.timestamp * 1000).toLocaleTimeString()}
                    </div>
                  </div>
                  
                  {message.role === 'user' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                      <span className="text-white text-sm font-medium">U</span>
                    </div>
                  )}
                </div>
              ))
            )}
            
            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-blue-600" />
                </div>
                <div className="bg-gray-100 rounded-lg px-3 py-2">
                  <TypingIndicator />
                </div>
              </div>
            )}

            {isConversationLoading && (
              <div className="flex gap-3 justify-start">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-blue-600" />
                </div>
                <div className="bg-gray-100 rounded-lg px-3 py-2">
                  <TypingIndicator />
                </div>
              </div>
            )}
          </div>

          {/* 输入区域 */}
          <div className="border-t border-gray-200 p-3">
            {fileRefs.length ? (
              <div className="mb-2 flex flex-wrap gap-1">
                {fileRefs.map((r) => (
                  <button
                    key={r.path}
                    type="button"
                    className="text-[11px] px-2 py-1 rounded border border-gray-200 bg-gray-50 hover:bg-gray-100"
                    title={r.path}
                    onClick={() => toggleFileRef(r)}
                  >
                    @{r.displayPath}
                  </button>
                ))}
              </div>
            ) : null}

            {filePickerOpen ? (
              <div className="mb-2 rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="p-2 border-b border-gray-200">
                  <input
                    type="text"
                    value={filePickerQuery}
                    onChange={(e) => setFilePickerQuery(e.target.value)}
                    placeholder={filePickerBusy ? 'Loading...' : 'Search files...'}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={filePickerBusy}
                  />
                </div>
                <div className="max-h-52 overflow-auto p-1">
                  {filePickerBusy ? (
                    <div className="p-2 text-xs text-gray-500">Loading...</div>
                  ) : filteredPickerItems.length === 0 ? (
                    <div className="p-2 text-xs text-gray-500">No files</div>
                  ) : (
                    filteredPickerItems.slice(0, 200).map((it) => {
                      const selected = fileRefs.some((x) => x.path === it.path);
                      return (
                        <button
                          key={it.path}
                          type="button"
                          className={
                            'w-full text-left px-2 py-1.5 rounded text-xs ' +
                            (selected ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700')
                          }
                          title={it.path}
                          onClick={() => toggleFileRef(it)}
                        >
                          {selected ? '✓ ' : ''}{it.displayPath}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}

            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={currentConversation ? "输入消息..." : "请先创建会话"}
                  disabled={isConversationLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              <button
                type="button"
                onClick={async () => {
                  if (!canReferenceFiles) return;
                  const next = !filePickerOpen;
                  setFilePickerOpen(next);
                  if (next && filePickerItems.length === 0 && !filePickerBusy) {
                    const ok = await loadProjectFilesFromIndex();
                    if (!ok) {
                      await loadProjectFiles();
                    }
                  }
                }}
                disabled={!canReferenceFiles || isConversationLoading}
                className="px-2.5 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                title={canReferenceFiles ? '引用文件' : '未打开项目目录'}
              >
                <FileText className="w-4 h-4 text-gray-700" />
              </button>

              <button
                onClick={isConversationLoading ? handleStop : handleSendMessage}
                disabled={(!input.trim() && !isConversationLoading)}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isConversationLoading ? (
                  <X className="w-4 h-4" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </>
      ) : (
        // 任务拆解界面（保持原有功能）
        <>
          {/* 消息列表 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm">输入需求，AI 将为您拆解为具体任务。</p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {message.role === 'assistant' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-blue-600" />
                    </div>
                  )}
                  
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <div className="text-sm">
                      {message.role === 'assistant' ? (
                        <div className="prose prose-sm max-w-none">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeHighlight]}
                            components={{
                              code: ({node, className, children, ...props}: any) => {
                                const match = /language-(\w+)/.exec(className || '')
                                const isInline = !props['data-inline'] && !className?.includes('language-')
                                return !isInline && match ? (
                                  <pre className="bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto">
                                    <code className={className} {...props}>
                                      {children}
                                    </code>
                                  </pre>
                                ) : (
                                  <code className="bg-gray-200 text-gray-800 px-1 py-0.5 rounded text-sm" {...props}>
                                    {children}
                                  </code>
                                )
                              },
                              pre: ({children}) => (
                                <pre className="bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto">
                                  {children}
                                </pre>
                              ),
                              blockquote: ({children}) => (
                                <blockquote className="border-l-4 border-blue-500 pl-4 italic text-gray-600">
                                  {children}
                                </blockquote>
                              ),
                              table: ({children}) => (
                                <div className="overflow-x-auto">
                                  <table className="min-w-full border-collapse border border-gray-300">
                                    {children}
                                  </table>
                                </div>
                              ),
                              th: ({children}) => (
                                <th className="border border-gray-300 bg-gray-100 px-4 py-2 text-left font-semibold">
                                  {children}
                                </th>
                              ),
                              td: ({children}) => (
                                <td className="border border-gray-300 px-4 py-2">
                                  {children}
                                </td>
                              ),
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap">{message.content}</div>
                      )}
                    </div>
                    <div className="text-xs opacity-70 mt-1">
                      {message.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                  
                  {message.role === 'user' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                      <span className="text-white text-sm font-medium">U</span>
                    </div>
                  )}
                </div>
              ))
            )}
            
            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-blue-600" />
                </div>
                <div className="bg-gray-100 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 输入区域 */}
          <div className="border-t border-gray-200 p-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="输入需求，AI 将为您拆解为具体任务..."
                disabled={isLoading}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
              <button
                onClick={decomposeRequirement}
                disabled={isLoading || !input.trim()}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Code className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-2 text-xs text-gray-500">
              💡 提示：输入需求后，AI 将自动拆解为具体的开发任务
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// 主 AI 面板组件
const AIPanel: React.FC<{ rootPath?: string }> = ({ rootPath }) => {
  return (
    <ConversationProvider>
      <AIPanelInner rootPath={rootPath} />
    </ConversationProvider>
  );
};

export default AIPanel;
