import { forwardRef, useEffect, useMemo, useRef, useImperativeHandle } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';

import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';

declare global {
  interface Window {
    MonacoEnvironment?: {
      getWorker: (_moduleId: string, label: string) => Worker;
    };
  }
}

if (!window.MonacoEnvironment) {
  window.MonacoEnvironment = {
    getWorker(_moduleId: string, label: string) {
      switch (label) {
        case 'json':
          return new jsonWorker();
        case 'css':
        case 'scss':
        case 'less':
          return new cssWorker();
        case 'html':
        case 'handlebars':
        case 'razor':
          return new htmlWorker();
        case 'typescript':
        case 'javascript':
          return new tsWorker();
        default:
          return new editorWorker();
      }
    },
  };
}

export type MonacoEditorProps = {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  height?: string | number;
  readOnly?: boolean;
  reveal?: {
    line: number;
    column?: number;
  };
};

export type MonacoAnchor = {
  id: string;
  lineNumber: number;
  column?: number;
};

export type MonacoEditorHandle = {
  addAnchor: (anchor: Omit<MonacoAnchor, 'id'> & { id?: string }) => string;
  removeAnchor: (id: string) => void;
  clearAnchors: () => void;
  revealAnchor: (id: string) => void;
};

function normalizeLanguage(language: string) {
  const l = language.trim().toLowerCase();
  if (l === 'ts') return 'typescript';
  if (l === 'js') return 'javascript';
  if (l === 'tsx') return 'typescript';
  if (l === 'jsx') return 'javascript';
  if (l === 'golang') return 'go';
  if (l === 'yml') return 'yaml';
  return l;
}

const MonacoEditor = forwardRef<MonacoEditorHandle, MonacoEditorProps>(function MonacoEditor(
  {
    value,
    onChange,
    language = 'typescript',
    height = '60vh',
    readOnly = false,
    reveal,
  }: MonacoEditorProps,
  ref,
) {
  const editorRef = useRef<import('monaco-editor').editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
  const anchorDecorationIdsRef = useRef<Record<string, string[]>>({});

  const normalizedLanguage = useMemo(() => normalizeLanguage(language), [language]);

  const options = useMemo(
    () => ({
      minimap: { enabled: false },
      glyphMargin: true,
      fontSize: 14,
      scrollBeyondLastLine: false,
      wordWrap: 'on' as const,
      readOnly,
      automaticLayout: true,
    }),
    [readOnly],
  );

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    const model = editor.getModel();
    if (model) {
      monaco.editor.setModelLanguage(model, normalizedLanguage);
    }
    editor.focus();
  };

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;
    monaco.editor.setModelLanguage(model, normalizedLanguage);
  }, [normalizedLanguage]);

  useEffect(() => {
    if (!reveal) return;
    const editor = editorRef.current;
    if (!editor) return;
    const lineNumber = Math.max(1, Number(reveal.line) || 1);
    const column = Math.max(1, Number(reveal.column ?? 1) || 1);
    try {
      editor.revealLineInCenter(lineNumber);
      editor.setPosition({ lineNumber, column });
      editor.focus();
    } catch {
      // ignore
    }
  }, [reveal?.line, reveal?.column]);

  useImperativeHandle(
    ref,
    (): MonacoEditorHandle => ({
      addAnchor(anchor) {
        const editor = editorRef.current;
        const monaco = monacoRef.current;
        if (!editor || !monaco) return '';

        const id = anchor.id ?? `a_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const column = anchor.column ?? 1;
        const range = new monaco.Range(anchor.lineNumber, column, anchor.lineNumber, column);

        const newDecorations: import('monaco-editor').editor.IModelDeltaDecoration[] = [
          {
            range,
            options: {
              glyphMarginClassName: 'monaco-anchor-glyph',
              stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
              overviewRuler: {
                color: '#3b82f6',
                position: monaco.editor.OverviewRulerLane.Right,
              },
            },
          },
        ];

        const old = anchorDecorationIdsRef.current[id] ?? [];
        const next = editor.deltaDecorations(old, newDecorations);
        anchorDecorationIdsRef.current[id] = next;
        return id;
      },
      removeAnchor(id) {
        const editor = editorRef.current;
        if (!editor) return;
        const old = anchorDecorationIdsRef.current[id];
        if (!old) return;
        editor.deltaDecorations(old, []);
        delete anchorDecorationIdsRef.current[id];
      },
      clearAnchors() {
        const editor = editorRef.current;
        if (!editor) return;
        for (const id of Object.keys(anchorDecorationIdsRef.current)) {
          const old = anchorDecorationIdsRef.current[id];
          editor.deltaDecorations(old, []);
        }
        anchorDecorationIdsRef.current = {};
      },
      revealAnchor(id) {
        const editor = editorRef.current;
        const monaco = monacoRef.current;
        if (!editor || !monaco) return;
        const decorationIds = anchorDecorationIdsRef.current[id];
        if (!decorationIds || decorationIds.length === 0) return;
        const model = editor.getModel();
        if (!model) return;
        const dec = model.getDecorationRange(decorationIds[0]);
        if (!dec) return;
        editor.revealRangeInCenter(dec);
        editor.setPosition({ lineNumber: dec.startLineNumber, column: dec.startColumn });
        editor.focus();
      },
    }),
    [],
  );

  return (
    <Editor
      value={value}
      onChange={(v) => onChange(v ?? '')}
      language={normalizedLanguage}
      height={height}
      theme="vs-dark"
      options={options}
      onMount={handleMount}
    />
  );
});

export default MonacoEditor;
