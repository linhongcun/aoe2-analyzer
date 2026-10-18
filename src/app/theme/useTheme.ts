import { useEffect, useState } from 'react';
import { parseThemePreference, resolveTheme, THEME_STORAGE_KEY, type ThemePreference } from './theme';

function storedPreference(): ThemePreference {
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'light';
  }
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(storedPreference);
  useEffect(() => {
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(preference, system.matches);
      document.documentElement.dataset.themePreference = preference;
    };
    const storage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) setPreference(parseThemePreference(event.newValue));
    };
    apply();
    system.addEventListener('change', apply);
    window.addEventListener('storage', storage);
    return () => {
      system.removeEventListener('change', apply);
      window.removeEventListener('storage', storage);
    };
  }, [preference]);

  const select = (next: ThemePreference) => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // 禁用本地存储时，本次浏览仍可切换外观。
    }
    setPreference(next);
  };
  return { preference, select };
}
