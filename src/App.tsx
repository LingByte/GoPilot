import GlobalHeader from '@/components/layouts/GlobalHeader';
import ActivityBar, { type ActivityBarItem } from '@/components/layouts/ActivityBar';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Files, Search, GitBranch, Terminal, Database, Bot } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import ExplorerTree from '@/components/explorer/ExplorerTree';
import EditorWorkspace, { type EditorWorkspaceHandle } from '@/components/editor/EditorWorkspace';
import { ViewerRegistryProvider } from '@/components/viewers/ViewerRegistry';
import { defaultRenderers } from '@/components/viewers/defaultRenderers';
import GitPanel from '@/components/git/GitPanel';
import SearchPanel from '@/components/search/SearchPanel';
import GlobalFooter from '@/components/layouts/GlobalFooter';
import BottomPanel from '@/components/terminal/BottomPanel';
import ResizableRightPanel from '@/components/layouts/ResizableRightPanel';
import DatabasePanel from '@/components/database/DatabasePanel';
import AIPanel from '@/components/ai/AIPanel';
import { ExtensionRegistry } from './extensions/registry';
import { loadBuiltinExtensions } from '@/extensions/builtin';
import { loadInstalledExtensionContributions } from './extensions/installed';
import { activateInstalledExtensionsNode } from './extensions/node-runtime';
import { listenForOutputEvents } from './extensions/output-listener';
import type { ExtensionContributions } from './extensions/types';
import Settings from './pages/Settings';
import { invoke } from '@tauri-apps/api/tauri';

const EXPLORER_ROOT_KEY = 'gopilot.explorer.rootPath';
const RECENT_PROJECTS_KEY = 'gopilot.recentProjects';

function pilotOutputLogPath(rootPath: string) {
    return `${rootPath}/.pilot/output.jsonl`;
}

function pilotSessionPath(rootPath: string) {
    return `${rootPath}/.pilot/session.json`;
}

function pilotFileIndexPath(rootPath: string) {
    return `${rootPath}/.pilot/file_index.json`;
}

// 创建 .pilot 索引文件
async function createPilotIndexFile(rootPath: string) {
    console.log('Creating .pilot file for:', rootPath);
    try {
        const pilotDirPath = `${rootPath}/.pilot`;
        const pilotIndexPath = `${pilotDirPath}/index.json`;

        console.log('Original path:', rootPath);
        console.log('Pilot dir path:', pilotDirPath);
        console.log('Pilot index path:', pilotIndexPath);

        // 创建或更新索引文件内容
        const pilotContent = JSON.stringify({
            version: '1.0.0',
            created: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            rootPath,
            files: [],
            lastIndexed: null,
        }, null, 2);
        
        console.log('File content length:', pilotContent.length);

        // 直接使用 Tauri 命令
        console.log('Using Tauri commands directly...');

        // 如果之前错误地创建了同名文件，则先删除
        try {
            await invoke('delete_file', { path: pilotDirPath });
            console.log('Deleted legacy .pilot file (if it existed)');
        } catch {
            // ignore
        }

        // 如果之前使用 Windows 风格路径误创建了同名文件/目录，也尝试清理
        try {
            await invoke('delete_file', { path: `${rootPath}\\.pilot` });
        } catch {
            // ignore
        }

        // 确保 .pilot 目录存在
        await invoke('create_directory', { path: pilotDirPath });

        // 写入索引文件
        await invoke('write_file', { path: pilotIndexPath, content: pilotContent });
        console.log('Tauri commands executed successfully');

        // 验证 index.json 是否真的被创建（使用后端命令，避免前端 FS scope 限制）
        try {
            const tauriContent = (await invoke('read_file', { path: pilotIndexPath })) as string;
            console.log('Tauri file verification successful, size:', tauriContent.length);
            console.log('Tauri file content preview:', tauriContent.substring(0, 100) + '...');
        } catch (tauriVerifyError) {
            console.error('File verification failed:', tauriVerifyError);
        }

        console.log('Successfully updated .pilot index file at:', pilotIndexPath);
    } catch (error) {
        console.error('Failed to create .pilot file:', error);
    }
}

