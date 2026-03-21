import { useEffect, useRef } from 'react';

export default function Modal({
  open,
  title,
  children,
  onClose,
  footer,
  widthClassName = 'w-[420px]',
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  widthClassName?: string;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      const el = panelRef.current;
      if (!el) return;
      const focusable = el.querySelector<HTMLElement>('input, textarea, button, [tabindex]:not([tabindex="-1"])');
      focusable?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label="Close modal"
      />
      <div
        ref={panelRef}
        className={
          'relative mx-4 max-w-[90vw] rounded-xl border border-gray-200 bg-white shadow-xl ' + widthClassName
        }
      >
        <div className="px-4 py-3 border-b border-gray-200">
          <div className="text-sm font-medium text-gray-900">{title}</div>
        </div>

        <div className="px-4 py-3 max-h-[60vh] overflow-auto">{children}</div>

        {footer ? <div className="px-4 py-3 border-t border-gray-200">{footer}</div> : null}
      </div>
    </div>
  );
}
