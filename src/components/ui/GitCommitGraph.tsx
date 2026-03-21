import { useMemo } from 'react';

export type GitGraphLine = {
  graph: string;
  hash: string;
  message: string;
  refs?: string;
  timestamp?: number;
};

function laneColor(idx: number) {
  const colors = ['#2563eb', '#16a34a', '#f97316', '#a855f7', '#06b6d4', '#ef4444', '#84cc16'];
  return colors[idx % colors.length];
}

export default function GitCommitGraph({
  lines,
  rowHeight = 18,
  colWidth = 12,
}: {
  lines: GitGraphLine[];
  rowHeight?: number;
  colWidth?: number;
}) {
  const maxCols = useMemo(() => {
    let m = 0;
    for (const l of lines) m = Math.max(m, l.graph.length);
    return Math.max(1, m);
  }, [lines]);

  const parsed = useMemo(() => {
    const list = lines.map((l) => {
      const g = l.graph ?? '';
      const nodeCol = Math.max(0, g.indexOf('*'));
      const activeCols = new Set<number>();
      for (let i = 0; i < g.length; i++) {
        const ch = g[i];
        if (ch === '|' || ch === '*' || ch === '/' || ch === '\\') activeCols.add(i);
      }
      return { ...l, nodeCol, activeCols, graph: g };
    });

    const activeBetween: Array<Set<number>> = [];
    for (let i = 0; i < list.length; i++) {
      const cur = list[i];
      const prev = list[i - 1];
      const next = new Set<number>();
      for (const c of cur.activeCols) next.add(c);
      if (prev) for (const c of prev.activeCols) next.add(c);
      activeBetween.push(next);
    }

    return { list, activeBetween };
  }, [lines]);

  const graphWidth = maxCols * colWidth;

  const fmtTime = useMemo(() => {
    const dtf = new Intl.DateTimeFormat(undefined, {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    return (ts?: number) => {
      if (!ts) return '';
      try {
        return dtf.format(new Date(ts * 1000));
      } catch {
        return '';
      }
    };
  }, []);

  return (
    <div className="w-full">
      {parsed.list.map((l, row) => {
        const yMid = rowHeight / 2;
        const xNode = l.nodeCol * colWidth + colWidth / 2;
        const actives = parsed.activeBetween[row];
        return (
          <div key={l.hash} className="flex items-start gap-2">
            <svg
              width={graphWidth}
              height={rowHeight}
              viewBox={`0 0 ${graphWidth} ${rowHeight}`}
              className="shrink-0"
            >
              {Array.from({ length: maxCols }).map((_, col) => {
                if (!actives.has(col)) return null;
                const xMid = col * colWidth + colWidth / 2;
                return (
                  <line
                    key={`${row}:${col}:lane`}
                    x1={xMid}
                    y1={0}
                    x2={xMid}
                    y2={rowHeight}
                    stroke={laneColor(col)}
                    strokeWidth={2}
                    strokeLinecap="round"
                    opacity={0.6}
                  />
                );
              })}

              {Array.from(l.graph).map((ch, col) => {
                const xMid = col * colWidth + colWidth / 2;
                if (ch === '/') {
                  return (
                    <line
                      key={`${row}:${col}:s`}
                      x1={xMid + colWidth / 2}
                      y1={0}
                      x2={xMid - colWidth / 2}
                      y2={rowHeight}
                      stroke={laneColor(col)}
                      strokeWidth={2}
                      strokeLinecap="round"
                      opacity={0.8}
                    />
                  );
                }
                if (ch === '\\') {
                  return (
                    <line
                      key={`${row}:${col}:b`}
                      x1={xMid - colWidth / 2}
                      y1={0}
                      x2={xMid + colWidth / 2}
                      y2={rowHeight}
                      stroke={laneColor(col)}
                      strokeWidth={2}
                      strokeLinecap="round"
                      opacity={0.8}
                    />
                  );
                }
                return null;
              })}

              <g>
                <circle cx={xNode} cy={yMid} r={4} fill={laneColor(l.nodeCol)} />
                <circle cx={xNode} cy={yMid} r={8} fill="transparent" stroke={laneColor(l.nodeCol)} strokeWidth={2} opacity={0.25} />
              </g>
            </svg>

            <div className="min-w-0 flex-1 leading-[18px]">
              <div className="text-xs text-gray-800 truncate">
                <span className="font-mono text-gray-500">{l.hash}</span>
                <span className="ml-2">{l.message}</span>
              </div>
              <div className="text-[11px] text-gray-500 truncate">
                {fmtTime(l.timestamp)}
                {l.refs ? <span className="ml-2">{l.refs}</span> : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
