import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import XtermTerminal from '@/components/terminal/XtermTerminal';
import { Plus, X } from 'lucide-react';

type PanelTab = 'problems' | 'output' | 'terminal';

export default function BottomPanel({
  open,
  activeTab,
  height,
  onOpenChange,
  onActiveTabChange,
  onHeightChange,
  rootPath,
  outputText,
  onClearOutput,
}: {
  open: boolean;
  activeTab: PanelTab;
  height: number;
  onOpenChange: (open: boolean) => void;
  onActiveTabChange: (tab: PanelTab) => void;
  onHeightChange: (height: number) => void;
  rootPath: string;
  outputText: string;
  onClearOutput: () => void;
}) {
  const [terminals, setTerminals] = useState<Array<{ id: string; cwd: string; title: string }>>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string>('');
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    if (terminals.length > 0) return;
    const id = `t_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const cwd = rootPath;
    setTerminals([{ id, cwd, title: '1' }]);
    setActiveTerminalId(id);
  }, [open, rootPath, terminals.length]);

  const addTerminal = useCallback(() => {
    const nextIndex = terminals.length + 1;
    const id = `t_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const cwd = rootPath;
    const t = { id, cwd, title: String(nextIndex) };
    setTerminals((p) => [...p, t]);
    setActiveTerminalId(id);
    if (!open) onOpenChange(true);
    onActiveTabChange('terminal');
  }, [onActiveTabChange, onOpenChange, open, rootPath, terminals.length]);

  const closeActiveTerminal = useCallback(() => {
    setTerminals((prev) => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex((t) => t.id === activeTerminalId);
      const next = prev.filter((t) => t.id !== activeTerminalId);
      const nextActive = next[Math.min(Math.max(0, idx), next.length - 1)]?.id ?? next[0]?.id;
      if (nextActive) setActiveTerminalId(nextActive);
      return next;
    });
  }, [activeTerminalId, terminals]);

  const tabBtn = useCallback(
    (id: PanelTab, label: string) => {
      const active = activeTab === id;
      return (
        <button
          type="button"
          className={
            'text-xs px-2 py-1 rounded ' +
            (active ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:bg-gray-100 active:bg-gray-200')
          }
          onClick={() => {
            onActiveTabChange(id);
            if (!open) onOpenChange(true);
          }}
        >
          {label}
        </button>
      );
    },
    [activeTab, onActiveTabChange, onOpenChange, open],
  );

  const onMouseDownDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startY: e.clientY, startH: height };

      const onMove = (ev: MouseEvent) => {
        const cur = dragRef.current;
        if (!cur) return;
        const delta = cur.startY - ev.clientY;
        const next = Math.max(120, Math.min(600, cur.startH + delta));
        onHeightChange(next);
      };

      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [height, onHeightChange],
  );

  const body = useMemo(() => {
    if (activeTab === 'problems') {
      return <div className="p-3 text-xs text-gray-500">No problems.</div>;
    }
    if (activeTab === 'output') {
      return (
        <div className="h-full flex flex-col">
          <div className="h-8 px-2 flex items-center justify-between border-b border-gray-200 bg-white">
            <div className="text-[11px] text-gray-500">Output</div>
            <button
              type="button"
              className="text-xs px-2 py-1 rounded hover:bg-gray-100 active:bg-gray-200 text-gray-600"
              onClick={onClearOutput}
            >
              Clear
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-auto bg-black text-gray-100 p-2">
            {outputText.trim() ? (
              <pre className="text-xs whitespace-pre-wrap break-words">{outputText}</pre>
            ) : (
              <div className="text-xs text-gray-400">No output.</div>
            )}
          </div>
        </div>
      );
    }

    const active = terminals.find((t) => t.id === activeTerminalId) ?? terminals[0];
    return (
      <div className="h-full flex flex-col">
        <div className="h-8 px-2 flex items-center justify-between border-b border-gray-200 bg-white">
          <div className="min-w-0 text-[11px] text-gray-500 truncate" title={active?.cwd ?? rootPath}>
            {active?.cwd ?? rootPath}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-gray-100 active:bg-gray-200"
              onClick={addTerminal}
              title="New Terminal"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-gray-100 active:bg-gray-200"
              onClick={closeActiveTerminal}
              title="Kill Terminal"
              disabled={terminals.length <= 1}
            >
              <X className="w-4 h-4" />
            </button>

            <div className="ml-2 pl-2 border-l border-gray-200 flex items-center gap-1 max-w-[260px] overflow-auto">
              {terminals.map((t) => {
                const isActive = t.id === activeTerminalId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={
                      'text-xs px-2 py-1 rounded shrink-0 ' +
                      (isActive ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:bg-gray-100 active:bg-gray-200')
                    }
                    onClick={() => setActiveTerminalId(t.id)}
                    title={t.cwd}
                  >
                    {t.title}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 p-2">
          {terminals.map((t) => {
            const isActive = t.id === activeTerminalId;
            return (
              <div key={t.id} className={isActive ? 'h-full' : 'h-full hidden'}>
                <XtermTerminal cwd={t.cwd} active={isActive} />
              </div>
            );
          })}
        </div>
      </div>
    );
  }, [activeTab, activeTerminalId, addTerminal, closeActiveTerminal, onClearOutput, outputText, rootPath, terminals]);

  if (!open) return null;

  return (
    <div className="w-full border-t border-gray-200 bg-white" style={{ height }}>
      <div
        className="h-2 cursor-ns-resize bg-transparent"
        onMouseDown={onMouseDownDrag}
        title="Drag to resize"
      />

      <div className="h-8 px-2 flex items-center justify-between border-b border-gray-200">
        <div className="flex items-center gap-1">
          {tabBtn('problems', 'Problems')}
          {tabBtn('output', 'Output')}
          {tabBtn('terminal', 'Terminal')}
        </div>

        <button
          type="button"
          className="text-xs px-2 py-1 rounded hover:bg-gray-100 active:bg-gray-200 text-gray-600"
          onClick={() => onOpenChange(false)}
        >
          Close
        </button>
      </div>

      <div className="h-[calc(100%-2.5rem)]">{body}</div>
    </div>
  );
}
