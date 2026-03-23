import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

export default function XtermTerminal({ cwd, active }: { cwd: string; active: boolean }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const sessionIdRef = useRef<string>('');
  const unlistenRef = useRef<null | (() => void)>(null);
  const resizeTimerRef = useRef<number | null>(null);
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const resizeCooldownUntilRef = useRef<number>(0);
  const cooldownTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Ensure StrictMode remounts don't leave previous terminal DOM/content behind.
    try {
      host.innerHTML = '';
    } catch {
      // ignore
    }

    const term = new Terminal({
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      cursorBlink: true,
      scrollback: 2000,
      convertEol: false,
      rows: 30, // 固定行数
      cols: 80, // 固定列数
      theme: {
        background: '#0b0f14',
        foreground: '#e5e7eb',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(host);

    try {
      fitAddon.fit();
    } catch {
      // ignore
    }

    termRef.current = term;
    fitRef.current = fitAddon;

    const scheduleResize = () => {
      if (resizeTimerRef.current) {
        window.clearTimeout(resizeTimerRef.current);
      }
      resizeTimerRef.current = window.setTimeout(() => {
        resizeTimerRef.current = null;

        // Avoid sending early resizes right after PTY spawn. zsh can redraw prompt on resize
        // and produce duplicated prompt lines.
        if (Date.now() < resizeCooldownUntilRef.current) return;

        const currentTerm = termRef.current;
        const fit = fitRef.current;
        if (!currentTerm || !fit) return;
        try {
          fit.fit();
        } catch {
          return;
        }

        const cols = currentTerm.cols;
        const rows = currentTerm.rows;
        if (!cols || !rows) return;

        const last = lastSizeRef.current;
        if (last && last.cols === cols && last.rows === rows) return;
        lastSizeRef.current = { cols, rows };

        const sid = sessionIdRef.current;
        if (!sid) return;
        void import('@tauri-apps/api/tauri').then(({ invoke }) =>
          invoke('terminal_resize', { sessionId: sid, cols, rows }).catch(() => null),
        );
      }, 150);
    };

    const ro = new ResizeObserver(scheduleResize);
    ro.observe(host);
    roRef.current = ro;

    let disposed = false;

    (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/tauri');
        const currentTerm = termRef.current;
        const dims = {
          cols: currentTerm?.cols ? Number(currentTerm.cols) : 80,
          rows: currentTerm?.rows ? Number(currentTerm.rows) : 30,
        }; // 使用固定尺寸
        const sid = (await invoke<string>('terminal_start', {
          cwd: cwd || undefined,
          cols: dims.cols,
          rows: dims.rows,
        })) as string;
        if (disposed) {
          await invoke('terminal_kill', { sessionId: sid }).catch(() => null);
          return;
        }
        sessionIdRef.current = sid;
        lastSizeRef.current = { cols: dims.cols, rows: dims.rows };

        // Cooldown: suppress resize events briefly after spawning shell.
        resizeCooldownUntilRef.current = Date.now() + 1500;
        if (cooldownTimerRef.current) {
          window.clearTimeout(cooldownTimerRef.current);
        }
        cooldownTimerRef.current = window.setTimeout(() => {
          cooldownTimerRef.current = null;
          resizeCooldownUntilRef.current = 0;
          scheduleResize();
        }, 1550);

        const { listen } = await import('@tauri-apps/api/event');
        const unlisten = await listen<any>('terminal-data', (event) => {
          const payload = event.payload as any;
          if (!payload) return;
          if (payload.sessionId !== sid) return;
          const data = typeof payload.data === 'string' ? payload.data : '';
          if (!data) return;
          term.write(data);
        });
        unlistenRef.current = unlisten;

        term.onData((data) => {
          void invoke('terminal_write', { sessionId: sid, data }).catch(() => null);
        });
      } catch {
        term.write('Failed to start terminal session.\r\n');
      }
    })();

    return () => {
      disposed = true;

      if (resizeTimerRef.current) {
        window.clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }

      if (cooldownTimerRef.current) {
        window.clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
      resizeCooldownUntilRef.current = 0;

      lastSizeRef.current = null;
      try {
        ro.disconnect();
      } catch {
        // ignore
      }
      roRef.current = null;

      try {
        unlistenRef.current?.();
      } catch {
        // ignore
      }
      unlistenRef.current = null;

      const sid = sessionIdRef.current;
      sessionIdRef.current = '';
      if (sid) {
        void import('@tauri-apps/api/tauri').then(({ invoke }) => invoke('terminal_kill', { sessionId: sid }).catch(() => null));
      }

      try {
        term.dispose();
      } catch {
        // ignore
      }
      termRef.current = null;
      fitRef.current = null;

      try {
        host.innerHTML = '';
      } catch {
        // ignore
      }
    };
  }, [cwd]);

  useEffect(() => {
    if (!active) return;
    const term = termRef.current;
    const sid = sessionIdRef.current;
    if (!term || !sid) return;
    // No-op: resizing is handled by ResizeObserver (debounced).
  }, [active]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 border border-gray-200 rounded overflow-hidden">
        <div ref={hostRef} className="h-full w-full" />
      </div>
    </div>
  );
}
