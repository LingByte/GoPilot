import { forwardRef, useEffect, useMemo, useRef, useImperativeHandle, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';

// 直接导入 worker 以确保本地加载
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';

import 'monaco-editor/esm/vs/basic-languages/abap/abap.contribution';
import 'monaco-editor/esm/vs/basic-languages/apex/apex.contribution';
import 'monaco-editor/esm/vs/basic-languages/azcli/azcli.contribution';
import 'monaco-editor/esm/vs/basic-languages/bat/bat.contribution';
import 'monaco-editor/esm/vs/basic-languages/cameligo/cameligo.contribution';
import 'monaco-editor/esm/vs/basic-languages/clojure/clojure.contribution';
import 'monaco-editor/esm/vs/basic-languages/coffee/coffee.contribution';
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution';
import 'monaco-editor/esm/vs/basic-languages/csharp/csharp.contribution';
import 'monaco-editor/esm/vs/basic-languages/csp/csp.contribution';
import 'monaco-editor/esm/vs/basic-languages/css/css.contribution';
import 'monaco-editor/esm/vs/basic-languages/dart/dart.contribution';
import 'monaco-editor/esm/vs/basic-languages/dockerfile/dockerfile.contribution';
import 'monaco-editor/esm/vs/basic-languages/fsharp/fsharp.contribution';
import 'monaco-editor/esm/vs/basic-languages/go/go.contribution';
import 'monaco-editor/esm/vs/basic-languages/graphql/graphql.contribution';
import 'monaco-editor/esm/vs/basic-languages/handlebars/handlebars.contribution';
import 'monaco-editor/esm/vs/basic-languages/hcl/hcl.contribution';
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution';
import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution';
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution';
import 'monaco-editor/esm/vs/basic-languages/julia/julia.contribution';
import 'monaco-editor/esm/vs/basic-languages/kotlin/kotlin.contribution';
import 'monaco-editor/esm/vs/basic-languages/less/less.contribution';
import 'monaco-editor/esm/vs/basic-languages/lua/lua.contribution';
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution';
import 'monaco-editor/esm/vs/basic-languages/mips/mips.contribution';
import 'monaco-editor/esm/vs/basic-languages/msdax/msdax.contribution';
import 'monaco-editor/esm/vs/basic-languages/mysql/mysql.contribution';
import 'monaco-editor/esm/vs/basic-languages/objective-c/objective-c.contribution';
import 'monaco-editor/esm/vs/basic-languages/pascal/pascal.contribution';
import 'monaco-editor/esm/vs/basic-languages/perl/perl.contribution';
import 'monaco-editor/esm/vs/basic-languages/pgsql/pgsql.contribution';
import 'monaco-editor/esm/vs/basic-languages/php/php.contribution';
import 'monaco-editor/esm/vs/basic-languages/pla/pla.contribution';
import 'monaco-editor/esm/vs/basic-languages/postiats/postiats.contribution';
import 'monaco-editor/esm/vs/basic-languages/powerquery/powerquery.contribution';
import 'monaco-editor/esm/vs/basic-languages/powershell/powershell.contribution';
import 'monaco-editor/esm/vs/basic-languages/pug/pug.contribution';
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution';
import 'monaco-editor/esm/vs/basic-languages/r/r.contribution';
import 'monaco-editor/esm/vs/basic-languages/razor/razor.contribution';
import 'monaco-editor/esm/vs/basic-languages/redis/redis.contribution';
import 'monaco-editor/esm/vs/basic-languages/redshift/redshift.contribution';
import 'monaco-editor/esm/vs/basic-languages/ruby/ruby.contribution';
import 'monaco-editor/esm/vs/basic-languages/rust/rust.contribution';
import 'monaco-editor/esm/vs/basic-languages/sb/sb.contribution';
import 'monaco-editor/esm/vs/basic-languages/scss/scss.contribution';
import 'monaco-editor/esm/vs/basic-languages/shell/shell.contribution';
import 'monaco-editor/esm/vs/basic-languages/solidity/solidity.contribution';
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution';
import 'monaco-editor/esm/vs/basic-languages/st/st.contribution';
import 'monaco-editor/esm/vs/basic-languages/swift/swift.contribution';
import 'monaco-editor/esm/vs/basic-languages/tcl/tcl.contribution';
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution';
import 'monaco-editor/esm/vs/basic-languages/vb/vb.contribution';
import 'monaco-editor/esm/vs/basic-languages/xml/xml.contribution';
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution';

// 确保 Monaco Environment 在组件加载前设置
declare global {
  interface Window {
    MonacoEnvironment?: {
      getWorker: (_moduleId: string, label: string) => Worker;
    };
  }
}

function getMonacoTheme() {
  if (typeof document === 'undefined') return 'vs-dark';
  return document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs';
}

// 立即设置 Monaco Environment
if (!window.MonacoEnvironment) {
  console.log('Setting up Monaco Environment with local workers');
  window.MonacoEnvironment = {
    getWorker(_moduleId: string, label: string) {
      console.log('Creating worker for:', label);
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
} else {
  console.log('MonacoEnvironment already exists');
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

export interface MonacoEditorRef {
  editor: any;
  monaco: any;
  focus: () => void;
  revealPosition: (line: number, column?: number) => void;
  getSelection: () => any;
  setSelection: (selection: any) => void;
}

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
  if (l === 'rs') return 'rust';
  if (l === 'py') return 'python';
  if (l === 'ps1') return 'powershell';
  if (l === 'sh') return 'shell';
  if (l === 'md') return 'markdown';
  if (l === 'kt') return 'kotlin';
  if (l === 'cs') return 'csharp';
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
  const [monacoTheme, setMonacoTheme] = useState(getMonacoTheme());

  useEffect(() => {
    const root = document?.documentElement;
    if (!root) return;

    const apply = () => {
      const next = getMonacoTheme();
      setMonacoTheme(next);
      const m = monacoRef.current;
      if (!m) return;
      m.editor.setTheme(next);
    };

    apply();

    const obs = new MutationObserver(() => apply());
    obs.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const options = useMemo(
    () => ({
      minimap: { enabled: false },
      glyphMargin: true,
      fontSize: 14,
      scrollBeyondLastLine: false,
      wordWrap: 'on' as const,
      readOnly,
      automaticLayout: true, // 启用自动布局以适应容器
      smoothScrolling: false,
      cursorSmoothCaretAnimation: 'off' as const,
      selectOnLineNumbers: true,
      lineNumbers: 'on' as const,
      renderLineHighlight: 'line' as const,
      scrollbar: {
        vertical: 'visible' as const,
        horizontal: 'visible' as const,
        useShadows: false,
      },
    }),
    [readOnly],
  );

  const handleMount: OnMount = (editor, monaco) => {
    console.log('Monaco Editor mounted successfully');
    editorRef.current = editor;
    monacoRef.current = monaco;

    // 设置语言
    const model = editor.getModel();
    if (model) {
      monaco.editor.setModelLanguage(model, normalizedLanguage);
      console.log('Monaco Editor language set to:', normalizedLanguage);
    }

    // 设置主题
    monaco.editor.setTheme(getMonacoTheme());

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
      theme={monacoTheme}
      options={options}
      onMount={handleMount}
    />
  );
});

export default MonacoEditor;