async function buildPilotFileIndex(rootPath: string) {
    try {
        const pilotDirPath = `${rootPath}/.pilot`;
        await invoke('create_directory', { path: pilotDirPath });

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

        const entries = (await invoke('read_directory_tree', { path: rootPath, maxDepth: 12 })) as any[];
        const out: Array<{ path: string; displayPath: string }> = [];
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
                const rel = p.startsWith(rootPath) ? p.slice(rootPath.length).replace(/^\//, '') : p;
                out.push({ path: p, displayPath: rel || p });
            }
        };
        walk(entries);
        out.sort((a, b) => a.displayPath.localeCompare(b.displayPath));

        const payload = JSON.stringify(
            {
                version: '1.0.0',
                rootPath,
                createdAt: new Date().toISOString(),
                files: out,
            },
            null,
            2,
        );
        await invoke('write_file', { path: pilotFileIndexPath(rootPath), content: payload });
    } catch (e) {
        console.error('Failed to build .pilot file index:', e);
    }
}

type WorkspaceSession = {
    openPaths: string[];
    activePath: string | null;
};

function App() {
    const location = useLocation();
    const navigate = useNavigate();
    const showSettings = location.pathname === '/settings';

    return (
        <>
            <EditorShell />
            {showSettings ? (
                <div className="fixed inset-0 z-50 bg-black/30">
                    <div className="absolute inset-4 bg-white rounded-lg shadow-xl overflow-hidden">
                        <Settings onClose={() => navigate('/')} />
                    </div>
                </div>
            ) : null}
        </>
    );
}

