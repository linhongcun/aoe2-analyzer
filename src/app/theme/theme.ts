/** 外观是本机偏好，不参与路由与分享链接。 */
export const THEME_STORAGE_KEY = 'aoe2-theme';
export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export function parseThemePreference(value: string | null): ThemePreference {
  return value === 'dark' || value === 'system' ? value : 'light';
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}
