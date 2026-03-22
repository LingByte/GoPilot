import { forwardRef, useEffect, useMemo, useRef, useImperativeHandle, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { applyMonacoProjectConfig, getMonacoProjectConfig, MONACO_PROJECT_CONFIG_CHANGED_EVENT } from './monacoProject';

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

function applyTsDefaults(monaco: typeof import('monaco-editor'), extraLibsAddedRef: { current: boolean }) {
  try {
    monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);
    monaco.languages.typescript.javascriptDefaults.setEagerModelSync(true);

    const common = {
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      moduleResolution:
        (monaco.languages.typescript.ModuleResolutionKind as any).Bundler ??
        (monaco.languages.typescript.ModuleResolutionKind as any).NodeNext ??
        monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      allowNonTsExtensions: true,
      allowJs: true,
      checkJs: true,
      jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
      esModuleInterop: true,
      resolveJsonModule: true,
    };

    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      ...monaco.languages.typescript.typescriptDefaults.getCompilerOptions(),
      ...common,
      strict: false,
    } as any);

    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      ...monaco.languages.typescript.javascriptDefaults.getCompilerOptions(),
      ...common,
    } as any);

    if (!extraLibsAddedRef.current) {
      extraLibsAddedRef.current = true;

      const reactStub = `declare module 'react' {
  export type Dispatch<A> = (value: A) => void;
  export type SetStateAction<S> = S | ((prevState: S) => S);

  export function useState<S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useEffect(effect: (...args: any[]) => any, deps?: any[]): void;
  export function useMemo<T>(factory: () => T, deps: any[]): T;
  export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: any[]): T;
  export function useRef<T>(initialValue: T): { current: T };

  export const Fragment: any;
  export const createElement: any;

  const React: any;
  export default React;
}
declare module 'react-dom' {
  const ReactDOM: any;
  export default ReactDOM;
}
declare namespace JSX {
  interface IntrinsicElements { [elemName: string]: any }
}
`;

      const jsxRuntimeStub = `declare module 'react/jsx-runtime' {
  export const Fragment: any;
  export const jsx: any;
  export const jsxs: any;
}
declare module 'react/jsx-dev-runtime' {
  export const Fragment: any;
  export const jsxDEV: any;
}
`;

      const antdStub = `declare module 'antd' { const antd: any; export = antd; }
declare module 'antd/*' { const mod: any; export = mod; }
`;

      const nodePathStub = `declare module 'path' {
  export function resolve(...paths: any[]): string;
  export function join(...paths: any[]): string;
  export const sep: string;
  const path: { resolve: typeof resolve; join: typeof join; sep: string };
  export default path;
}
declare module 'node:path' {
  export * from 'path';
  import path from 'path';
  export default path;
}
`;

      const viteStub = `declare module 'vite' {
  export function defineConfig(config: any): any;
}
declare module '@vitejs/plugin-react' {
  export default function react(...args: any[]): any;
}
`;

      const reactRouterDomStub = `declare module 'react-router-dom' {
  export const Link: any;
  export const NavLink: any;
  export const Navigate: any;
  export const Outlet: any;
  export const Route: any;
  export const Routes: any;
  export const BrowserRouter: any;
  export const HashRouter: any;
  export function useNavigate(): any;
  export function useLocation(): any;
  export function useParams(): any;
  export function useSearchParams(): any;
}
`;

      const lucideStub = `declare module 'lucide-react' {
  export const Icon: any;
  const anyIcon: any;
  export default anyIcon;
  export const Blocks: any;
  export const BookText: any;
  export const ChevronDown: any;
  export const ChevronRight: any;
  export const Search: any;
  export const Files: any;
  export const Folder: any;
  export const FolderOpen: any;
  export const File: any;
  export const GitBranch: any;
  export const Package: any;
  export const Plus: any;
  export const Puzzle: any;
  export const Settings: any;
  export const Terminal: any;
  export const X: any;
}
`;

      monaco.languages.typescript.typescriptDefaults.addExtraLib(reactStub, 'file:///node_modules/@types/react/index.d.ts');
      monaco.languages.typescript.typescriptDefaults.addExtraLib(jsxRuntimeStub, 'file:///node_modules/@types/react/jsx-runtime.d.ts');
      monaco.languages.typescript.typescriptDefaults.addExtraLib(antdStub, 'file:///node_modules/@types/antd/index.d.ts');
      monaco.languages.typescript.typescriptDefaults.addExtraLib(nodePathStub, 'file:///node_modules/@types/node/path.d.ts');
      monaco.languages.typescript.typescriptDefaults.addExtraLib(viteStub, 'file:///node_modules/vite/index.d.ts');
      monaco.languages.typescript.typescriptDefaults.addExtraLib(reactRouterDomStub, 'file:///gopilot/typings/react-router-dom.d.ts');
      monaco.languages.typescript.typescriptDefaults.addExtraLib(lucideStub, 'file:///gopilot/typings/lucide-react.d.ts');
      monaco.languages.typescript.javascriptDefaults.addExtraLib(reactStub, 'file:///node_modules/@types/react/index.d.ts');
      monaco.languages.typescript.javascriptDefaults.addExtraLib(jsxRuntimeStub, 'file:///node_modules/@types/react/jsx-runtime.d.ts');
      monaco.languages.typescript.javascriptDefaults.addExtraLib(antdStub, 'file:///node_modules/@types/antd/index.d.ts');
      monaco.languages.typescript.javascriptDefaults.addExtraLib(nodePathStub, 'file:///node_modules/@types/node/path.d.ts');
      monaco.languages.typescript.javascriptDefaults.addExtraLib(viteStub, 'file:///node_modules/vite/index.d.ts');
      monaco.languages.typescript.javascriptDefaults.addExtraLib(reactRouterDomStub, 'file:///gopilot/typings/react-router-dom.d.ts');
      monaco.languages.typescript.javascriptDefaults.addExtraLib(lucideStub, 'file:///gopilot/typings/lucide-react.d.ts');
    }
  } catch {
    return;
  }
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
  path?: string;
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

