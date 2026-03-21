import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type SearchMatch = {
  path: string;
  line: number;
  column: number;
  text: string;
};

export default function SearchPanel({
  rootPath,
  onOpenMatch,
}: {
  rootPath: string;
  onOpenMatch: (path: string, line: number, column: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const requestIdRef = useRef(0);

  const grouped = useMemo(() => {
    const map = new Map<string, SearchMatch[]>();
    for (const m of matches) {
      const arr = map.get(m.path) ?? [];
      arr.push(m);
      map.set(m.path, arr);
    }
    return Array.from(map.entries());
  }, [matches]);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!rootPath) {
      setError('Open a folder to search.');
      setMatches([]);
      return;
    }
    if (!q) {
      setMatches([]);
      setError('');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { invoke } = await import('@tauri-apps/api/tauri');
      const rid = ++requestIdRef.current;
      const res = await invoke<any[]>('search_workspace', {
        path: rootPath,
        query: q,
        max_results: 500,
      });
      if (rid !== requestIdRef.current) return;
      const list: SearchMatch[] = Array.isArray(res)
        ? res
            .map((x) => ({
              path: typeof x?.path === 'string' ? x.path : '',
              line: typeof x?.line === 'number' ? x.line : 0,
              column: typeof x?.column === 'number' ? x.column : 0,
              text: typeof x?.text === 'string' ? x.text : '',
            }))
            .filter((x) => x.path && x.line > 0)
        : [];
      setMatches(list);
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : e?.message ? String(e.message) : 'Search failed.';
      setError(msg);
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [query, rootPath]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setMatches([]);
      setError('');
      setLoading(false);
      return;
    }
    const t = window.setTimeout(() => {
      void runSearch();
    }, 250);
    return () => window.clearTimeout(t);
  }, [query, runSearch]);

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="h-10 px-3 flex items-center border-b border-gray-200 text-sm font-medium text-gray-800">Search</div>

      <div className="p-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded"
          />
        </div>
        {loading ? <div className="text-xs text-gray-500 mt-2">Searching...</div> : null}
        {error ? <div className="text-xs text-red-600 mt-2 whitespace-pre-wrap">{error}</div> : null}
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {grouped.length === 0 ? (
          <div className="p-3 text-xs text-gray-500">{query.trim() ? 'No results.' : 'Enter a query to search the workspace.'}</div>
        ) : (
          <div className="p-2 space-y-3">
            {grouped.map(([path, items]) => (
              <div key={path} className="border border-gray-200 rounded">
                <div className="px-2 py-1 text-xs font-medium text-gray-800 bg-gray-50 border-b border-gray-200 truncate" title={path}>
                  {path}
                </div>
                <div className="p-1">
                  {items.slice(0, 50).map((m, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="w-full text-left px-2 py-1 rounded hover:bg-gray-100 active:bg-gray-200"
                      onClick={() => onOpenMatch(m.path, m.line, m.column)}
                      title="Open file"
                    >
                      <div className="text-[11px] text-gray-500">
                        {m.line}:{m.column}
                      </div>
                      <div className="text-xs text-gray-800 truncate">{m.text}</div>
                    </button>
                  ))}
                  {items.length > 50 ? <div className="px-2 py-1 text-[11px] text-gray-500">+{items.length - 50} more…</div> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
