import { Settings } from 'lucide-react';
import { useCallback } from 'react';

type GlobalHeaderProps = {
  onSettingsClick?: () => void;
};

async function tryClose() {
  try {
    const mod = await import('@tauri-apps/api/window');
    await mod.appWindow.close();
  } catch {
    window.close();
  }
}

async function tryMinimize() {
  try {
    const mod = await import('@tauri-apps/api/window');
    await mod.appWindow.minimize();
  } catch {
    return;
  }
}

async function tryToggleMaximize() {
  try {
    const mod = await import('@tauri-apps/api/window');
    const isMax = await mod.appWindow.isMaximized();
    if (isMax) {
      await mod.appWindow.unmaximize();
    } else {
      await mod.appWindow.maximize();
    }
  } catch {
    return;
  }
}

export default function GlobalHeader({ onSettingsClick }: GlobalHeaderProps) {
  const onClose = useCallback(() => {
    void tryClose();
  }, []);

  const onMin = useCallback(() => {
    void tryMinimize();
  }, []);

  const onMax = useCallback(() => {
    void tryToggleMaximize();
  }, []);

  return (
    <header
      className="h-11 w-full flex items-center justify-between px-3 bg-white border-b border-gray-200 flex-shrink-0 sticky top-0 z-50"
      data-tauri-drag-region
    >
      <div className="flex items-center gap-2" data-tauri-drag-region>
        <button
          type="button"
          onClick={onClose}
          className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 active:bg-red-600"
          aria-label="Close"
        />
        <button
          type="button"
          onClick={onMin}
          className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-400 active:bg-yellow-600"
          aria-label="Minimize"
        />
        <button
          type="button"
          onClick={onMax}
          className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-400 active:bg-green-600"
          aria-label="Maximize"
        />
      </div>

      <div className="flex items-center" data-tauri-drag-region>
        <button
          type="button"
          onClick={onSettingsClick}
          className="p-2 rounded-md hover:bg-gray-100 active:bg-gray-200"
          aria-label="Settings"
          data-tauri-drag-region="false"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
