import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import type { BuildOrder, Task } from '../../src/domain/buildOrder';
import { civSimNotes, gatherRate, simSupport, simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { gatherModel } from '../../src/domain/realCost';
import { civBonuses } from '../../src/domain/civBonus';
import { bonusUsage } from '../../src/domain/bonusUsage';
import { civs } from '../../src/data';

const E = eco as unknown as EcoData;
const ups = Object.fromEntries(units.filter((unit) => unit.up).map((unit) => [unit.id, unit.up])) as UpgradeData;
const tree = (e: EcoData) => e.civEco.Mayans!.find((row) => row.source === 'tree')!;
const team = (e: EcoData) => e.civEco.Mayans!.find((row) => row.source === 'team')!;
const resource = (e: EcoData, id: number) => tree(e).effects.find((effect) => effect.res === id)!;
const work = (e: EcoData, task: string) => tree(e).effects.find((effect) => effect.target === 'task:' + task && effect.attr === 'workRate')!;
const pairs = [
  ['gold', 47],
  ['stone', 79],
  ['wood', 189],
  ['farm', 190],
  ['sheep', 216],
  ['hunt', 268],
  ['fish', 219],
  ['berries', 296],
] as const;
const withoutTree = (e = E) => ({ ...e, civEco: { ...e.civEco, Mayans: e.civEco.Mayans!.filter((row) => row.source !== 'tree') } });
const note = '资源产量与工作率配对估算；储量和耗尽未模拟';
const templateNote = '玛雅无马厩；侦察骑兵、骑士方案仅供通用模板经济估算';
const probe = (task: Task = 'sheep'): BuildOrder => ({
  id: 'mayans-pair-probe',
  name: { zh: '玛雅采集核对', en: 'paired productivity probe' },
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
    { vils: 4, actions: [{ type: 'gather', task, count: 4 }] },
    { vils: 4, actions: [{ type: 'ageUp', age: 2 }] },
    { vils: 4, phase: 'feudal', actions: [] },
  ],
});
const probeEco = (e = E) => {
  const result = structuredClone(e);
  result.ageReq = undefined;
  result.techs[101] = { ...result.techs[101]!, cost: {}, researchTime: 20 };
  return result;
};
const run = (bo: BuildOrder, e = E, tiles = 2, isTeam = false, civ = 'Mayans') =>
  simulateBuild(bo, civ, e, ups, { autoHouses: false, nearTiles: tiles, walkTiles: tiles, team: isTeam });
const rate = (e: EcoData, task: string, multiplier: number, tiles = 2) => {
  const base = e.villager.tasks[task]!;
  return base.carry / (base.carry / (base.workRate * multiplier) + (2 * tiles) / e.villager.speed);
};
const stockResource = (task: Task) => (task === 'wood' ? 'wood' : task === 'gold' ? 'gold' : task === 'stone' ? 'stone' : 'food');

