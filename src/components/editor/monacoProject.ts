import type * as Monaco from 'monaco-editor';

export type MonacoProjectConfig = {
  baseUrl?: string;
  paths?: Record<string, string[]>;
  projectRootAbs?: string;
  sourceRootAbs?: string;
};

let projectConfig: MonacoProjectConfig = {};
let projectConfigVersion = 0;

export const MONACO_PROJECT_CONFIG_CHANGED_EVENT = 'gopilot:monacoProjectConfigChanged';

export function setMonacoProjectConfig(cfg: MonacoProjectConfig) {
  projectConfig = {
    baseUrl: cfg.baseUrl,
    paths: cfg.paths,
    projectRootAbs: cfg.projectRootAbs,
    sourceRootAbs: cfg.sourceRootAbs,
  };

  projectConfigVersion++;
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(MONACO_PROJECT_CONFIG_CHANGED_EVENT));
    }
  } catch {
    // ignore
  }
}

export function getMonacoProjectConfig() {
  return projectConfig;
}

export function getMonacoProjectConfigVersion() {
  return projectConfigVersion;
}

export function applyMonacoProjectConfig(monaco: typeof Monaco) {
  const prevTs = monaco.languages.typescript.typescriptDefaults.getCompilerOptions();
  const prevJs = monaco.languages.typescript.javascriptDefaults.getCompilerOptions();

  const patch: any = {};
  if (projectConfig.baseUrl) patch.baseUrl = projectConfig.baseUrl;
  if (projectConfig.paths) patch.paths = projectConfig.paths;

  if (Object.keys(patch).length === 0) return;

  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    ...prevTs,
    ...patch,
  } as any);

  monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
    ...prevJs,
    ...patch,
  } as any);

  // Force diagnostics refresh so updated baseUrl/paths take effect immediately.
  try {
    const tsDiag = monaco.languages.typescript.typescriptDefaults.getDiagnosticsOptions();
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({ ...tsDiag });
    const jsDiag = monaco.languages.typescript.javascriptDefaults.getDiagnosticsOptions();
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({ ...jsDiag });
  } catch {
    // ignore
  }
}
