import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from '@/components/ui/Modal';

type Line = {
  kind: 'cmd' | 'out' | 'err';
  text: string;
};

export default function TerminalModal({
  open,
  rootPath,
  onClose,
}: {
  open: boolean;
  rootPath: string;
  onClose: () => void;
}) {
  const [cmd, setCmd] = useState('');
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const outputRef = useRef<HTMLDivElement | null>(null);

  const title = useMemo(() => {
    const p = rootPath?.trim();
    return p ? `Terminal — ${p}` : 'Terminal';
  }, [rootPath]);

  useEffect(() => {
    if (!open) return;
    // Ensure latest output is visible
    const t = window.setTimeout(() => {
      const el = outputRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, lines.length]);

  const run = useCallback(async () => {
    const c = cmd.trim();
    if (!c || busy) return;

    setBusy(true);
    setLines((p) => [...p, { kind: 'cmd', text: c }]);
    setCmd('');

    try {
      const { invoke } = await import('@tauri-apps/api/tauri');
      const out = await invoke<string>('execute_command', {
        command: c,
        working_dir: rootPath || undefined,
      });
      const text = String(out ?? '');
      if (text.trim()) {
        setLines((p) => [...p, { kind: 'out', text }]);
      }
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : e?.message ? String(e.message) : 'Command failed.';
      setLines((p) => [...p, { kind: 'err', text: msg }]);
    } finally {
      setBusy(false);
    }
  }, [busy, cmd, rootPath]);

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      widthClassName="w-[900px]"
      footer={
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] text-gray-500 truncate">{rootPath || 'No workspace selected'}</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-xs px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50"
              onClick={() => setLines([])}
              disabled={busy}
            >
              Clear
            </button>
            <button
              type="button"
              className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => void run()}
              disabled={busy || !cmd.trim()}
            >
              Run
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-2">
        <div ref={outputRef} className="h-[45vh] overflow-auto rounded border border-gray-200 bg-black text-gray-100 p-2">
          {lines.length === 0 ? (
            <div className="text-xs text-gray-400">Type a command below.</div>
          ) : (
            <div className="space-y-1">
              {lines.map((l, idx) => (
                <pre
                  key={idx}
                  className={
                    'text-xs whitespace-pre-wrap break-words ' +
                    (l.kind === 'cmd' ? 'text-blue-200' : l.kind === 'err' ? 'text-red-300' : 'text-gray-100')
                  }
                >
                  {l.kind === 'cmd' ? `$ ${l.text}` : l.text}
                </pre>
              ))}
            </div>
          )}
        </div>

        <input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          placeholder={rootPath ? 'Enter command and press Enter…' : 'Open a workspace first…'}
          className="w-full text-sm px-3 py-2 border border-gray-200 rounded"
          disabled={busy || !rootPath}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void run();
            }
          }}
        />
      </div>
    </Modal>
  );
}