function EditorShell() {
    const navigate = useNavigate();
    const baseItems: ActivityBarItem[] = [
        { id: 'explorer', label: 'Explorer', icon: <Files className="w-5 h-5" /> },
        { id: 'search', label: 'Search', icon: <Search className="w-5 h-5" /> },
        { id: 'git', label: 'Git', icon: <GitBranch className="w-5 h-5" /> },
    ];
    const [activeId, setActiveId] = useState(baseItems[0]?.id ?? 'explorer');
    const workspaceRef = useRef<EditorWorkspaceHandle>(null);
    const [rootPath, setRootPath] = useState('');
    const [recentProjects, setRecentProjects] = useState<string[]>([]);
    const [bottomOpen, setBottomOpen] = useState(false);
    const [bottomTab, setBottomTab] = useState<'problems' | 'output' | 'terminal'>('terminal');
    const [bottomHeight, setBottomHeight] = useState(260);
    const [outputText, setOutputText] = useState('');
    const [rightActiveId, setRightActiveId] = useState<string | null>(null);
    const registryRef = useRef<ExtensionRegistry | null>(null);
    const [ext, setExt] = useState<ExtensionContributions>({ activityBarItems: [], sidebarPanels: [] });

    const LEFT_PANEL_WIDTH_KEY = 'gopilot.leftPanel.width';
    const [leftPanelWidth, setLeftPanelWidth] = useState(256);
    const [isLeftDragging, setIsLeftDragging] = useState(false);
    const leftDragStartX = useRef(0);
    const leftDragStartWidth = useRef(0);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(LEFT_PANEL_WIDTH_KEY);
            const n = raw ? Number(raw) : NaN;
            if (Number.isFinite(n) && n >= 180) {
                setLeftPanelWidth(n);
            }
        } catch {
            return;
        }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(LEFT_PANEL_WIDTH_KEY, String(leftPanelWidth));
        } catch {
            return;
        }
    }, [leftPanelWidth]);

    const onLeftResizeMouseDown = useCallback((e: React.MouseEvent) => {
        setIsLeftDragging(true);
        leftDragStartX.current = e.clientX;
        leftDragStartWidth.current = leftPanelWidth;
        e.preventDefault();
    }, [leftPanelWidth]);

    useEffect(() => {
        if (!isLeftDragging) return;

        const onMove = (e: MouseEvent) => {
            const deltaX = e.clientX - leftDragStartX.current;
            const minWidth = 180;
            const maxWidth = window.innerWidth * 0.6;
            const next = Math.max(minWidth, Math.min(leftDragStartWidth.current + deltaX, maxWidth));
            setLeftPanelWidth(next);
        };

        const onUp = () => {
            setIsLeftDragging(false);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
    }, [isLeftDragging]);

    if (!registryRef.current) {
        registryRef.current = new ExtensionRegistry();
        loadBuiltinExtensions(registryRef.current);
        loadInstalledExtensionContributions(registryRef.current);
        activateInstalledExtensionsNode(); // 使用 Node Extension Host
        listenForOutputEvents();
    }

    useEffect(() => {
        const reg = registryRef.current;
        if (!reg) return;
        const unsub = reg.subscribe(setExt);
        const onChanged = () => {
            void loadInstalledExtensionContributions(reg);
            // Node Extension Host 不需要重新激活，由 host 管理扩展生命周期
        };
        const onRuntimeReload = () => {
            // Node Extension Host 不支持热重载，需要重启 host
            console.log('[Extensions] Runtime reload requested - restarting Node Extension Host');
        };
        window.addEventListener('extensions-installed-changed', onChanged);
        window.addEventListener('extensions-runtime-reload', onRuntimeReload);
        return () => {
            window.removeEventListener('extensions-installed-changed', onChanged);
            window.removeEventListener('extensions-runtime-reload', onRuntimeReload);
            unsub();
        };
    }, []); // 只在组件挂载时执行一次

    const items: ActivityBarItem[] = useMemo(() => {
        return [...baseItems, ...ext.activityBarItems];
    }, [baseItems, ext.activityBarItems]);

    const rightItems = useMemo(() => {
        return [
            { id: 'tools', label: 'Tools', icon: <Terminal className="w-5 h-5" /> },
            { id: 'database', label: 'Database', icon: <Database className="w-5 h-5" /> },
            { id: 'ai', label: 'AI Assistant', icon: <Bot className="w-5 h-5" /> },
        ];
    }, []);

    const appendOutput = useCallback(
        (title: string, text: string) => {
            if (!rootPath) return;
            const entry = {
                ts: new Date().toISOString(),
                title,
                text: (text ?? '').toString(),
            };
            const line = `${JSON.stringify(entry)}\n`;

            setOutputText((prev) => (prev ? `${prev}${line}` : line));

            void (async () => {
                try {
                    const p = pilotOutputLogPath(rootPath);
                    await invoke('create_directory', { path: `${rootPath}/.pilot` });
                    await invoke('append_file', { path: p, content: line });
                } catch (e) {
                    console.error('Failed to append output log:', e);
                }
            })();

            setBottomTab('output');
            setBottomOpen(true);
        },
        [rootPath],
    );

    const loadOutputLog = useCallback(async () => {
        if (!rootPath) {
            setOutputText('');
            return;
        }
        try {
            const p = pilotOutputLogPath(rootPath);
            const content = await invoke('read_file', { path: p });
            setOutputText(typeof content === 'string' ? content : String(content ?? ''));
        } catch {
            setOutputText('');
        }
    }, [rootPath]);

    const clearOutput = useCallback(() => {
        setOutputText('');
        if (!rootPath) return;
        void (async () => {
            try {
                const p = pilotOutputLogPath(rootPath);
                await invoke('write_file', { path: p, content: '' });
            } catch (e) {
                console.error('Failed to clear output log:', e);
            }
        })();
    }, [rootPath]);

    // 创建 .pilot 索引文件的包装函数
    const handleRootPathChange = useCallback(
        async (path: string) => {
            console.log('Root path changing to:', path);
            setRootPath(path);
            console.log('About to create .pilot file...');
            await createPilotIndexFile(path);
            void buildPilotFileIndex(path);
            await loadOutputLog();
        },
        [loadOutputLog],
    );

    const addRecentProject = useCallback((p: string) => {
        const next = [p, ...recentProjects.filter((x) => x !== p)].slice(0, 12);
        setRecentProjects(next);
        try {
            localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(next));
        } catch {
            return;
        }
    }, [recentProjects]);

    const openRecentProject = useCallback(async (p: string) => {
        if (!p) return;
        await handleRootPathChange(p);
        addRecentProject(p);
        setActiveId('explorer');
    }, [addRecentProject, handleRootPathChange]);

    const persistSession = useCallback(
        (session: WorkspaceSession) => {
            if (!rootPath) return;
            void (async () => {
                try {
                    await invoke('create_directory', { path: `${rootPath}/.pilot` });
                    await invoke('write_file', { path: pilotSessionPath(rootPath), content: JSON.stringify(session, null, 2) });
                } catch (e) {
                    console.error('Failed to persist session:', e);
                }
            })();
        },
        [rootPath],
    );

    const restoreSession = useCallback(async () => {
        if (!rootPath) return;
        try {
            const raw = await invoke('read_file', { path: pilotSessionPath(rootPath) });
            if (typeof raw !== 'string' || !raw) return;
            const parsed = JSON.parse(raw) as WorkspaceSession;
            const openPaths = Array.isArray(parsed?.openPaths) ? parsed.openPaths.filter(Boolean) : [];
            const activePath = typeof parsed?.activePath === 'string' ? parsed.activePath : null;
            if (openPaths.length === 0) return;
            await workspaceRef.current?.restoreSession(openPaths, activePath ?? undefined);
        } catch {
            return;
        }
    }, [rootPath]);

    useEffect(() => {
        const onExtOutput = (e: any) => {
            const title = e?.detail?.title ? String(e.detail.title) : 'Extension';
            const text = e?.detail?.text ? String(e.detail.text) : '';
            if (!text) return;
            appendOutput(title, text);
        };
        window.addEventListener('extensions-output', onExtOutput);
        return () => {
            window.removeEventListener('extensions-output', onExtOutput);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const saved = localStorage.getItem(EXPLORER_ROOT_KEY);
        if (saved) setRootPath(saved);
    }, []);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(RECENT_PROJECTS_KEY);
            const list = raw ? JSON.parse(raw) : [];
            if (Array.isArray(list)) setRecentProjects(list.filter(Boolean));
        } catch {
            return;
        }
    }, []);

    useEffect(() => {
        let unlisten: null | (() => void) = null;
        console.log('Setting up file open listeners...');

        (async () => {
            try {
                console.log('Importing Tauri event module...');
                const event = await import('@tauri-apps/api/event');
                const fs = await import('@tauri-apps/api/fs');
                console.log('Tauri modules imported successfully');
                
                const listener = await event.listen<string[]>('open-files', async (e) => {
                    console.log('open-files event received:', e.payload);
                    const paths = (e.payload ?? []).filter(Boolean);
                    if (paths.length === 0) return;

                    const candidate = paths[0];
                    try {
                        await fs.readDir(candidate, { recursive: false });
                        console.log('Setting root path to:', candidate);
                        setRootPath(candidate);
                        addRecentProject(candidate);
                        console.log('About to create .pilot file...');
                        await createPilotIndexFile(candidate); // 创建 .pilot 文件
                        await loadOutputLog();
                        setActiveId('explorer');
                    } catch (error) {
                        console.error('Failed to open directory:', error);
                        return;
                    }
                });
                console.log('open-files listener set up successfully');
                unlisten = () => {
                    try {
                        listener();
                    } catch {
                        return;
                    }
                };
            } catch (error) {
                console.error('Failed to set up file listeners:', error);
            }
        })();

        return () => {
            if (unlisten) unlisten();
        };
    }, []);

    useEffect(() => {
        const handler = () => {
            setActiveId('explorer');
        };

        try {
            window.addEventListener('gopilot:revealInExplorer', handler as any);
        } catch {
            return;
        }

        return () => {
            try {
                window.removeEventListener('gopilot:revealInExplorer', handler as any);
            } catch {
                return;
            }
        };
    }, []);

    useEffect(() => {
        if (rootPath) localStorage.setItem(EXPLORER_ROOT_KEY, rootPath);
        else localStorage.removeItem(EXPLORER_ROOT_KEY);
    }, [rootPath]);

    useEffect(() => {
        void restoreSession();
    }, [restoreSession]);

    useEffect(() => {
        void loadOutputLog();
    }, [loadOutputLog]);

    useEffect(() => {
        let unlisten: null | (() => void) = null;

        (async () => {
            try {
                const event = await import('@tauri-apps/api/event');
                const fs = await import('@tauri-apps/api/fs');
                const listener = await event.listen<string[]>('tauri://file-drop', async (e) => {
                    const paths = (e.payload ?? []).filter(Boolean);
                    if (paths.length === 0) return;

                    const candidate = paths[0];
                    try {
                        await fs.readDir(candidate, { recursive: false });
                        console.log('Setting root path to:', candidate);
                        setRootPath(candidate);
                        addRecentProject(candidate);
                        console.log('About to create .pilot file...');
                        await createPilotIndexFile(candidate); // 创建 .pilot 文件
                        await loadOutputLog();
                        setActiveId('explorer');
                    } catch (error) {
                        console.error('Failed to open directory:', error);
                        return;
                    }
                });
                unlisten = () => {
                    try {
                        listener();
                    } catch {
                        return;
                    }
                };
            } catch {
                return;
            }
        })();

        return () => {
            if (unlisten) unlisten();
        };
    }, []);

    return (
        <ViewerRegistryProvider renderers={defaultRenderers}>
            <div className="h-screen overflow-hidden flex flex-col">
                <GlobalHeader onSettingsClick={() => navigate('/settings')} />
                <div className="flex-1 min-h-0 flex">
                    <ActivityBar items={items} activeId={activeId} onActiveChange={setActiveId} />

                    <aside
                        className="border-r border-gray-200 bg-white relative"
                        style={{ width: leftPanelWidth, minWidth: 180 }}
                    >
                        {isLeftDragging && (
                            <div
                                className="fixed inset-0 z-50 cursor-ew-resizing"
                                style={{ cursor: 'ew-resizing' }}
                            />
                        )}

                        <div className={(activeId === 'explorer' ? '' : 'hidden') + ' h-full'}>
                            <ExplorerTree
                                rootPath={rootPath}
                                onRootPathChange={handleRootPathChange}
                                onOpenFile={(path) => workspaceRef.current?.openFile(path)}
                            />
                        </div>

                        <div className={(activeId === 'search' ? '' : 'hidden') + ' h-full'}>
                            <SearchPanel
                                rootPath={rootPath}
                                onOpenMatch={(path, line, column) => {
                                    const ws = workspaceRef.current;
                                    if (!ws) return;
                                    void ws.openFileAt(path, line, column);
                                }}
                            />
                        </div>

                        <div className={(activeId === 'git' ? '' : 'hidden') + ' h-full'}>
                            <GitPanel
                                rootPath={rootPath}
                                onOutput={(title: string, text: string) => appendOutput(title, text)}
                            />
                        </div>

                        {ext.sidebarPanels.map((p) => (
                            <div key={p.id} className={(activeId === p.id ? '' : 'hidden') + ' h-full'}>
                                {p.render({ rootPath, onOpenFile: (path) => workspaceRef.current?.openFile(path) })}
                            </div>
                        ))}

                        <div
                            className={
                                'absolute right-0 top-0 bottom-0 w-1 transition-all duration-200 z-10 group ' +
                                (isLeftDragging
                                    ? 'bg-blue-500 cursor-ew-resizing'
                                    : 'bg-gray-300 hover:bg-blue-500 hover:opacity-70 cursor-ew-resize')
                            }
                            onMouseDown={onLeftResizeMouseDown}
                            style={{ right: -2, width: isLeftDragging ? 6 : 4 }}
                        >
                            <div
                                className={
                                    'absolute right-0 top-1/2 transform -translate-y-1/2 w-0.5 h-6 rounded-full transition-colors duration-200 ' +
                                    (isLeftDragging ? 'bg-blue-300' : 'bg-gray-400 group-hover:bg-blue-400')
                                }
                            />
                        </div>
                    </aside>

                    <div className="flex-1 min-h-0 flex flex-col w-full overflow-hidden">
                        <div className="flex-1 min-h-0 w-full overflow-hidden">
                            <EditorWorkspace
                                ref={workspaceRef}
                                onSessionChange={(session: WorkspaceSession) => persistSession(session)}
                                recentProjects={recentProjects}
                                onOpenRecentProject={(p: string) => void openRecentProject(p)}
                                projectRoot={rootPath}
                            />
                        </div>
                        <BottomPanel
                            open={bottomOpen}
                            activeTab={bottomTab}
                            height={bottomHeight}
                            onOpenChange={setBottomOpen}
                            onActiveTabChange={setBottomTab}
                            onHeightChange={setBottomHeight}
                            rootPath={rootPath}
                            outputText={outputText}
                            onClearOutput={clearOutput}
                        />
                    </div>

                    {/* 弹性右侧面板 */}
                    <ResizableRightPanel
                        items={rightItems}
                        panels={[
                            {
                                id: 'tools',
                                title: 'Tools',
                                children: (
                                    <div className="p-3 flex flex-col gap-2">
                                        <button
                                            type="button"
                                            className="text-sm px-3 py-2 rounded border border-gray-200 hover:bg-gray-50 active:bg-gray-100 text-left"
                                            onClick={() => {
                                                setBottomTab('terminal');
                                                setBottomOpen(true);
                                            }}
                                        >
                                            Open Terminal
                                        </button>
                                        <button
                                            type="button"
                                            className="text-sm px-3 py-2 rounded border border-gray-200 hover:bg-gray-50 active:bg-gray-100 text-left"
                                            onClick={() => {
                                                setBottomTab('output');
                                                setBottomOpen(true);
                                            }}
                                        >
                                            Open Output
                                        </button>
                                        <button
                                            type="button"
                                            className="text-sm px-3 py-2 rounded border border-gray-200 hover:bg-gray-50 active:bg-gray-100 text-left"
                                            onClick={clearOutput}
                                        >
                                            Clear Output
                                        </button>
                                        <button
                                            type="button"
                                            className="text-sm px-3 py-2 rounded border border-gray-200 hover:bg-gray-50 active:bg-gray-100 text-left"
                                            onClick={() => navigate('/settings')}
                                        >
                                            Settings
                                        </button>
                                    </div>
                                ),
                                minWidth: 200,
                                defaultWidth: 280,
                            },
                            {
                                id: 'database',
                                title: 'Database',
                                children: <DatabasePanel rootPath={rootPath} />,
                                minWidth: 300,
                                defaultWidth: 480,
                            },
                            {
                                id: 'ai',
                                title: 'AI Assistant',
                                children: <AIPanel rootPath={rootPath} />,
                                minWidth: 350,
                                defaultWidth: 420,
                            },
                        ]}
                        activeId={rightActiveId}
                        onActiveChange={setRightActiveId}
                    />
                </div>
                <GlobalFooter
                    rootPath={rootPath}
                    onOpenTerminal={() => {
                        setBottomTab('terminal');
                        setBottomOpen(true);
                    }}
                />
            </div>
        </ViewerRegistryProvider>
    );
}

export default App;