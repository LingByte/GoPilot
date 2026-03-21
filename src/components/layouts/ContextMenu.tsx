import { useEffect, useRef } from 'react';

export type ContextMenuItem = {
  id: string;
  label: string;
  disabled?: boolean;
  onClick: () => void;
};

export default function ContextMenu({
  open,
  x,
  y,
  items,
  onClose,
}: {
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onMouseDown = (e: MouseEvent) => {
      const el = ref.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      onClose();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className="fixed z-[9999] min-w-44 bg-white border border-gray-200 rounded-md shadow-lg py-1"
      style={{ left: x, top: y }}
      role="menu"
    >
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className={
            'w-full text-left px-3 py-2 text-sm ' +
            (it.disabled
              ? 'text-gray-300 cursor-not-allowed'
              : 'text-gray-700 hover:bg-gray-100 active:bg-gray-200')
          }
          onClick={() => {
            if (it.disabled) return;
            it.onClick();
            onClose();
          }}
          disabled={it.disabled}
          role="menuitem"
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
