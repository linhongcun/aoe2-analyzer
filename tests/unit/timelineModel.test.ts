import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import { simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { buildView, parseQuery, rangeText, summaryText } from '../../src/features/builds/timelineModel';

const ups = Object.fromEntries((units as { id: number; up?: unknown }[]).filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const sim = (id: string, civ: string, autoHouses = true) =>
  simulateBuild(
    buildOrders.find((b) => b.id === id)!,
    civ,
    eco as unknown as EcoData,
    ups,
    { autoHouses },
  );

describe('timelineModel', () => {
  it('每个开局都能生成视图，资源行村民数与 buildSim 快照一致', () => {
    for (const bo of buildOrders) {
      const tl = sim(bo.id, 'Britons');
      const v = buildView(tl, (x) => x);
      expect(v.rows.tc.length).toBeGreaterThan(0);
      for (const s of v.rows.food) expect(Number(s.label)).toBe(tl.steps[s.step!]!.villagers.food);
      expect(v.ages.map((a) => a.reachAt)).toEqual(tl.ageUps.map((a) => a.reachAt));
    }
  });
  it('超时前已卡人口：主要卡点是卡人口（第 13 步），不是超时；轴不拉到 60 分钟', () => {
    const v = buildView(sim('scouts-18', 'Britons', false), (x) => x);
    expect(v.top!.type).toBe('pop_block');
    expect(v.top!.step).toBe(12);
    expect(v.timeout).toBe(false);
    expect(v.end).toBeLessThan(3600);
    expect(summaryText(v.top, '封建', v.tOut)).toEqual({ main: expect.stringMatching(/^卡人口 约 \d+:\d\d/), sub: '第 13 步' });
  });
  it('超时文案按目标时代写', () => {
    const b = { type: 'timeout' as const, from: 3600, to: 3600, sec: 0, label: '', reasonZh: '', step: 4 };
    expect(summaryText(b, '封建').main).toBe('60 分钟内到不了封建');
    expect(summaryText(b, '城堡').main).toBe('60 分钟内到不了城堡');
    expect(summaryText(null, '封建').main).toBe('没有卡点');
  });
  it('误差带两端相同不显示区间', () => {
    expect(rangeText(554, { early: 0, late: 0 })).toBeNull();
    expect(rangeText(554, { early: 0, late: 25 })).toBe('9:14–9:39');
  });
  it('卡点标签形如「卡人口 · 约 N 秒」', () => {
    const v = buildView(sim('archers-19', 'Britons', false), (x) => x);
    expect(v.bottlenecks.find((b) => b.type === 'pop_block')!.label).toMatch(/^卡人口 · 约 \d+ 秒$/);
    expect(v.top!.type).toBe('idle_tc');
  });
  it('URL 非法值回退默认', () => {
    const q = parseQuery(new URLSearchParams('bo=x&civ=y&dist=99&house=2&step=a'), ['scouts-18'], ['Britons']);
    expect(q).toEqual({ bo: null, civ: '', dist: 4, house: true, step: null, variant: null });
    const ok = parseQuery(new URLSearchParams('bo=scouts-18&civ=Generic&step=99&var=aggr'), ['scouts-18'], ['Britons'], () => 13);
    expect(ok).toMatchObject({ civ: '', step: null, variant: 'aggr' });
    expect(parseQuery(new URLSearchParams('bo=scouts-18'), ['scouts-18'], ['Britons']).civ).toBe('');
    expect(parseQuery(new URLSearchParams('bo=scouts-18&civ=Britons'), ['scouts-18'], ['Britons']).civ).toBe('Britons');
  });
});
