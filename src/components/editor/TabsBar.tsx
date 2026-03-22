import { X } from 'lucide-react';

export type EditorTab = {
  id: string;
  path: string;
  title: string;
  isDirty: boolean;
};

export type TabsBarProps = {
  tabs: EditorTab[];
  activeId: string | null;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onContextMenu?: (args: { id: string | null; x: number; y: number }) => void;
};

export default function TabsBar({ tabs, activeId, onActivate, onClose, onContextMenu }: TabsBarProps) {
  return (
    <div 
      className="h-10 border-b border-gray-200 bg-white flex-shrink-0 w-full overflow-hidden"
      style={{ 
        overflowX: 'auto', 
        overflowY: 'hidden',
        maxWidth: '100%',
        boxSizing: 'border-box'
      }}
      onContextMenu={(e) => {
        // empty area context menu
        if (!onContextMenu) return;
        e.preventDefault();
        onContextMenu({ id: null, x: e.clientX, y: e.clientY });
      }}
    >
      <div 
        style={{ 
          display: 'flex',
          height: '100%',
          width: `${tabs.length * 150}px` // 明确计算总宽度
        }}
      >
        {tabs.map((t) => {
          const active = t.id === activeId;
          return (
            <div
              key={t.id}
              className={
                'h-full flex items-center gap-2 px-3 border-r border-gray-200 cursor-pointer select-none ' +
                (active ? 'bg-gray-50 text-gray-900' : 'text-gray-600 hover:bg-gray-50')
              }
              onClick={() => onActivate(t.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onContextMenu?.({ id: t.id, x: e.clientX, y: e.clientY });
              }}
              title={t.path}
              style={{ 
                width: '150px', // 固定宽度
                flexShrink: 0,
                boxSizing: 'border-box'
              }}
            >
              <span className="text-sm whitespace-nowrap overflow-hidden text-ellipsis flex-1 min-w-0">
                {t.title}
                {t.isDirty ? <span className="ml-1 text-blue-600">•</span> : null}
              </span>
              <button
                type="button"
                className="p-1 rounded hover:bg-gray-200 flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(t.id);
                }}
                aria-label="Close tab"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
