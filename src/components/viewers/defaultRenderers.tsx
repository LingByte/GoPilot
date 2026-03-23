import type { FileViewerRenderer, FileViewerRenderParams } from './types';
import MonacoEditor from '@/components/editor/MonacoEditor';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { Play, Database as DatabaseIcon, AlertCircle, CheckCircle, Terminal } from 'lucide-react';
import VideoViewer from './VideoViewer';
import MarkdownViewer from './MarkdownViewer';
import PdfEditorViewer from './PdfEditorViewer';
import ImageEditorViewer from './ImageEditorViewer';

function ext(path: string) {
  const idx = path.lastIndexOf('.');
  return idx >= 0 ? path.slice(idx + 1).toLowerCase() : '';
}

export function isImagePath(path: string) {
  const e = ext(path);
  return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'tiff', 'ico', 'heic', 'heif'].includes(e);
}

export function isVideoPath(path: string) {
  const e = ext(path);
  return ['mp4', 'webm', 'ogg', 'mov', 'avi'].includes(e);
}

export function isAudioPath(path: string) {
  const e = ext(path);
  return ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(e);
}

export function isMarkdownPath(path: string) {
  return ext(path) === 'md' || ext(path) === 'markdown';
}

export function isPdfPath(path: string) {
  return ext(path) === 'pdf';
}

export function imageMime(path: string) {
  const e = ext(path);
  if (e === 'png') return 'image/png';
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
  if (e === 'gif') return 'image/gif';
  if (e === 'webp') return 'image/webp';
  if (e === 'bmp') return 'image/bmp';
  if (e === 'svg') return 'image/svg+xml';
  if (e === 'ico') return 'image/x-icon';
  return 'application/octet-stream';
}

export function pdfMime(_path: string) {
  return 'application/pdf';
}

export function videoMime(path: string) {
  const e = ext(path);
  if (e === 'mp4') return 'video/mp4';
  if (e === 'webm') return 'video/webm';
  if (e === 'ogg') return 'video/ogg';
  if (e === 'mov') return 'video/quicktime';
  if (e === 'avi') return 'video/x-msvideo';
  return 'application/octet-stream';
}

export function audioMime(path: string) {
  const e = ext(path);
  if (e === 'mp3') return 'audio/mpeg';
  if (e === 'wav') return 'audio/wav';
  if (e === 'ogg') return 'audio/ogg';
  if (e === 'flac') return 'audio/flac';
  if (e === 'aac') return 'audio/aac';
  if (e === 'm4a') return 'audio/mp4';
  return 'application/octet-stream';
}

const imageRenderer: FileViewerRenderer = {
  id: 'image',
  label: 'Image',
  match: isImagePath,
  render: ({ tab, onChange, assetUrl }: FileViewerRenderParams) => (
    <ImageEditorViewer 
      assetUrl={assetUrl}
      value={tab.value}
      onChange={onChange}
      readOnly={tab.readOnly}
    />
  ),
};

const audioRenderer: FileViewerRenderer = {
  id: 'audio',
  label: 'Audio',
  match: (path: string) => ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext(path)),
  render: ({ tab }: FileViewerRenderParams) => (
    <div className="flex items-center justify-center h-full p-4">
      <audio controls className="max-w-full">
        <source src={tab.path} type={`audio/${ext(tab.path)}`} />
        Your browser does not support the audio element.
      </audio>
    </div>
  ),
};

const markdownRenderer: FileViewerRenderer = {
  id: 'markdown',
  label: 'Markdown',
  match: (path: string) => {
    const e = ext(path);
    return ['md', 'markdown'].includes(e);
  },
  render: ({ tab, onChange }: FileViewerRenderParams) => (
    <MarkdownViewer value={tab.value} onChange={onChange} readOnly={tab.readOnly} />
  ),
};