describe('#197 玛雅完整资源与工作率配对', () => {
  it('固定原始任务各自读取一个生产率资源，保留真正系数和起始事件', () => {
    const raw = JSON.parse(readFileSync(new URL('../../docs/design/mayans197-source.json', import.meta.url), 'utf8'));
    expect(raw.datSource.sha256).toBe('4aa2f0a719e88e5f1502517eddb27c669aeb40c2fe9d8c4f3eec7751c01e7baa');
    expect(raw.civTechs).toHaveLength(9);
    expect(Object.keys(raw.techClosure)).toHaveLength(133);
    expect(raw.civTechs.find((row: { id: number }) => row.id === 554).commands).toEqual([
      { Type: 1, A: 234, B: 0, C: -1, D: 1 },
      { Type: 7, A: 83, B: 619, C: 1, D: 0 },
    ]);
    const taskUnits: Record<string, number> = { gold: 579, stone: 124, wood: 123, farm: 259, sheep: 592, hunt: 122, fish: 56, berries: 120 };
    for (const [task, id] of pairs) {
      expect(
        raw.trackedUnits[taskUnits[task]!].tasks.some((x: { resMul: number }) => x.resMul === id),
        task,
      ).toBe(true);
      expect(resource(E, id).v).toBe(1.15);
      expect(work(E, task).v).toBe(task === 'farm' ? 0.81 : 0.87);
    }
    expect(raw.trackedUnits[13].tasks.some((x: { resMul: number }) => x.resMul === 219)).toBe(true);
  });
  for (const [task, id] of pairs) {
    it.each([0, 1, 3, 7])(`${task} 距离%s：只配本任务${id}，不叠idle0.87或其它食物资源`, (tiles) => {
      const multiplier = resource(E, id).v! * work(E, task).v!;
      const result = gatherRate(E, 'Mayans', task, tiles);
      expect(result.workRate).toBeCloseTo(E.villager.tasks[task]!.workRate * multiplier, 12);
      expect(result.rate).toBeCloseTo(rate(E, task, multiplier, tiles), 12);
      expect(result.carry).toBe(E.villager.tasks[task]!.carry);
      expect(result.extraIncome).toEqual({});
      expect(multiplier).toBeCloseTo(task === 'farm' ? 0.9315 : 1.0005, 12);
      expect(multiplier).not.toBe(1);
    });
    it(`${task} 真正库存使用配对后的率，没有库存赠送`, () => {
      const e = probeEco();
      const p = probe(task === 'hunt' ? 'boar' : task);
      const result = run(p, e).steps[2]!;
      const field = stockResource(task);
      const initial = field === 'food' ? 150 : field === 'gold' ? 100 : 200;
      expect(result.stock[field]).toBe(Math.floor(initial + 4 * rate(e, task, resource(e, id).v! * work(e, task).v!) * result.doneAt));
      expect(result.pop.used).toBe(5);
      const without = run(p, probeEco(withoutTree())).steps[2]!;
      expect(result.startAt).toBe(without.startAt);
    });
    it(`${task} 改变真实${id}系数只改变对应任务，不硬写1.15`, () => {
      const e = probeEco();
      resource(e, id).v! *= 2;
      const target = gatherRate(e, 'Mayans', task, 7);
      expect(target.rate).toBeCloseTo(rate(e, task, resource(e, id).v! * work(e, task).v!, 7), 12);
      const field = stockResource(task);
      const result = run(probe(task === 'hunt' ? 'boar' : task), e, 7).steps[2]!;
      const initial = field === 'food' ? 150 : field === 'gold' ? 100 : 200;
      expect(result.stock[field]).toBe(Math.floor(initial + 4 * target.rate * result.doneAt));
      for (const [other] of pairs.filter(([other]) => other !== task)) expect(gatherRate(e, 'Mayans', other)).toEqual(gatherRate(E, 'Mayans', other));
    });
    it.each(['resource', 'work'] as const)(`${task} %s真实输入翻倍独立量化库存，结果不被floor掩盖`, (kind) => {
      const e = probeEco();
      if (kind === 'resource') resource(e, id).v! *= 2;
      else work(e, task).v! *= 2;
      const actualTask = task === 'hunt' ? 'boar' : task;
      const result = run(probe(actualTask), e).steps[2]!;
      const field = stockResource(task);
      const initial = field === 'food' ? 150 : field === 'gold' ? 100 : 200;
      const expected = Math.floor(initial + 4 * rate(e, task, resource(e, id).v! * work(e, task).v!) * result.doneAt);
      expect(result.stock[field]).toBe(expected);
      expect(result.stock[field]).toBeGreaterThan(run(probe(actualTask), probeEco()).steps[2]!.stock[field]);
    });
  }
  it('普通idle和额外牧羊/猎人对象没有第二次乘到专职任务', () => {
    const e = structuredClone(E);
    for (const effect of tree(e).effects.filter(
      (effect) => ['villager', 'unit:1891', 'unit:1892', 'unit:2333', 'unit:2334'].includes(effect.target ?? '') && effect.attr === 'workRate',
    ))
      effect.v! *= 2;
    for (const [task] of pairs) expect(gatherRate(e, 'Mayans', task)).toEqual(gatherRate(E, 'Mayans', task));
    expect(gatherRate(E, 'Mayans', 'build')).toEqual(gatherRate(E, 'Generic', 'build'));
  });
  it.each(['boar', 'deer', 'hunt'] as Task[])('%s BO映射使用原始对应任务，不把190叠所有食物', (task) => {
    const e = probeEco();
    const isSheep = task === 'hunt';
    const et = isSheep ? 'sheep' : 'hunt';
    const id = isSheep ? 216 : 268;
    resource(e, id).v! *= 2;
    const result = run(probe(task), e).steps[2]!;
    expect(result.stock.food).toBe(Math.floor(150 + 4 * rate(e, et, resource(e, id).v! * work(e, et).v!) * result.doneAt));
  });
  it('携带与移速在配对之后计算，不能在有效率上再乘1.15', () => {
    const e = structuredClone(E);
    e.villager.tasks.gold!.carry *= 2;
    e.villager.speed *= 2;
    resource(e, 47).v! *= 2;
    const result = gatherRate(e, 'Mayans', 'gold', 7);
    expect(result.rate).toBeCloseTo(rate(e, 'gold', resource(e, 47).v! * work(e, 'gold').v!, 7), 12);
    expect(Math.abs(result.rate - rate(e, 'gold', work(e, 'gold').v!, 7) * resource(e, 47).v!)).toBeGreaterThan(0.01);
  });
  it('时代变化不重复应用玛雅配对', () => {
    const e = probeEco();
    e.ageReq = undefined;
    for (const id of [101, 102]) e.techs[id] = { ...e.techs[id]!, cost: {}, researchTime: 10 };
    const p = probe('gold');
    p.target = { age: 3, vils: 4 };
    p.steps = [
      {
        vils: 4,
        actions: [
          { type: 'gather', task: 'gold', count: 4 },
          { type: 'ageUp', age: 2 },
        ],
      },
      { vils: 4, phase: 'feudal', actions: [{ type: 'ageUp', age: 3 }] },
      { vils: 4, phase: 'castle', actions: [] },
    ];
    for (const result of run(p, e).steps.slice(1))
      expect(result.stock.gold).toBe(Math.floor(100 + 4 * rate(e, 'gold', 1.0005) * (result.researchAt ?? result.doneAt)));
  });
  it('真实47翻倍后的两次升级库存按同一2.001净率累计，时代重套会显著失败', () => {
    const e = probeEco();
    resource(e, 47).v! *= 2;
    for (const id of [101, 102]) e.techs[id] = { ...e.techs[id]!, cost: {}, researchTime: 10 };
    const p = probe('gold');
    p.target = { age: 3, vils: 4 };
    p.steps = [
      {
        vils: 4,
        actions: [
          { type: 'gather', task: 'gold', count: 4 },
          { type: 'ageUp', age: 2 },
        ],
      },
      { vils: 4, phase: 'feudal', actions: [{ type: 'ageUp', age: 3 }] },
      { vils: 4, phase: 'castle', actions: [] },
    ];
    for (const result of run(p, e).steps.slice(1))
      expect(result.stock.gold).toBe(Math.floor(100 + 4 * rate(e, 'gold', 2.001) * (result.researchAt ?? result.doneAt)));
  });
  it('渔船按自己的class21与219配对，保留deepFish/携带和距离，不乘村民倍率', () => {
    const e = probeEco();
    e.buildings[45] = { ...e.buildings[45]!, cost: {}, buildTime: 0 };
    e.buildings[70] = { ...e.buildings[70]!, cost: {}, buildTime: 0 };
    e.units[13] = { ...e.units[13]!, cost: {}, trainTime: 1, timeAt: undefined };
    resource(e, 219).v! *= 2;
    const p = probe('build');
    p.steps = [
      {
        vils: 4,
        actions: [
          { type: 'gather', task: 'build', count: 4 },
          { type: 'build', building: 45 },
          { type: 'build', building: 70 },
        ],
      },
      {
        vils: 4,
        actions: [
          { type: 'train', unit: 13 },
          { type: 'ageUp', age: 2 },
        ],
      },
      { vils: 4, phase: 'feudal', actions: [] },
    ];
    const result = run(p, e, 7);
    const ship = e.fishingShip!;
    const wr = ship.workRate * (ship.deepFishMultiplier ?? 1) * 0.87 * resource(e, 219).v!;
    const q = ship.carry / (ship.carry / wr + (2 * 7) / ship.speed);
    const completeAt = result.steps[1]!.doneAt - e.techs[101]!.researchTime + e.units[13]!.trainTime;
    expect(result.steps[2]!.stock.food).toBe(Math.floor(150 + q * (result.steps[2]!.doneAt - completeAt)));
    expect(result.steps[2]!.pop.used).toBe(6);
  });
  it.each([
    'missing-resource',
    'missing-work',
    'wrong-source',
    'wrong-age',
    'wrong-resource-op',
    'wrong-work-op',
    'duplicate-resource',
    'duplicate-work',
    'missing-variant',
    'unknown-companion',
  ])('坏tree%s：主模拟和helper拒绝整条，不能留下半边工作率', (variant) => {
    const e = probeEco();
    const row = tree(e);
    if (variant === 'missing-resource') row.effects = row.effects.filter((effect) => effect.res !== 47);
    else if (variant === 'missing-work') row.effects = row.effects.filter((effect) => effect.target !== 'task:gold');
    else if (variant === 'wrong-source') row.source = 'bonus';
    else if (variant === 'wrong-age') row.age = 2;
    else if (variant === 'wrong-resource-op') resource(e, 47).op = 'add';
    else if (variant === 'wrong-work-op') work(e, 'gold').op = 'add';
    else if (variant === 'duplicate-resource') row.effects.push({ ...resource(e, 47) });
    else if (variant === 'duplicate-work') row.effects.push({ ...work(e, 'gold') });
    else if (variant === 'missing-variant') row.effects = row.effects.filter((effect) => effect.target !== 'unit:2333');
    else row.effects.push({ kind: 'res', res: 9999, op: 'set', v: 1 });
    expect(simSupport(e, 'Mayans', buildOrders).supported).toBe(false);
    for (const [task] of pairs) expect(gatherRate(e, 'Mayans', task)).toEqual(gatherRate(E, 'Generic', task));
    expect(run(probe('gold'), e).steps).toEqual(run(probe('gold'), probeEco(withoutTree())).steps);
    expect(civSimNotes(e, 'Mayans')).not.toContain(note);
  });
  for (const target of ['resource', 'work', 'idle', 'boat', 'variant'] as const)
    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(`${target}无效乘数%s：整行拒绝`, (value) => {
      const e = probeEco();
      const effect =
        target === 'resource'
          ? resource(e, 47)
          : target === 'work'
            ? work(e, 'gold')
            : tree(e).effects.find(
                (effect) => effect.attr === 'workRate' && effect.target === (target === 'idle' ? 'villager' : target === 'boat' ? 'class:21' : 'unit:1891'),
              )!;
      effect.v = value;
      expect(simSupport(e, 'Mayans', buildOrders).supported).toBe(false);
      expect(gatherRate(e, 'Mayans', 'gold')).toEqual(gatherRate(E, 'Generic', 'gold'));
      expect(run(probe('gold'), e).steps).toEqual(run(probe('gold'), probeEco(withoutTree())).steps);
    });
  it('其它文明携带玛雅整树也不能启用局部配对或留下半边减速', () => {
    const e = structuredClone(E);
    e.civEco.Generic = [structuredClone(tree(e))];
    for (const [task] of pairs) expect(gatherRate(e, 'Generic', task)).toEqual(gatherRate(E, 'Generic', task));
  });
  it('重复完整tree整组拒绝：helper、实际库存与附注保持同一口径', () => {
    const e = probeEco();
    e.civEco.Mayans!.push(structuredClone(tree(e)));
    expect(simSupport(e, 'Mayans', buildOrders).supported).toBe(false);
    expect({ rate: gatherRate(e, 'Mayans', 'farm'), steps: run(probe('farm'), e).steps, note: civSimNotes(e, 'Mayans').includes(note) }).toEqual({
      rate: gatherRate(E, 'Generic', 'farm'),
      steps: run(probe('farm'), probeEco(withoutTree())).steps,
      note: false,
    });
  });
});

