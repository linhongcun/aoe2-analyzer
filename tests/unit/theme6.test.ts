import { describe, expect, it } from 'vitest';
import { parseThemePreference, resolveTheme } from '../../src/app/theme/theme';

describe('#6 本机主题偏好', () => {
  it('初次访问及失效的历史值均回到用户选定的浅色', () => {
    for (const stored of [null, '', 'unknown', 'Dark', '{"theme":"dark"}']) expect(parseThemePreference(stored)).toBe('light');
  });

  it('识别已有选择，不用系统偏好覆盖用户明确选择的主题', () => {
    for (const preference of ['light', 'dark'] as const) {
      expect(parseThemePreference(preference)).toBe(preference);
      expect(resolveTheme(preference, false)).toBe(preference);
      expect(resolveTheme(preference, true)).toBe(preference);
    }
  });

  it('只有主动选择跟随系统时才使用当前系统配色', () => {
    const preference = parseThemePreference('system');
    expect(resolveTheme(preference, false)).toBe('light');
    expect(resolveTheme(preference, true)).toBe('dark');
  });
});
