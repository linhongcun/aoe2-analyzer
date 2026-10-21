/**
 * v0.29.0 验收（#329）A 组 #312 部分：取自 Kent Beck test/v0290-acceptance @ 2b917c0 tests/unit/v0290-A.test.ts，断言原样未改。
 */
import { describe, expect, it } from 'vitest';
import scouting from '../../src/content/scouting.json';

// ---------- #312 ----------
// 公开来源：https://aoecoach.com/en/resources/buildings/town-center/ 「Castle Age Boom: Upon reaching Castle Age, immediately build 2-3 additional Town Centers」
// もち（https://note.com/aoe2_moti/n/ne0367d003ef2）只讲黑暗到封建时代侦察，未讲城镇中心。
describe('#312 侦察辨析：新增城镇中心的来源', () => {
  const walled = scouting.scenarios.find((s) => s.id === 'walled')!;
  const signal = (id: string) => walled.signals.find((s) => s.id === id)!;
  it('extra-tc 只保留 AoE2 Coach 城镇中心页，不再标「本站整理」', () => {
    expect(signal('extra-tc').sourceIds).toEqual(['aoecoach-town-center']);
    expect(signal('extra-tc').editorial ?? false).toBe(false);
  });
  it('AoE2 Coach 来源是公开页面', () => {
    expect(scouting.sources.find((s) => s.id === 'aoecoach-town-center')!.url).toBe('https://aoecoach.com/en/resources/buildings/town-center/');
  });
  it('守卫：forward-building、forward-units 仍为「本站整理」', () => {
    expect(signal('forward-building').editorial).toBe(true);
    expect(signal('forward-units').editorial).toBe(true);
  });
});
