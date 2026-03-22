import { useState, useRef, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

export type RightActivityBarItem = {
  id: string;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
};

export type RightPanelContent = {
  id: string;
  title: string;
  children: ReactNode;
  minWidth?: number;
  defaultWidth?: number;
};

export type ResizableRightPanelProps = {
  items: RightActivityBarItem[];
  panels: RightPanelContent[];
  activeId: string | null;
  onActiveChange: (id: string | null) => void;
};

function ItemButton({
  item,
  active,
  onClick,
  collapsed,
}: {
  item: RightActivityBarItem;
  active: boolean;
  onClick: () => void;
  collapsed: boolean;
}) {
  return (
    <button
      type="button"
      className={
        'w-12 h-12 flex items-center justify-center relative transition-all ' +
        (item.disabled ? 'opacity-40 cursor-not-allowed ' : 'hover:bg-gray-100 active:bg-gray-200 ') +
        (active ? 'text-gray-900' : 'text-gray-500')
      }
      onClick={item.disabled ? undefined : onClick}
      aria-label={item.label}
      title={collapsed ? item.label : ''}
    >
      {active ? <span className="absolute right-0 top-2 bottom-2 w-0.5 bg-blue-500 rounded-l" /> : null}
      <span className="w-5 h-5 flex items-center justify-center">{item.icon}</span>
    </button>
  );
}

export default function ResizableRightPanel({ 
  items, 
  panels, 
  activeId, 
  onActiveChange 
}: ResizableRightPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [panelWidth, setPanelWidth] = useState<{ [key: string]: number }>({});
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);
  const activePanelRef = useRef<string | null>(null);

  const activePanel = panels.find(p => p.id === activeId);

  // 初始化面板宽度
  const getPanelWidth = useCallback((panelId: string) => {
    const panel = panels.find(p => p.id === panelId);
    const storedWidth = panelWidth[panelId];
    if (storedWidth) return storedWidth;
    const defaultWidth = panel?.defaultWidth || 320;
    const minWidth = panel?.minWidth || 200;
    return Math.max(defaultWidth, minWidth);
  }, [panels, panelWidth]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!activeId) return;
    setIsDragging(true);
    dragStartX.current = e.clientX;
    dragStartWidth.current = getPanelWidth(activeId);
    activePanelRef.current = activeId;
    e.preventDefault();
  }, [activeId, getPanelWidth]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !activePanelRef.current) return;
    
    const deltaX = dragStartX.current - e.clientX;
    const newWidth = dragStartWidth.current + deltaX;
    const panel = panels.find(p => p.id === activePanelRef.current);
    const minWidth = panel?.minWidth || 200;
    const maxWidth = window.innerWidth * 0.6; // 最大不超过窗口宽度的60%
    
    const finalWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));
    
    setPanelWidth(prev => ({
      ...prev,
      [activePanelRef.current!]: finalWidth,
    }));
  }, [isDragging, panels]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    activePanelRef.current = null;
  }, []);

  // 全局鼠标事件监听
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const toggleCollapse = useCallback(() => {
    setIsCollapsed(prev => !prev);
  }, []);

  // 当活跃面板改变时，自动展开
  useEffect(() => {
    if (activeId && isCollapsed) {
      setIsCollapsed(false);
    }
  }, [activeId, isCollapsed]);

  // 处理面板切换，如果切换到已折叠的面板，则展开
  const handleActiveChange = useCallback((newActiveId: string | null) => {
    if (newActiveId && isCollapsed) {
      // 如果有新的活跃面板且当前是折叠状态，先展开
      setIsCollapsed(false);
    }
    onActiveChange(newActiveId);
  }, [isCollapsed, onActiveChange]);

  if (!activePanel) {
    // 只显示 ActivityBar
    return (
      <div className="flex">
        <RightActivityBar 
          items={items} 
          activeId={activeId} 
          onActiveChange={handleActiveChange}
          collapsed={false}
        />
      </div>
    );
  }

  const currentWidth = activeId ? getPanelWidth(activeId) : 0;

  return (
    <div className="flex relative">
      {/* 拖拽时的全局遮罩 */}
      {isDragging && (
        <div 
          className="fixed inset-0 z-50 cursor-ew-resizing" 
          style={{ cursor: 'ew-resizing' }}
        />
      )}
      
      {/* 面板内容 */}
      <aside 
        className="border-l border-gray-200 bg-white flex flex-col transition-all duration-300 ease-in-out relative shadow-lg"
        style={{ 
          width: isCollapsed ? 0 : currentWidth,
          minWidth: isCollapsed ? 0 : (activePanel?.minWidth || 200),
          display: isCollapsed ? 'none' : 'flex',
          opacity: isCollapsed ? 0 : 1,
          transform: isCollapsed ? 'translateX(100%)' : 'translateX(0)',
          zIndex: isDragging ? 51 : 'auto'
        }}
      >
        {/* 面板头部 */}
        <div className="h-10 px-3 flex items-center justify-between border-b border-gray-200 flex-shrink-0">
          <div className="text-sm font-medium text-gray-800 truncate">
            {activePanel.title}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="p-1.5 rounded-md hover:bg-gray-100 active:bg-gray-200"
              onClick={toggleCollapse}
              aria-label="Collapse"
              title="Collapse panel"
            >
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
            <button
              type="button"
              className="p-1.5 rounded-md hover:bg-gray-100 active:bg-gray-200"
              onClick={() => onActiveChange(null)}
              aria-label="Close"
              title="Close panel"
            >
              <X className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        </div>

        {/* 面板内容 */}
        <div className="flex-1 min-h-0 overflow-auto">
          {activePanel.children}
        </div>

        {/* 调整大小的拖拽条 */}
        <div
          className={`absolute left-0 top-0 bottom-0 w-1 transition-all duration-200 z-10 group ${
            isDragging 
              ? 'bg-blue-500 cursor-ew-resizing' 
              : 'bg-gray-300 hover:bg-blue-500 hover:opacity-70 cursor-ew-resize'
          }`}
          onMouseDown={handleMouseDown}
          style={{ 
            left: -2, // 稍微扩展点击区域
            width: isDragging ? 6 : 4
          }}
        >
          {/* 拖拽指示器 */}
          <div className={`absolute left-0 top-1/2 transform -translate-y-1/2 w-0.5 h-6 rounded-full transition-colors duration-200 ${
            isDragging ? 'bg-blue-300' : 'bg-gray-400 group-hover:bg-blue-400'
          }`} />
        </div>
      </aside>

      {/* ActivityBar */}
      <RightActivityBar 
        items={items} 
        activeId={activeId} 
        onActiveChange={handleActiveChange}
        collapsed={isCollapsed}
      />
    </div>
  );
}

// 分离的 ActivityBar 组件
function RightActivityBar({ 
  items, 
  activeId, 
  onActiveChange,
  collapsed 
}: { 
  items: RightActivityBarItem[];
  activeId: string | null;
  onActiveChange: (id: string) => void;
  collapsed: boolean;
}) {
  if (collapsed && activeId) {
    return (
      <aside className="w-12 bg-white border-l border-gray-200 flex flex-col">
        <div className="flex-1 flex flex-col">
          <button
            type="button"
            className="w-12 h-12 flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 text-gray-500"
            onClick={() => onActiveChange(activeId)} // 触发重新展开
            aria-label="Expand panel"
            title="Expand panel"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-12 bg-white border-l border-gray-200 flex flex-col">
      <div className="flex-1 flex flex-col">
        {items.map((item) => (
          <ItemButton
            key={item.id}
            item={item}
            active={item.id === activeId}
            onClick={() => onActiveChange(item.id)}
            collapsed={collapsed}
          />
        ))}
      </div>
    </aside>
  );
}
