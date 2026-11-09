import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('#817 不支持原因投影', () => {
  it('当前支持文明没有原因，回退通用句', async () => {
    const mod = await import('../../src/domain/simSupport');
    expect(mod.simSupport('Generic')).toBe(true);
    expect(mod.simSupportReasons('Generic')).toEqual([]);
    expect(mod.simSupportSummary('Generic')).toEqual([]);
    expect(mod.simSupportNote('Generic')).toBe('文明加成尚未计入');
    expect(mod.simSupportTitle('Generic')).toBeUndefined();
    expect(mod.simSupportWarning('Generic', '通用')).toBe('链接里的通用加成尚未计入，已按通用计算。');
    const leak = mod.simSupportReasons('Generic');
    leak.push('mutated');
    expect(mod.simSupportReasons('Generic')).toEqual([]);
    expect(mod.supportWarningText(['a'], '高棉')).toBe('链接里的高棉：a，已按通用计算。');
    expect(mod.supportWarningText(['a', 'b'], '高棉')).toBe('链接里的高棉：a；b，已按通用计算。');
    expect(mod.supportWarningText(['a', 'b', 'c'], '高棉')).toBe('链接里的高棉：a；b；等 3 条，已按通用计算。');
  });

  it('测试构建强制不支持时给出具体原因，并截断警告', async () => {
    vi.stubEnv('VITE_FORCE_UNSUPPORTED_CIVS', 'Khmer');
    vi.resetModules();
    const mod = await import('../../src/domain/simSupport');
    expect(mod.simSupport('Khmer')).toBe(false);
    expect(mod.simSupportReasons('Khmer')).toEqual(['测试构建：该文明被强制标记为不支持']);
    expect(mod.simSupportNote('Khmer')).toBe('测试构建：该文明被强制标记为不支持');
    expect(mod.simSupportTitle('Khmer')).toBe('测试构建：该文明被强制标记为不支持');
    expect(mod.simSupportWarning('Khmer', '高棉')).toBe('链接里的高棉：测试构建：该文明被强制标记为不支持，已按通用计算。');
  });
});
