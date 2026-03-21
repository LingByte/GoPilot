import { useMemo, useState } from 'react';
import { marked } from 'marked';
import MonacoEditor from '@/components/editor/MonacoEditor';

export default function MarkdownViewer({
  value,
  onChange,
  readOnly,
}: {
  value: string;
  onChange: (next: string) => void;
  readOnly: boolean;
}) {
  const [mode, setMode] = useState<'edit' | 'preview'>('preview');

  const html = useMemo(() => {
    try {
      return marked.parse(value) as string;
    } catch {
      return '';
    }
  }, [value]);

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="h-10 flex items-center justify-between px-3 border-b border-gray-200">
        <div className="text-sm font-medium text-gray-800">Markdown</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={
              'px-2 py-1 text-xs rounded ' +
              (mode === 'preview' ? 'bg-gray-200 text-gray-900' : 'hover:bg-gray-100 text-gray-600')
            }
            onClick={() => setMode('preview')}
          >
            Preview
          </button>
          <button
            type="button"
            className={
              'px-2 py-1 text-xs rounded ' +
              (mode === 'edit' ? 'bg-gray-200 text-gray-900' : 'hover:bg-gray-100 text-gray-600')
            }
            onClick={() => setMode('edit')}
            disabled={readOnly}
          >
            Edit
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {mode === 'edit' ? (
          <MonacoEditor value={value} onChange={onChange} language="markdown" height="100%" readOnly={readOnly} />
        ) : (
          <div className="h-full overflow-auto p-4 prose max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
    </div>
  );
}
