import type { FileViewerRenderer, FileViewerRenderParams } from './types';
import MonacoEditor from '@/components/editor/MonacoEditor';
import VideoViewer from './VideoViewer';

function ext(path: string) {
  const idx = path.lastIndexOf('.');
  return idx >= 0 ? path.slice(idx + 1).toLowerCase() : '';
}

export function isImagePath(path: string) {
  const e = ext(path);
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'icns'].includes(e);
}

export function isVideoPath(path: string) {
  const e = ext(path);
  return ['mp4', 'webm'].includes(e);
}

export function isAudioPath(path: string) {
  const e = ext(path);
  return ['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(e);
}

export function isMarkdownPath(path: string) {
  return ext(path) === 'md' || ext(path) === 'markdown';
}

export function isPdfPath(path: string) {
  return ext(path) === 'pdf';
}

export function imageMime(path: string) {
  const e = ext(path);
  if (e === 'png') return 'image/png';
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
  if (e === 'gif') return 'image/gif';
  if (e === 'webp') return 'image/webp';
  if (e === 'bmp') return 'image/bmp';
  if (e === 'svg') return 'image/svg+xml';
  if (e === 'ico') return 'image/x-icon';
  return 'application/octet-stream';
}

export function pdfMime(_path: string) {
  return 'application/pdf';
}

export function videoMime(path: string) {
  const e = ext(path);
  if (e === 'mp4') return 'video/mp4';
  if (e === 'webm') return 'video/webm';
  return 'application/octet-stream';
}

export function audioMime(path: string) {
  const e = ext(path);
  if (e === 'mp3') return 'audio/mpeg';
  if (e === 'wav') return 'audio/wav';
  if (e === 'ogg') return 'audio/ogg';
  if (e === 'flac') return 'audio/flac';
  if (e === 'aac') return 'audio/aac';
  return 'application/octet-stream';
}

export const markdownRenderer: FileViewerRenderer = {
  id: 'markdown',
  label: 'Markdown',
  match: (path: string) => {
    const e = ext(path);
    return ['md', 'markdown'].includes(e);
  },
  render: ({ tab }: FileViewerRenderParams) => (
    <div className="p-4 h-full overflow-auto">
      <pre className="whitespace-pre-wrap">{tab.value}</pre>
    </div>
  ),
};

export const pdfRenderer: FileViewerRenderer = {
  id: 'pdf',
  label: 'PDF',
  match: (path: string) => {
    const e = ext(path);
    return e === 'pdf';
  },
  render: ({ tab }: FileViewerRenderParams) => (
    <div className="p-4 h-full overflow-auto">
      <div className="text-center text-gray-500">
        PDF Viewer: {tab.path}
      </div>
    </div>
  ),
};

export const imageRenderer: FileViewerRenderer = {
  id: 'image',
  label: 'Image',
  match: (path: string) => isImagePath(path),
  render: ({ assetUrl }: FileViewerRenderParams) => (
    <div className="flex items-center justify-center h-full">
      <img src={assetUrl} alt="Image" className="max-w-full max-h-full object-contain" />
    </div>
  ),
};

export const videoRenderer: FileViewerRenderer = {
  id: 'video',
  label: 'Video',
  match: (path) => isVideoPath(path),
  render: ({ assetUrl }) => <VideoViewer assetUrl={assetUrl} />,
};

export const audioRenderer: FileViewerRenderer = {
  id: 'audio',
  label: 'Audio',
  match: (path: string) => {
    const e = ext(path);
    return ['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(e);
  },
  render: ({ assetUrl }: FileViewerRenderParams) => (
    <div className="flex items-center justify-center h-full">
      <audio controls src={assetUrl} className="max-w-full" />
    </div>
  ),
};

export const textRenderer: FileViewerRenderer = {
  id: 'text',
  label: 'Text',
  match: () => true,
  render: ({ tab, onChange }: FileViewerRenderParams) => (
    <MonacoEditor
      value={tab.value}
      onChange={onChange}
      language={tab.language}
      height="100%"
      readOnly={tab.readOnly}
      reveal={tab.reveal ? { line: tab.reveal.line, column: tab.reveal.column || 1 } : undefined}
    />
  ),
};

export const binaryRenderer: FileViewerRenderer = {
  id: 'binary',
  label: 'Binary',
  match: () => true,
  render: ({ tab }: FileViewerRenderParams) => (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="text-6xl mb-4">📁</div>
        <div className="text-lg font-medium mb-2">{tab.title}</div>
        <div className="text-sm text-gray-500">Binary file - cannot preview</div>
      </div>
    </div>
  ),
};

export const defaultRenderers: FileViewerRenderer[] = [
  imageRenderer,
  audioRenderer,
  videoRenderer,
  pdfRenderer,
  markdownRenderer,
  textRenderer,
  binaryRenderer,
];
