import MonacoEditor from '@/components/editor/MonacoEditor';
import type { FileViewerRenderer } from './types';
import ImageViewer from './ImageViewer';
import MarkdownViewer from './MarkdownViewer';
import PdfEditorViewer from './PdfEditorViewer';
import VideoViewer from './VideoViewer';

function ext(path: string) {
  const idx = path.lastIndexOf('.');
  return idx >= 0 ? path.slice(idx + 1).toLowerCase() : '';
}

export function isImagePath(path: string) {
  const e = ext(path);
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'icns'].includes(e);
}

export function isAudioPath(path: string) {
  const e = ext(path);
  return ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(e);
}

export function isPdfPath(path: string) {
  return ext(path) === 'pdf';
}

export function isVideoPath(path: string) {
  const e = ext(path);
  return ['mp4', 'webm'].includes(e);
}

export function isMarkdownPath(path: string) {
  return ext(path) === 'md' || ext(path) === 'markdown';
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

export const markdownRenderer: FileViewerRenderer = {
  id: 'markdown',
  label: 'Markdown',
  match: (path) => isMarkdownPath(path),
  render: ({ tab, onChange }) => (
    <MarkdownViewer value={tab.value} onChange={onChange} readOnly={tab.readOnly} />
  ),
};

export const pdfRenderer: FileViewerRenderer = {
  id: 'pdf',
  label: 'PDF',
  match: (path) => isPdfPath(path),
  render: ({ tab, assetUrl, onChange }) => (
    <PdfEditorViewer assetUrl={assetUrl} value={tab.value} onChange={onChange} readOnly={tab.readOnly} />
  ),
};

export const videoRenderer: FileViewerRenderer = {
  id: 'video',
  label: 'Video',
  match: (path) => isVideoPath(path),
  render: ({ assetUrl }) => <VideoViewer assetUrl={assetUrl} />,
};

export function audioMime(path: string) {
  const e = ext(path);
  if (e === 'mp3') return 'audio/mpeg';
  if (e === 'wav') return 'audio/wav';
  if (e === 'ogg') return 'audio/ogg';
  if (e === 'm4a') return 'audio/mp4';
  if (e === 'flac') return 'audio/flac';
  if (e === 'aac') return 'audio/aac';
  return 'application/octet-stream';
}

export const textRenderer: FileViewerRenderer = {
  id: 'text',
  label: 'Text',
  match: () => true,
  render: ({ tab, onChange }) => (
    <MonacoEditor
      value={tab.value}
      onChange={onChange}
      language={tab.language}
      height="100%"
      readOnly={tab.readOnly}
    />
  ),
};

export const imageRenderer: FileViewerRenderer = {
  id: 'image',
  label: 'Image',
  match: (path) => isImagePath(path),
  render: ({ tab, assetUrl }) => (
    <div className="h-full w-full flex items-center justify-center bg-gray-50">
      <ImageViewer src={assetUrl} alt={tab.title} />
    </div>
  ),
};

export const audioRenderer: FileViewerRenderer = {
  id: 'audio',
  label: 'Audio',
  match: (path) => isAudioPath(path),
  render: ({ assetUrl }) => (
    <div className="h-full w-full flex items-center justify-center bg-gray-50 p-6">
      {assetUrl ? <audio controls src={assetUrl} className="w-full" /> : <div className="text-sm text-gray-500">No preview</div>}
    </div>
  ),
};

export const binaryRenderer: FileViewerRenderer = {
  id: 'binary',
  label: 'Binary',
  match: () => true,
  render: ({ tab }) => (
    <div className="h-full w-full flex items-center justify-center bg-gray-50 p-6">
      <pre className="text-xs text-gray-600 whitespace-pre-wrap">{tab.value}</pre>
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
