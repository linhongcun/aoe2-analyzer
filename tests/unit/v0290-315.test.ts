/**
 * v0.29.0 验收（#329）B 组 #315 部分：取自 Kent Beck test/v0290-acceptance @ 66530fc tests/unit/v0290-B.test.ts，断言原样未改。
 */
import { describe, expect, it } from 'vitest';
import { suggestRoutes } from '../../src/domain/routeSuggestions';
import { ALL } from '../../src/shared/nav/sections';

// ---------- #315 ----------
// 与 NotFound.tsx 一致：已登记入口 + 关于数据。别名若登记在 sections 的条目上，会随条目一起传入。
const destinations = [...ALL, { path: '/about-data', label: '关于数据' }];
const first = (path: string) => suggestRoutes(path, destinations)[0]?.path;
describe('#315 404 页「你是不是要找」容错', () => {
  it.each([
    ['/glossery', '/glossary'],
    ['/glosary', '/glossary'],
    ['/buildorder', '/builds'],
    ['/build-orders', '/builds'],
    ['/tradeincome', '/trade-income'],
  ])('%s 第 1 条建议是 %s', (input, want) => {
    expect(first(input)).toBe(want);
  });
  it('最多 3 条，且都是已登记入口', () => {
    for (const input of ['/glossery', '/buildorder', '/tradeincome', '/team']) {
      const got = suggestRoutes(input, destinations);
      expect(got.length).toBeLessThanOrEqual(3);
      got.forEach((r) => expect(destinations.map((d) => d.path)).toContain(r.path));
    }
  });
  it('守卫：#/hotkey 到 快捷键速查，#/civ 到 文明 排第 1', () => {
    expect(first('/hotkey')).toBe('/hotkeys');
    expect(first('/civ')).toBe('/civs');
  });
  it('反例：很短的乱写路径 #/ab、明显无关的 #/this-page-does-not-exist-xyz 不出建议', () => {
    expect(suggestRoutes('/ab', destinations)).toEqual([]);
    expect(suggestRoutes('/this-page-does-not-exist-xyz', destinations)).toEqual([]);
  });
});
