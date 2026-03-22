import type { ExtensionRegistry } from '@/extensions/registry';
import React from 'react';
import { Blocks } from 'lucide-react';
import ExtensionsPanel from '@/components/extensions/ExtensionsPanel';

export async function loadBuiltinExtensions(registry: ExtensionRegistry) {
  registry.registerActivityBarItem({
    id: 'extensions',
    label: 'Extensions',
    icon: React.createElement(Blocks, { className: 'w-5 h-5' }),
  });

  registry.registerSidebarPanel({
    id: 'extensions',
    title: 'Extensions',
    render: () => React.createElement(ExtensionsPanel),
  });
}
