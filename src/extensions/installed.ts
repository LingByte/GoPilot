import type { ExtensionRegistry } from '@/extensions/registry';
import type { SidebarPanelRenderProps } from '@/extensions/types';
import { loadInstalledExtensions } from '@/extensions/store';
import { getExtensionActivationError, getWebviewHtml } from '@/extensions/runtime';
import JSZip from 'jszip';
import React from 'react';
import { Puzzle } from 'lucide-react';

type VsixManifest = {
  name?: string;
  publisher?: string;
  displayName?: string;
  version?: string;
  main?: string;
  browser?: string;
  activationEvents?: string[];
  contributes?: {
    viewsContainers?: {
      activitybar?: Array<{ id: string; title: string; icon?: string }>;
      [k: string]: any;
    };
    views?: {
      [viewContainerId: string]: Array<{ id: string; name: string }>;
    };
  };
};

async function readInstalledManifestFromDir(installDir: string): Promise<VsixManifest> {
  const path = await import('@tauri-apps/api/path');
  const fs = await import('@tauri-apps/api/fs');

  const tryRead = async (p: string) => {
    const content = await fs.readTextFile(p);
    return JSON.parse(content) as VsixManifest;
  };

  const p1 = await path.join(installDir, 'extension', 'package.json');
  const p2 = await path.join(installDir, 'package.json');
  try {
    return await tryRead(p1);
  } catch {
    return await tryRead(p2);
  }
}

async function readVsixManifest(vsixPath: string): Promise<VsixManifest> {
  const fs = await import('@tauri-apps/api/fs');
  const bytes = await fs.readBinaryFile(vsixPath);
  const zip = await JSZip.loadAsync(bytes);
  const pkg = zip.file('extension/package.json') ?? zip.file('package.json');
  if (!pkg) throw new Error('VSIX missing package.json');
  const content = await pkg.async('string');
  return JSON.parse(content) as VsixManifest;
}

function PlaceholderViewPanel({
  title,
  views,
  extId,
  main,
  browser,
  activationEvents,
}: {
  title: string;
  views: Array<{ id: string; name: string }>;
  extId: string;
  main?: string;
  browser?: string;
  activationEvents?: string[];
}) {
  const [_tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const onChanged = () => setTick((x) => x + 1);
    window.addEventListener('extensions-webviews-changed', onChanged);
    return () => window.removeEventListener('extensions-webviews-changed', onChanged);
  }, []);

  const header = React.createElement(
    'div',
    {
      className:
        'h-10 px-3 flex items-center border-b border-gray-200 text-sm font-medium text-gray-800',
    },
    title,
  );

  const info = React.createElement(
    'div',
    { className: 'text-[11px] text-gray-500 leading-5' },
    React.createElement('div', null, `Extension: ${extId}`),
    React.createElement('div', null, `main: ${main ? main : '(none)'}`),
    React.createElement('div', null, `browser: ${browser ? browser : '(none)'}`),
    React.createElement(
      'div',
      null,
      `activationEvents: ${Array.isArray(activationEvents) ? activationEvents.length : 0}`,
    ),
  );

  const tip = React.createElement(
    'div',
    { className: 'text-xs text-gray-600 leading-5' },
    React.createElement('div', { className: 'font-medium text-gray-800' }, 'This is a contributed view container.'),
    React.createElement(
      'div',
      null,
      'The extension UI is not executed yet, so this panel is a placeholder (stage 1).',
    ),
  );

  const activationError = getExtensionActivationError(extId);
  const errorBlock = activationError
    ? React.createElement(
        'div',
        { className: 'text-xs text-red-700 border border-red-200 bg-red-50 rounded p-2' },
        activationError,
      )
    : null;

  const firstViewId = views[0]?.id ?? '';
  const webviewHtml = firstViewId ? getWebviewHtml(firstViewId) : '';
  const webviewBlock = webviewHtml
    ? React.createElement(
        'div',
        { className: 'border border-gray-200 rounded overflow-auto bg-white' },
        React.createElement('div', {
          className: 'p-2',
          dangerouslySetInnerHTML: { __html: webviewHtml },
        }),
      )
    : null;

  const body =
    views.length === 0
      ? React.createElement(
          'div',
          { className: 'space-y-2' },
          info,
          errorBlock,
          tip,
          React.createElement(
            'div',
            { className: 'text-xs text-gray-500' },
            'No contributed views were declared for this container.',
          ),
        )
      : React.createElement(
          'div',
          { className: 'space-y-3' },
          // 当有 webview 内容时，只显示 webview，不显示任何调试信息
          webviewBlock || React.createElement(
            'div',
            { className: 'space-y-2' },
            info,
            errorBlock,
            tip,
            React.createElement(
              'div',
              { className: 'text-xs text-gray-500' },
              'No contributed views were declared for this container.',
            ),
          ),
          // 不显示 views 列表，因为那是调试信息
        );

  return React.createElement(
    'div',
    { className: 'h-full flex flex-col bg-white' },
    header,
    React.createElement('div', { 
      className: webviewBlock ? 'flex-1 min-h-0 overflow-auto' : 'flex-1 min-h-0 overflow-auto p-3' 
    }, body),
  );
}

