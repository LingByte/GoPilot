export default function VideoViewer({ assetUrl }: { assetUrl?: string }) {
  if (!assetUrl) {
    return <div className="h-full w-full flex items-center justify-center text-sm text-gray-500">No preview</div>;
  }

  return (
    <div className="h-full w-full flex items-center justify-center bg-black">
      <video controls src={assetUrl} className="max-w-full max-h-full" />
    </div>
  );
}
