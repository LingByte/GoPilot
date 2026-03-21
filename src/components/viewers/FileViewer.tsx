import type { FileViewerRenderer, FileViewerRenderParams } from './types';
import { defaultRenderers } from './defaultRenderers';
import { useViewerRenderers } from './ViewerRegistry';

export type FileViewerProps = FileViewerRenderParams & {
  renderers?: FileViewerRenderer[];
};

export default function FileViewer({ tab, onChange, assetUrl, renderers }: FileViewerProps) {
  const injected = useViewerRenderers();
  const effectiveRenderers = renderers ?? injected ?? defaultRenderers;
  const explicit = effectiveRenderers.find((r) => r.id === tab.viewerId);
  const renderer =
    explicit ??
    effectiveRenderers.find((r) => r.match(tab.path)) ??
    effectiveRenderers[effectiveRenderers.length - 1];
  return <>{renderer.render({ tab, onChange, assetUrl })}</>;
}
