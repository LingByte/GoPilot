import type { ReactNode } from 'react';
import type { ActivityBarItem } from '@/components/layouts/ActivityBar';

export type SidebarPanelRenderProps = {
  rootPath: string;
  onOpenFile: (path: string) => void;
};

export type SidebarPanelContribution = {
  id: string;
  title: string;
  render: (props: SidebarPanelRenderProps) => ReactNode;
};

export type ExtensionContributions = {
  activityBarItems: ActivityBarItem[];
  sidebarPanels: SidebarPanelContribution[];
};
