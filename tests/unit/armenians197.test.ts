import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import type { BuildOrder, Task } from '../../src/domain/buildOrder';
import { simSupport, simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';

const E = eco as unknown as EcoData;
const ups = Object.fromEntries(units.filter((unit) => unit.up).map((unit) => [unit.id, unit.up])) as UpgradeData;
const ENHANCEMENTS = [960, 961, 962, 963, 964, 965, 966];
const without = (...ids: number[]): EcoData => ({
  ...E,
  civEco: { ...E.civEco, Armenians: E.civEco.Armenians!.filter((row) => !ids.includes(row.tech ?? -1)) },
});
const seed = (steps: BuildOrder['steps']): BuildOrder => ({
  id: 'armenians-source-probe',
  name: { zh: '亚美尼亚机制核对', en: 'Armenian source probe' },
  style: 'other',
  civs: [],
  map: 'test',
  difficulty: 'beginner',
  target: { age: 2, vils: Math.max(...steps.map((step) => step.vils)) },
  summary: 'test',
  sources: [],
  license: 'test',
  review: { status: 'draft' },
  steps,
});
const run = (order: BuildOrder, data = E, civ = 'Armenians') => simulateBuild(order, civ, data, ups, { autoHouses: false });
const camp = (building: number, count = 1, builders = 1) =>
  seed([
    {
      vils: 3,
      actions: [
        { type: 'gather', task: 'build', count: builders },
        { type: 'gather', task: 'wood', count: 3 - builders },
        { type: 'build', building, count },
      ],
      note: building === 562 ? '建伐木场。' : '建金矿营地。',
    },
    { vils: 3, actions: [] },
  ]);
const ageData = (data: EcoData): EcoData => {
  const out = structuredClone(data);
  out.ageReq = undefined;
  for (const tech of [101, 102, 103]) out.techs[tech] = { ...out.techs[tech]!, cost: {}, researchTime: 10 };
  return out;
};
const ageOnly = (task: Task, age: 2 | 3 | 4): BuildOrder => ({
  ...seed([
    {
      vils: 3,
      actions: [
        { type: 'gather', task, count: 3 },
        ...([2, 3, 4] as const).filter((next) => next <= age).map((next) => ({ type: 'ageUp' as const, age: next })),
        { type: 'research', tech: 22 },
      ],
    },
    { vils: 4, phase: ({ 2: 'feudal', 3: 'castle', 4: 'imperial' } as const)[age], actions: [{ type: 'gather', task, count: 1 }] },
  ]),
  target: { age, vils: 4 },
});
const paidResearch = (tech: 14 | 202): BuildOrder =>
  seed([
    {
      vils: 3,
      actions: [
        { type: 'gather', task: 'build', count: 1 },
        { type: 'gather', task: 'sheep', count: 2 },
        { type: 'build', building: 70 },
        { type: 'build', building: tech === 14 ? 68 : 562 },
        { type: 'ageUp', age: 2 },
      ],
    },
    { vils: 3, phase: 'feudal', actions: [{ type: 'research', tech }] },
    { vils: 4, actions: [{ type: 'gather', task: 'wood', count: 1 }] },
    { vils: 8, actions: [{ type: 'gather', task: 'wood', count: 4 }] },
  ]);

describe('#197 亚美尼亚付费骡车、实际研究与来源隔离', () => {
  it('当前八套支持亚美尼亚，仍保持三村正常起点', () => {
    expect(simSupport(E, 'Armenians', buildOrders)).toEqual({ supported: true, reasons: [] });
    const timeline = run(camp(562));
    expect(timeline.steps[0]!.pop).toEqual({ used: 4, cap: 5 });
    expect(timeline.steps[0]!.stock).toEqual({ food: 200, wood: 200, gold: 100, stone: 200 });
    expect(timeline.bonusVillagerEvents).toBeUndefined();
  });

  it('现有骡车原值保留80木20食物25秒，未伪造新全局单位', () => {
    expect(E.buildings[1808]).toMatchObject({ buildTime: 25, class: 3, cost: { Wood: 80, Food: 20 } });
    expect(E.units[1808]).toBeUndefined();
  });

  it.each([562, 584])('原建筑%s以实际1808实体、60木15食物和完成记录运行', (building) => {
    const timeline = run(camp(building));
    expect(timeline.steps[0]!.entity).toEqual({ kind: 'building', id: '1808' });
    expect(timeline.steps[0]!.cost).toEqual({ food: 15, wood: 60, gold: 0, stone: 0 });
    expect(timeline.buildingsDone.map((done) => done.building)).toEqual([1808]);
    const elapsed = timeline.buildingsDone[0]!.at - timeline.steps[0]!.startAt;
    expect(elapsed).toBeGreaterThanOrEqual(E.buildings[1808]!.buildTime - 0.1);
    expect(elapsed).toBeLessThanOrEqual(E.buildings[1808]!.buildTime + 0.1);
  });

  it('每个显式建造都付费；两辆骡车不自动合并为一辆', () => {
    const timeline = run(camp(562, 2));
    expect(timeline.steps[0]!.cost).toEqual({ food: 30, wood: 120, gold: 0, stone: 0 });
    expect(timeline.buildingsDone.map((done) => done.building)).toEqual([1808, 1808]);
  });

  it('原317移除958只移除折扣，仍为80木20食物的骡车', () => {
    const timeline = run(camp(562), without(958));
    expect(timeline.steps[0]!.entity).toEqual({ kind: 'building', id: '1808' });
    expect(timeline.steps[0]!.cost).toEqual({ food: 20, wood: 80, gold: 0, stone: 0 });
    expect(timeline.buildingsDone.map((done) => done.building)).toEqual([1808]);
  });

  it('原317同时移除两条圣物科技，不影响付费骡车', () => {
    const timeline = run(camp(584), without(949, 957));
    expect(timeline.steps[0]!.entity).toEqual({ kind: 'building', id: '1808' });
    expect(timeline.steps[0]!.cost).toEqual({ food: 15, wood: 60, gold: 0, stone: 0 });
  });

  it('未研究整组经济科技增强时仍可独立模拟骡车', () => {
    expect(simSupport(without(...ENHANCEMENTS), 'Armenians', buildOrders)).toEqual({ supported: true, reasons: [] });
    expect(run(camp(562), without(...ENHANCEMENTS)).steps[0]!.cost).toEqual({ food: 15, wood: 60, gold: 0, stone: 0 });
  });

  it.each([
    ['wood', 2],
    ['wood', 3],
    ['wood', 4],
    ['gold', 2],
    ['gold', 3],
    ['stone', 2],
    ['stone', 3],
  ] as const)('只到时代%s/%s而未研究时，不提前获得整组研究增强', (task, age) => {
    const order = ageOnly(task, age);
    const actual = run(order, ageData(E));
    const noEnhancement = run(order, ageData(without(...ENHANCEMENTS)));
    expect(actual.anomalies.filter((anomaly) => anomaly.type === 'timeout')).toEqual([]);
    expect(noEnhancement.anomalies.filter((anomaly) => anomaly.type === 'timeout')).toEqual([]);
    expect(actual.steps.map((step) => [step.startAt, step.doneAt, step.stock, step.villagers, step.pop])).toEqual(
      noEnhancement.steps.map((step) => [step.startAt, step.doneAt, step.stock, step.villagers, step.pop]),
    );
  });

  it('双刃斧必须等待骡车完成，不能在到封建时借用不存在的研究地点', () => {
    const timeline = run(paidResearch(202), ageData(E));
    expect(timeline.anomalies.filter((anomaly) => anomaly.type === 'timeout')).toEqual([]);
    const cart = timeline.buildingsDone.find((done) => done.building === 1808);
    expect(cart).toBeDefined();
    expect(timeline.steps[1]!.startAt).toBeLessThan(cart!.at);
    expect(timeline.steps[1]!.startAt).toBeGreaterThanOrEqual(timeline.ageUps.find((age) => age.age === 'feudal')!.reachAt);
    expect(timeline.steps[1]!.stock.food).toBeGreaterThanOrEqual(E.techs[202]!.cost.Food!);
    expect(timeline.steps[1]!.stock.wood).toBeGreaterThanOrEqual(E.techs[202]!.cost.Wood!);
    expect(timeline.steps[1]!.researchAt).toBeGreaterThanOrEqual(cart!.at);
    expect(timeline.steps[1]!.doneAt - timeline.steps[1]!.researchAt!).toBeGreaterThanOrEqual(E.techs[202]!.researchTime - 0.1);
  });

  it('双刃斧实际完成后产生额外木材收益，普通研究与额外倍率各走一份来源', () => {
    const order = paidResearch(202);
    const actual = run(order, ageData(E));
    const standard = run(order, ageData(without(...ENHANCEMENTS)));
    expect(actual.anomalies.filter((anomaly) => anomaly.type === 'timeout')).toEqual([]);
    expect(standard.anomalies.filter((anomaly) => anomaly.type === 'timeout')).toEqual([]);
    expect(actual.steps[3]!.vils).toBe(8);
    expect(actual.steps[3]!.doneAt).toBeLessThan(3600);
    expect(actual.steps[2]!.villagers.wood).toBeGreaterThanOrEqual(1);
    expect(actual.steps[3]!.startAt - Math.max(actual.steps[1]!.doneAt, actual.steps[2]!.startAt)).toBeGreaterThan(E.villager.trainTime);
    expect(actual.steps[3]!.startAt).toBe(standard.steps[3]!.startAt);
    expect(actual.steps[3]!.stock.food).toBe(standard.steps[3]!.stock.food);
    expect(actual.steps[3]!.stock.gold).toBe(standard.steps[3]!.stock.gold);
    const normal = E.ecoTechs[202]!.effects.find((effect) => effect.target === 'task:wood' && effect.attr === 'workRate')!.v!;
    const extra = E.civEco.Armenians!.find((row) => row.tech === 960)!.effects[0]!.v!;
    const base = E.villager.tasks.wood!;
    const rate = (multiplier: number) => base.carry / (base.carry / (base.workRate * multiplier) + (2 * actual.params.walkTiles) / E.villager.speed);
    const workerSeconds = actual.villagerEvents!.reduce(
      (total, event) => total + Math.max(0, actual.steps[3]!.startAt - Math.max(event.to, actual.steps[1]!.doneAt)),
      0,
    );
    const predicted = workerSeconds * (rate(normal * extra) - rate(normal));
    const observed = actual.steps[3]!.stock.wood - standard.steps[3]!.stock.wood;
    expect(observed).toBeGreaterThan(1);
    expect(Math.abs(observed - predicted)).toBeLessThan(2);
  });

  it('马轭仍等待磨坊，不能把骡车当作浆果或农田科技地点', () => {
    const timeline = run(paidResearch(14), ageData(E));
    expect(timeline.anomalies.filter((anomaly) => anomaly.type === 'timeout')).toEqual([]);
    const mill = timeline.buildingsDone.find((done) => done.building === 68);
    expect(mill).toBeDefined();
    expect(timeline.steps[1]!.startAt).toBeLessThan(mill!.at);
    expect(timeline.steps[1]!.startAt).toBeGreaterThanOrEqual(timeline.ageUps.find((age) => age.age === 'feudal')!.reachAt);
    expect(timeline.steps[1]!.stock.food).toBeGreaterThanOrEqual(E.techs[14]!.cost.Food!);
    expect(timeline.steps[1]!.stock.wood).toBeGreaterThanOrEqual(E.techs[14]!.cost.Wood!);
    expect(timeline.steps[1]!.researchAt).toBeGreaterThanOrEqual(mill!.at);
    expect(timeline.buildingsDone.some((done) => done.building === 1808)).toBe(false);
  });

  it('研究增强族缺一条时拒绝支持，而不是只应用剩余六条', () => {
    expect(simSupport(without(960), 'Armenians', buildOrders).supported).toBe(false);
  });

  it('圣物族缺一条时拒绝支持，不放开通用资源234', () => {
    expect(simSupport(without(949), 'Armenians', buildOrders).supported).toBe(false);
  });

  it('原计划动作和文字不被模拟原地修改，通用文明继续建普通营地', () => {
    const order = camp(562);
    const before = structuredClone(order);
    run(order);
    expect(order).toEqual(before);
    expect(run(order, E, 'Generic').steps[0]!.entity).toEqual({ kind: 'building', id: '562' });
    expect(run(order, E, 'Generic').steps[0]!.cost).toEqual({ food: 0, wood: 100, gold: 0, stone: 0 });
  });
});
