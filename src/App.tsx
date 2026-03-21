import GlobalHeader from '@/components/layouts/GlobalHeader';
import ActivityBar, { type ActivityBarItem } from '@/components/layouts/ActivityBar';
import { useEffect, useRef, useState } from 'react';
import { Files, Search, GitBranch } from 'lucide-react';
import ExplorerTree from '@/components/explorer/ExplorerTree';
import EditorWorkspace, { type EditorWorkspaceHandle } from '@/components/editor/EditorWorkspace';
import { ViewerRegistryProvider } from '@/components/viewers/ViewerRegistry';
import { defaultRenderers } from '@/components/viewers/defaultRenderers';

const EXPLORER_ROOT_KEY = 'gopilot.explorer.rootPath';

function App() {
    const items: ActivityBarItem[] = [
        { id: 'explorer', label: 'Explorer', icon: <Files className="w-5 h-5" /> },
        { id: 'search', label: 'Search', icon: <Search className="w-5 h-5" /> },
        { id: 'git', label: 'Git', icon: <GitBranch className="w-5 h-5" /> },
    ];
    const [activeId, setActiveId] = useState(items[0]?.id ?? 'explorer');
    const workspaceRef = useRef<EditorWorkspaceHandle>(null);
    const [rootPath, setRootPath] = useState('');

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

                    // If user drops a folder on the app icon, it typically arrives here as argv.
                    const candidate = paths[0];
                    try {
                        await fs.readDir(candidate, { recursive: false });
                        setRootPath(candidate);
                        setActiveId('explorer');
                    } catch {
                        // Not a directory or not allowed; ignore.
                    }
                });
                unlisten = () => {
                    try {
                        listener();
                    } catch {
                        // ignore
                    }
                };
            } catch {
                // not running in tauri
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
                        // If it is a directory, readDir will succeed.
                        await fs.readDir(candidate, { recursive: false });
                        setRootPath(candidate);
                        setActiveId('explorer');
                    } catch {
                        // Not a directory or not allowed; ignore.
                    }
                });
                unlisten = () => {
                    try {
                        listener();
                    } catch {
                        // ignore
                    }
                };
            } catch {
                // not running in tauri
            }
        })();

        return () => {
            if (unlisten) unlisten();
        };
    }, []);

    return (
        <ViewerRegistryProvider renderers={defaultRenderers}>
            <div className="h-screen overflow-hidden flex flex-col">
                <GlobalHeader />
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
                        <div className="h-10 px-3 flex items-center border-b border-gray-200 text-sm font-medium text-gray-800">
                            Search
                        </div>
                        <div className="p-3 text-xs text-gray-500">Coming soon.</div>
                    </div>

                    <div className={"w-64 min-w-64 border-r border-gray-200 bg-white " + (activeId === 'git' ? '' : 'hidden')}>
                        <div className="h-10 px-3 flex items-center border-b border-gray-200 text-sm font-medium text-gray-800">
                            Git
                        </div>
                        <div className="p-3 text-xs text-gray-500">Coming soon.</div>
                    </div>

                    <div className="flex-1 min-h-0">
                        <EditorWorkspace ref={workspaceRef} />
                    </div>
                </div>
            </div>
        </ViewerRegistryProvider>
    );
}

export default App;