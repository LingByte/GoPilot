import type { ReactNode } from 'react';

export type ActivityBarItem = {
  id: string;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  active?: boolean;
  onSelect?: () => void;
};

export type ActivityBarProps = {
  items: ActivityBarItem[];
  bottomItems?: ActivityBarItem[];
  activeId: string;
  onActiveChange: (id: string) => void;
};

function ItemButton({
  item,
  active,
  onClick,
}: {
  item: ActivityBarItem;
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
      {active ? (
        <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-blue-500 rounded-r" />
      ) : null}
      <span className="w-5 h-5 flex items-center justify-center">{item.icon}</span>
    </button>
  );
}

export default function ActivityBar({
  items,
  bottomItems = [],
  activeId,
  onActiveChange,
}: ActivityBarProps) {
  return (
    <aside className="w-12 bg-white border-r border-gray-200 flex flex-col">
      <div className="flex-1 flex flex-col">
        {items.map((item) => (
          <ItemButton
            key={item.id}
            item={item}
            active={item.active ?? item.id === activeId}
            onClick={
              item.disabled
                ? () => {
                    return;
                  }
                : item.onSelect
                  ? item.onSelect
                  : () => onActiveChange(item.id)
            }
          />
        ))}
      </div>

      {bottomItems.length > 0 ? (
        <div className="border-t border-gray-200">
          {bottomItems.map((item) => (
            <ItemButton
              key={item.id}
              item={item}
              active={item.active ?? item.id === activeId}
              onClick={
                item.disabled
                  ? () => {
                      return;
                    }
                  : item.onSelect
                    ? item.onSelect
                    : () => onActiveChange(item.id)
              }
            />
          ))}
        </div>
      ) : null}
    </aside>
  );
}
