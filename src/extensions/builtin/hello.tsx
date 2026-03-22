import type { ExtensionRegistry } from '@/extensions/registry';
import type { SidebarPanelRenderProps } from '@/extensions/types';
import { Puzzle } from 'lucide-react';

function HelloPanel({ rootPath }: SidebarPanelRenderProps) {
  return (
    <div className="h-full flex flex-col bg-white">
      <div className="h-10 px-3 flex items-center border-b border-gray-200 text-sm font-medium text-gray-800">Hello Extension</div>
      <div className="p-3 text-xs text-gray-600 whitespace-pre-wrap">
        {rootPath ? `Workspace: ${rootPath}` : 'Open a folder to see rootPath.'}
      </div>
    </div>
  );
}

export function activateHelloExtension(registry: ExtensionRegistry) {
  registry.registerActivityBarItem({
    id: 'ext.hello',
    label: 'Hello',
    icon: <Puzzle className="w-5 h-5" />,
  });

  registry.registerSidebarPanel({
    id: 'ext.hello',
    title: 'Hello',
    render: (props) => <HelloPanel {...props} />,
  });
}
