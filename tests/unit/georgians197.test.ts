import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import type { BuildOrder } from '../../src/domain/buildOrder';
import { ageReqOk, simSupport, simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';

const E = eco as unknown as EcoData;
const ups = Object.fromEntries(units.filter((unit) => unit.up).map((unit) => [unit.id, unit.up])) as UpgradeData;
const seed = (steps: BuildOrder['steps']): BuildOrder => ({
  ...buildOrders[0]!,
  id: 'georgians-source-probe',
  target: { age: 2, vils: Math.max(...steps.map((step) => step.vils)) },
  steps,
});
const run = (order: BuildOrder, data = E, civ = 'Georgians') => simulateBuild(order, civ, data, ups, { autoHouses: false });
const without = (...ids: number[]): EcoData => ({
  ...E,
  civEco: { ...E.civEco, Georgians: E.civEco.Georgians!.filter((row) => !ids.includes(row.tech ?? -1)) },
});
const camp = (building: number, count = 1, builders = 1) =>
  seed([
    {
      vils: 3,
      actions: [
        { type: 'gather', task: 'build', count: builders },
        ...(builders < 3 ? [{ type: 'gather' as const, task: 'wood' as const, count: 3 - builders }] : []),
        { type: 'build', building, count },
      ],
    },
    { vils: 3, actions: [] },
  ]);
const fastAge = (data = E, removeRequirements = true): EcoData => {
  const out = structuredClone(data);
  if (removeRequirements) out.ageReq = undefined;
  for (const tech of [101, 102, 103]) out.techs[tech] = { ...out.techs[tech]!, cost: {}, researchTime: 10 };
  return out;
};
const research = (tech: number, building?: number, age: 2 | 3 = 2) =>
  seed([
    {
      vils: 3,
      actions: [
        { type: 'gather', task: 'build', count: 1 },
        { type: 'gather', task: 'sheep', count: 2 },
        ...(building ? [{ type: 'build' as const, building }] : []),
        { type: 'ageUp', age: 2 },
        ...(age === 3 ? [{ type: 'ageUp' as const, age: 3 as const }] : []),
      ],
    },
    { vils: 3, phase: age === 3 ? 'castle' : 'feudal', actions: [{ type: 'research', tech }] },
    { vils: 3, actions: [] },
  ]);

describe('#197 格鲁吉亚起始免费骡车与显式付费骡车', () => {
  it('当前八套格鲁吉亚受支持', () => {
    expect(simSupport(E, 'Georgians', buildOrders)).toEqual({ supported: true, reasons: [] });
  });

  it('起始免费车是真实at0完成建筑，正常三村、库存和人口不变', () => {
    const timeline = run(seed([{ vils: 3, actions: [] }]));
    expect(timeline.buildingsDone).toEqual([{ building: 1808, at: 0 }]);
    expect(timeline.steps[0]!.stock).toEqual({ food: 200, wood: 200, gold: 100, stone: 200 });
    expect(timeline.steps[0]!.pop).toEqual({ used: 4, cap: 5 });
    expect(timeline.steps[0]!.villagers).toEqual({ food: 0, wood: 0, gold: 0, stone: 0, build: 0, idle: 3 });
    expect(timeline.steps[0]!.cost).toBeUndefined();
    expect(timeline.bonusVillagerEvents).toBeUndefined();
    expect(timeline.villagerEvents).toEqual([]);
  });

  it.each([562, 584])('原营地%s仍付80木20食物建新车，不能抵消起始车', (building) => {
    const timeline = run(camp(building));
    expect(timeline.steps[0]!.entity).toEqual({ kind: 'building', id: '1808' });
    expect(timeline.steps[0]!.cost).toEqual({ food: 20, wood: 80, gold: 0, stone: 0 });
    expect(timeline.buildingsDone.map((done) => done.building)).toEqual([1808, 1808]);
    expect(timeline.buildingsDone[0]!.at).toBe(0);
    expect(timeline.buildingsDone[1]!.at - timeline.steps[0]!.startAt).toBeGreaterThanOrEqual(24.9 - 1e-8);
    expect(timeline.buildingsDone[1]!.at - timeline.steps[0]!.startAt).toBeLessThanOrEqual(25.1);
    expect(timeline.steps[0]!.pop).toEqual({ used: 4, cap: 5 });
  });

  it('两个显式动作对应两辆新付费车，不能自动复用免费车', () => {
    const timeline = run(camp(562, 2));
    expect(timeline.steps[0]!.cost).toEqual({ food: 40, wood: 160, gold: 0, stone: 0 });
    expect(timeline.buildingsDone.map((done) => done.building)).toEqual([1808, 1808, 1808]);
    expect(timeline.buildingsDone.filter((done) => done.at === 0)).toHaveLength(1);
  });

  it.each([1, 2, 3])('%s村施工继承25秒及既有衰减公式，免费车不参加施工', (builders) => {
    const timeline = run(camp(584, 1, builders));
    expect(timeline.anomalies.filter((anomaly) => anomaly.type === 'timeout')).toEqual([]);
    const paid = timeline.buildingsDone.find((done) => done.at > 0)!;
    expect(paid.building).toBe(1808);
    expect(paid.at).toBeGreaterThanOrEqual(75 / (builders + 2) - 0.1 - 1e-8);
    expect(paid.at).toBeLessThanOrEqual(75 / (builders + 2) + 0.1);
  });

  it('原317移除925只取消免费起始车，付费替换和25秒仍生效', () => {
    const data = without(925);
    expect(simSupport(data, 'Georgians', buildOrders)).toEqual({ supported: true, reasons: [] });
    const timeline = run(camp(562), data);
    expect(timeline.steps[0]!.entity).toEqual({ kind: 'building', id: '1808' });
    expect(timeline.steps[0]!.cost).toEqual({ food: 20, wood: 80, gold: 0, stone: 0 });
    expect(timeline.buildingsDone).toHaveLength(1);
    expect(timeline.buildingsDone[0]!.building).toBe(1808);
    expect(timeline.buildingsDone[0]!.at).toBeGreaterThanOrEqual(24.9 - 1e-8);
    expect(timeline.buildingsDone[0]!.at).toBeLessThanOrEqual(25.1);
  });

  it('原317移除934只移除Church来源，免费和付费车均保持', () => {
    const timeline = run(camp(584), without(934));
    expect(timeline.buildingsDone.map((done) => done.building)).toEqual([1808, 1808]);
    expect(timeline.steps[0]!.cost).toEqual({ food: 20, wood: 80, gold: 0, stone: 0 });
  });

  it('免费起始车从起点就是双刃斧研究地点，不必等原营地动作', () => {
    const timeline = run(research(202), fastAge());
    expect(timeline.anomalies.filter((anomaly) => anomaly.type === 'timeout')).toEqual([]);
    expect(timeline.buildingsDone).toEqual([{ building: 1808, at: 0 }]);
    expect(timeline.steps[1]!.researchAt).toBeGreaterThanOrEqual(timeline.ageUps[0]!.reachAt);
    expect(timeline.steps[1]!.researchAt! - timeline.ageUps[0]!.reachAt).toBeLessThanOrEqual(0.1 + 1e-8);
    expect(timeline.steps[1]!.doneAt - timeline.steps[1]!.researchAt!).toBeGreaterThanOrEqual(E.techs[202]!.researchTime - 0.1 - 1e-8);
    expect(timeline.steps[1]!.doneAt - timeline.steps[1]!.researchAt!).toBeLessThanOrEqual(E.techs[202]!.researchTime + 0.1);
    expect(timeline.anomalies.some((anomaly) => anomaly.researchSite === '骡车')).toBe(false);
  });

  it('移除925后没有车必须等研究地点，不能仅到封建便研究', () => {
    const timeline = run(research(202), fastAge(without(925)));
    expect(timeline.buildingsDone).toEqual([]);
    expect(timeline.anomalies.some((anomaly) => anomaly.type === 'timeout')).toBe(true);
    expect(timeline.steps[1]!.researchAt).toBeUndefined();
  });

  it('移除925后付费车完成才允许双刃斧付款和研究', () => {
    const timeline = run(research(202, 562), fastAge(without(925)));
    expect(timeline.anomalies.filter((anomaly) => anomaly.type === 'timeout')).toEqual([]);
    const cart = timeline.buildingsDone.find((done) => done.building === 1808)!;
    expect(cart).toBeDefined();
    expect(timeline.steps[1]!.startAt).toBeLessThan(cart.at);
    expect(timeline.steps[1]!.researchAt).toBeGreaterThanOrEqual(cart.at);
    expect(timeline.anomalies.some((anomaly) => anomaly.type === 'prereq_wait' && anomaly.researchSite === '骡车')).toBe(true);
  });

  it('起始车与磨坊满足两种时代建筑；移除925后同一计划不能升时代', () => {
    const order = seed([
      {
        vils: 3,
        actions: [
          { type: 'gather', task: 'build', count: 1 },
          { type: 'gather', task: 'sheep', count: 2 },
          { type: 'build', building: 68 },
          { type: 'ageUp', age: 2 },
        ],
      },
      { vils: 3, phase: 'feudal', actions: [] },
    ]);
    const actual = run(order, fastAge(E, false));
    const absent = run(order, fastAge(without(925), false));
    expect(actual.ageUps).toHaveLength(1);
    expect(actual.anomalies.filter((anomaly) => anomaly.type === 'timeout')).toEqual([]);
    expect(actual.ageUps[0]!.clickAt).toBeGreaterThanOrEqual(actual.buildingsDone.find((done) => done.building === 68)!.at);
    expect(absent.ageUps).toEqual([]);
    expect(absent.anomalies.some((anomaly) => anomaly.type === 'timeout')).toBe(true);
  });

  it('免费加两辆付费仍只算一种，不能当伐木和采矿两种', () => {
    const built = new Map([
      [109, 1],
      [1808, 3],
    ]);
    expect(ageReqOk(E.ageReq!['2']!.req, built, 'Georgians')).toBe(false);
    built.set(68, 1);
    expect(ageReqOk(E.ageReq!['2']!.req, built, 'Georgians')).toBe(true);
  });

  it('普通Generic与亚美尼亚保持各自实体和费用行为', () => {
    const order = camp(562);
    expect(run(order, E, 'Generic').buildingsDone.map((done) => done.building)).toEqual([562]);
    const armenian = run(order, E, 'Armenians');
    expect(armenian.steps[0]!.cost).toEqual({ food: 15, wood: 60, gold: 0, stone: 0 });
    expect(armenian.buildingsDone.map((done) => done.building)).toEqual([1808]);
  });

  it('实际研究202后保留标准木材收益，不误套亚美尼亚研究增强', () => {
    const order = seed([
      {
        vils: 3,
        actions: [
          { type: 'gather', task: 'wood', count: 3 },
          { type: 'ageUp', age: 2 },
        ],
      },
      { vils: 3, phase: 'feudal', actions: [{ type: 'research', tech: 202 }] },
      { vils: 3, phase: 'feudal', actions: [{ type: 'ageUp', age: 3 }] },
      { vils: 3, phase: 'castle', actions: [] },
    ]);
    const data = fastAge();
    data.techs[102]!.researchTime = 80;
    const noStandardEffect = structuredClone(data);
    noStandardEffect.ecoTechs[202]!.effects = [];
    const actual = run(order, data);
    const standard = run(order, data, 'Generic');
    const unresearchedRate = run(order, noStandardEffect, 'Generic');
    for (const timeline of [actual, standard, unresearchedRate]) {
      expect(timeline.anomalies.filter((anomaly) => anomaly.type === 'timeout')).toEqual([]);
      expect(timeline.steps[3]!.startAt).toBeGreaterThan(timeline.steps[1]!.doneAt + E.villager.trainTime);
      expect(timeline.steps[3]!.villagers.wood).toBe(3);
      expect(timeline.steps[1]!.doneAt - timeline.steps[1]!.researchAt!).toBeGreaterThanOrEqual(E.techs[202]!.researchTime - 0.1 - 1e-8);
      expect(timeline.villagerEvents).toEqual([]);
    }
    expect(actual.steps.map((step) => [step.startAt, step.doneAt, step.stock, step.villagers, step.pop])).toEqual(
      standard.steps.map((step) => [step.startAt, step.doneAt, step.stock, step.villagers, step.pop]),
    );
    expect(actual.steps[3]!.stock.wood).toBeGreaterThan(unresearchedRate.steps[3]!.stock.wood);
  });
});