const tableDataRenderer: FileViewerRenderer = {
  id: 'tableData',
  label: 'Table Data',
  match: (path: string) => path.startsWith('gopilot://table-data/') && path.endsWith('.data'),
  render: ({ tab }: FileViewerRenderParams) => {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [limit, setLimit] = useState(100);
    const [offset, setOffset] = useState(0);

    const connectionId = useMemo(() => {
      const p = tab.path;
      const m = p.match(/^gopilot:\/\/table-data\/(.+?)\/(.+?)\/(.+?)\.data$/);
      return m?.[1] ?? '';
    }, [tab.path]);

    const database = useMemo(() => {
      const p = tab.path;
      const m = p.match(/^gopilot:\/\/table-data\/(.+?)\/(.+?)\/(.+?)\.data$/);
      return m?.[2] ?? '';
    }, [tab.path]);

    const table = useMemo(() => {
      const p = tab.path;
      const m = p.match(/^gopilot:\/\/table-data\/(.+?)\/(.+?)\/(.+?)\.data$/);
      return m?.[3] ?? '';
    }, [tab.path]);

    const loadData = useCallback(async () => {
      if (!connectionId || !database || !table) return;
      
      setLoading(true);
      setError('');
      try {
        // 用户会自己写完整的 SQL，包括分页
        const sql = `SELECT * FROM \`${database}\`.\`${table}\``;
        
        const result = await invoke('db_query_sql_paged', {
          id: connectionId,
          sql: sql,
          opts: { limit, offset, params: [] },
        });
        setData(result);
      } catch (e: any) {
        setError(String(e));
        setData(null);
      } finally {
        setLoading(false);
      }
    }, [connectionId, database, table, limit, offset]);

    useEffect(() => {
      void loadData();
    }, [loadData]);

    return (
      <div className="h-full flex flex-col">
        <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DatabaseIcon className="w-4 h-4 text-gray-600" />
            <span className="sm font-medium text-gray-800">
              {database}.{table}
            </span>
            <span className="text-xs text-gray-500">
              (Connection: {connectionId.slice(0, 8)}...)
            </span>
          </div>
          {loading && (
            <span className="text-xs text-blue-600">Loading...</span>
          )}
        </div>
        
        <div className="border-b border-gray-200 p-3 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600">Limit:</label>
              <input
                className="w-20 border border-gray-200 rounded px-2 py-1 text-xs"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value) || 0)}
                placeholder="limit"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600">Offset:</label>
              <input
                className="w-20 border border-gray-200 rounded px-2 py-1 text-xs"
                value={offset}
                onChange={(e) => setOffset(Number(e.target.value) || 0)}
                placeholder="offset"
              />
            </div>
            <button
              type="button"
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50"
              disabled={loading}
              onClick={loadData}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2 mt-2">
              {error}
            </div>
          )}
        </div>
        
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              Loading...
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full text-red-600 text-sm">
              {error}
            </div>
          ) : !data || !data.rows || data.rows.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              No data found
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {data.columns?.map((col: string, idx: number) => (
                      <th key={idx} className="px-2 py-1 text-left font-medium text-gray-700 border-b border-gray-200">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row: any[], rowIdx: number) => (
                    <tr key={rowIdx} className="hover:bg-gray-50">
                      {row.map((cell, cellIdx) => (
                        <td key={cellIdx} className="px-2 py-1 border-b border-gray-100 text-gray-600">
                          {cell === null ? (
                            <span className="text-gray-400 italic">NULL</span>
                          ) : (
                            String(cell)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.rows_affected && (
                <div className="p-2 text-xs text-gray-500 border-t border-gray-200">
                  Total rows: {data.rows_affected}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  },
};

const sqlConsoleRenderer: FileViewerRenderer = {
  id: 'sqlConsole',
  label: 'SQL Console',
  match: (path: string) => {
    const matches = path.startsWith('gopilot://sql-console/') && path.endsWith('.sql');
    console.log('SQL Console renderer match check:', { path, matches });
    // 强制匹配所有路径进行测试
    return path.includes('sql-console') || matches;
  },
  render: ({ tab, onChange }: FileViewerRenderParams) => {
    console.log('SQL Console renderer rendering:', { tab: tab.path, value: tab.value });
    
    const connectionId = useMemo(() => {
      const p = tab.path;
      const m = p.match(/^gopilot:\/\/sql-console\/(.+?)\.sql$/);
      return m?.[1] ?? '';
    }, [tab.path]);

    const [limit, setLimit] = useState(200);
    const [offset, setOffset] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<any>(null);

    const executeQuery = useCallback(async () => {
      if (!connectionId || !tab.value.trim()) return;
      
      setBusy(true);
      setError('');
      
      try {
        // 直接执行用户输入的 SQL，不做任何修改
        const r = await invoke('db_query_sql_paged', {
          id: connectionId,
          sql: tab.value.trim(),
          opts: { limit: 0, offset: 0, params: [] },
        });
        setResult(r);
      } catch (e: any) {
        setError(String(e));
        setResult(null);
      } finally {
        setBusy(false);
      }
    }, [connectionId, tab.value]);

    // Keyboard shortcuts
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !busy) {
          e.preventDefault();
          void executeQuery();
        }
      };
      
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [executeQuery, busy]);

    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-gray-600" />
            <span className="text-xs font-medium text-gray-700">SQL Console</span>
            {connectionId ? (
              <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded border border-gray-200">
                Connection: {connectionId.slice(0, 8)}...
              </span>
            ) : (
              <span className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded border border-red-200">
                No Connection
              </span>
            )}
          </div>
          {busy && (
            <span className="text-xs text-blue-600 flex items-center gap-1">
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
              Executing...
            </span>
          )}
        </div>
        
        <div className="flex-1 min-h-0">
          <MonacoEditor 
            value={tab.value} 
            onChange={onChange} 
            language="sql" 
            path={tab.path} 
            height="100%" 
            readOnly={tab.readOnly}
          />
        </div>
        
        <div className="border-t border-gray-200 p-3 bg-gray-50">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600">Limit:</label>
              <input
                className="w-20 border border-gray-200 rounded px-2 py-1 text-xs"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value) || 0)}
                placeholder="limit"
                type="number"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600">Offset:</label>
              <input
                className="w-20 border border-gray-200 rounded px-2 py-1 text-xs"
                value={offset}
                onChange={(e) => setOffset(Number(e.target.value) || 0)}
                placeholder="offset"
                type="number"
              />
            </div>
            <button
              type="button"
              className="flex items-center gap-2 text-xs px-4 py-2 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
              disabled={busy}
              onClick={executeQuery}
            >
              <Play className="w-3 h-3" />
              {busy ? 'Running...' : 'Run (Ctrl+Enter)'}
            </button>
          </div>
          
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="font-mono">{error}</div>
            </div>
          )}
          
          {result && !error && (
            <div className="text-xs text-green-600 bg-green-50 border border-green-200 rounded p-2 flex items-center gap-2">
              <CheckCircle className="w-3 h-3" />
              Query executed successfully
            </div>
          )}
        </div>
        
        <div className="h-56 border-t border-gray-200 overflow-auto">
          {result?.columns?.length ? (
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {result.columns.map((c: string) => (
                    <th key={c} className="px-2 py-1 text-left bg-gray-50 border-b border-gray-200">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(result.rows ?? []).map((row: any[], i: number) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    {row.map((v, j) => (
                      <td key={j} className="px-2 py-1 border-b border-gray-200 whitespace-pre-wrap">
                        {String(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : result?.rows_affected != null ? (
            <div className="p-2 text-xs text-gray-600">Rows affected: {String(result.rows_affected)}</div>
          ) : (
            <div className="p-2 text-xs text-gray-500">No results</div>
          )}
        </div>
      </div>
    );
  },
};

export const pdfRenderer: FileViewerRenderer = {
  id: 'pdf',
  label: 'PDF',
  match: (path: string) => {
    const e = ext(path);
    return e === 'pdf';
  },
  render: ({ tab, onChange, assetUrl }: FileViewerRenderParams) => (
    <PdfEditorViewer 
      assetUrl={assetUrl}
      value={tab.value}
      onChange={onChange}
      readOnly={tab.readOnly}
    />
  ),
};

export const videoRenderer: FileViewerRenderer = {
  id: 'video',
  label: 'Video',
  match: (path: string) => ['mp4', 'webm', 'ogg', 'mov', 'avi'].includes(ext(path)),
  render: ({ tab }: FileViewerRenderParams) => (
    <div className="flex items-center justify-center h-full p-4">
      <VideoViewer assetUrl={tab.path} />
    </div>
  ),
};

export const textRenderer: FileViewerRenderer = {
  id: 'text',
  label: 'Text',
  match: () => true,
  render: ({ tab, onChange }: FileViewerRenderParams) => (
    <MonacoEditor value={tab.value} onChange={onChange} language={tab.language} path={tab.path} height="100%" readOnly={tab.readOnly} />
  ),
};

export const binaryRenderer: FileViewerRenderer = {
  id: 'binary',
  label: 'Binary',
  match: () => true,
  render: ({ tab }: FileViewerRenderParams) => (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="text-6xl mb-4">📁</div>
        <div className="text-lg font-medium mb-2">{tab.title}</div>
        <div className="text-sm text-gray-500">Binary file - cannot preview</div>
      </div>
    </div>
  ),
};

export const defaultRenderers: FileViewerRenderer[] = [
  sqlConsoleRenderer,
  tableDataRenderer,
  markdownRenderer,
  imageRenderer,
  audioRenderer,
  pdfRenderer,
  videoRenderer,
  textRenderer,
  binaryRenderer,
];
