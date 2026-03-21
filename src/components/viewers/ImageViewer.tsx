import { useState } from 'react';

export type ImageViewerProps = {
  src?: string;
  alt: string;
};

export default function ImageViewer({ src, alt }: ImageViewerProps) {
  const [error, setError] = useState<string>('');

  if (!src) {
    return <div className="text-sm text-gray-500">No preview</div>;
  }

  if (error) {
    return (
      <div className="text-xs text-gray-600 whitespace-pre-wrap">
        Failed to render image.
        {'\n'}
        {error}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className="max-w-full max-h-full object-contain"
      onError={() => {
        setError('The image URL could not be loaded. This is often caused by missing Tauri FS permissions or an unsupported image format.');
      }}
    />
  );
}
