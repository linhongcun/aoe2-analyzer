import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import type { BuildOrder, Task } from '../../src/domain/buildOrder';
import { civSimNotes, gatherRate, simSupport, simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { gatherModel } from '../../src/domain/realCost';

const E = eco as unknown as EcoData;
const ups = Object.fromEntries(units.filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const percent = E.civEco.Portuguese!.find((r) => (r as { tech?: number }).tech === 453)!.effects.find((e) => e.res === 267)!.v!;
const ratio = percent / 100;
const baseRate = (e: EcoData, task: string, tiles: number) => {
  const b = e.villager.tasks[task]!;
  return b.carry / (b.carry / b.workRate + (2 * tiles) / e.villager.speed);
};
const probe = (task: Task): BuildOrder => ({
  id: 'portuguese-income-probe',
  name: { zh: '采集核对', en: 'income probe' },
  style: 'other',
  civs: [],
  map: 'test',
  difficulty: 'beginner',
  target: { age: 2, vils: 4 },
  summary: 'test',
  sources: [],
  license: 'test',
  review: { status: 'draft' },
  steps: [
    { vils: 3, actions: [{ type: 'gather', task, count: 3 }] },
    { vils: 4, actions: [] },
  ],
});
const run = (bo: BuildOrder, civ = 'Portuguese', e = E, nearTiles = 2) => simulateBuild(bo, civ, e, ups, { autoHouses: false, nearTiles });

// 独立 oracle 使用固定 eco 输入和连续模型算式；核对实际 runOnce 库存，而非只验辅助函数。
describe('#197 葡萄牙采果兼产木材', () => {
  it('来源行：453 / res267 为百分数，559 为各单位类别的黄金费用倍率', () => {
    expect(percent).toBe(33.333302);
    expect(E.civEco.Portuguese!.filter((r) => r.source !== 'team').map((r) => (r as { tech?: number }).tech)).toEqual([453, 559]);
    expect(
      E.civEco.Portuguese!.find((r) => (r as { tech?: number }).tech === 559)!.effects.every((e) => e.attr === 'goldCost' && e.op === 'mul' && e.v === 0.8),
    ).toBe(true);
  });
  it.each([0, 2, 7])('距离 %s：实际库存保留食物，并增加采果收入×res267/100的木材', (tiles) => {
    const bo = probe('berries');
    const p = run(bo, 'Portuguese', E, tiles).steps[1]!;
    const g = run(bo, 'Generic', E, tiles).steps[1]!;
    expect(p.startAt).toBe(g.startAt);
    const food = 3 * baseRate(E, 'berries', tiles) * p.startAt;
    expect(p.stock.food).toBe(Math.floor(200 - E.villager.cost.Food! + food));
    expect(p.stock.food).toBe(g.stock.food);
    expect(p.stock.wood).toBe(Math.floor(200 + food * ratio));
    expect(p.stock.wood).toBeGreaterThan(g.stock.wood);
    const r = gatherRate(E, 'Portuguese', 'berries', tiles);
    expect(r).toMatchObject({ carry: 10, workRate: 0.31 });
    expect(r.rate).toBeCloseTo(baseRate(E, 'berries', tiles), 12);
    expect(r.extraIncome).toEqual({ wood: r.rate * ratio });
  });
  it('携带量改变往返效率，不被额外木材占用；兼产倍率仍为固定比例', () => {
    const e = structuredClone(E);
    e.villager.tasks.berries!.carry = 20;
    const p = run(probe('berries'), 'Portuguese', e).steps[1]!;
    const food = 3 * baseRate(e, 'berries', 2) * p.startAt;
    expect(p.stock).toMatchObject({ food: Math.floor(150 + food), wood: Math.floor(200 + food * ratio) });
  });
  it.each(['sheep', 'boar', 'deer', 'hunt', 'farm', 'fish', 'wood', 'gold', 'stone'] as Task[])('%s 不产额外木材，无采果时与通用库存和时间相同', (task) => {
    expect(run(probe(task)).steps).toEqual(run(probe(task), 'Generic').steps);
  });
  it('换时代不叠加兼产；无团队参数时研发时间与通用相同', () => {
    const e = structuredClone(E);
    e.ageReq = undefined;
    for (const id of [101, 102]) e.techs[id] = { ...e.techs[id]!, cost: {}, researchTime: 10 };
    const bo = probe('berries');
    bo.target = { age: 3, vils: 3 };
    bo.steps = [
      {
        vils: 3,
        actions: [
          { type: 'gather', task: 'berries', count: 3 },
          { type: 'ageUp', age: 2 },
        ],
      },
      { vils: 3, phase: 'feudal', actions: [{ type: 'ageUp', age: 3 }] },
      { vils: 3, phase: 'castle', actions: [] },
    ];
    const p = run(bo, 'Portuguese', e);
    expect(p.ageUps).toEqual(run(bo, 'Generic', e).ageUps);
    for (const step of p.steps.slice(1)) {
      const food = 3 * baseRate(e, 'berries', 2) * step.startAt;
      expect(step.stock).toMatchObject({ food: Math.floor(200 + food), wood: Math.floor(200 + food * ratio) });
    }
  });
  it('独轮手推车的携带/移速影响同一采果往返，伐木科技不改变兼产木材倍率', () => {
    const e = structuredClone(E);
    e.techs[213] = { ...e.techs[213]!, cost: {}, researchTime: 0 };
    const bo = probe('berries');
    bo.steps[0]!.actions.push({ type: 'research', tech: 213 });
    const p = run(bo, 'Portuguese', e).steps[1]!;
    const mul = (attr: string) => E.ecoTechs[213]!.effects.find((x) => x.attr === attr && x.target === 'class:4')!.v!;
    const b = E.villager.tasks.berries!;
    const carry = b.carry * mul('carry');
    const speed = E.villager.speed * mul('speed');
    const upgraded = carry / (carry / b.workRate + 4 / speed);
    // TC研究在0.1秒完成；第一个tick用原始效率，其后按真实213携带/移速倍率。
    const food = 3 * (baseRate(E, 'berries', 2) * 0.1 + upgraded * (p.startAt - 0.1));
    expect(p.stock).toMatchObject({ food: Math.floor(150 + food), wood: Math.floor(200 + food * ratio) });
    e.techs[202] = { ...e.techs[202]!, cost: {}, researchTime: 0 };
    const woodTech = probe('berries');
    woodTech.steps[0]!.actions.push({ type: 'research', tech: 202 });
    expect(run(woodTech, 'Portuguese', e).steps[1]!.stock).toEqual(run(probe('berries'), 'Portuguese', e).steps[1]!.stock);
  });
  it('真实开局移除453只去除兼产、移除559只去除黄金折扣，两条确实分别改变结果', () => {
    const bo = buildOrders.find((b) => b.id === 'drush-fc')!;
    const without = (tech: number): EcoData => ({
      ...E,
      civEco: { ...E.civEco, Portuguese: E.civEco.Portuguese!.filter((r) => (r as { tech?: number }).tech !== tech) },
    });
    const p = run(bo);
    const no453 = run(bo, 'Portuguese', without(453));
    const no559 = run(bo, 'Portuguese', without(559));
    expect(p.steps).not.toEqual(no453.steps);
    expect(p.steps).not.toEqual(no559.steps);
    expect(no453.steps.find((s) => s.entity?.id === '74')!.cost!.gold).toBe(16);
    expect(no559.steps.find((s) => s.entity?.id === '74')!.cost!.gold).toBe(20);
  });
  it.each([74, 4, 38])('单位%s实际付费黄金×0.8，其它资源和训练时长保留', (unit) => {
    const e = structuredClone(E);
    e.units[unit]!.at = [109]; // 隔离训练槽；费用、类别、训练时间全部保留 fixed eco 数据。
    const bo = probe('sheep');
    bo.target.vils = 3;
    bo.steps = [
      {
        vils: 3,
        actions: [
          { type: 'gather', task: 'sheep', count: 3 },
          { type: 'train', unit },
        ],
      },
    ];
    const p = run(bo, 'Portuguese', e).steps[0]!;
    const g = run(bo, 'Generic', e).steps[0]!;
    expect(p.cost).toEqual({ ...g.cost, gold: e.units[unit]!.cost.Gold! * 0.8 });
    expect(p.doneAt - p.startAt).toBeCloseTo(g.doneAt - g.startAt, 1);
  });
  it.each([
    ['drush-fc', 74],
    ['fast-castle-knights', 38],
  ] as const)('%s 的真实单位%s步骤同样付折后黄金', (id, unit) => {
    const bo = buildOrders.find((b) => b.id === id)!;
    const p = run(bo).steps.find((s) => s.entity?.kind === 'unit' && s.entity.id === String(unit))!;
    expect(p.cost!.gold).toBe(E.units[unit]!.cost.Gold! * 0.8);
  });
  it.each(['other-tech', 'unknown-companion'])('267护栏：%s不能让辅助读数或真实库存漏算半条科技', (variant) => {
    const e = structuredClone(E);
    const row = e.civEco.Portuguese!.find((r) => (r as { tech?: number }).tech === 453)!;
    if (variant === 'other-tech') (row as { tech?: number }).tech = 9998;
    else row.effects.push({ kind: 'res', res: 9999, op: 'add', v: 1 });
    expect(simSupport(e, 'Portuguese', buildOrders).supported).toBe(false);
    expect(gatherRate(e, 'Portuguese', 'berries').extraIncome).toEqual({});
    expect(run(probe('berries'), 'Portuguese', e).steps[1]!.stock.wood).toBe(200);
  });
  it('完整支持后按葡萄牙计；附注说明连续估算，等采集时间仍保留原独立边界', () => {
    expect(simSupport(E, 'Portuguese', buildOrders)).toEqual({ supported: true, reasons: [] });
    expect(civSimNotes(E, 'Portuguese').join('')).toContain('采果兼产木材');
    expect(civSimNotes(E, 'Portuguese').join('')).toContain('连续收入估算');
    for (const age of [1, 2, 3, 4]) {
      expect(gatherModel(age, 'Portuguese').unsupported.map((x) => x.label)).toEqual(['采浆果同时产木头']);
      expect(gatherModel(age, 'Portuguese').rate).toEqual(gatherModel(age).rate);
    }
  });
});
