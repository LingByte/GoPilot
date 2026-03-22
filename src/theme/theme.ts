export type ThemeMode = 'light' | 'dark' | 'system';

export type ColorTheme = 'default' | 'cherry' | 'ocean' | 'nature' | 'fresh' | 'sunset' | 'lavender';

const THEME_KEY = 'gopilot.appearance.theme';
const COLOR_THEME_KEY = 'gopilot.appearance.colorTheme';

const COLOR_THEME_CLASSES: ColorTheme[] = ['cherry', 'ocean', 'nature', 'fresh', 'sunset', 'lavender', 'default'];

let mediaQueryList: MediaQueryList | null = null;
let mediaListener: ((e: MediaQueryListEvent) => void) | null = null;

function systemPrefersDark() {
  if (typeof window === 'undefined') return false;
  if (!window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyDarkClass(isDark: boolean) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (isDark) root.classList.add('dark');
  else root.classList.remove('dark');
}

function applyColorThemeClass(theme: ColorTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const t of COLOR_THEME_CLASSES) {
    if (t === 'default') continue;
    root.classList.remove(t);
  }
  if (theme !== 'default') {
    root.classList.add(theme);
  }
}

function detachSystemListener() {
  if (!mediaQueryList || !mediaListener) return;
  try {
    mediaQueryList.removeEventListener('change', mediaListener);
  } catch {
    try {
      mediaQueryList.removeListener(mediaListener);
    } catch {
      return;
    }
  } finally {
    mediaQueryList = null;
    mediaListener = null;
  }
}

function attachSystemListener() {
  detachSystemListener();
  if (typeof window === 'undefined' || !window.matchMedia) return;
  mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
  mediaListener = () => {
    applyDarkClass(systemPrefersDark());
  };
  try {
    mediaQueryList.addEventListener('change', mediaListener);
  } catch {
    try {
      mediaQueryList.addListener(mediaListener);
    } catch {
      return;
    }
  }
}

export function getStoredThemeMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    return 'system';
  }
  return 'system';
}

export function getStoredColorTheme(): ColorTheme {
  try {
    const raw = localStorage.getItem(COLOR_THEME_KEY);
    if (
      raw === 'default' ||
      raw === 'cherry' ||
      raw === 'ocean' ||
      raw === 'nature' ||
      raw === 'fresh' ||
      raw === 'sunset' ||
      raw === 'lavender'
    ) {
      return raw;
    }
  } catch {
    return 'default';
  }
  return 'default';
}

export function setStoredThemeMode(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    return;
  }
}

export function setStoredColorTheme(theme: ColorTheme) {
  try {
    localStorage.setItem(COLOR_THEME_KEY, theme);
  } catch {
    return;
  }
}

export function applyThemeMode(mode: ThemeMode) {
  if (mode === 'dark') {
    detachSystemListener();
    applyDarkClass(true);
    return;
  }
  if (mode === 'light') {
    detachSystemListener();
    applyDarkClass(false);
    return;
  }

  applyDarkClass(systemPrefersDark());
  attachSystemListener();
}

export function applyColorTheme(theme: ColorTheme) {
  applyColorThemeClass(theme);
}

export function initTheme() {
  const mode = getStoredThemeMode();
  applyThemeMode(mode);
  const colorTheme = getStoredColorTheme();
  applyColorTheme(colorTheme);
  return { mode, colorTheme };
}
