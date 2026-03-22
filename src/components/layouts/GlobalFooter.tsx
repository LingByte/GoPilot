import { useEffect, useState } from 'react';
import { GitBranch, Terminal } from 'lucide-react';

export default function GlobalFooter({
  rootPath,
  onOpenTerminal,
}: {
  rootPath: string;
  onOpenTerminal: () => void;
}) {
  const [label, setLabel] = useState('No Git');

  useEffect(() => {
    let disposed = false;
    let timer: number | null = null;

    const refresh = async () => {
      if (!rootPath) {
        if (!disposed) setLabel('No Git');
        return;
      }
      try {
        const { invoke } = await import('@tauri-apps/api/tauri');
        const repo = await invoke<boolean>('is_git_repository', { path: rootPath });
        if (!repo) {
          if (!disposed) setLabel('No Git');
          return;
        }
        const branch = await invoke<string | null>('git_current_branch', { path: rootPath });
        if (!disposed) setLabel(branch && branch.trim() ? branch.trim() : 'Detached');
      } catch {
        if (!disposed) setLabel('No Git');
      }
    };

    void refresh();
    timer = window.setInterval(() => void refresh(), 5000);

    return () => {
      disposed = true;
      if (timer) window.clearInterval(timer);
    };
  }, [rootPath]);

  return (
    <footer className="h-7 shrink-0 flex items-center justify-between px-2 bg-background text-foreground border-t border-border">
      <div className="flex items-center gap-2 text-xs min-w-0">
        <GitBranch className="w-3.5 h-3.5 shrink-0" />
        <div className="flex items-center gap-1 min-w-0">
          <span className="truncate max-w-[220px]" title={label}>
            {label}
          </span>
          <button
            type="button"
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent active:bg-accent/80"
            onClick={onOpenTerminal}
            title="Terminal"
          >
            <Terminal className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div />
    </footer>
  );
}
