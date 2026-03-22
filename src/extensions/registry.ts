import type { ActivityBarItem } from '@/components/layouts/ActivityBar';
import type { ExtensionContributions, SidebarPanelContribution } from './types';

type Listener = (c: ExtensionContributions) => void;

export class ExtensionRegistry {
  private static instance: ExtensionRegistry;
  private activityBarItems: Array<{ tag: string; item: ActivityBarItem }> = [];
  private sidebarPanels: Array<{ tag: string; panel: SidebarPanelContribution }> = [];
  private listeners: Set<Listener> = new Set();

  static getInstance(): ExtensionRegistry {
    if (!ExtensionRegistry.instance) {
      ExtensionRegistry.instance = new ExtensionRegistry();
    }
    return ExtensionRegistry.instance;
  }

  getContributions(): ExtensionContributions {
    return {
      activityBarItems: this.activityBarItems.map((x) => x.item),
      sidebarPanels: this.sidebarPanels.map((x) => x.panel),
    };
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.getContributions());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const next = this.getContributions();
    for (const l of this.listeners) l(next);
  }

  clearTag(tag: string) {
    this.activityBarItems = this.activityBarItems.filter((x) => x.tag !== tag);
    this.sidebarPanels = this.sidebarPanels.filter((x) => x.tag !== tag);
    this.notify();
  }

  registerActivityBarItem(item: ActivityBarItem) {
    this.registerActivityBarItemTagged('builtin', item);
  }

  registerActivityBarItemTagged(tag: string, item: ActivityBarItem) {
    if (this.activityBarItems.some((x) => x.item.id === item.id)) return;
    this.activityBarItems.push({ tag, item });
    this.notify();
  }

  registerSidebarPanel(panel: SidebarPanelContribution) {
    this.registerSidebarPanelTagged('builtin', panel);
  }

  registerSidebarPanelTagged(tag: string, panel: SidebarPanelContribution) {
    if (this.sidebarPanels.some((x) => x.panel.id === panel.id)) return;
    this.sidebarPanels.push({ tag, panel });
    this.notify();
  }
}
