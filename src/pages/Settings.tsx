import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  applyColorTheme,
  applyThemeMode,
  getStoredColorTheme,
  getStoredThemeMode,
  setStoredColorTheme,
  setStoredThemeMode,
  type ColorTheme,
  type ThemeMode,
} from '@/theme/theme';

type SettingSection = {
  id: string;
  title: string;
  description?: string;
};

export default function Settings({ onClose }: { onClose?: () => void }) {
  const navigate = useNavigate();
  const sections: SettingSection[] = useMemo(
    () => [
      { id: 'general', title: 'General', description: 'Basic application preferences' },
      { id: 'extensions', title: 'Extensions', description: 'Manage installed extensions' },
      { id: 'editor', title: 'Editor', description: 'Font, tab size, formatting' },
    ],
    [],
  );

  const [active, setActive] = useState(sections[0]?.id ?? 'general');
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getStoredThemeMode());
  const [colorTheme, setColorTheme] = useState<ColorTheme>(() => getStoredColorTheme());

  const activeSection = useMemo(() => sections.find((s) => s.id === active) ?? sections[0], [active, sections]);

  useEffect(() => {
    applyThemeMode(themeMode);
    setStoredThemeMode(themeMode);
  }, [themeMode]);

  useEffect(() => {
    applyColorTheme(colorTheme);
    setStoredColorTheme(colorTheme);
  }, [colorTheme]);

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-white">
      <div className="h-11 flex items-center justify-between px-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50 active:bg-gray-100"
            onClick={() => {
              if (onClose) {
                onClose();
              } else {
                navigate('/');
              }
            }}
          >
            Back
          </button>
          <div className="text-sm font-medium text-gray-900">Settings</div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="w-72 min-w-72 border-r border-gray-200 overflow-auto">
          <div className="p-2">
            <div className="text-[11px] text-gray-500 mb-2">Sections</div>
            <div className="space-y-2">
              {sections.map((s) => {
                const isActive = s.id === active;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={
                      'w-full text-left border border-gray-200 rounded p-2 ' +
                      (isActive ? 'bg-gray-50' : 'hover:bg-gray-50 active:bg-gray-100')
                    }
                    onClick={() => setActive(s.id)}
                  >
                    <div className="text-sm text-gray-900 font-medium">{s.title}</div>
                    {s.description ? <div className="text-[11px] text-gray-500 mt-1">{s.description}</div> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0 overflow-auto">
          <div className="p-4">
            <div className="text-sm font-medium text-gray-900">{activeSection?.title ?? 'Settings'}</div>

            {active === 'general' ? (
              <div className="mt-4 max-w-xl">
                <div className="text-[11px] text-gray-500">Appearance</div>
                <div className="mt-2 border border-gray-200 rounded">
                  <div className="px-3 py-2 border-b border-gray-200">
                    <div className="text-xs font-medium text-gray-900">Color Theme</div>
                    <div className="mt-1 text-[11px] text-gray-500">Choose Light / Dark or follow your system setting.</div>
                  </div>
                  <div className="p-3">
                    <select
                      className="w-full text-sm px-3 py-2 border border-gray-200 rounded bg-white"
                      value={themeMode}
                      onChange={(e) => setThemeMode(e.target.value as ThemeMode)}
                    >
                      <option value="system">System</option>
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                  </div>
                </div>

                <div className="mt-3 border border-gray-200 rounded">
                  <div className="px-3 py-2 border-b border-gray-200">
                    <div className="text-xs font-medium text-gray-900">Accent Palette</div>
                    <div className="mt-1 text-[11px] text-gray-500">Switch the primary/accent color set (VSCode-like presets).</div>
                  </div>
                  <div className="p-3">
                    <select
                      className="w-full text-sm px-3 py-2 border border-gray-200 rounded bg-white"
                      value={colorTheme}
                      onChange={(e) => setColorTheme(e.target.value as ColorTheme)}
                    >
                      <option value="default">Default (Blue)</option>
                      <option value="lavender">Lavender (Purple)</option>
                      <option value="cherry">Cherry (Pink)</option>
                      <option value="ocean">Ocean (Teal)</option>
                      <option value="nature">Nature (Green)</option>
                      <option value="fresh">Fresh (Mint)</option>
                      <option value="sunset">Sunset (Orange)</option>
                    </select>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-2 text-xs text-gray-600">This section is a placeholder for now.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
