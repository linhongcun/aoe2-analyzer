import { describe, expect, it } from 'vitest';
import { isApplePlatform, searchShortcutLabel } from '../../src/domain/platform';

describe('平台检测与全局搜索快捷键提示（Issue 1282）', () => {
  it('优先按 userAgentData.platform 判断，不被 userAgent 误导', () => {
    expect(isApplePlatform({ userAgentDataPlatform: 'macOS', platform: 'Win32' })).toBe(true);
    expect(searchShortcutLabel({ userAgentDataPlatform: 'macOS' })).toBe('⌘ K');
    expect(isApplePlatform({ userAgentDataPlatform: 'iOS' })).toBe(true);
    expect(isApplePlatform({ userAgentDataPlatform: 'Windows', userAgent: 'Mozilla/5.0 (Macintosh)' })).toBe(false);
    expect(searchShortcutLabel({ userAgentDataPlatform: 'Linux', platform: 'MacIntel' })).toBe('Ctrl K');
  });

  it('userAgentData 缺省时回退到 platform 与 userAgent', () => {
    expect(isApplePlatform({ platform: 'MacIntel' })).toBe(true);
    expect(isApplePlatform({ platform: 'iPad' })).toBe(true);
    expect(isApplePlatform({ platform: 'Win32' })).toBe(false);
    expect(isApplePlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)' })).toBe(true);
    expect(isApplePlatform({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })).toBe(false);
  });

  it('非浏览器或空信息时默认回退 Ctrl K', () => {
    expect(isApplePlatform({})).toBe(false);
    expect(searchShortcutLabel({})).toBe('Ctrl K');
    expect(searchShortcutLabel()).toBe('Ctrl K');
  });
});