describe('#197 玛雅起始、队列与墙团队开关', () => {
  it.each([
    [2, 22.5, 40.5],
    [3, 20, 36],
    [4, 17.5, 31.5],
  ])('时代%s：弓手实际费用按原始连乘与原半价口径支付', (age, wood, gold) => {
    const e = probeEco();
    e.buildings[70] = { ...e.buildings[70]!, cost: {}, buildTime: 0 };
    e.buildings[87] = { ...e.buildings[87]!, cost: {}, buildTime: 0 };
    for (const id of [101, 102, 103]) e.techs[id] = { ...e.techs[id]!, cost: {}, researchTime: 1 };
    const p = probe('build');
    p.target.age = age as 2 | 3 | 4;
    p.steps = [
      {
        vils: 4,
        actions: [
          { type: 'gather', task: 'build', count: 4 },
          { type: 'build', building: 70 },
          { type: 'build', building: 87 },
          { type: 'ageUp', age: 2 },
        ],
      },
    ];
    if (age >= 3) p.steps.push({ vils: 4, phase: 'feudal', actions: [{ type: 'ageUp', age: 3 }] });
    if (age >= 4) p.steps.push({ vils: 4, phase: 'castle', actions: [{ type: 'ageUp', age: 4 }] });
    p.steps.push({ vils: 4, phase: age === 2 ? 'feudal' : age === 3 ? 'castle' : 'imperial', actions: [{ type: 'train', unit: 4 }] });
    const last = run(p, e).steps.at(-1)!;
    expect(last.cost).toEqual({ food: 0, wood, gold, stone: 0 });
  });
  it('原有四村/-50食物/5人口保留，没有额外赠食或免费织布', () => {
    const p = probe('build');
    p.steps[1]!.actions = [{ type: 'research', tech: 22 }];
    p.steps[2]!.phase = undefined;
    const result = run(p).steps;
    expect(result[0]!.stock).toEqual({ food: 150, wood: 200, gold: 100, stone: 200 });
    expect(result[0]!.pop).toEqual({ used: 5, cap: 5 });
    expect(result[0]!.villagers.build).toBe(4);
    expect(result[2]!.stock.gold).toBe(100 - E.techs[22]!.cost.Gold!);
    expect(result[1]!.doneAt - result[1]!.researchAt!).toBeCloseTo(E.techs[22]!.researchTime, 1);
  });
  it('训练第五村仍付真实食物并占队列，没有重复初始生成', () => {
    const e = structuredClone(E);
    e.buildings[70] = { ...e.buildings[70]!, cost: {}, buildTime: 0 };
    const p = probe('build');
    p.target.vils = 5;
    p.steps = [
      {
        vils: 4,
        actions: [
          { type: 'gather', task: 'build', count: 4 },
          { type: 'build', building: 70 },
        ],
      },
      { vils: 5, actions: [] },
    ];
    const result = run(p, e);
    expect(result.steps[1]!.stock.food).toBe(150 - E.villager.cost.Food!);
    expect(result.steps[1]!.pop.used).toBe(6);
    expect(result.villagerEvents).toHaveLength(1);
    expect(result.villagerEvents![0]!.to - result.villagerEvents![0]!.from).toBeCloseTo(E.villager.trainTime, 1);
  });
  const wallProbe = (building = 72): BuildOrder => ({
    ...probe('build'),
    steps: [
      { vils: 4, actions: [{ type: 'gather', task: 'build', count: 4 }] },
      { vils: 4, actions: [{ type: 'build', building }] },
      { vils: 4, actions: [] },
    ],
  });
  it('墙木费只在显式team开关折半，实际库存扣款按半价模型', () => {
    const off = run(wallProbe());
    const on = run(wallProbe(), E, 2, true);
    expect(off.steps[1]!.cost!.wood).toBe(E.buildings[72]!.cost.Wood);
    expect(on.steps[1]!.cost!.wood).toBe(E.buildings[72]!.cost.Wood! / 2);
    expect(off.steps[2]!.stock.wood).toBe(200 - off.steps[1]!.cost!.wood);
    expect(on.steps[2]!.stock.wood).toBe(Math.floor(200 - on.steps[1]!.cost!.wood));
    expect(on.steps[1]!.doneAt).toBe(off.steps[1]!.doneAt);
    expect(run(wallProbe(70), E, 2, true).steps).toEqual(run(wallProbe(70)).steps);
  });
  it.each([
    [487, 'stone', 'Stone'],
    [792, 'wood', 'Wood'],
  ] as const)('class39城门%s：%s实际支付折半，不能只实现木墙', (building, field, costField) => {
    const off = run(wallProbe(building));
    const on = run(wallProbe(building), E, 2, true);
    expect(off.steps[1]!.cost![field]).toBe(E.buildings[building]!.cost[costField]);
    expect(on.steps[1]!.cost![field]).toBe(E.buildings[building]!.cost[costField]! / 2);
    expect(off.steps[2]!.stock[field]).toBe(200 - off.steps[1]!.cost![field]);
    expect(on.steps[2]!.stock[field]).toBe(200 - on.steps[1]!.cost![field]);
  });
  it('真实drush-fc完整动作块受控核验全部木费，不把首个房子cost误当整步支付', () => {
    const original = buildOrders
      .find((bo) => bo.id === 'drush-fc')!
      .steps.find((step) => step.actions.some((action) => action.type === 'build' && action.building === 72))!;
    const e = structuredClone(E);
    e.civEco.Mayans!.find((row) => (row as { tech?: number }).tech === 227)!.effects.push({ kind: 'res', res: 92, op: 'add', v: 500 });
    const p = wallProbe();
    p.steps[1] = { ...structuredClone(original), vils: 4 };
    const cost = (isTeam: boolean) =>
      original.actions.reduce(
        (sum, action) =>
          action.type !== 'build'
            ? sum
            : sum +
              (E.buildings[action.building]!.cost.Wood ?? 0) *
                (action.count ?? 1) *
                (isTeam && [27, 39].includes(E.buildings[action.building]!.class!) ? 0.5 : 1),
        0,
      );
    expect(cost(false)).toBe(228);
    expect(cost(true)).toBe(226.5);
    expect(run(p, e).steps[2]!.stock.wood).toBe(Math.floor(700 - cost(false)));
    expect(run(p, e, 2, true).steps[2]!.stock.wood).toBe(Math.floor(700 - cost(true)));
  });
  it('原始drush-fc完整执行的team开关真实改变支付后的步骤结果', () => {
    const original = buildOrders.find((bo) => bo.id === 'drush-fc')!;
    const projection = (isTeam: boolean) => run(original, E, 2, isTeam).steps.map((step) => [step.doneAt, step.stock]);
    expect(projection(true)).not.toEqual(projection(false));
  });
  it('重复完整team整组拒绝优惠，默认team关闭与支持状态不受无关坏团队影响', () => {
    const e = structuredClone(E);
    e.civEco.Mayans!.push(structuredClone(team(e)));
    expect(simSupport(e, 'Mayans', buildOrders).supported).toBe(true);
    expect(run(wallProbe(), e).steps).toEqual(run(wallProbe()).steps);
    expect(run(wallProbe(), e, 2, true).steps[1]!.cost!.wood).toBe(E.buildings[72]!.cost.Wood);
  });
  it.each(['missing-class', 'wrong-op', 'invalid', 'unknown-companion'])('坏team%s整条不付半边墙费', (variant) => {
    const e = structuredClone(E);
    if (variant === 'missing-class') team(e).effects = team(e).effects.filter((effect) => effect.target !== 'class:39');
    else if (variant === 'wrong-op') team(e).effects[0]!.op = 'add';
    else if (variant === 'invalid') team(e).effects[0]!.v = Number.NaN;
    else team(e).effects.push({ kind: 'res', res: 9999, op: 'set', v: 1 });
    expect(run(wallProbe(), e, 2, true).steps).toEqual(run(wallProbe(), e).steps);
  });
  it('玛雅来源详情写明配对边界，独立真实成本原解释和数值保留', () => {
    const bonus = civBonuses(civs.find((civ) => civ.en === 'Mayans')!).find((bonus) => bonus.idx === 1)!;
    expect(bonusUsage(bonus).find((line) => line.tool === 'sim')).toMatchObject({ on: true, note: '已计入资源产量与工作率配对；储量和耗尽未模拟' });
    for (const age of [1, 2, 3, 4]) {
      const result = gatherModel(age, 'Mayans');
      expect(result.rate).toEqual(gatherModel(age, '').rate);
      expect(result.applied).toEqual([]);
      expect(result.unsupported.length).toBeGreaterThan(0);
    }
    expect(civSimNotes(E, 'Mayans')).toContain(note);
    expect(civSimNotes(E, 'Mayans')).toContain(templateNote);
    expect(simSupport(E, 'Mayans', buildOrders)).toEqual({ supported: true, reasons: [] });
    expect(simSupport(E, 'Georgians', buildOrders).supported).toBe(false);
  });
});