export async function loadInstalledExtensionContributions(registry: ExtensionRegistry) {
  registry.clearTag('installed');

  const installed = loadInstalledExtensions().filter((e) => !!e.vsixPath && e.enabled !== false);
  for (const ext of installed) {
    try {
      const manifest = ext.installDir ? await readInstalledManifestFromDir(ext.installDir) : await readVsixManifest(ext.vsixPath!);
      const displayName = (manifest.displayName ?? ext.displayName ?? ext.name).trim();

      const viewsContainers = manifest.contributes?.viewsContainers ?? {};
      const activityContainers = (viewsContainers as any).activitybar ?? (viewsContainers as any).activityBar;
      const containers = Array.isArray(activityContainers) ? activityContainers : [];
      const viewsMap = manifest.contributes?.views ?? {};

      const registerContainer = (containerId: string, title: string) => {
        const panelId = `installed.${containerId}`;
        const views = Array.isArray((viewsMap as any)[containerId]) ? ((viewsMap as any)[containerId] as any[]) : [];
        const normalizedViews = views
          .map((v: any) => ({ id: typeof v?.id === 'string' ? v.id : '', name: typeof v?.name === 'string' ? v.name : '' }))
          .filter((v: any) => v.id && v.name);

        registry.registerActivityBarItemTagged('installed', {
          id: panelId,
          label: title,
          icon: React.createElement(Puzzle, { className: 'w-5 h-5' }),
        });

        registry.registerSidebarPanelTagged('installed', {
          id: panelId,
          title,
          render: (_props: SidebarPanelRenderProps) =>
            React.createElement(PlaceholderViewPanel, {
              title,
              views: normalizedViews,
              extId: ext.id,
              main: typeof (manifest as any).main === 'string' ? (manifest as any).main : ext.main,
              browser: typeof (manifest as any).browser === 'string' ? (manifest as any).browser : undefined,
              activationEvents: (manifest as any).activationEvents,
            }),
        });
      };

      if (containers.length > 0) {
        for (const c of containers) {
          const containerId = typeof c?.id === 'string' ? c.id : '';
          const title = typeof c?.title === 'string' ? c.title : displayName;
          if (!containerId) continue;
          registerContainer(containerId, title);
        }
        continue;
      }

      // Fallback: if the extension defines any viewsContainers but not under activitybar,
      // still surface a single entry so the user can see it in the ActivityBar.
      const anyContainers: Array<{ id: string; title: string }> = [];
      for (const key of Object.keys(viewsContainers)) {
        const arr = (viewsContainers as any)[key];
        if (!Array.isArray(arr)) continue;
        for (const c of arr) {
          const containerId = typeof c?.id === 'string' ? c.id : '';
          if (!containerId) continue;
          const title = typeof c?.title === 'string' ? c.title : displayName;
          anyContainers.push({ id: containerId, title });
        }
      }
      if (anyContainers.length > 0) {
        registerContainer(anyContainers[0]!.id, anyContainers[0]!.title);
      }
    } catch {
      console.warn('[extensions] failed to load installed contributions for', ext.id);
    }
  }
}
