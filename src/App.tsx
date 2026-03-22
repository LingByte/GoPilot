import GlobalHeader from '@/components/layouts/GlobalHeader';
import ActivityBar, { type ActivityBarItem } from '@/components/layouts/ActivityBar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Files, Search, GitBranch } from 'lucide-react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import ExplorerTree from '@/components/explorer/ExplorerTree';
import EditorWorkspace, { type EditorWorkspaceHandle } from '@/components/editor/EditorWorkspace';
import { ViewerRegistryProvider } from '@/components/viewers/ViewerRegistry';
import { defaultRenderers } from '@/components/viewers/defaultRenderers';
import GitPanel from '@/components/git/GitPanel';
import SearchPanel from '@/components/search/SearchPanel';
import GlobalFooter from '@/components/layouts/GlobalFooter';
import BottomPanel from '@/components/terminal/BottomPanel';
import { ExtensionRegistry } from './extensions/registry';
import { loadBuiltinExtensions } from '@/extensions/builtin';
import { loadInstalledExtensionContributions } from './extensions/installed';
import { activateInstalledExtensionsNode } from './extensions/node-runtime';
import { listenForOutputEvents } from './extensions/output-listener';
import type { ExtensionContributions } from './extensions/types';
import Settings from './pages/Settings';

const EXPLORER_ROOT_KEY = 'gopilot.explorer.rootPath';

function App() {
    return (
        <Routes>
            <Route path="/" element={<EditorShell />} />
            <Route path="/settings" element={<Settings />} />
        </Routes>
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
    const [bottomOpen, setBottomOpen] = useState(false);
    const [bottomTab, setBottomTab] = useState<'problems' | 'output' | 'terminal'>('terminal');
    const [bottomHeight, setBottomHeight] = useState(260);
    const [outputText, setOutputText] = useState('');
    const registryRef = useRef<ExtensionRegistry | null>(null);
    const [ext, setExt] = useState<ExtensionContributions>({ activityBarItems: [], sidebarPanels: [] });

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

    const appendOutput = (title: string, text: string) => {
        const stamp = new Date().toLocaleTimeString();
        const header = `[${stamp}] ${title}`;
        const body = (text ?? '').toString().trimEnd();
        setOutputText((prev) => {
            const next = prev ? `${prev}\n\n${header}\n${body}` : `${header}\n${body}`;
            return next.trimEnd();
        });
        setBottomTab('output');
        setBottomOpen(true);
    };

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
        let unlisten: null | (() => void) = null;

        (async () => {
            try {
                const event = await import('@tauri-apps/api/event');
                const fs = await import('@tauri-apps/api/fs');
                const listener = await event.listen<string[]>('open-files', async (e) => {
                    const paths = (e.payload ?? []).filter(Boolean);
                    if (paths.length === 0) return;

                    const candidate = paths[0];
                    try {
                        await fs.readDir(candidate, { recursive: false });
                        setRootPath(candidate);
                        setActiveId('explorer');
                    } catch {
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

    useEffect(() => {
        if (rootPath) localStorage.setItem(EXPLORER_ROOT_KEY, rootPath);
        else localStorage.removeItem(EXPLORER_ROOT_KEY);
    }, [rootPath]);

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
                        setRootPath(candidate);
                        setActiveId('explorer');
                    } catch {
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

                    <div className={"w-64 min-w-64 border-r border-gray-200 " + (activeId === 'explorer' ? '' : 'hidden')}>
                        <ExplorerTree
                            rootPath={rootPath}
                            onRootPathChange={setRootPath}
                            onOpenFile={(path) => workspaceRef.current?.openFile(path)}
                        />
                    </div>

                    <div className={"w-64 min-w-64 border-r border-gray-200 bg-white " + (activeId === 'search' ? '' : 'hidden')}>
                        <SearchPanel
                            rootPath={rootPath}
                            onOpenMatch={(path, line, column) => {
                                const ws = workspaceRef.current;
                                if (!ws) return;
                                void ws.openFileAt(path, line, column);
                            }}
                        />
                    </div>

                    <div className={"w-64 min-w-64 border-r border-gray-200 bg-white " + (activeId === 'git' ? '' : 'hidden')}>
                        <GitPanel
                            rootPath={rootPath}
                            onOutput={(title: string, text: string) => appendOutput(title, text)}
                        />
                    </div>

                    {ext.sidebarPanels.map((p) => (
                        <div
                            key={p.id}
                            className={"w-64 min-w-64 border-r border-gray-200 bg-white " + (activeId === p.id ? '' : 'hidden')}
                        >
                            {p.render({ rootPath, onOpenFile: (path) => workspaceRef.current?.openFile(path) })}
                        </div>
                    ))}

                    <div className="flex-1 min-h-0 flex flex-col">
                        <div className="flex-1 min-h-0">
                            <EditorWorkspace ref={workspaceRef} />
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
                            onClearOutput={() => setOutputText('')}
                        />
                    </div>
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