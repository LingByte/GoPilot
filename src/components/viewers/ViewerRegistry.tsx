import { createContext, useContext, type ReactNode } from 'react';
import type { FileViewerRenderer } from './types';

const ViewerRegistryContext = createContext<FileViewerRenderer[] | null>(null);

export function ViewerRegistryProvider({
  renderers,
  children,
}: {
  renderers: FileViewerRenderer[];
  children: ReactNode;
}) {
  return <ViewerRegistryContext.Provider value={renderers}>{children}</ViewerRegistryContext.Provider>;
}

export function useViewerRenderers() {
  return useContext(ViewerRegistryContext);
}