function toFileUri(p?: string) {
  if (!p) return undefined;
  if (p.startsWith('file://')) return p;
  // Windows absolute path: C:\foo\bar or C:/foo/bar
  const win = p.replace(/\\/g, '/');
  if (/^[a-zA-Z]:\//.test(win)) {
    // Match monaco.Uri.file(...).toString() behavior on Windows: drive letter lowercased and ':' encoded as '%3A'
    const drive = win[0].toLowerCase();
    const rest = win.slice(2); // '/Users/...'
    return `file:///${drive}%3A${rest}`;
  }
  return p;
}

async function preloadSourceModels(monaco: typeof import('monaco-editor'), sourceRootAbs?: string) {
  if (!sourceRootAbs) return;

  const fs = await import('@tauri-apps/api/fs');
  const MAX_FILES = 500;
  let count = 0;

  let tree: any[] = [];
  try {
    tree = await fs.readDir(sourceRootAbs, { recursive: true });
  } catch {
    return;
  }

  const flatten = (entries: any[]): string[] => {
    const out: string[] = [];
    for (const e of entries) {
      if (!e?.path) continue;
      if (Array.isArray(e.children)) {
        if (e.children.length > 0) {
          out.push(...flatten(e.children));
        }
        continue;
      }
      out.push(e.path);
    }
    return out;
  };

  const files = flatten(tree);
  for (const p of files) {
    if (count >= MAX_FILES) break;
    const lower = String(p).toLowerCase();
    if (!lower.endsWith('.ts') && !lower.endsWith('.tsx') && !lower.endsWith('.js') && !lower.endsWith('.jsx')) {
      continue;
    }

    try {
      const uri = monaco.Uri.file(p);
      if (monaco.editor.getModel(uri)) continue;
      const text = await fs.readTextFile(p);
      const lang = lower.endsWith('.ts') || lower.endsWith('.tsx') ? 'typescript' : 'javascript';
      monaco.editor.createModel(text, lang, uri);
      count++;
    } catch {
      continue;
    }
  }

  try {
    console.log('[monaco-project] preloadedSourceModels', { sourceRootAbs, count, max: MAX_FILES });
  } catch {
    // ignore
  }
}

