import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import type { BuildOrder, Task } from '../../src/domain/buildOrder';
import { animalFood, civSimNotes, gatherRate, simSupport, simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { gatherModel } from '../../src/domain/realCost';

const E = eco as unknown as EcoData;
const ups = Object.fromEntries(units.filter((unit) => unit.up).map((unit) => [unit.id, unit.up])) as UpgradeData;
const rowOf = (e: EcoData) => e.civEco.Tatars!.find((row) => (row as { tech?: number }).tech === 704)!;
const productivityOf = (e: EcoData) => rowOf(e).effects.find((effect) => effect.res === 216)!;
const workOf = (e: EcoData) => rowOf(e).effects.find((effect) => effect.target === 'task:sheep')!;
const product = productivityOf(E).v! * workOf(E).v!;
const note = '牧羊按产量与工作率配对估算；新增羊和资源耗尽未模拟';
const probe = (task: Task = 'sheep'): BuildOrder => ({
  id: 'tatars-pair-probe',
  name: { zh: '牧羊配对核对', en: 'paired shepherd probe' },
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
const run = (bo: BuildOrder, e = E, civ = 'Tatars', tiles = 2) => simulateBuild(bo, civ, e, ups, { autoHouses: false, nearTiles: tiles, walkTiles: tiles });
const expectedRate = (e: EcoData, multiplier: number, tiles = 2) => {
  const sheep = e.villager.tasks.sheep!;
  return sheep.carry / (sheep.carry / (sheep.workRate * multiplier) + (2 * tiles) / e.villager.speed);
};

describe('#197 鞑靼牧羊产量与工作率配对', () => {
  it('固定704源命令保留真实1.57与0.637及三个目标，净倍率不归一为1', () => {
    expect(productivityOf(E)).toEqual({ kind: 'res', label: '牧羊产量倍率', op: 'mul', res: 216, v: 1.57 });
    expect(rowOf(E).effects.filter((effect) => effect.attr === 'workRate')).toEqual([
      { kind: 'attr', target: 'task:sheep', attr: 'workRate', op: 'mul', v: 0.637 },
      { kind: 'attr', target: 'unit:1891', attr: 'workRate', op: 'mul', v: 0.637 },
      { kind: 'attr', target: 'unit:1892', attr: 'workRate', op: 'mul', v: 0.637 },
    ]);
    expect(product).toBeCloseTo(1.00009, 12);
    expect(product).not.toBe(1);
  });
  it.each([1, 3, 7])('距离%s：先配对主工作率再计算携带与往返，保留真实残差', (tiles) => {
    const rate = gatherRate(E, 'Tatars', 'sheep', tiles);
    expect(rate.workRate).toBeCloseTo(E.villager.tasks.sheep!.workRate * product, 12);
    expect(rate.workRate).not.toBe(E.villager.tasks.sheep!.workRate);
    expect(rate.carry).toBe(E.villager.tasks.sheep!.carry);
    expect(rate.rate).toBeCloseTo(expectedRate(E, product, tiles), 12);
    expect(rate.extraIncome).toEqual({});
  });
  it.each(['sheep', 'hunt'] as Task[])('%s实际Food按同一既有牧羊代理配对，不重复套1891/1892', (task) => {
    const result = run(probe(task)).steps[1]!;
    const generic = run(probe(task), E, 'Generic').steps[1]!;
    expect(result.startAt).toBe(generic.startAt);
    expect(result.stock.food).toBe(Math.floor(150 + 3 * expectedRate(E, product) * result.startAt));
    expect(result.stock.wood).toBe(generic.stock.wood);
    expect(result.stock.gold).toBe(generic.stock.gold);
    expect(result.pop).toEqual(generic.pop);
  });
  it.each(['sheep', 'hunt'] as Task[])('%s真实216输入翻倍会量化改变实际Food，不硬写50%或归一1', (task) => {
    const e = structuredClone(E);
    productivityOf(e).v! *= 2;
    const result = run(probe(task), e).steps[1]!;
    const generic = run(probe(task), e, 'Generic').steps[1]!;
    expect(result.startAt).toBe(generic.startAt);
    expect(result.stock.food).toBe(Math.floor(150 + 3 * expectedRate(e, product * 2) * result.startAt));
    expect(result.stock.food).toBeGreaterThan(generic.stock.food);
  });
  it('真实task:sheep工作率输入改变也能量化生效，额外牧羊变体不重复应用', () => {
    const e = structuredClone(E);
    workOf(e).v! *= 2;
    const result = run(probe(), e).steps[1]!;
    expect(result.stock.food).toBe(Math.floor(150 + 3 * expectedRate(e, product * 2) * result.startAt));
    expect(gatherRate(e, 'Tatars', 'sheep').workRate).toBeCloseTo(e.villager.tasks.sheep!.workRate * product * 2, 12);
  });
  it('不能在已算完往返的收入上再乘216，系数在主工作率阶段配对', () => {
    const e = structuredClone(E);
    productivityOf(e).v! *= 2;
    const rate = gatherRate(e, 'Tatars', 'sheep', 7);
    const wrongAfterWalk = expectedRate(e, workOf(e).v!, 7) * productivityOf(e).v!;
    expect(rate.rate).toBeCloseTo(expectedRate(e, product * 2, 7), 12);
    expect(Math.abs(rate.rate - wrongAfterWalk)).toBeGreaterThan(0.01);
  });
  it.each(['boar', 'deer', 'berries', 'farm', 'fish', 'wood', 'gold', 'stone', 'build'] as Task[])(
    '%s真实任务不获得羊倍率，实际库存/时间与通用相同',
    (task) => {
      expect(run(probe(task)).steps).toEqual(run(probe(task), E, 'Generic').steps);
      if (task !== 'build') {
        const ecoTask = task === 'boar' || task === 'deer' ? 'hunt' : task;
        expect(gatherRate(E, 'Tatars', ecoTask)).toEqual(gatherRate(E, 'Generic', ecoTask));
      }
    },
  );
  it.each(['carry', 'speed'] as const)('%s真实参数仍改变同一次主食物携带/往返', (kind) => {
    const e = structuredClone(E);
    if (kind === 'carry') e.villager.tasks.sheep!.carry *= 2;
    else e.villager.speed *= 2;
    productivityOf(e).v! *= 2;
    const result = run(probe(), e).steps[1]!;
    expect(result.stock.food).toBe(Math.floor(150 + 3 * expectedRate(e, product * 2) * result.startAt));
    expect(gatherRate(e, 'Tatars', 'sheep').rate).toBeCloseTo(expectedRate(e, product * 2), 12);
  });
  it('手推车改变携带/移速后配对只应用一次', () => {
    const e = structuredClone(E);
    e.techs[213] = { ...e.techs[213]!, cost: {}, researchTime: 0 };
    productivityOf(e).v! *= 2;
    const bo = probe();
    bo.steps[0]!.actions.push({ type: 'research', tech: 213 });
    const result = run(bo, e).steps[1]!;
    const mul = (attr: string) => e.ecoTechs[213]!.effects.find((effect) => effect.attr === attr && effect.target === 'class:4')!.v!;
    const sheep = e.villager.tasks.sheep!;
    const carry = sheep.carry * mul('carry');
    const upgraded = carry / (carry / (sheep.workRate * product * 2) + 4 / (e.villager.speed * mul('speed')));
    const primary = 3 * (expectedRate(e, product * 2) * 0.1 + upgraded * (result.startAt - 0.1));
    expect(result.stock.food).toBe(Math.floor(150 + primary));
  });
  it('时代变化不重复应用704的产量或工作率', () => {
    const e = structuredClone(E);
    e.ageReq = undefined;
    productivityOf(e).v! *= 2;
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
    for (const result of run(bo, e).steps.slice(1)) {
      // 既有界面startAt夹到上时代reachAt；库存快照在下一tick启动研究/完成空分配时取得。
      const snapshotAt = result.researchAt ?? result.doneAt;
      expect(result.stock.food).toBe(Math.floor(200 + 3 * expectedRate(e, product * 2) * snapshotAt));
    }
  });
  it('移除完整704时回到通用主率和实际库存', () => {
    const e = structuredClone(E);
    e.civEco.Tatars = e.civEco.Tatars!.filter((row) => (row as { tech?: number }).tech !== 704);
    expect(gatherRate(e, 'Tatars', 'sheep')).toEqual(gatherRate(e, 'Generic', 'sheep'));
    expect(run(probe(), e).steps).toEqual(run(probe(), e, 'Generic').steps);
  });
  it.each(['missing-216', 'missing-work', 'wrong-tech', 'wrong-source', 'wrong-216-op', 'wrong-work-op', 'unknown-companion'])(
    '坏704%s：实际模拟与helper都拒绝整条，不留下0.637半边减速',
    (variant) => {
      const e = structuredClone(E);
      const row = rowOf(e);
      if (variant === 'missing-216') row.effects = row.effects.filter((effect) => effect.res !== 216);
      else if (variant === 'missing-work') row.effects = row.effects.filter((effect) => effect.target !== 'task:sheep');
      else if (variant === 'wrong-tech') (row as { tech?: number }).tech = 9998;
      else if (variant === 'wrong-source') row.source = 'tree';
      else if (variant === 'wrong-216-op') productivityOf(e).op = 'add';
      else if (variant === 'wrong-work-op') workOf(e).op = 'add';
      else row.effects.push({ kind: 'res', res: 9999, op: 'set', v: 1 });
      expect(simSupport(e, 'Tatars', buildOrders).supported).toBe(false);
      expect(gatherRate(e, 'Tatars', 'sheep')).toEqual(gatherRate(e, 'Generic', 'sheep'));
      expect(run(probe(), e).steps).toEqual(run(probe(), e, 'Generic').steps);
      expect(civSimNotes(e, 'Tatars')).not.toContain(note);
    },
  );
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('216无效乘数%s整条拒绝，helper不保留减速', (value) => {
    const e = structuredClone(E);
    productivityOf(e).v = value;
    expect(simSupport(e, 'Tatars', buildOrders).supported).toBe(false);
    expect(gatherRate(e, 'Tatars', 'sheep')).toEqual(gatherRate(e, 'Generic', 'sheep'));
    expect(run(probe(), e).steps).toEqual(run(probe(), e, 'Generic').steps);
  });
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('工作率无效乘数%s整条拒绝，不单独应用216', (value) => {
    const e = structuredClone(E);
    workOf(e).v = value;
    expect(simSupport(e, 'Tatars', buildOrders).supported).toBe(false);
    expect(gatherRate(e, 'Tatars', 'sheep')).toEqual(gatherRate(e, 'Generic', 'sheep'));
    expect(run(probe(), e).steps).toEqual(run(probe(), e, 'Generic').steps);
  });
  it('其它文明即使携带704也不启用鞑靼配对或半边减速', () => {
    const e = structuredClone(E);
    e.civEco.Generic = [structuredClone(rowOf(e))];
    expect(gatherRate(e, 'Generic', 'sheep')).toEqual(gatherRate(E, 'Generic', 'sheep'));
    expect(run(probe(), e, 'Generic').steps).toEqual(run(probe(), E, 'Generic').steps);
  });
  it('城堡后新建两TC不直接赠送库存食物或村民，羊原始stored概念不改', () => {
    const e = structuredClone(E);
    e.ageReq = undefined;
    for (const id of [101, 102]) e.techs[id] = { ...e.techs[id]!, cost: {}, researchTime: 10 };
    e.buildings[109] = { ...e.buildings[109]!, cost: {}, buildTime: 5 };
    const bo = probe('build');
    bo.target = { age: 3, vils: 3 };
    bo.steps = [
      {
        vils: 3,
        actions: [
          { type: 'gather', task: 'build', count: 3 },
          { type: 'ageUp', age: 2 },
        ],
      },
      { vils: 3, phase: 'feudal', actions: [{ type: 'ageUp', age: 3 }] },
      { vils: 3, phase: 'castle', actions: [{ type: 'build', building: 109, count: 2 }] },
      { vils: 3, phase: 'castle', actions: [] },
    ];
    const result = run(bo, e);
    expect(result.buildingsDone.filter((done) => done.building === 109)).toHaveLength(2);
    expect(result.steps).toEqual(run(bo, e, 'Generic').steps);
    expect(result.steps.at(-1)!.stock.food).toBe(200);
    expect(animalFood(E, 'Tatars', 'sheep')).toBe(E.animals!.sheep!.food);
    expect(animalFood(E, 'Tatars', 'sheep')).toBe(100);
  });
  it('渔船主食物不获216，放大羊系数也不影响真实船收入', () => {
    const e = structuredClone(E);
    productivityOf(e).v! *= 2;
    e.villager.trainTime = 100;
    e.buildings[45] = { ...e.buildings[45]!, cost: {}, buildTime: 0 };
    e.buildings[70] = { ...e.buildings[70]!, cost: {}, buildTime: 0 };
    e.units[13] = { ...e.units[13]!, cost: {}, trainTime: 10, timeAt: { 45: 10 } };
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
      { vils: 3, actions: [{ type: 'train', unit: 13 }] },
      { vils: 4, actions: [] },
    ];
    const result = run(bo, e);
    expect(result.steps.at(-1)!.stock.food).toBeGreaterThan(150);
    expect(result.steps).toEqual(run(bo, e, 'Generic').steps);
  });
  it('支持/附注显示配对及羊实体边界', () => {
    expect(simSupport(E, 'Tatars', buildOrders)).toEqual({ supported: true, reasons: [] });
    expect(civSimNotes(E, 'Tatars')).toContain(note);
    const assumptions = run(probe()).model.assumptions.join('');
    expect(assumptions).toContain('近城镇中心肉类');
    expect(assumptions).toContain('不模拟新增羊实体');
  });
  it('其它未支持者和独立真实成本的完整原农田模型保持', () => {
    expect(simSupport(E, 'Slavs', buildOrders).supported).toBe(false);
    expect(simSupport(E, 'Chinese', buildOrders).supported).toBe(false);
    for (const age of [1, 2, 3, 4]) {
      expect(gatherModel(age, 'Tatars')).toEqual({ ...gatherModel(age), civ: 'Tatars' });
      expect(gatherModel(age, 'Tatars').applied).toEqual([]);
      expect(gatherModel(age, 'Tatars').unsupported).toEqual([]);
    }
  });
});
