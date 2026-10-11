import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import { simulateBuild, type Anomaly, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import {
  bottleneckLabel,
  buildView,
  parseQuery,
  pickReason,
  prereqDetail,
  rowSegments,
  segLabel,
  rangeText,
  rowTime,
  summaryText,
} from '../../src/features/builds/timelineModel';

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
  it('卡点标签形如「卡人口 · 约 m:ss」，摘要卡人口优先', () => {
    const v = buildView(sim('archers-19', 'Britons', false), (x) => x);
    expect(v.bottlenecks.find((b) => b.type === 'pop_block')!.label).toMatch(/^卡人口 · 约 \d+:\d{2}$/);
    expect(v.top!.type).toBe('pop_block');
  });
  it('URL 非法值回退默认', () => {
    const q = parseQuery(new URLSearchParams('bo=x&civ=y&dist=99&house=2&step=a'), ['scouts-18'], ['Britons']);
    expect(q).toEqual({ bo: null, civ: '', dist: 4, house: true, step: null, variant: null });
    const ok = parseQuery(new URLSearchParams('bo=scouts-18&civ=Generic&step=99&var=aggr'), ['scouts-18'], ['Britons'], () => 13);
    expect(ok).toMatchObject({ civ: '', step: null, variant: 'aggr' });
    const P = (s: string) => parseQuery(new URLSearchParams(`bo=scouts-18&step=${s}`), ['scouts-18'], [], () => 13).step;
    expect(P('1')).toBe(0); // 1 起 → 下标 0
    expect(P('13')).toBe(12);
    expect(P('14')).toBeNull();
    expect(P('0')).toBeNull();
    expect(P('-1')).toBeNull();
    expect(P('x')).toBeNull();
    expect(parseQuery(new URLSearchParams('bo=scouts-18'), ['scouts-18'], ['Britons']).civ).toBe('');
    expect(parseQuery(new URLSearchParams('bo=scouts-18&civ=Britons'), ['scouts-18'], ['Britons']).civ).toBe('Britons');
  });
});

describe('pickReason（摘要与步骤行共用的原因优先级）', () => {
  const a = (type: Anomaly['type'], from: number, to: number) => ({ type, from, to, reasonZh: '' }) as Anomaly;
  it('卡人口 > 超时 > 其他，只返回一条', () => {
    expect(pickReason([a('timeout', 3600, 3600), a('idle_tc', 0, 50), a('pop_block', 658, 3600)])?.type).toBe('pop_block');
    expect(pickReason([a('resource_short', 0, 99), a('timeout', 3600, 3600), a('idle_tc', 0, 50)])?.type).toBe('timeout');
  });
  it('卡人口 > 等前置建筑 > 其他（#3）', () => {
    expect(pickReason([a('prereq_wait', 0, 40), a('pop_block', 0, 5)])?.type).toBe('pop_block');
    expect(pickReason([a('resource_short', 0, 300), a('timeout', 3600, 3600), a('idle_tc', 0, 200), a('prereq_wait', 0, 4)])?.type).toBe('prereq_wait');
    expect(bottleneckLabel(a('prereq_wait', 830, 870))).toBe('等前置建筑 · 约 0:40');
    expect(bottleneckLabel(a('tc_busy', 581, 600))).toBe('等城镇中心（在造村民） · 约 0:19');
    expect(pickReason([a('tc_busy', 0, 100), a('resource_short', 0, 5)])?.type).toBe('resource_short');
    expect(prereqDetail({ age: 3, need: 2, missing: ['铁匠铺'] })).toBe('升城堡需先建完 2 座封建建筑（还差：铁匠铺）');
    expect(rowTime({ startAt: 380, researchAt: 441 })).toBe(441);
    expect(rowTime({ startAt: 380 })).toBe(380);
  });
  it('同级取等待更久的；空列表返回 null', () => {
    expect(pickReason([a('idle_tc', 0, 10), a('idle_tc', 20, 60)])?.from).toBe(20);
    expect(pickReason([])).toBeNull();
  });
  it('时长用 m:ss，不出现「秒」原始值', () => {
    expect(bottleneckLabel(a('pop_block', 100, 225))).toBe('卡人口 · 约 2:05');
  });
});

describe('rowSegments（#51 多段卡点）', () => {
  const a = (type: Anomaly['type'], from: number, to: number) => ({ type, from, to, waitSec: to - from, reasonZh: '' }) as Anomaly;
  it('前后接续的各成一段，按时间先后；时长取段长', () => {
    const segs = rowSegments([a('tc_busy', 581.3, 600.6), a('resource_short', 525.7, 581.3)], { from: 525.7, to: 600.6 });
    expect(segs.map((x) => x.a.type)).toEqual(['resource_short', 'tc_busy']);
    expect(segLabel(segs[1]!)).toBe('等城镇中心（在造村民） · 约 0:19');
  });
  it('重叠的只留优先级最高的；零长度超时贴着卡人口时并入', () => {
    expect(rowSegments([a('idle_tc', 0, 50), a('resource_short', 1, 50)]).map((x) => x.a.type)).toEqual(['idle_tc']);
    expect(rowSegments([a('pop_block', 658, 3600), a('timeout', 3600, 3600)]).map((x) => x.a.type)).toEqual(['pop_block']);
  });
  it('裁剪到步骤开始至开始研究', () => {
    const [x] = rowSegments([a('prereq_wait', 100, 300)], { from: 150, to: 200 });
    expect([x!.start, x!.end]).toEqual([150, 200]);
  });
});
