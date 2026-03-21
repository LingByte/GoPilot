import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { PDFDocument, rgb } from 'pdf-lib';
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker?url';

GlobalWorkerOptions.workerSrc = workerSrc;

type Tool = 'pan' | 'highlight' | 'pen' | 'text';

type HighlightAnnotation = {
  type: 'highlight';
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  opacity: number;
};

type PenAnnotation = {
  type: 'pen';
  page: number;
  points: Array<{ x: number; y: number }>;
  color: string;
  width: number;
};

type TextAnnotation = {
  type: 'text';
  page: number;
  x: number;
  y: number;
  text: string;
  size: number;
  color: string;
};

type PdfAnnotation = HighlightAnnotation | PenAnnotation | TextAnnotation;

type PdfEditState = {
  version: 1;
  annotations: PdfAnnotation[];
};

function safeParseState(value: string): PdfEditState {
  try {
    const v = JSON.parse(value);
    if (v && v.version === 1 && Array.isArray(v.annotations)) return v;
  } catch {
    return { version: 1, annotations: [] };
  }
  return { version: 1, annotations: [] };
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function hexToRgb(hex: string) {
  const h = hex.replace('#', '').trim();
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return rgb(r, g, b);
}

export async function applyPdfAnnotations(pdfBytes: Uint8Array, state: PdfEditState) {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  for (const a of state.annotations) {
    const p = pages[a.page - 1];
    if (!p) continue;
    const { width, height } = p.getSize();

    if (a.type === 'highlight') {
      const c = hexToRgb(a.color);
      const x = a.x * width;
      const y = (1 - a.y - a.h) * height;
      const w = a.w * width;
      const h = a.h * height;
      p.drawRectangle({ x, y, width: w, height: h, color: c, opacity: clamp01(a.opacity) });
    }

    if (a.type === 'pen') {
      const c = hexToRgb(a.color);
      const pts = a.points.map((pt) => ({ x: pt.x * width, y: (1 - pt.y) * height }));
      for (let i = 1; i < pts.length; i++) {
        const p0 = pts[i - 1];
        const p1 = pts[i];
        p.drawLine({ start: p0, end: p1, thickness: a.width, color: c });
      }
    }

    if (a.type === 'text') {
      const c = hexToRgb(a.color);
      const x = a.x * width;
      const y = (1 - a.y) * height;
      p.drawText(a.text, { x, y, size: a.size, color: c });
    }
  }

  return await pdfDoc.save();
}

export default function PdfEditorViewer({
  assetUrl,
  value,
  onChange,
  readOnly,
}: {
  assetUrl?: string;
  value: string;
  onChange: (next: string) => void;
  readOnly: boolean;
}) {
  const state = useMemo(() => safeParseState(value), [value]);
  const [tool, setTool] = useState<Tool>('pan');
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [scale, setScale] = useState(1.25);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);

  const draftRef = useRef<{
    pen?: { points: Array<{ x: number; y: number }>; color: string; width: number };
    highlight?: { x0: number; y0: number; x1: number; y1: number; color: string; opacity: number };
  }>({});

  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    points: Array<{ x: number; y: number }>;
  }>({ active: false, startX: 0, startY: 0, points: [] });

  useEffect(() => {
    let canceled = false;
    setDoc(null);
    if (!assetUrl) return;

    (async () => {
      const task = getDocument(assetUrl);
      const pdf = await task.promise;
      if (canceled) return;
      setDoc(pdf);
      setPageNum(1);
    })();

    return () => {
      canceled = true;
    };
  }, [assetUrl]);

  useEffect(() => {
    if (!doc) return;
    const render = async () => {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      const canvas = canvasRef.current;
      const overlay = overlayRef.current;
      if (!canvas || !overlay) return;

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      overlay.width = canvas.width;
      overlay.height = canvas.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      await page.render({ canvasContext: ctx, viewport }).promise;

      const octx = overlay.getContext('2d');
      if (!octx) return;
      octx.clearRect(0, 0, overlay.width, overlay.height);

      for (const a of state.annotations) {
        if (a.page !== pageNum) continue;
        if (a.type === 'highlight') {
          octx.save();
          octx.globalAlpha = clamp01(a.opacity);
          octx.fillStyle = a.color;
          octx.fillRect(a.x * overlay.width, a.y * overlay.height, a.w * overlay.width, a.h * overlay.height);
          octx.restore();
        }
        if (a.type === 'pen') {
          octx.save();
          octx.strokeStyle = a.color;
          octx.lineWidth = a.width;
          octx.lineJoin = 'round';
          octx.lineCap = 'round';
          octx.beginPath();
          a.points.forEach((pt: { x: number; y: number }, idx: number) => {
            const x = pt.x * overlay.width;
            const y = pt.y * overlay.height;
            if (idx === 0) octx.moveTo(x, y);
            else octx.lineTo(x, y);
          });
          octx.stroke();
          octx.restore();
        }
        if (a.type === 'text') {
          octx.save();
          octx.fillStyle = a.color;
          octx.font = `${a.size}px sans-serif`;
          octx.fillText(a.text, a.x * overlay.width, a.y * overlay.height);
          octx.restore();
        }
      }

      // Draw draft highlight
      const draft = draftRef.current;
      if (draft.highlight) {
        const { x0, y0, x1, y1, color, opacity } = draft.highlight;
        const nx = Math.min(x0, x1) * overlay.width;
        const ny = Math.min(y0, y1) * overlay.height;
        const w = Math.abs(x1 - x0) * overlay.width;
        const h = Math.abs(y1 - y0) * overlay.height;
        octx.save();
        octx.globalAlpha = clamp01(opacity);
        octx.fillStyle = color;
        octx.fillRect(nx, ny, w, h);
        octx.restore();
      }

      // Draw draft pen
      if (draft.pen) {
        octx.save();
        octx.strokeStyle = draft.pen.color;
        octx.lineWidth = draft.pen.width;
        octx.lineJoin = 'round';
        octx.lineCap = 'round';
        octx.beginPath();
        draft.pen.points.forEach((pt, idx) => {
          const x = pt.x * overlay.width;
          const y = pt.y * overlay.height;
          if (idx === 0) octx.moveTo(x, y);
          else octx.lineTo(x, y);
        });
        octx.stroke();
        octx.restore();
      }
    };

    void render();
  }, [doc, pageNum, scale, state.annotations]);

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (readOnly) return;
    if (!overlayRef.current) return;
    if (tool === 'pan') return;

    const rect = overlayRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    dragRef.current.active = true;
    dragRef.current.startX = x;
    dragRef.current.startY = y;
    dragRef.current.points = [{ x, y }];

    if (tool === 'pen') {
      draftRef.current.pen = { points: [{ x, y }], color: '#2563eb', width: 2 };
    }
    if (tool === 'highlight') {
      draftRef.current.highlight = { x0: x, y0: y, x1: x, y1: y, color: '#fde047', opacity: 0.45 };
    }

    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (readOnly) return;
    if (!overlayRef.current) return;
    if (!dragRef.current.active) return;

    const rect = overlayRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    if (tool === 'pen') {
      dragRef.current.points.push({ x, y });
      if (draftRef.current.pen) {
        draftRef.current.pen.points = [...dragRef.current.points];
      }
      // re-render draft
      void Promise.resolve().then(() => {
        // trigger render effect by nudging scale (no-op) isn't good; instead just draw immediately
        const overlay = overlayRef.current;
        if (!overlay) return;
        const octx = overlay.getContext('2d');
        if (!octx) return;
        octx.clearRect(0, 0, overlay.width, overlay.height);
        // Draw committed annotations by calling onChange is avoided here; reuse current state drawing by forcing effect is heavy.
        // Minimal: draw draft on top; committed items will be redrawn on next state change.
        // Draft is visible immediately.
        const draft = draftRef.current;
        if (draft.pen) {
          octx.save();
          octx.strokeStyle = draft.pen.color;
          octx.lineWidth = draft.pen.width;
          octx.lineJoin = 'round';
          octx.lineCap = 'round';
          octx.beginPath();
          draft.pen.points.forEach((pt, idx) => {
            const px = pt.x * overlay.width;
            const py = pt.y * overlay.height;
            if (idx === 0) octx.moveTo(px, py);
            else octx.lineTo(px, py);
          });
          octx.stroke();
          octx.restore();
        }
      });
    }

    if (tool === 'highlight') {
      if (draftRef.current.highlight) {
        draftRef.current.highlight.x1 = x;
        draftRef.current.highlight.y1 = y;
      }
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (readOnly) return;
    if (!overlayRef.current) return;
    if (!dragRef.current.active) return;

    const rect = overlayRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    const sx = dragRef.current.startX;
    const sy = dragRef.current.startY;

    dragRef.current.active = false;

    if (tool === 'highlight') {
      const nx = Math.min(sx, x);
      const ny = Math.min(sy, y);
      const w = Math.abs(x - sx);
      const h = Math.abs(y - sy);
      const next: PdfEditState = {
        version: 1,
        annotations: [
          ...state.annotations,
          { type: 'highlight', page: pageNum, x: nx, y: ny, w, h, color: '#fde047', opacity: 0.45 },
        ],
      };
      draftRef.current.highlight = undefined;
      onChange(JSON.stringify(next));
    }

    if (tool === 'pen') {
      const pts = dragRef.current.points;
      if (pts.length >= 2) {
        const next: PdfEditState = {
          version: 1,
          annotations: [
            ...state.annotations,
            { type: 'pen', page: pageNum, points: pts, color: '#2563eb', width: 2 },
          ],
        };
        onChange(JSON.stringify(next));
      }
      draftRef.current.pen = undefined;
    }

    if (tool === 'text') {
      const text = window.prompt('Text');
      if (!text) return;
      const next: PdfEditState = {
        version: 1,
        annotations: [
          ...state.annotations,
          { type: 'text', page: pageNum, x, y, text, size: 14, color: '#111827' },
        ],
      };
      onChange(JSON.stringify(next));
    }

    (e.target as Element).releasePointerCapture(e.pointerId);
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="h-10 flex items-center justify-between px-3 border-b border-gray-200">
        <div className="text-sm font-medium text-gray-800">PDF</div>
        <div className="flex items-center gap-2">
          <select
            className="text-xs border border-gray-200 rounded px-2 py-1"
            value={tool}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTool(e.target.value as Tool)}
            disabled={readOnly}
          >
            <option value="pan">Pan</option>
            <option value="highlight">Highlight</option>
            <option value="pen">Pen</option>
            <option value="text">Text</option>
          </select>

          <button
            type="button"
            className="px-2 py-1 text-xs rounded hover:bg-gray-100"
            onClick={() => setScale((s: number) => Math.max(0.5, Math.min(3, s - 0.25)))}
          >
            -
          </button>
          <div className="text-xs text-gray-600">{Math.round(scale * 100)}%</div>
          <button
            type="button"
            className="px-2 py-1 text-xs rounded hover:bg-gray-100"
            onClick={() => setScale((s: number) => Math.max(0.5, Math.min(3, s + 0.25)))}
          >
            +
          </button>

          <button
            type="button"
            className="px-2 py-1 text-xs rounded hover:bg-gray-100"
            onClick={() => setPageNum((p: number) => Math.max(1, p - 1))}
            disabled={!doc || pageNum <= 1}
          >
            Prev
          </button>
          <div className="text-xs text-gray-600">{doc ? `${pageNum}/${doc.numPages}` : '—'}</div>
          <button
            type="button"
            className="px-2 py-1 text-xs rounded hover:bg-gray-100"
            onClick={() => setPageNum((p: number) => (doc ? Math.min(doc.numPages, p + 1) : p))}
            disabled={!doc || (doc ? pageNum >= doc.numPages : true)}
          >
            Next
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-3 bg-gray-50">
        <div className="relative inline-block">
          <canvas ref={canvasRef} className="block bg-white shadow" />
          <canvas
            ref={overlayRef}
            className="absolute inset-0"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
        </div>
      </div>
    </div>
  );
}
