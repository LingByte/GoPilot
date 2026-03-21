import type { ReactNode } from 'react';

export type FileViewerTabModel = {
  id: string;
  path: string;
  title: string;
  language: string;
  viewerId: 'text' | 'markdown' | 'image' | 'audio' | 'pdf' | 'video' | 'binary';
  readOnly: boolean;
  value: string;
  reveal?: {
    line: number;
    column?: number;
  };
};

export type FileViewerRenderParams = {
  tab: FileViewerTabModel;
  onChange: (nextValue: string) => void;
  assetUrl?: string;
};

export type FileViewerRenderer = {
  id: string;
  label: string;
  match: (path: string) => boolean;
  render: (params: FileViewerRenderParams) => ReactNode;
};
