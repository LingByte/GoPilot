import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  RotateCcw, 
  Download, 
  FlipHorizontal,
  FlipVertical,
  Sun,
  Contrast,
  Palette,
  Crop,
  Info,
  X
} from 'lucide-react';

interface ImageEditorViewerProps {
  assetUrl?: string;
  value: string;
  onChange: (next: string) => void;
  readOnly: boolean;
}

interface ImageInfo {
  width: number;
  height: number;
  size: string;
  type: string;
  name: string;
}

interface ImageFilters {
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  grayscale: number;
  sepia: number;
}

export default function ImageEditorViewer({ assetUrl, value, onChange, readOnly }: ImageEditorViewerProps) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null);
  const [filters, setFilters] = useState<ImageFilters>({
    brightness: 100,
    contrast: 100,
    saturation: 100,
    blur: 0,
    grayscale: 0,
    sepia: 0
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);

  // 加载图片
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setOriginalImage(img);
      setImageInfo({
        width: img.naturalWidth,
        height: img.naturalHeight,
        size: formatFileSize(value.length),
        type: getImageType(assetUrl || ''),
        name: assetUrl?.split('/').pop() || 'unknown'
      });
      applyFilters();
    };
    img.src = assetUrl || '';
  }, [assetUrl]);

  // 应用滤镜
  const applyFilters = useCallback(() => {
    if (!canvasRef.current || !imageRef.current || !originalImage) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = originalImage.naturalWidth;
    canvas.height = originalImage.naturalHeight;

    // 应用 CSS 滤镜
    ctx.filter = `
      brightness(${filters.brightness}%) 
      contrast(${filters.contrast}%) 
      saturate(${filters.saturation}%)
      blur(${filters.blur}px)
      grayscale(${filters.grayscale}%)
      sepia(${filters.sepia}%)
    `;

    ctx.drawImage(originalImage, 0, 0);
  }, [filters, originalImage]);

  // 重置滤镜
  const resetFilters = () => {
    setFilters({
      brightness: 100,
      contrast: 100,
      saturation: 100,
      blur: 0,
      grayscale: 0,
      sepia: 0
    });
  };

  // 缩放
  const zoomIn = () => setScale(prev => Math.min(prev + 0.25, 5));
  const zoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.25));
  const resetZoom = () => setScale(1);

  // 旋转
  const rotateLeft = () => setRotation(prev => prev - 90);
  const rotateRight = () => setRotation(prev => prev + 90);

  // 翻转
  const toggleFlipHorizontal = () => setFlipH(prev => !prev);
  const toggleFlipVertical = () => setFlipV(prev => !prev);

  // 下载图片
  const downloadImage = () => {
    if (!canvasRef.current) return;

    canvasRef.current.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `edited_${imageInfo?.name || 'image.png'}`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  // 获取变换样式
  const getTransformStyle = () => {
    const transforms = [];
    transforms.push(`scale(${scale})`);
    transforms.push(`rotate(${rotation}deg)`);
    if (flipH) transforms.push('scaleX(-1)');
    if (flipV) transforms.push('scaleY(-1)');
    return transforms.join(' ');
  };

  const getFilterStyle = () => {
    return `
      brightness(${filters.brightness}%) 
      contrast(${filters.contrast}%) 
      saturate(${filters.saturation}%)
      blur(${filters.blur}px)
      grayscale(${filters.grayscale}%)
      sepia(${filters.sepia}%)
    `;
  };

  return (
    <div className="h-full flex flex-col bg-primary">
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 bg-secondary border-b border-border">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={zoomOut}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
            title="缩小"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-muted-foreground text-sm min-w-[60px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={zoomIn}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
            title="放大"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={resetZoom}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
            title="重置缩放"
          >
            <X className="w-4 h-4" />
          </button>
          
          <div className="w-px h-6 bg-border mx-2" />
          
          <button
            type="button"
            onClick={rotateLeft}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
            title="左旋转"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={rotateRight}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
            title="右旋转"
          >
            <RotateCw className="w-4 h-4" />
          </button>
          
          <div className="w-px h-6 bg-border mx-2" />
          
          <button
            type="button"
            onClick={toggleFlipHorizontal}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
            title="水平翻转"
          >
            <FlipHorizontal className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={toggleFlipVertical}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
            title="垂直翻转"
          >
            <FlipVertical className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded ${showFilters ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
            title="滤镜"
          >
            <Palette className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setShowInfo(!showInfo)}
            className={`p-2 rounded ${showInfo ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
            title="信息"
          >
            <Info className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={downloadImage}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
            title="下载"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex relative">
        {/* 图片显示区域 */}
        <div className={`flex-1 flex items-center justify-center overflow-hidden relative transition-all duration-300 ${
          (showInfo || showFilters) ? 'mr-80' : ''
        }`}>
          {assetUrl && (
            <img
              ref={imageRef}
              src={assetUrl}
              alt="Preview"
              className="max-w-full max-h-full object-contain transition-transform duration-200"
              style={{
                transform: getTransformStyle(),
                filter: getFilterStyle()
              }}
              draggable={false}
            />
          )}
          <canvas
            ref={canvasRef}
            className="hidden"
          />
        </div>

        {/* 侧边栏 - 相对定位 */}
        {(showInfo || showFilters) && (
          <div className="absolute right-0 top-0 bottom-0 w-80 bg-secondary border-l border-border overflow-y-auto shadow-2xl z-50">
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between">
                <h3 className="text-foreground font-medium">
                  {showInfo ? '图片信息' : '图片滤镜'}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowInfo(false);
                    setShowFilters(false);
                  }}
                  className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            {showInfo && (
              <div className="p-4">
                {imageInfo && (
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">文件名:</span>
                      <span className="text-foreground truncate ml-2">{imageInfo.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">尺寸:</span>
                      <span className="text-foreground">{imageInfo.width} × {imageInfo.height}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">大小:</span>
                      <span className="text-foreground">{imageInfo.size}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">类型:</span>
                      <span className="text-foreground">{imageInfo.type}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {showFilters && (
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-foreground font-medium flex items-center gap-2">
                    <Palette className="w-4 h-4" />
                    图片滤镜
                  </h3>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    重置
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-muted-foreground text-sm flex justify-between mb-1">
                      <span>亮度</span>
                      <span>{filters.brightness}%</span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={filters.brightness}
                      onChange={(e) => setFilters(prev => ({ ...prev, brightness: Number(e.target.value) }))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="text-muted-foreground text-sm flex justify-between mb-1">
                      <span>对比度</span>
                      <span>{filters.contrast}%</span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={filters.contrast}
                      onChange={(e) => setFilters(prev => ({ ...prev, contrast: Number(e.target.value) }))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="text-muted-foreground text-sm flex justify-between mb-1">
                      <span>饱和度</span>
                      <span>{filters.saturation}%</span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={filters.saturation}
                      onChange={(e) => setFilters(prev => ({ ...prev, saturation: Number(e.target.value) }))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="text-muted-foreground text-sm flex justify-between mb-1">
                      <span>模糊</span>
                      <span>{filters.blur}px</span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="20"
                      value={filters.blur}
                      onChange={(e) => setFilters(prev => ({ ...prev, blur: Number(e.target.value) }))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="text-muted-foreground text-sm flex justify-between mb-1">
                      <span>灰度</span>
                      <span>{filters.grayscale}%</span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={filters.grayscale}
                      onChange={(e) => setFilters(prev => ({ ...prev, grayscale: Number(e.target.value) }))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="text-muted-foreground text-sm flex justify-between mb-1">
                      <span>褐色</span>
                      <span>{filters.sepia}%</span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={filters.sepia}
                      onChange={(e) => setFilters(prev => ({ ...prev, sepia: Number(e.target.value) }))}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// 工具函数
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getImageType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'JPEG';
    case 'png':
      return 'PNG';
    case 'gif':
      return 'GIF';
    case 'webp':
      return 'WebP';
    case 'svg':
      return 'SVG';
    case 'bmp':
      return 'BMP';
    default:
      return 'Unknown';
  }
}
