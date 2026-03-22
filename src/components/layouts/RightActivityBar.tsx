import type { ReactNode } from 'react';

export type RightActivityBarItem = {
  id: string;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
};

export type RightActivityBarProps = {
  items: RightActivityBarItem[];
  activeId: string | null;
  onActiveChange: (id: string | null) => void;
};

function ItemButton({
  item,
  active,
  onClick,
}: {
  item: RightActivityBarItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={
        'w-12 h-12 flex items-center justify-center relative ' +
        (item.disabled ? 'opacity-40 cursor-not-allowed ' : 'hover:bg-gray-100 active:bg-gray-200 ') +
        (active ? 'text-gray-900' : 'text-gray-500')
      }
      onClick={item.disabled ? undefined : onClick}
      aria-label={item.label}
      title={item.label}
    >
      {active ? <span className="absolute right-0 top-2 bottom-2 w-0.5 bg-blue-500 rounded-l" /> : null}
      <span className="w-5 h-5 flex items-center justify-center">{item.icon}</span>
    </button>
  );
}

export default function RightActivityBar({ items, activeId, onActiveChange }: RightActivityBarProps) {
  return (
    <aside className="w-12 bg-white border-l border-gray-200 flex flex-col">
      <div className="flex-1 flex flex-col">
        {items.map((item) => (
          <ItemButton
            key={item.id}
            item={item}
            active={item.id === activeId}
            onClick={() => {
              if (item.disabled) return;
              onActiveChange(activeId === item.id ? null : item.id);
            }}
          />
        ))}
      </div>
    </aside>
  );
}