const MonacoEditor = forwardRef<MonacoEditorHandle, MonacoEditorProps>(function MonacoEditor(
  {
    value,
    onChange,
    language = 'typescript',
    path,
    height = '60vh',
    readOnly = false,
    reveal,
  }: MonacoEditorProps,
  ref,
) {
  const editorRef = useRef<import('monaco-editor').editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
  const anchorDecorationIdsRef = useRef<Record<string, string[]>>({});
  const extraLibsAddedRef = useRef(false);

  const normalizedLanguage = useMemo(() => normalizeLanguage(language), [language]);
  const editorPath = useMemo(() => toFileUri(path), [path]);
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

  useEffect(() => {
    const handler = () => {
      const m = monacoRef.current;
      if (!m) return;
      applyMonacoProjectConfig(m);

      const cfg = getMonacoProjectConfig();
      void preloadSourceModels(m, cfg.sourceRootAbs);

      try {
        const opts = m.languages.typescript.typescriptDefaults.getCompilerOptions() as any;
        const paths = opts?.paths as any;
        console.log('[monaco-project] compilerOptions', {
          baseUrl: opts?.baseUrl,
          paths: opts?.paths,
          moduleResolution: opts?.moduleResolution,
        });

        try {
          console.log('[monaco-project] paths[@/*]', paths?.['@/*']);
        } catch {
          // ignore
        }

        try {
          const model = editorRef.current?.getModel();
          if (model) {
            console.log('[monaco-project] activeModelUri', {
              toString: model.uri.toString(),
              toStringNoEncode: model.uri.toString(true),
            });
          }
        } catch {
          // ignore
        }
      } catch {
        // ignore
      }
    };

    try {
      window.addEventListener(MONACO_PROJECT_CONFIG_CHANGED_EVENT, handler);
    } catch {
      return;
    }

    return () => {
      try {
        window.removeEventListener(MONACO_PROJECT_CONFIG_CHANGED_EVENT, handler);
      } catch {
        // ignore
      }
    };
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
    editorRef.current = editor;
    monacoRef.current = monaco;

    applyTsDefaults(monaco, extraLibsAddedRef);

    applyMonacoProjectConfig(monaco);

    try {
      const cfg = getMonacoProjectConfig();
      void preloadSourceModels(monaco, cfg.sourceRootAbs);
      const opts = monaco.languages.typescript.typescriptDefaults.getCompilerOptions() as any;
      const paths = opts?.paths as any;
      console.log('[monaco-project] compilerOptions', {
        baseUrl: opts?.baseUrl,
        paths: opts?.paths,
        moduleResolution: opts?.moduleResolution,
      });

      try {
        console.log('[monaco-project] paths[@/*]', paths?.['@/*']);
      } catch {
        // ignore
      }

      try {
        const model = editor.getModel();
        if (model) {
          console.log('[monaco-project] activeModelUri', {
            toString: model.uri.toString(),
            toStringNoEncode: model.uri.toString(true),
          });
        }
      } catch {
        // ignore
      }
    } catch {
      // ignore
    }

    // 设置语言
    const model = editor.getModel();
    if (model) {
      monaco.editor.setModelLanguage(model, normalizedLanguage);
      console.log('Monaco Editor language set to:', normalizedLanguage);
    }

    try {
      const cfg = getMonacoProjectConfig();
      const probe = cfg.projectRootAbs ? `${cfg.projectRootAbs}\\src\\extensions\\types.ts` : null;
      if (probe) {
        const probeUri = monaco.Uri.file(probe);
        console.log('[monaco-project] probeModelExists', {
          path: probe,
          exists: Boolean(monaco.editor.getModel(probeUri)),
        });
      }
    } catch {
      // ignore
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
      path={editorPath}
      height={height}
      theme={monacoTheme}
      options={options}
      onMount={handleMount}
    />
  );
});

export default MonacoEditor;
