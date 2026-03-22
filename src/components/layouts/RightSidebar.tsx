import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export type RightSidebarProps = {
  open: boolean;
  title?: string;
  children?: ReactNode;
  widthClassName?: string;
  onClose?: () => void;
};

export default function RightSidebar({ open, title, children, widthClassName = 'w-80 min-w-80', onClose }: RightSidebarProps) {
  if (!open) return null;

  return (
    <aside className={widthClassName + ' border-l border-gray-200 bg-white flex flex-col'}>
      <div className="h-10 px-3 flex items-center justify-between border-b border-gray-200">
        <div className="text-sm font-medium text-gray-800 truncate">{title ?? ''}</div>
        {onClose ? (
          <button
            type="button"
            className="p-1.5 rounded-md hover:bg-gray-100 active:bg-gray-200"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <X className="w-4 h-4 text-gray-600" />
          </button>
        ) : null}
      </div>

      <div className="flex-1 min-h-0 overflow-auto">{children}</div>
    </aside>
  );
}
