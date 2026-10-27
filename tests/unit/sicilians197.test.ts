import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { CONSTRUCTION_DATA } from '../../src/data/construction';
import { buildOrders } from '../../src/data/buildOrders';
import type { BuildOrder } from '../../src/domain/buildOrder';
import { civSimNotes, gatherRate, simSupport, simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { gatherModel } from '../../src/domain/realCost';

const E = eco as unknown as EcoData;
const ups = Object.fromEntries(units.filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const rowOf = (e: EcoData, tech: number) => e.civEco.Sicilians!.find((r) => (r as { tech?: number }).tech === tech)!;
const without = (e: EcoData, tech: number): EcoData => ({
  ...e,
  civEco: { ...e.civEco, Sicilians: e.civEco.Sicilians!.filter((r) => (r as { tech?: number }).tech !== tech) },
});
const constructionNote = '按实际施工形态计入城镇中心、城堡和防御工事加成';
const farmNote = '农田升级额外储量、耗尽和续种未模拟';
const multiplier = (e: EcoData, target: string) => rowOf(e, 770).effects.find((x) => x.target === target)!.v!;
const raw = JSON.parse(readFileSync(new URL('../../docs/design/sicilians197-source.json', import.meta.url), 'utf8'));
const probe = (building = 72, builders = 1): BuildOrder => ({
  id: 'sicilians-construction-probe',
  name: { zh: '西西里施工核对', en: 'Sicilian construction probe' },
  style: 'other',
  civs: [],
  map: 'test',
  difficulty: 'beginner',
  target: { age: 2, vils: 3 },
  summary: 'test',
  sources: [],
  license: 'test',
  review: { status: 'draft' },
  steps: [
    {
      vils: 3,
      actions: [
        { type: 'gather', task: 'build', count: builders },
        { type: 'gather', task: 'wood', count: 3 - builders },
        { type: 'build', building },
      ],
    },
  ],
});
const run = (bo: BuildOrder, e = E, team = false, civ = 'Sicilians', autoHouses = false) => simulateBuild(bo, civ, e, ups, { autoHouses, team });
const freeBuilding = (building: number) => {
  const e = structuredClone(E);
  e.buildings[building]!.cost = {};
  return e;
};
const duration = (bo: BuildOrder, e = E) => {
  const step = run(bo, e).steps[0]!;
  return step.doneAt - step.startAt;
};

describe('#197 西西里真实施工与农田储量边界', () => {
  it('固定原始11项专属科技、133前置闭包与8套当前动作；770和772不能靠文字猜数', () => {
    expect(raw.baseline).toBe('7098ff0cba6a915766f38ca8c152ce35cc3cfcc6');
    expect(raw.datSource.sha256).toBe(CONSTRUCTION_DATA.meta.sha256);
    expect(raw.civ).toMatchObject({ id: 37, name: 'Sicilians', tree: 784, team: 785 });
    expect(raw.civTechs.map((t: { id: number }) => t.id)).toEqual([228, 261, 749, 752, 753, 756, 757, 770, 771, 772, 775]);
    expect(Object.keys(raw.techClosure)).toHaveLength(133);
    expect(Object.fromEntries(raw.buildOrders.map((bo: { id: string; actions: { action: unknown }[] }) => [bo.id, bo.actions.map((a) => a.action)]))).toEqual(
      Object.fromEntries(buildOrders.map((bo) => [bo.id, bo.steps.flatMap((s) => s.actions)])),
    );
    const t = raw.civTechs.find((t: { id: number }) => t.id === 770);
    expect(t.requires.filter((id: number) => id >= 0)).toEqual([307]);
    expect(t.commands).toHaveLength(8);
    expect(t.commands.map((c: { Type: number; A: number; B: number; C: number }) => [c.Type, c.A, c.B, c.C])).toEqual([
      [5, 82, -1, 101],
      [5, 621, -1, 101],
      [5, 617, -1, 101],
      [5, 484, -1, 101],
      [5, 597, -1, 101],
      [5, -1, 27, 101],
      [5, -1, 39, 101],
      [5, -1, 52, 101],
    ]);
    expect(raw.civTechs.find((t: { id: number }) => t.id === 772).commands).toEqual([{ Type: 6, A: 69, B: -1, C: -1, D: 2.25 }]);
  });

  it('TC施工映射是四个class3 annex150，完成TC109的100不能冒充施工基数', () => {
    expect(E.buildings[109]).toMatchObject({ class: 3, buildTime: 100 });
    expect(CONSTRUCTION_DATA.buildings[109]!.forms).toEqual([621, 617, 484, 597]);
    for (const id of CONSTRUCTION_DATA.buildings[109]!.forms) {
      expect(E.buildings[id]).toBeUndefined();
      expect(CONSTRUCTION_DATA.civs.Sicilians!.units[id]).toMatchObject({ class: 3, time: 150, rate: 1, at: [118] });
      expect(multiplier(E, 'unit:' + id)).toBe(0.5);
    }
  });

  it.each([1, 2, 3])('%s人建TC：从实际annex读取工期后应用半时长和既有多人公式', (builders) => {
    const e = freeBuilding(109);
    const form = CONSTRUCTION_DATA.buildings[109]!.forms[0]!;
    const expected = (CONSTRUCTION_DATA.civs.Sicilians!.units[form]!.time * multiplier(e, 'unit:' + form) * 3) / (builders + 2);
    expect(Math.abs(duration(probe(109, builders), e) - expected)).toBeLessThanOrEqual(0.100001);
    expect(duration(probe(109, builders), e)).not.toBeCloseTo((e.buildings[109]!.buildTime * 0.5 * 3) / (builders + 2), 1);
    expect(duration(probe(109, builders), e)).not.toBeCloseTo((150 * multiplier(e, 'class:52') * 3) / (builders + 2), 1);
  });

  it.each([
    [72, 27],
    [487, 39],
    [79, 52],
    [82, null],
  ] as const)('建筑%s按完整770的对应目标缩短真实工期', (building, cls) => {
    const e = freeBuilding(building);
    const target = cls === null ? 'unit:' + building : 'class:' + cls;
    for (const builders of [1, 3]) {
      const expected = (e.buildings[building]!.buildTime * multiplier(e, target) * 3) / (builders + 2);
      expect(Math.abs(duration(probe(building, builders), e) - expected)).toBeLessThanOrEqual(0.100001);
    }
  });

  it('真实输入倍率改变会改变施工，不能硬编码75或三分之二', () => {
    const e = freeBuilding(109);
    rowOf(e, 770).effects.find((x) => x.target === 'unit:621')!.v = 0.4;
    expect(Math.abs(duration(probe(109), e) - CONSTRUCTION_DATA.civs.Sicilians!.units[621]!.time * 0.4)).toBeLessThanOrEqual(0.100001);
    const wall = freeBuilding(72);
    rowOf(wall, 770).effects.find((x) => x.target === 'class:27')!.v = 0.4;
    expect(Math.abs(duration(probe(72), wall) - wall.buildings[72]!.buildTime * 0.4)).toBeLessThanOrEqual(0.100001);
  });

  it('TC真实施工输入改变时读取数据；缺失或非法源形态不能退回完成态100并放行', () => {
    const source = CONSTRUCTION_DATA.civs.Sicilians!.units;
    const original = source[621]!;
    try {
      source[621] = { ...original, time: original.time + 20 };
      const e = freeBuilding(109);
      expect(Math.abs(duration(probe(109), e) - (original.time + 20) * multiplier(e, 'unit:621'))).toBeLessThanOrEqual(0.100001);
      for (const value of [0, Number.NaN, Number.POSITIVE_INFINITY]) {
        source[621] = { ...original, time: value };
        expect(simSupport(structuredClone(E), 'Sicilians', buildOrders).supported).toBe(false);
      }
      delete source[621];
      expect(simSupport(structuredClone(E), 'Sicilians', buildOrders).supported).toBe(false);
    } finally {
      source[621] = original;
    }
  });

  it('真实drush木栅栏更早建成，费用和此前房屋保持；不是仅解除69警告', () => {
    const bo = buildOrders.find((b) => b.id === 'drush-fc')!;
    const result = run(bo),
      control = run(bo, without(E, 770));
    const wall = result.buildingsDone.find((b) => b.building === 72)!,
      base = control.buildingsDone.find((b) => b.building === 72)!;
    expect(wall.at).toBeLessThan(base.at - 2);
    expect(result.steps[0]).toEqual(control.steps[0]);
    expect(result.steps.map((s) => s.cost)).toEqual(control.steps.map((s) => s.cost));
  });

  it('真实boom两TC按城堡annex施工，不新增村民队列或重复送100石', () => {
    const bo = buildOrders.find((b) => b.id === 'fast-castle-boom')!;
    const result = run(bo),
      control = run(bo, without(E, 770));
    expect(result.buildingsDone.filter((b) => b.building === 109)).toHaveLength(2);
    const step = result.steps.at(-1)!,
      base = control.steps.at(-1)!;
    expect(step.doneAt).toBeLessThan(base.doneAt);
    const actualTCs = result.buildingsDone.filter((b) => b.building === 109),
      controlTCs = control.buildingsDone.filter((b) => b.building === 109);
    for (let index = 0; index < 2; index++) expect(actualTCs[index]!.at).toBeCloseTo(controlTCs[index]!.at - 25, 6);
    expect(step.cost).toEqual({ food: 0, wood: E.buildings[109]!.cost.Wood! * 2, gold: 0, stone: E.buildings[109]!.cost.Stone! * 2 });
    expect(result.villagerEvents).toEqual(control.villagerEvents);
    expect(step.stock.stone).toBe(300);
    expect(step.pop.used).toBe(base.pop.used);
  });

  it('boom完工后观察：只扣两TC实际费用和增加10人口上限，不赠石或新村民', () => {
    const bo = structuredClone(buildOrders.find((b) => b.id === 'fast-castle-boom')!);
    const e = structuredClone(E);
    e.ageReq = undefined;
    e.techs[103] = { ...e.techs[103]!, researchTime: 200, cost: {} };
    bo.steps.push({ vils: 25, actions: [{ type: 'ageUp', age: 4 }] }, { vils: 25, phase: 'imperial', actions: [] });
    const result = run(bo, e),
      observer = result.steps.at(-1)!;
    const tcStep = result.steps.find((s) => s.entity?.kind === 'building' && s.entity.id === '109')!;
    expect(result.buildingsDone.filter((b) => b.building === 109)).toHaveLength(2);
    expect(observer.stock.stone).toBe(300 - 2 * E.buildings[109]!.cost.Stone!);
    expect(observer.pop.cap).toBe(tcStep.pop.cap + 10);
    expect(observer.pop.used).toBe(tcStep.pop.used);
    expect(observer.vils).toBe(25);
  });

  it('借用施工者完工回伐木，节省占用时间进入实际库存，支付木费不变', () => {
    const bo = probe(487, 0),
      e = freeBuilding(487);
    e.villager.trainTime = 100;
    bo.target.vils = 4;
    bo.steps.push({ vils: 4, actions: [] });
    const result = run(bo, e),
      control = run(bo, without(e, 770));
    const step = result.steps.at(-1)!,
      base = control.steps.at(-1)!;
    const saved = control.buildingsDone[0]!.at - result.buildingsDone[0]!.at;
    expect(step.villagers.wood).toBe(3);
    expect(step.startAt).toBe(base.startAt);
    expect(step.stock.wood).toBeGreaterThan(base.stock.wood);
    expect(Math.abs(step.stock.wood - base.stock.wood - saved * gatherRate(E, 'Generic', 'wood', 4).rate)).toBeLessThanOrEqual(1);
    expect(result.steps[0]!.cost).toEqual(control.steps[0]!.cost);
  });

  it('普通房屋、自动补房、村民生产和人口沿用旧机制，不套防御类施工倍率', () => {
    const bo = buildOrders.find((b) => b.id === 'archers-19')!;
    const result = run(bo, E, false, 'Sicilians', true),
      control = run(bo, without(E, 770), false, 'Sicilians', true);
    expect(result.housePaidAt).toEqual(control.housePaidAt);
    expect(result.villagerEvents).toEqual(control.villagerEvents);
    expect(result.steps.map((s) => [s.doneAt, s.cost, s.pop])).toEqual(control.steps.map((s) => [s.doneAt, s.cost, s.pop]));
  });

  it.each(['sheep', 'hunt', 'berries', 'farm', 'fish', 'wood', 'gold', 'stone', 'build'])('%s采集不因69或施工工期变快', (task) => {
    expect(gatherRate(E, 'Sicilians', task)).toEqual(gatherRate(E, 'Generic', task));
  });

  it('772合法数值改变不创造农田速率、初始食物或续种收益；真实研究支付时间不变', () => {
    const e = structuredClone(E);
    rowOf(e, 772).effects[0]!.v = 4.5;
    const bo = buildOrders.find((b) => b.id === 'fast-castle-boom')!;
    expect(run(bo, e).steps).toEqual(run(bo).steps);
    expect(gatherRate(e, 'Sicilians', 'farm')).toEqual(gatherRate(E, 'Generic', 'farm'));
    const initial = run(probe(72)).steps[0]!;
    expect(initial.stock.food).toBe(200);
    expect(initial.stock.stone).toBe(300);
  });

  for (const tech of [228, 261, 770, 772]) {
    it.each([
      'missing-row',
      'wrong-tech',
      'wrong-source',
      'wrong-age',
      'wrong-requires',
      'missing-effect',
      'duplicate-row',
      'duplicate-effect',
      'unknown-companion',
      'extra-attribute',
    ])(`${tech}坏上下文%s必须禁用文明及相应整条效果，helper不能残留半边效果`, (variant) => {
      const e = structuredClone(E),
        row = rowOf(e, tech);
      if (variant === 'missing-row') e.civEco.Sicilians = e.civEco.Sicilians!.filter((r) => r !== row);
      else if (variant === 'wrong-tech') (row as { tech?: number }).tech = 9998;
      else if (variant === 'wrong-source') row.source = 'tree';
      else if (variant === 'wrong-age') row.age = 2;
      else if (variant === 'wrong-requires') (row as unknown as { requires: number[] }).requires = [9998];
      else if (variant === 'missing-effect') row.effects.pop();
      else if (variant === 'duplicate-row') e.civEco.Sicilians!.push(structuredClone(row));
      else if (variant === 'duplicate-effect') row.effects.push(structuredClone(row.effects[0]!));
      else if (variant === 'extra-attribute') row.effects[0]!.target = 'task:wood';
      else row.effects.push({ kind: 'attr', target: 'task:wood', attr: 'workRate', op: 'mul', v: 0.5 });
      expect(simSupport(e, 'Sicilians', buildOrders).supported).toBe(false);
      expect(gatherRate(e, 'Sicilians', 'wood')).toEqual(gatherRate(E, 'Generic', 'wood'));
      if (tech === 770) {
        const free = structuredClone(e);
        free.buildings[82]!.cost = {};
        expect(duration(probe(82), free)).toBe(duration(probe(82), without(free, 770)));
        expect(civSimNotes(e, 'Sicilians')).not.toContain(constructionNote);
        expect(run(probe(), e).model.assumptions.join('')).not.toContain('西西里施工');
      }
      if (tech === 772) expect(civSimNotes(e, 'Sicilians')).not.toContain(farmNote);
    });
    it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(`${tech}非有限效果%s不得通过通用已处理判断`, (value) => {
      const e = structuredClone(E);
      rowOf(e, tech).effects[0]!.v = value;
      expect(simSupport(e, 'Sicilians', buildOrders).supported).toBe(false);
      expect(gatherRate(e, 'Sicilians', 'wood')).toEqual(gatherRate(E, 'Generic', 'wood'));
    });
  }

  it.each([770, 772])('tech%s的零值/负值及错误操作必须失败关闭', (tech) => {
    for (const value of [0, -1]) {
      const e = structuredClone(E);
      rowOf(e, tech).effects[0]!.v = value;
      expect(simSupport(e, 'Sicilians', buildOrders).supported).toBe(false);
    }
    const e = structuredClone(E);
    rowOf(e, tech).effects[0]!.op = 'add';
    expect(simSupport(e, 'Sicilians', buildOrders).supported).toBe(false);
  });

  it('770缺少任一annex或类别时不能部分套城堡加成', () => {
    for (const target of ['unit:621', 'unit:617', 'unit:484', 'unit:597', 'class:27', 'class:39', 'class:52']) {
      const e = freeBuilding(82);
      rowOf(e, 770).effects = rowOf(e, 770).effects.filter((x) => x.target !== target);
      expect(simSupport(e, 'Sicilians', buildOrders).supported).toBe(false);
      expect(duration(probe(82), e)).toBe(duration(probe(82), without(e, 770)));
    }
  });

  it('当前建筑类别缺失时不能悄悄漏掉施工效果', () => {
    const e = structuredClone(E);
    delete e.buildings[72]!.class;
    expect(simSupport(e, 'Sicilians', buildOrders).supported).toBe(false);
    expect(civSimNotes(e, 'Sicilians')).not.toContain(constructionNote);
  });

  it.each([72, 487, 79, 82, 109])('建筑%s的错误数字类别也须拒绝，不能漏算墙或把TC当防御类', (id) => {
    const e = freeBuilding(82);
    e.buildings[id]!.class = 4;
    expect(simSupport(e, 'Sicilians', buildOrders).supported).toBe(false);
    expect(civSimNotes(e, 'Sicilians')).not.toContain(constructionNote);
    expect(duration(probe(82), e)).toBe(duration(probe(82), without(e, 770)));
  });

  it('缺少69不能让其它文明或未知科技被全局当作无关', () => {
    const e = structuredClone(E);
    e.civEco.Generic = [structuredClone(rowOf(e, 772))];
    (e.civEco.Generic[0] as { tech?: number }).tech = 9998;
    expect(simSupport(e, 'Generic', buildOrders).supported).toBe(false);
  });

  it('默认团队关闭；显式开启运输船折扣也不改变真实捕鱼方案', () => {
    const bo =
      buildOrders.find((b) => b.id === 'hybrid-fish-22') ??
      buildOrders.find((b) => b.steps.some((s) => s.actions.some((a) => a.type === 'train' && a.unit === 13)))!;
    expect(run(bo, E, true).steps).toEqual(run(bo, E, false).steps);
    expect(run(bo).params.team).toBe(false);
    const e = structuredClone(E);
    e.units[545] = { trainTime: 1, at: [45], cost: { Wood: 100 }, class: 20 };
    e.buildings[45]!.cost = {};
    const transport = probe(45, 3);
    transport.steps.push({ vils: 3, actions: [{ type: 'train', unit: 545 }] });
    expect(run(transport, e, false).steps[1]!.cost!.wood).toBe(100);
    expect(run(transport, e, true).steps[1]!.cost!.wood).toBe(50);
  });

  it.each(['duplicate', 'wrong-source', 'wrong-age', 'unknown-companion', 'extra-attribute', 'nonfinite'])(
    '运输团队坏上下文%s不能让支持声明和显式费用生效',
    (variant) => {
      const e = structuredClone(E),
        row = e.civEco.Sicilians!.find((r) => r.source === 'team')!;
      if (variant === 'duplicate') e.civEco.Sicilians!.push(structuredClone(row));
      else if (variant === 'wrong-source') row.source = 'tree';
      else if (variant === 'wrong-age') row.age = 2;
      else if (variant === 'unknown-companion') row.effects.push({ kind: 'attr', target: 'task:wood', attr: 'workRate', op: 'mul', v: 0.5 });
      else if (variant === 'extra-attribute') row.effects[0]!.res = 69;
      else row.effects[0]!.v = Number.NaN;
      expect(simSupport(e, 'Sicilians', buildOrders).supported).toBe(false);
      expect(gatherRate(e, 'Sicilians', 'wood')).toEqual(gatherRate(E, 'Generic', 'wood'));
      e.units[545] = { trainTime: 1, at: [45], cost: { Wood: 100 }, class: 20 };
      e.buildings[45]!.cost = {};
      const transport = probe(45, 3);
      transport.steps.push({ vils: 3, actions: [{ type: 'train', unit: 545 }] });
      expect(run(transport, e, true).steps[1]!.cost!.wood).toBe(100);
    },
  );

  it('支持声明、附注和估算边界一致；独立真实成本保留原提示及数值', () => {
    expect(simSupport(E, 'Sicilians', buildOrders)).toEqual({ supported: true, reasons: [] });
    expect(civSimNotes(E, 'Sicilians')).toContain(constructionNote);
    expect(civSimNotes(E, 'Sicilians')).toContain(farmNote);
    const assumptions = run(probe()).model.assumptions.join('');
    expect(assumptions).toContain('西西里施工');
    expect(assumptions).toContain('农田升级额外储量');
    expect(assumptions).toContain('续种');
    for (const age of [1, 2, 3, 4]) {
      const real = gatherModel(age, 'Sicilians');
      expect(real.rate).toEqual(gatherModel(age).rate);
      expect(real.applied).toEqual([]);
      expect(real.unsupported).toEqual([{ label: '农田食物储量', techs: [772] }]);
    }
  });
});
