export default function PdfViewer({ assetUrl }: { assetUrl?: string }) {
  if (!assetUrl) {
    return <div className="h-full w-full flex items-center justify-center text-sm text-gray-500">No preview</div>;
  }

  return (
    <iframe
      src={assetUrl}
      className="w-full h-full"
      title="PDF Preview"
      style={{ border: 0 }}
    />
  );
}
