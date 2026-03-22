import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import 'xterm/css/xterm.css';

export default function XtermTerminal({ cwd, active }: { cwd: string; active: boolean }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const sessionIdRef = useRef<string>('');
  const unlistenRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      cursorBlink: true,
      scrollback: 2000,
      convertEol: true,
      rows: 30, // 固定行数
      cols: 80, // 固定列数
      theme: {
        background: '#0b0f14',
        foreground: '#e5e7eb',
      },
    });

    term.open(host);

    termRef.current = term;

    // 手动处理尺寸调整
    const resizeTerminal = () => {
      const currentTerm = termRef.current;
      if (!host || !currentTerm) return;
      
      const rect = host.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      
      // 计算新的行列数
      const charWidth = 8; // 近似字符宽度
      const charHeight = 17; // 近似字符高度 (13px fontSize + 4px line height)
      
      const cols = Math.floor(rect.width / charWidth);
      const rows = Math.floor(rect.height / charHeight);
      
      if (cols > 0 && rows > 0) {
        try {
          currentTerm.resize(cols, rows);
          
          // 通知后端调整尺寸
          const sid = sessionIdRef.current;
          if (sid) {
            void import('@tauri-apps/api/tauri').then(({ invoke }) =>
              invoke('terminal_resize', { sessionId: sid, cols, rows }).catch(() => null),
            );
          }
        } catch (error) {
          console.debug('Terminal resize error (ignored):', error);
        }
      }
    };

    const ro = new ResizeObserver(resizeTerminal);
    ro.observe(host);
    roRef.current = ro;

    // 延迟调整初始尺寸
    setTimeout(resizeTerminal, 100);

    let disposed = false;

    (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/tauri');
        const dims = { cols: 80, rows: 30 }; // 使用固定尺寸
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
    };
  }, [cwd]);

  useEffect(() => {
    if (!active) return;
    const term = termRef.current;
    const sid = sessionIdRef.current;
    if (!term || !sid) return;

    // 当终端变为活跃时，重新调整尺寸
    const resizeTerminal = () => {
      if (!termRef.current) return;
      
      const host = hostRef.current;
      if (!host) return;
      
      const rect = host.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      
      const charWidth = 8;
      const charHeight = 17;
      
      const cols = Math.floor(rect.width / charWidth);
      const rows = Math.floor(rect.height / charHeight);
      
      if (cols > 0 && rows > 0) {
        try {
          termRef.current?.resize(cols, rows);
          
          void import('@tauri-apps/api/tauri').then(({ invoke }) =>
            invoke('terminal_resize', { sessionId: sid, cols, rows }).catch(() => null),
          );
        } catch (error) {
          console.debug('Terminal resize error (ignored):', error);
        }
      }
    };

    setTimeout(resizeTerminal, 50);
  }, [active]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 border border-gray-200 rounded overflow-hidden">
        <div ref={hostRef} className="h-full w-full" />
      </div>
    </div>
  );
}
