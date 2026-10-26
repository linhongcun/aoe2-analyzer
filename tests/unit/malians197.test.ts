import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import type { BuildOrder, Task } from '../../src/domain/buildOrder';
import { civSimNotes, gatherRate, simSupport, simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { discountedCost } from '../../src/domain/costDiscount';
import { gatherModel } from '../../src/domain/realCost';
import { uncountedText } from '../../src/shared/ui/RealCost';

const E = eco as unknown as EcoData;
const ups = Object.fromEntries(units.filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const techOf = (row: object) => (row as { tech?: number }).tech;
const rowOf = (e: EcoData, tech: number) => e.civEco.Malians!.find((row) => techOf(row) === tech)!;
const without = (...techs: number[]): EcoData => ({
  ...E,
  civEco: { ...E.civEco, Malians: E.civEco.Malians!.filter((row) => !techs.includes(techOf(row) ?? -1)) },
});
const percent = rowOf(E, 594).effects.find((effect) => effect.res === 276)!.v!;
const baseRate = (e: EcoData, task: string, tiles: number) => {
  const b = e.villager.tasks[task]!;
  return b.carry / (b.carry / b.workRate + (2 * tiles) / e.villager.speed);
};
const probe = (task: Task = 'gold'): BuildOrder => ({
  id: 'malians-income-probe',
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
const run = (bo: BuildOrder, e = E, civ = 'Malians', tiles = 2) => simulateBuild(bo, civ, e, ups, { autoHouses: false, nearTiles: tiles, walkTiles: tiles });
const funded = (e: EcoData) => ({
  ...e,
  civEco: {
    ...e.civEco,
    Malians: [...e.civEco.Malians!, { source: 'bonus', age: 1, effects: [{ kind: 'res', res: 92, op: 'add', v: 1000 }] }],
  },
});
const buildingProbe = (building: number): BuildOrder => ({
  ...probe(),
  id: 'malians-building-probe',
  target: { age: 3, vils: 3 },
  steps: [
    {
      vils: 3,
      actions: [
        { type: 'gather', task: 'build', count: 3 },
        { type: 'build', building },
      ],
    },
    { vils: 3, actions: [] },
  ],
});
const buildingRun = (building: number, e = E) => run(buildingProbe(building), funded(e));
const note = '采金交仓额外黄金按连续收入估算';

describe('#197 马里交仓黄金与建筑木费', () => {
  it('固定来源：594的276 add10与33 set11；156/595仍是原始乘数', () => {
    expect(percent).toBe(10);
    expect(rowOf(E, 594).effects).toEqual([
      { kind: 'res', label: null, op: 'add', res: 276, v: 10 },
      { kind: 'res', label: null, op: 'set', res: 33, v: 11 },
    ]);
    expect(rowOf(E, 156).effects.every((effect) => effect.attr === 'woodCost' && effect.op === 'mul' && effect.v === 0.85)).toBe(true);
    expect(
      rowOf(E, 595)
        .effects.filter((effect) => effect.target?.startsWith('class:'))
        .map((effect) => [effect.target, effect.v]),
    ).toEqual([
      ['class:3', 0.85],
      ['class:39', 0.85],
      ['class:52', 0.85],
      ['class:27', 0.85],
    ]);
  });
  it('建筑类别与同一固定dat审计记录一致，农田49与建筑/木墙类别区分', () => {
    const source = JSON.parse(readFileSync(new URL('../../docs/design/malians197-source.json', import.meta.url), 'utf8')) as {
      trackedUnits: Record<string, { classId: number }>;
    };
    for (const id of [12, 45, 50, 68, 70, 72, 84, 87, 101, 103, 109, 562, 584])
      expect((E.buildings[id] as { class?: number }).class, String(id)).toBe(source.trackedUnits[id]!.classId);
  });
  it.each([1, 3, 7])('距离%s：实际黄金库存为有效采金收入加百分数，主率/携带量不变', (tiles) => {
    const m = run(probe(), E, 'Malians', tiles).steps[1]!;
    const g = run(probe(), E, 'Generic', tiles).steps[1]!;
    expect(m.startAt).toBe(g.startAt);
    const primary = 3 * baseRate(E, 'gold', tiles) * m.startAt;
    expect(m.stock.gold).toBe(Math.floor(100 + primary * (1 + percent / 100)));
    expect(m.stock.gold).toBeGreaterThan(g.stock.gold);
    expect(m.stock.food).toBe(g.stock.food);
    expect(m.stock.wood).toBe(g.stock.wood);
    const rate = gatherRate(E, 'Malians', 'gold', tiles);
    expect(rate).toMatchObject({ carry: E.villager.tasks.gold!.carry, workRate: E.villager.tasks.gold!.workRate });
    expect(rate.rate).toBeCloseTo(baseRate(E, 'gold', tiles), 12);
    expect(rate.extraIncome).toEqual({ gold: rate.rate * (percent / 100) });
  });
  it('采金携带量变化只改变同一次往返效率，不另设交仓距离', () => {
    const e = structuredClone(E);
    e.villager.tasks.gold!.carry *= 2;
    const m = run(probe(), e).steps[1]!;
    expect(m.stock.gold).toBe(Math.floor(100 + 3 * baseRate(e, 'gold', 2) * m.startAt * 1.1));
    expect(gatherRate(e, 'Malians', 'gold').extraIncome).toEqual({ gold: baseRate(e, 'gold', 2) * 0.1 });
  });
  it.each(['sheep', 'boar', 'deer', 'hunt', 'berries', 'farm', 'fish', 'wood', 'stone'] as Task[])('%s不产生黄金交仓加成', (task) => {
    expect(run(probe(task)).steps).toEqual(run(probe(task), E, 'Generic').steps);
    expect(gatherRate(E, 'Malians', task === 'boar' || task === 'deer' ? 'hunt' : task).extraIncome).toEqual({});
  });
  it('黄金支出和开局额外黄金不增加交仓基数', () => {
    const e = structuredClone(E);
    e.techs[22] = { ...e.techs[22]!, at: 109, cost: { Gold: 50 }, researchTime: 0 };
    e.civEco.Malians!.push({ source: 'bonus', age: 1, effects: [{ kind: 'res', res: 94, op: 'add', v: 200 }] });
    const bo = probe();
    bo.steps[0]!.actions.push({ type: 'research', tech: 22 });
    const m = run(bo, e).steps[1]!;
    expect(m.stock.gold).toBe(Math.floor(250 + 3 * baseRate(e, 'gold', 2) * m.startAt * 1.1));
  });
  it('采金科技改变同一主率，额外交仓收入只乘一次', () => {
    const e = structuredClone(E);
    e.techs[55] = { ...e.techs[55]!, at: 109, cost: {}, researchTime: 0 };
    const bo = probe();
    bo.steps[0]!.actions.push({ type: 'research', tech: 55 });
    const m = run(bo, e).steps[1]!;
    const factor = E.ecoTechs[55]!.effects.find((effect) => effect.attr === 'workRate' && effect.target === 'task:gold')!.v!;
    const b = E.villager.tasks.gold!;
    const upgraded = b.carry / (b.carry / (b.workRate * factor) + 4 / E.villager.speed);
    const primary = 3 * (baseRate(E, 'gold', 2) * 0.1 + upgraded * (m.startAt - 0.1));
    expect(m.stock.gold).toBe(Math.floor(100 + primary * 1.1));
  });
  it('升级时代不重复应用采金加成', () => {
    const e = structuredClone(E);
    e.ageReq = undefined;
    for (const id of [101, 102]) e.techs[id] = { ...e.techs[id]!, cost: {}, researchTime: 10 };
    const bo = probe();
    bo.target = { age: 3, vils: 3 };
    bo.steps = [
      {
        vils: 3,
        actions: [
          { type: 'gather', task: 'gold', count: 3 },
          { type: 'ageUp', age: 2 },
        ],
      },
      {
        vils: 3,
        phase: 'feudal',
        actions: [{ type: 'ageUp', age: 3 }],
      },
      { vils: 3, phase: 'castle', actions: [] },
    ];
    const m = run(bo, funded(e));
    for (const step of m.steps.slice(1)) expect(step.stock.gold).toBe(Math.floor(100 + 3 * baseRate(e, 'gold', 2) * step.startAt * 1.1));
  });
  it('升级时代不重复应用建筑折扣', () => {
    const e = structuredClone(E);
    e.ageReq = undefined;
    for (const id of [101, 102]) e.techs[id] = { ...e.techs[id]!, cost: {}, researchTime: 10 };
    const bo = buildingProbe(70);
    bo.steps = [
      {
        vils: 3,
        actions: [
          { type: 'gather', task: 'build', count: 3 },
          { type: 'ageUp', age: 2 },
        ],
      },
      {
        vils: 3,
        phase: 'feudal',
        actions: [
          { type: 'build', building: 70 },
          { type: 'ageUp', age: 3 },
        ],
      },
      { vils: 3, phase: 'castle', actions: [{ type: 'build', building: 12 }] },
    ];
    const m = run(bo, funded(e));
    expect(m.steps[1]!.cost?.wood).toBe(21);
    expect(m.steps[2]!.cost?.wood).toBe(149);
  });
  it.each(['other-tech', 'wrong-op', 'missing-marker', 'wrong-marker', 'unknown-companion'])('采金整条守护：%s不让辅助或库存只应用半条', (variant) => {
    const e = structuredClone(E);
    const row = rowOf(e, 594);
    if (variant === 'other-tech') (row as { tech?: number }).tech = 9998;
    else if (variant === 'wrong-op') row.effects[0]!.op = 'set';
    else if (variant === 'missing-marker') row.effects = row.effects.filter((effect) => effect.res !== 33);
    else if (variant === 'wrong-marker') row.effects.find((effect) => effect.res === 33)!.v = 12;
    else row.effects.push({ kind: 'res', res: 9999, op: 'add', v: 1 });
    expect(simSupport(e, 'Malians', buildOrders).supported).toBe(false);
    expect(gatherRate(e, 'Malians', 'gold').extraIncome).toEqual({});
    expect(civSimNotes(e, 'Malians')).not.toContain(note);
    expect(run(probe(), e).steps[1]!.stock.gold).toBe(run(probe(), e, 'Generic').steps[1]!.stock.gold);
  });
  it.each([
    [70, 21],
    [12, 149],
    [109, 234],
    [72, 2.5],
    [50, 60],
    [45, 127.5],
    [68, 85],
    [562, 85],
    [584, 85],
    [84, 149],
    [87, 149],
    [101, 149],
    [103, 127.5],
  ])('建筑%s实际支付%s木，与独立既有费用表一致，农田除外', (id, expected) => {
    const result = buildingRun(id);
    expect(result.steps[0]!.cost?.wood).toBe(expected);
    const independent = discountedCost({ id, cost: E.buildings[id]!.cost }, 'Malians', 1);
    expect(result.steps[0]!.cost?.wood).toBe(independent.cost.Wood);
    expect(result.steps[0]!.cost?.stone).toBe(E.buildings[id]!.cost.Stone ?? 0);
    expect(result.steps[0]!.cost?.gold).toBe(E.buildings[id]!.cost.Gold ?? 0);
    expect(result.steps[0]!.doneAt - result.steps[0]!.startAt).toBeGreaterThan(0);
    expect(result.steps[0]!.doneAt).toBe(buildingRun(id, without(156, 595)).steps[0]!.doneAt);
    expect(result.anomalies.some((anomaly) => anomaly.type === 'timeout')).toBe(false);
  });
  it.each([
    [156, 275],
    [595, 234],
    ['both', 275],
  ] as const)('TC去掉%s后实际木费%s，不硬套全局展示价', (tech, expected) => {
    const e = tech === 'both' ? without(156, 595) : without(tech);
    expect(buildingRun(109, e).steps[0]!.cost?.wood).toBe(expected);
  });
  it('改变595原始class木费倍率会改变实际支付，排除硬写85%或全局费用表', () => {
    const e = structuredClone(E);
    rowOf(e, 595).effects.find((effect) => effect.target === 'class:3')!.v = 0.8;
    expect(buildingRun(70, e).steps[0]!.cost?.wood).toBe(20);
    expect(buildingRun(109, e).steps[0]!.cost?.wood).toBe(220);
    expect(buildingRun(72, e).steps[0]!.cost?.wood).toBe(2.5);
  });
  it('自动补房也实际付折扣木材', () => {
    const bo = probe();
    bo.target.vils = 6;
    bo.steps = [
      { vils: 3, actions: [{ type: 'gather', task: 'stone', count: 3 }] },
      { vils: 6, actions: [] },
    ];
    const result = simulateBuild(bo, 'Malians', E, ups, { autoHouses: true });
    expect(result.housePaidAt).toHaveLength(1);
    expect(result.steps[1]!.stock.wood).toBe(179);
  });
  it.each(['wrong-op', 'wrong-class', 'unknown-companion', 'missing-class'])('建筑整条守护：%s不能声称马里完整支持', (variant) => {
    const e = structuredClone(E);
    const row = rowOf(e, 595);
    if (variant === 'wrong-op') row.effects.find((effect) => effect.target === 'class:3')!.op = 'add';
    else if (variant === 'wrong-class') row.effects.find((effect) => effect.target === 'class:3')!.target = 'class:9998';
    else if (variant === 'missing-class') delete (e.buildings[70] as { class?: number }).class;
    else row.effects.push({ kind: 'res', res: 9999, op: 'add', v: 1 });
    expect(simSupport(e, 'Malians', buildOrders).supported).toBe(false);
    expect(buildingRun(70, e).steps[0]!.cost?.wood).toBe(25);
  });
  it('支持、附注与真实成本旧边界一致', () => {
    expect(simSupport(E, 'Malians', buildOrders)).toEqual({ supported: true, reasons: [] });
    expect(civSimNotes(E, 'Malians')).toContain(note);
    expect(run(probe()).model.assumptions.join('')).toContain('不模拟客户端逐次交仓');
    for (const age of [1, 2, 3, 4]) {
      const legacy = gatherModel(age, 'Malians');
      expect(legacy.unsupported.map((entry) => entry.label)).toContain('采金加成');
      expect(uncountedText('Malians', '马里', '采金加成')).toBe('未计入：马里 采金加成（存放黄金加成，未建模）');
      expect(legacy.rate.gold).toBe(gatherModel(age).rate.gold);
    }
  });
  it('当前八开局不建大学，原团队研究加成不改变结果或额外计入采金', () => {
    expect(buildOrders).toHaveLength(8);
    for (const bo of buildOrders) {
      const plain = simulateBuild(bo, 'Malians', E, ups);
      expect(simulateBuild(bo, 'Malians', E, ups, { team: true })).toEqual({ ...plain, params: { ...plain.params, team: true } });
    }
  });
});
