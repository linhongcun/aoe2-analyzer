/** Khmer canonical no-return-walk and independent farm supply: public API regression draft. */
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import type { BuildOrder, Task } from '../../src/domain/buildOrder';
import { ageReqOk, gatherRate, simSupport, simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { gatherModel } from '../../src/domain/realCost';
const E = eco as unknown as EcoData;
const ups = Object.fromEntries(units.filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const clone = () => structuredClone(E);
const row654 = (e: EcoData) => e.civEco.Khmer!.find((r) => r.tech === 654)!;
const without = (e: EcoData, tech: number) => {
  e.civEco.Khmer = e.civEco.Khmer!.filter((r) => r.tech !== tech);
  return e;
};
const consumer = (e: EcoData, tiles: number, bonus: boolean) => {
  const b = e.villager.tasks.farm!;
  return b.carry / (b.carry / (b.workRate * (bonus ? 0.95 : 1)) + (bonus ? 0 : (2 * tiles) / e.villager.speed));
};
const rate = (e: EcoData, tiles: number, bonus = true) => Math.min(consumer(e, tiles, bonus), 0.4);
const order = (steps: BuildOrder['steps']): BuildOrder => ({
  ...buildOrders[0]!,
  id: 'khmer-source-probe',
  target: { age: 4, vils: Math.max(...steps.map((s) => s.vils)) },
  steps,
});
const run = (b: BuildOrder, e = E, tiles = 2, civ = 'Khmer') => simulateBuild(b, civ, e, ups, { autoHouses: false, nearTiles: tiles, walkTiles: tiles });
const stockProbe = (task: Task = 'farm') =>
  order([
    { vils: 3, actions: [{ type: 'gather', task, count: 3 }] },
    { vils: 4, actions: [] },
  ]);
const checkpoint = (seconds: number, tiles: number, input = E, civ = 'Khmer') => {
  const e = structuredClone(input);
  e.villager.trainTime = seconds;
  return run(stockProbe(), e, tiles, civ).steps[1]!;
};
const stockClose = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1.2);
const ageProbe = (input = E) => {
  const e = structuredClone(input);
  for (const id of [101, 102, 103]) e.techs[id] = { ...e.techs[id]!, cost: {}, researchTime: 10 };
  const b = order([
    { vils: 3, actions: [{ type: 'ageUp', age: 2 }] },
    { vils: 3, phase: 'feudal', actions: [{ type: 'ageUp', age: 3 }] },
    { vils: 3, phase: 'castle', actions: [{ type: 'ageUp', age: 4 }] },
    { vils: 3, phase: 'imperial', actions: [] },
  ]);
  return { e, b };
};
describe('Khmer no-return-walk and separate supply in the public helper and real stock', () => {
  it('complete current Khmer source supports all eight legal templates', () =>
    expect(simSupport(E, 'Khmer', buildOrders)).toEqual({ supported: true, reasons: [] }));
  it.each([1, 2, 7])('distance %s: helper reports .5035 consumer work but caps effective income at .4', (tiles) => {
    const r = gatherRate(E, 'Khmer', 'farm', tiles);
    expect(r.workRate).toBeCloseTo(E.villager.tasks.farm!.workRate * 0.95, 12);
    expect(r.rate).toBeCloseTo(rate(E, tiles), 12);
    expect(r.carry).toBe(E.villager.tasks.farm!.carry);
    expect(r.extraIncome).toEqual({});
  });
  it.each([2, 7])('distance %s: real 100/200s checkpoints agree with the same capped helper', (tiles) => {
    const a = checkpoint(100, tiles),
      b = checkpoint(200, tiles);
    expect(Math.abs(a.startAt - 100)).toBeLessThanOrEqual(0.1 + 1e-9);
    expect(Math.abs(b.startAt - 200)).toBeLessThanOrEqual(0.1 + 1e-9);
    stockClose(a.stock.food, 150 + 3 * rate(E, tiles) * a.startAt);
    stockClose(b.stock.food, 150 + 3 * rate(E, tiles) * b.startAt);
    expect(Math.abs(b.stock.food - a.stock.food - 3 * gatherRate(E, 'Khmer', 'farm', tiles).rate * (b.startAt - a.startAt))).toBeLessThanOrEqual(2.2);
    expect(a.villagers).toMatchObject({ food: 3, idle: 1 });
    expect(a.pop).toEqual({ used: 5, cap: 5 });
    expect(a.stock).toMatchObject({ wood: 200, gold: 100, stone: 200 });
  });
  it('a consumer below the cap still uses no-return-walk, rather than always hardcoding .4', () => {
    const e = clone();
    e.villager.tasks.farm!.workRate = 0.3;
    for (const d of [1, 7]) {
      expect(gatherRate(e, 'Khmer', 'farm', d).rate).toBeCloseTo(0.3 * 0.95, 12);
      const s = checkpoint(100, d, e);
      stockClose(s.stock.food, 150 + 3 * 0.285 * s.startAt);
    }
  });
  it('whole654 removal keeps physical .4 but restores ordinary walking and base farmer work', () => {
    const e = without(clone(), 654);
    expect(simSupport(e, 'Khmer', buildOrders).supported).toBe(true);
    expect(gatherRate(e, 'Khmer', 'farm', 7).rate).toBeCloseTo(rate(e, 7, false), 12);
    expect(gatherRate(e, 'Khmer', 'farm', 7).workRate).toBe(e.villager.tasks.farm!.workRate);
    expect(rate(e, 7, false)).toBeLessThan(0.4);
    const s = checkpoint(100, 7, e);
    stockClose(s.stock.food, 150 + 3 * rate(e, 7, false) * s.startAt);
    expect(s.stock.food).toBeLessThan(checkpoint(100, 7).stock.food);
    expect(gatherRate(e, 'Khmer', 'farm', 2).rate).toBeCloseTo(0.4, 12);
  });
  it('preserves Generic legacy rates even when the new Khmer .4 estimate is lower at near2', () => {
    const b = E.villager.tasks.farm!;
    const generic = b.carry / (b.carry / b.workRate + 4 / E.villager.speed);
    expect(gatherRate(E, 'Generic', 'farm', 2).rate).toBeCloseTo(generic, 12);
    expect(generic).toBeGreaterThan(0.4);
    expect(gatherRate(E, 'Khmer', 'farm', 2).rate).toBeLessThan(generic);
  });
  it('whole638 removal leaves654 and independent farm supply active', () => {
    const e = without(clone(), 638);
    expect(simSupport(e, 'Khmer', buildOrders).supported).toBe(true);
    expect(gatherRate(e, 'Khmer', 'farm', 7).rate).toBeCloseTo(0.4, 12);
    expect(checkpoint(100, 7, e).stock).toEqual(checkpoint(100, 7).stock);
  });
  it('no initial food buffer, extra villagers, housing, or farm entity is granted', () => {
    const t = run(stockProbe()),
      g = run(stockProbe(), E, 2, 'Generic');
    expect(t.steps[0]!.stock).toEqual({ food: 200, wood: 200, gold: 100, stone: 200 });
    expect(t.steps[0]!.pop).toEqual({ used: 4, cap: 5 });
    expect(t.villagerEvents).toEqual(g.villagerEvents);
    expect(t.buildingsDone).toEqual([]);
  });
  it('canonical638 allows each actual ageReq OR branch without building prerequisites', () => {
    const { e, b } = ageProbe();
    const t = run(b, e);
    expect(t.ageUps.map((a) => a.age)).toEqual(['feudal', 'castle', 'imperial']);
    t.ageUps.forEach((a, i) => {
      expect(Math.abs(a.clickAt - (i ? t.ageUps[i - 1]!.reachAt : 0))).toBeLessThanOrEqual(0.1 + 1e-9);
      expect(Math.abs(a.reachAt - a.clickAt - 10)).toBeLessThanOrEqual(0.1 + 1e-9);
    });
    expect(t.buildingsDone).toEqual([]);
    expect(t.anomalies.some((a) => a.type === 'timeout' || a.type === 'prereq_wait')).toBe(false);
  });
  it('without638 a no-building age probe does not bypass the same raw age requirements', () => {
    const { e, b } = ageProbe(without(clone(), 638));
    const t = run(b, e);
    expect(t.ageUps).toEqual([]);
    expect(t.anomalies.some((a) => a.type === 'timeout')).toBe(true);
    expect(gatherRate(e, 'Khmer', 'farm', 7).rate).toBeCloseTo(0.4, 12);
  });
  it.each([
    [50, null, 15],
    [87, 2, 50],
    [101, 2, 50],
    [84, 2, 60],
  ] as const)('building %s:638 unlocks without its normal building prerequisite, and removing638 stops that bypass', (building, age, seconds) => {
    const e = clone();
    e.villager.trainTime = 100;
    e.techs[101] = { ...e.techs[101]!, cost: {}, researchTime: 10 };
    e.techs[102] = { ...e.techs[102]!, cost: {}, researchTime: 100 };
    const b = age
      ? order([
          {
            vils: 3,
            actions: [
              { type: 'gather', task: 'wood', count: 2 },
              { type: 'gather', task: 'build', count: 1 },
              { type: 'ageUp', age: 2 },
            ],
          },
          { vils: 3, phase: 'feudal', actions: [{ type: 'build', building }] },
          { vils: 3, phase: 'feudal', actions: [{ type: 'ageUp', age: 3 }] },
          { vils: 3, phase: 'castle', actions: [] },
        ])
      : order([
          {
            vils: 3,
            actions: [
              { type: 'gather', task: 'wood', count: 2 },
              { type: 'gather', task: 'build', count: 1 },
              { type: 'build', building },
            ],
          },
          { vils: 4, actions: [] },
        ]);
    const on = run(b, e);
    // Off638 must reach Feudal by the ordinary two-building alternative, so the
    // target absence isolates its own building prerequisite rather than age-up.
    const ordinaryPrerequisites = building === 84 ? [12, 562] : [68, 562];
    const offBo = age
      ? order([
          {
            vils: 3,
            actions: [
              { type: 'gather', task: 'wood', count: 2 },
              { type: 'gather', task: 'build', count: 1 },
              ...ordinaryPrerequisites.map((id) => ({ type: 'build' as const, building: id })),
              { type: 'ageUp', age: 2 },
            ],
          },
          { vils: 3, phase: 'feudal', actions: [{ type: 'build', building }] },
          { vils: 3, phase: 'feudal', actions: [{ type: 'ageUp', age: 3 }] },
          { vils: 3, phase: 'castle', actions: [] },
        ])
      : b;
    const off = run(offBo, without(structuredClone(e), 638));
    if (age) {
      expect(off.ageUps.some((x) => x.age === 'feudal' && x.reachAt > 0)).toBe(true);
      for (const prerequisite of ordinaryPrerequisites) expect(off.buildingsDone.some((x) => x.building === prerequisite)).toBe(true);
      expect(off.buildingsDone.some((x) => x.building === (building === 84 ? 68 : 12))).toBe(false);
    }
    const done = on.buildingsDone.find((x) => x.building === building)!;
    expect(done).toBeDefined();
    expect(on.buildingsDone.some((x) => x.building === 68 || x.building === 12)).toBe(false);
    expect(Math.abs(done.at - (age ? 10.1 : 0) - seconds)).toBeLessThanOrEqual(0.1 + 1e-9);
    expect(on.anomalies.some((x) => x.type === 'timeout')).toBe(false);
    expect(off.buildingsDone.some((x) => x.building === building)).toBe(false);
    expect(off.anomalies.some((x) => x.type === 'timeout')).toBe(true);
  });
  it('without638 normal Mill completion still unlocks an explicitly paid farm', () => {
    const e = without(clone(), 638);
    e.villager.trainTime = 100;
    const b = order([
      {
        vils: 3,
        actions: [
          { type: 'gather', task: 'wood', count: 2 },
          { type: 'gather', task: 'build', count: 1 },
          { type: 'build', building: 68 },
          { type: 'build', building: 50 },
        ],
      },
      { vils: 4, actions: [] },
    ]);
    const t = run(b, e),
      mill = t.buildingsDone.find((x) => x.building === 68)!,
      farm = t.buildingsDone.find((x) => x.building === 50)!;
    expect(mill).toBeDefined();
    expect(farm).toBeDefined();
    expect(farm.at).toBeGreaterThan(mill.at);
    expect(t.anomalies.some((x) => x.type === 'timeout')).toBe(false);
  });
  it('the pre-existing ordinary ageReq OR remains legal for Generic built prerequisites', () => {
    const empty = new Map<number, number>(),
      two = new Map([
        [68, 1],
        [562, 1],
      ]);
    expect(ageReqOk(E.ageReq!['2']!.req, empty, 'Generic')).toBe(false);
    expect(ageReqOk(E.ageReq!['2']!.req, two, 'Generic')).toBe(true);
  });
  it.each(['sheep', 'hunt', 'berries', 'fish', 'wood', 'gold', 'stone', 'build'])('%s receives neither Khmer noWalk nor farm cap', (task) => {
    expect(gatherRate(E, 'Khmer', task)).toEqual(gatherRate(E, 'Generic', task));
  });
  it.each([1, 2, 3, 4])('independent realCost age%s stays its original unsourced Khmer contract', (age) => {
    const r = gatherModel(age, 'Khmer');
    expect(r.rate).toEqual(gatherModel(age, '').rate);
    expect(r.applied).toEqual([]);
    expect(r.unsupported).toEqual([{ label: '农田采集 −5%', techs: [654] }]);
  });
  it('an unknown non-team row cannot double wood through the direct generic-attribute fallback', () => {
    const e = clone();
    e.civEco.Khmer!.push({ source: 'bonus', age: 1, tech: 99999, effects: [{ kind: 'attr', target: 'task:wood', attr: 'workRate', op: 'mul', v: 2 }] });
    expect(simSupport(e, 'Khmer', buildOrders).supported).toBe(false);
    expect(gatherRate(e, 'Khmer', 'wood')).toEqual(gatherRate(e, 'Generic', 'wood'));
  });
  it.each(['onlyResource', 'onlyFarmer', 'duplicate', 'extraKnown', 'unknownOnly'])(
    'bad654 %s refuses both paired effects and retains independent physical supply',
    (kind) => {
      const e = clone(),
        r = row654(e);
      if (kind === 'onlyResource') r.effects = r.effects.filter((x) => x.kind === 'res');
      if (kind === 'onlyFarmer') r.effects = r.effects.filter((x) => x.kind === 'attr');
      if (kind === 'duplicate') e.civEco.Khmer!.push(structuredClone(r));
      if (kind === 'extraKnown') r.effects.push({ kind: 'attr', target: 'task:wood', attr: 'workRate', op: 'mul', v: 2 });
      if (kind === 'unknownOnly') r.effects = [];
      expect(simSupport(e, 'Khmer', buildOrders).supported).toBe(false);
      expect(gatherRate(e, 'Khmer', 'farm', 7).rate).toBeCloseTo(rate(e, 7, false), 12);
      const s = checkpoint(100, 7, e);
      stockClose(s.stock.food, 150 + 3 * rate(e, 7, false) * s.startAt);
      expect(gatherRate(e, 'Khmer', 'wood')).toEqual(gatherRate(e, 'Generic', 'wood'));
    },
  );
});
