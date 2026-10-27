import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import type { BuildOrder, Task } from '../../src/domain/buildOrder';
import { civSimNotes, gatherRate, simSupport, simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { gatherModel } from '../../src/domain/realCost';

const E = eco as unknown as EcoData;
const ups = Object.fromEntries(units.filter((unit) => unit.up).map((unit) => [unit.id, unit.up])) as UpgradeData;
const rowOf = (e: EcoData) => e.civEco.Varangians!.find((row) => (row as { tech?: number }).tech === 1475)!;
const percent = rowOf(E).effects.find((effect) => effect.res === 298)!.v!;
const ratio = percent / 100;
const note = '牧羊、狩猎和捕鱼兼产黄金按连续收入估算';
const baseRate = (e: EcoData, task: string, tiles: number) => {
  const base = e.villager.tasks[task]!;
  return base.carry / (base.carry / base.workRate + (2 * tiles) / e.villager.speed);
};
const probe = (task: Task = 'sheep'): BuildOrder => ({
  id: 'varangians-income-probe',
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
const run = (bo: BuildOrder, e = E, civ = 'Varangians', tiles = 2) => simulateBuild(bo, civ, e, ups, { autoHouses: false, nearTiles: tiles, walkTiles: tiles });
const without = (): EcoData => ({ ...E, civEco: { ...E.civEco, Varangians: E.civEco.Varangians!.filter((row) => (row as { tech?: number }).tech !== 1475) } });
const fishProbe = (e: EcoData, count = 1) => {
  e.villager.trainTime = 100;
  e.buildings[45] = { ...e.buildings[45]!, buildTime: 0, cost: {} };
  e.buildings[70] = { ...e.buildings[70]!, buildTime: 0, cost: {} };
  e.units[13] = { ...e.units[13]!, trainTime: 10, timeAt: { 45: 10 }, cost: {} };
  const bo = probe('build');
  bo.steps = [
    {
      vils: 3,
      actions: [
        { type: 'gather', task: 'build', count: 3 },
        { type: 'build', building: 45 },
        { type: 'build', building: 70, count: 2 },
      ],
    },
    { vils: 3, actions: [{ type: 'train', unit: 13, count }] },
    { vils: 4, actions: [] },
  ];
  return bo;
};
const fishRate = (e: EcoData, tiles: number) => {
  const fish = e.fishingShip!;
  return fish.carry / (fish.carry / (fish.workRate * fish.deepFishMultiplier!) + (2 * tiles) / fish.speed);
};

describe('#197 瓦兰吉牧羊、狩猎和捕鱼兼产黄金', () => {
  it('固定来源1475：同条33 set34和298 set10.01，不以文字10覆盖数据', () => {
    expect(percent).toBe(10.01);
    expect(rowOf(E).effects).toEqual([
      { kind: 'res', label: null, op: 'set', res: 33, v: 34 },
      { kind: 'res', label: null, op: 'set', res: 298, v: 10.01 },
    ]);
  });
  it.each(['sheep', 'boar', 'deer', 'hunt', 'fish'] as Task[])('%s实际兼产黄金并保留主食物、携带量及工作速率', (task) => {
    const result = run(probe(task)).steps[1]!;
    const generic = run(probe(task), E, 'Generic').steps[1]!;
    const ecoTask = task === 'boar' || task === 'deer' ? 'hunt' : task === 'hunt' ? 'sheep' : task;
    const food = 3 * baseRate(E, ecoTask, 2) * result.startAt;
    expect(result.startAt).toBe(generic.startAt);
    expect(result.stock.food).toBe(generic.stock.food);
    expect(result.stock.gold).toBe(Math.floor(100 + food * ratio));
    expect(result.stock.gold).toBeGreaterThan(generic.stock.gold);
    expect(result.stock.wood).toBe(generic.stock.wood);
    const rate = gatherRate(E, 'Varangians', ecoTask);
    expect(rate.carry).toBe(E.villager.tasks[ecoTask]!.carry);
    expect(rate.workRate).toBe(E.villager.tasks[ecoTask]!.workRate);
    expect(rate.rate).toBeCloseTo(baseRate(E, ecoTask, 2), 12);
    expect(rate.extraIncome).toEqual({ gold: rate.rate * ratio });
  });
  it.each([1, 3, 7])('距离%s使用主资源同一往返，不额外增加黄金走路', (tiles) => {
    const result = run(probe('sheep'), E, 'Varangians', tiles).steps[1]!;
    expect(result.stock.gold).toBe(Math.floor(100 + 3 * baseRate(E, 'sheep', tiles) * result.startAt * ratio));
    expect(gatherRate(E, 'Varangians', 'sheep', tiles).extraIncome).toEqual({ gold: baseRate(E, 'sheep', tiles) * ratio });
  });
  it.each(['berries', 'farm', 'wood', 'gold', 'stone', 'build'] as Task[])('%s不兼产，实际时间/库存与通用一致', (task) => {
    expect(run(probe(task)).steps).toEqual(run(probe(task), E, 'Generic').steps);
    if (task !== 'build') expect(gatherRate(E, 'Varangians', task).extraIncome).toEqual({});
  });
  it('真实输入百分比更改和移除1475分别改变实际库存，不硬写10%', () => {
    const e = structuredClone(E);
    rowOf(e).effects.find((effect) => effect.res === 298)!.v = percent * 2;
    const result = run(probe(), e).steps[1]!;
    expect(result.stock.gold).toBe(Math.floor(100 + 3 * baseRate(e, 'sheep', 2) * result.startAt * ratio * 2));
    expect(run(probe(), without()).steps).toEqual(run(probe(), E, 'Generic').steps);
  });
  it('食物/黄金支出和开局赠送不扩大兼产基数', () => {
    const e = structuredClone(E);
    e.techs[22] = { ...e.techs[22]!, at: 109, cost: { Food: 50, Gold: 50 }, researchTime: 0 };
    e.civEco.Varangians!.push({
      source: 'bonus',
      age: 1,
      effects: [
        { kind: 'res', res: 91, op: 'add', v: 1000 },
        { kind: 'res', res: 94, op: 'add', v: 200 },
      ],
    });
    const bo = probe();
    bo.steps[0]!.actions.push({ type: 'research', tech: 22 });
    const result = run(bo, e).steps[1]!;
    expect(result.stock.gold).toBe(Math.floor(250 + 3 * baseRate(e, 'sheep', 2) * result.startAt * ratio));
  });
  it('携带量改变同一采集往返，兼产不占用携带空间', () => {
    const e = structuredClone(E);
    e.villager.tasks.sheep!.carry *= 2;
    const result = run(probe(), e).steps[1]!;
    expect(result.stock.gold).toBe(Math.floor(100 + 3 * baseRate(e, 'sheep', 2) * result.startAt * ratio));
    expect(gatherRate(e, 'Varangians', 'sheep').carry).toBe(e.villager.tasks.sheep!.carry);
  });
  it('手推车携带/移速改变主率后只兼产一次', () => {
    const e = structuredClone(E);
    e.techs[213] = { ...e.techs[213]!, cost: {}, researchTime: 0 };
    const bo = probe();
    bo.steps[0]!.actions.push({ type: 'research', tech: 213 });
    const result = run(bo, e).steps[1]!;
    const mul = (attr: string) => E.ecoTechs[213]!.effects.find((effect) => effect.attr === attr && effect.target === 'class:4')!.v!;
    const base = E.villager.tasks.sheep!;
    const carry = base.carry * mul('carry');
    const upgraded = carry / (carry / base.workRate + 4 / (e.villager.speed * mul('speed')));
    const primary = 3 * (baseRate(e, 'sheep', 2) * 0.1 + upgraded * (result.startAt - 0.1));
    expect(result.stock.gold).toBe(Math.floor(100 + primary * ratio));
  });
  it('换时代不把set比例重复累加', () => {
    const e = structuredClone(E);
    e.ageReq = undefined;
    for (const id of [101, 102]) e.techs[id] = { ...e.techs[id]!, cost: {}, researchTime: 10 };
    const bo = probe();
    bo.target = { age: 3, vils: 3 };
    bo.steps = [
      {
        vils: 3,
        actions: [
          { type: 'gather', task: 'sheep', count: 3 },
          { type: 'ageUp', age: 2 },
        ],
      },
      { vils: 3, phase: 'feudal', actions: [{ type: 'ageUp', age: 3 }] },
      { vils: 3, phase: 'castle', actions: [] },
    ];
    for (const result of run(bo, e).steps.slice(1)) expect(result.stock.gold).toBe(Math.floor(100 + 3 * baseRate(e, 'sheep', 2) * result.startAt * ratio));
  });
  it.each(['other-tech', 'wrong-source', 'wrong-op', 'missing-marker', 'wrong-marker', 'marker-op', 'unknown-companion'])(
    '整条守护%s：不声明支持、不兼产或显示已计入',
    (variant) => {
      const e = structuredClone(E);
      const row = rowOf(e);
      if (variant === 'other-tech') (row as { tech?: number }).tech = 9998;
      else if (variant === 'wrong-source') row.source = 'tree';
      else if (variant === 'wrong-op') row.effects.find((effect) => effect.res === 298)!.op = 'add';
      else if (variant === 'missing-marker') row.effects = row.effects.filter((effect) => effect.res !== 33);
      else if (variant === 'wrong-marker') row.effects.find((effect) => effect.res === 33)!.v = 35;
      else if (variant === 'marker-op') row.effects.find((effect) => effect.res === 33)!.op = 'add';
      else row.effects.push({ kind: 'res', res: 9999, op: 'set', v: 1 });
      expect(simSupport(e, 'Varangians', buildOrders).supported).toBe(false);
      expect(gatherRate(e, 'Varangians', 'sheep').extraIncome).toEqual({});
      expect(civSimNotes(e, 'Varangians')).not.toContain(note);
      expect(run(probe(), e).steps[1]!.stock.gold).toBe(run(probe(), e, 'Generic').steps[1]!.stock.gold);
    },
  );
  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, undefined])('298值%s无效时整条fail-closed', (value) => {
    const e = structuredClone(E);
    rowOf(e).effects.find((effect) => effect.res === 298)!.v = value;
    expect(simSupport(e, 'Varangians', buildOrders).supported).toBe(false);
    expect(gatherRate(e, 'Varangians', 'sheep').extraIncome).toEqual({});
    expect(run(probe(), e).steps[1]!.stock.gold).toBe(100);
  });
  it.each([1, 3, 7])('渔船距离%s：完成前无收入，完成后使用深海鱼/船自身参数兼产', (tiles) => {
    const e = structuredClone(E);
    const bo = fishProbe(e);
    const result = run(bo, e, 'Varangians', tiles);
    const generic = run(bo, e, 'Generic', tiles);
    const final = result.steps[2]!;
    const completed = result.steps[1]!.doneAt;
    const primary = fishRate(e, tiles) * (final.startAt - completed);
    expect(completed).toBeGreaterThan(0);
    expect(final.startAt).toBeGreaterThan(completed);
    expect(result.steps[1]!.stock.gold).toBe(100);
    expect(final.stock.food).toBe(generic.steps[2]!.stock.food);
    expect(final.stock.gold).toBe(Math.floor(100 + primary * ratio));
    expect(final.stock.gold).toBeGreaterThan(generic.steps[2]!.stock.gold);
  });
  it.each(['carry', 'speed', 'deepFishMultiplier'] as const)('渔船%s改变同一主收入；与村民速度无关', (key) => {
    const e = structuredClone(E);
    const bo = fishProbe(e);
    e.fishingShip![key]! *= 2;
    e.villager.speed *= 3;
    const result = run(bo, e);
    const primary = fishRate(e, 2) * (result.steps[2]!.startAt - result.steps[1]!.doneAt);
    expect(result.steps[2]!.stock.gold).toBe(Math.floor(100 + primary * ratio));
  });
  it('渔船排队或没有渔船不产生收入', () => {
    const e = structuredClone(E);
    const bo = fishProbe(e);
    e.units[13]!.trainTime = 1000;
    e.units[13]!.timeAt = { 45: 1000 };
    const queued = run(bo, e);
    expect(queued.steps[2]!.startAt).toBeLessThan(queued.steps[1]!.doneAt);
    expect(queued.steps[2]!.stock.gold).toBe(100);
    expect(run(probe('build')).steps[1]!.stock.gold).toBe(100);
  });
  it('同一队列两船各自完成后贡献，不能按最后完成时间统一计入', () => {
    const e = structuredClone(E);
    const bo = fishProbe(e, 2);
    const result = run(bo, e);
    const final = result.steps[2]!;
    const last = result.steps[1]!.doneAt;
    const first = last - e.units[13]!.trainTime;
    const primary = fishRate(e, 2) * (final.startAt - first + final.startAt - last);
    expect(last).toBeLessThan(final.startAt);
    expect(final.stock.gold).toBe(Math.floor(100 + primary * ratio));
  });
  it('渔船用walkTiles而非村民nearTiles；当前船速/携带/采集倍率只应用一次', () => {
    const e = structuredClone(E);
    const bo = fishProbe(e);
    e.civEco.Varangians!.push({
      source: 'bonus',
      age: 1,
      effects: [
        { kind: 'attr', target: 'unit:13', attr: 'workRate', op: 'mul', v: 2 },
        { kind: 'attr', target: 'unit:13', attr: 'carry', op: 'mul', v: 2 },
        { kind: 'attr', target: 'unit:13', attr: 'speed', op: 'mul', v: 2 },
      ],
    });
    const a = simulateBuild(bo, 'Varangians', e, ups, { autoHouses: false, walkTiles: 4, nearTiles: 1 });
    const b = simulateBuild(bo, 'Varangians', e, ups, { autoHouses: false, walkTiles: 4, nearTiles: 9 });
    expect(a.steps).toEqual(b.steps);
    const fish = e.fishingShip!;
    const carry = fish.carry * 2;
    const q = carry / (carry / (fish.workRate * fish.deepFishMultiplier! * 2) + 8 / (fish.speed * 2));
    expect(a.steps[2]!.stock.gold).toBe(Math.floor(100 + q * (a.steps[2]!.startAt - a.steps[1]!.doneAt) * ratio));
  });
  it.each(['workRate', 'carry', 'speed'] as const)('渔船%s为0时不凭空产生食物或黄金', (key) => {
    const e = structuredClone(E);
    const bo = fishProbe(e);
    e.fishingShip![key] = 0;
    const result = run(bo, e).steps[2]!;
    expect(result.stock.gold).toBe(100);
    expect(result.stock.food).toBe(150);
  });
  it('缺少渔船采集输入时不产生兼产', () => {
    const e = structuredClone(E);
    const bo = fishProbe(e);
    delete e.fishingShip;
    expect(run(bo, e).steps[2]!.stock.gold).toBe(100);
  });
  it('其它文明即使携带同1475效果，也不启用瓦兰吉兼产路径', () => {
    const e = structuredClone(E);
    e.civEco.Generic = [structuredClone(rowOf(e))];
    expect(run(probe(), e, 'Generic').steps[1]!.stock.gold).toBe(100);
    expect(gatherRate(e, 'Generic', 'sheep').extraIncome).toEqual({});
  });
  it('刺网65改变真实渔船工作率/携带量，兼产基数只应用一次', () => {
    const e = structuredClone(E);
    const bo = fishProbe(e);
    e.techs[65] = { ...e.techs[65]!, cost: {}, researchTime: 0 };
    bo.steps[1]!.actions.push({ type: 'research', tech: 65 });
    const result = run(bo, e);
    const fish = e.fishingShip!;
    const carry = fish.carry + e.ecoTechs[65]!.effects.find((effect) => effect.attr === 'carry')!.v!;
    const multiplier = e.ecoTechs[65]!.effects.find((effect) => effect.attr === 'workRate')!.v!;
    const q = carry / (carry / (fish.workRate * fish.deepFishMultiplier! * multiplier) + 4 / fish.speed);
    expect(result.steps[2]!.stock.gold).toBe(Math.floor(100 + q * (result.steps[2]!.startAt - result.steps[1]!.doneAt) * ratio));
    expect(result.steps[2]!.stock.food).toBe(run(bo, e, 'Generic').steps[2]!.stock.food);
  });
  it('真实混合图开局在同clock检查点增加实际黄金而保留食物/木材', () => {
    const bo = buildOrders.find((candidate) => candidate.id === 'hybrid-fish-18')!;
    const result = run(bo).steps[3]!;
    const generic = run(bo, E, 'Generic').steps[3]!;
    expect(result.startAt).toBe(generic.startAt);
    expect(result.stock.gold).toBeGreaterThan(generic.stock.gold);
    expect(result.stock.food).toBe(generic.stock.food);
    expect(result.stock.wood).toBe(generic.stock.wood);
  });
  it('支持和附注完整，独立真实成本保留原农田主率与空提示数组', () => {
    expect(simSupport(E, 'Varangians', buildOrders)).toEqual({ supported: true, reasons: [] });
    expect(civSimNotes(E, 'Varangians')).toContain(note);
    expect(run(probe()).model.assumptions.join('')).toContain('不模拟客户端逐笔到账');
    for (const age of [1, 2, 3, 4]) {
      const original = gatherModel(age, 'Varangians');
      expect(original.unsupported).toEqual([]);
      expect(original.applied).toEqual([]);
      expect(original.rate).toEqual(gatherModel(age).rate);
    }
  });
});
