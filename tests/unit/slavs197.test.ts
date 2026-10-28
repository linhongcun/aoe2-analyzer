/** #197 Slavic steady farm regression; exact first-red draft is archived with its evidence. */
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import type { BuildOrder, Task } from '../../src/domain/buildOrder';
import { gatherRate, simSupport, simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { gatherModel } from '../../src/domain/realCost';

const E = eco as unknown as EcoData;
const ups = Object.fromEntries(units.filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const clone = () => structuredClone(E);
const tree = (e: EcoData) => e.civEco.Slavs!.find((r) => r.source === 'tree' && r.effects.some((x) => x.target === 'task:farm'))!;
// Independent mathematical oracle. Supplier .4 is normalized pinned DAT WorkRate;
// the two factors refer to DIFFERENT entities and are never multiplied together.
const farmWork = 1.23;
const supply = 0.4 * 1.15;
const consumer = (e: EcoData, tiles: number, carryMul = 1, speedMul = 1) => {
  const b = e.villager.tasks.farm!;
  const c = b.carry * carryMul;
  const w = b.workRate * farmWork;
  return c / (c / w + (2 * tiles) / (e.villager.speed * speedMul));
};
const expectedRate = (e: EcoData, tiles: number, carryMul = 1, speedMul = 1) => Math.min(consumer(e, tiles, carryMul, speedMul), supply);
const unbonusedRate = (e: EcoData, tiles: number) => {
  const b = e.villager.tasks.farm!;
  return Math.min(b.carry / (b.carry / b.workRate + (2 * tiles) / e.villager.speed), 0.4);
};
const run = (bo: BuildOrder, e = E, tiles = 2, civ = 'Slavs') => simulateBuild(bo, civ, e, ups, { autoHouses: false, nearTiles: tiles, walkTiles: tiles });
const bo = (steps: BuildOrder['steps']): BuildOrder => ({
  id: 'slavs-steady-farm-probe',
  name: { zh: '斯拉夫农田稳态核对', en: 'Slavic steady farm probe' },
  style: 'other',
  civs: [],
  map: 'test',
  difficulty: 'beginner',
  target: { age: 2, vils: Math.max(...steps.map((s) => s.vils)) },
  summary: 'test',
  sources: [],
  license: 'test',
  review: { status: 'draft' },
  steps,
});
// This inherits the task-assignment abstraction: no farm building is required by the
// existing simulator. Exactly three workers gather; the fourth is born only at the checkpoint.
const stockProbe = (task: Task = 'farm') =>
  bo([
    { vils: 3, actions: [{ type: 'gather', task, count: 3 }] },
    { vils: 4, actions: [] },
  ]);
const checkpoint = (seconds: number, tiles: number, civ = 'Slavs', input = E) => {
  const e = structuredClone(input);
  e.villager.trainTime = seconds;
  return run(stockProbe(), e, tiles, civ).steps[1]!;
};
const closeStock = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1.2);

describe('#197 Slavs-only steady farm supply and farmer consumption', () => {
  it('current eight BOs are supported from their complete Slavic source', () => {
    expect(simSupport(E, 'Slavs', buildOrders)).toEqual({ supported: true, reasons: [] });
  });
  it.each([1, 2, 7])('distance %s: cap the carry/walk consumer average by independent supply', (tiles) => {
    const r = gatherRate(E, 'Slavs', 'farm', tiles);
    expect(r.carry).toBe(E.villager.tasks.farm!.carry);
    expect(r.workRate).toBeCloseTo(E.villager.tasks.farm!.workRate * farmWork, 12);
    expect(r.rate).toBeCloseTo(expectedRate(E, tiles), 12);
    expect(r.extraIncome).toEqual({});
    // Reject both multiplying 1.23*1.15 into the farmer and capping raw work before walking.
    const b = E.villager.tasks.farm!;
    const preCapped = b.carry / (b.carry / Math.min(b.workRate * farmWork, supply) + (2 * tiles) / E.villager.speed);
    expect(Math.abs(r.rate - preCapped)).toBeGreaterThan(0.01);
  });
  it('near2 preserves the old Generic .419 rate and does not promise a constant 15% uplift', () => {
    const generic = gatherRate(E, 'Generic', 'farm', 2).rate;
    const b = E.villager.tasks.farm!;
    expect(generic).toBeCloseTo(b.carry / (b.carry / b.workRate + 4 / E.villager.speed), 12);
    expect(generic).toBeGreaterThan(0.4);
    expect(gatherRate(E, 'Slavs', 'farm', 2).rate).toBeCloseTo(supply, 12);
    expect(gatherRate(E, 'Slavs', 'farm', 2).rate / generic).not.toBeCloseTo(1.15, 5);
  });
  it.each([5, 20])('carry %s remains inside the consumer trip, while supplier stays .46', (carry) => {
    const e = clone();
    e.villager.tasks.farm!.carry = carry;
    expect(gatherRate(e, 'Slavs', 'farm', 4).rate).toBeCloseTo(expectedRate(e, 4), 12);
  });
  it.each([0.4, 1.6])('speed %s changes the consumer trip without multiplying supply', (speed) => {
    const e = clone();
    e.villager.speed = speed;
    expect(gatherRate(e, 'Slavs', 'farm', 4).rate).toBeCloseTo(expectedRate(e, 4), 12);
  });
  it.each([2, 7])('distance %s: real 100s/200s stock windows use exactly three farmers', (tiles) => {
    const a = checkpoint(100, tiles);
    const b = checkpoint(200, tiles);
    expect(a.villagers).toMatchObject({ food: 3, idle: 1 });
    expect(b.villagers).toMatchObject({ food: 3, idle: 1 });
    expect(a.pop).toEqual({ used: 5, cap: 5 });
    expect(Math.abs(a.startAt - 100)).toBeLessThanOrEqual(0.1 + 1e-9);
    expect(Math.abs(b.startAt - 200)).toBeLessThanOrEqual(0.1 + 1e-9);
    expect(Math.abs(b.startAt - a.startAt - 100)).toBeLessThanOrEqual(0.1 + 1e-9);
    closeStock(a.stock.food, 150 + 3 * expectedRate(E, tiles) * a.startAt);
    closeStock(b.stock.food, 150 + 3 * expectedRate(E, tiles) * b.startAt);
    expect(Math.abs(b.stock.food - a.stock.food - 3 * expectedRate(E, tiles) * (b.startAt - a.startAt))).toBeLessThanOrEqual(2.2);
    expect(a.stock).toMatchObject({ wood: 200, gold: 100, stone: 200 });
    expect(b.stock).toMatchObject({ wood: 200, gold: 100, stone: 200 });
  });
  it.each([2, 4])('distance %s: standard Wheelbarrow changes carry/speed only after completion', (tiles) => {
    const e = clone();
    e.ageReq = { 2: { tech: 101, req: null }, 3: { tech: 102, req: null } };
    e.techs[101] = { ...e.techs[101]!, cost: {}, researchTime: 10 };
    e.techs[102] = { ...e.techs[102]!, cost: {}, researchTime: 100 };
    const p = bo([
      {
        vils: 3,
        actions: [
          { type: 'gather', task: 'farm', count: 3 },
          { type: 'ageUp', age: 2 },
        ],
      },
      { vils: 3, phase: 'feudal', actions: [{ type: 'research', tech: 213 }] },
      { vils: 3, phase: 'feudal', actions: [{ type: 'ageUp', age: 3 }] },
      { vils: 3, phase: 'castle', actions: [] },
    ]);
    const tl = run(p, e, tiles);
    const research = tl.steps[1]!;
    const last = tl.steps[3]!;
    const effects = e.ecoTechs[213]!.effects;
    const c = effects.find((x) => x.target === 'class:4' && x.attr === 'carry')!.v!;
    const s = effects.find((x) => x.target === 'class:4' && x.attr === 'speed')!.v!;
    expect(research.entity).toEqual({ kind: 'tech', id: '213' });
    expect(research.researchAt).toBeDefined();
    expect(Math.abs(research.doneAt - research.researchAt! - 75)).toBeLessThanOrEqual(0.1 + 1e-9);
    expect(Math.abs(last.startAt - research.doneAt - 100)).toBeLessThanOrEqual(0.1 + 1e-9);
    expect(last.villagers).toMatchObject({ food: 3, idle: 0 });
    expect(last.pop).toEqual({ used: 4, cap: 5 });
    closeStock(
      last.stock.food,
      200 - e.techs[213]!.cost.Food! + 3 * expectedRate(e, tiles) * research.doneAt + 3 * expectedRate(e, tiles, c, s) * (last.startAt - research.doneAt),
    );
    expect(last.stock.wood).toBe(200 - e.techs[213]!.cost.Wood!);
    expect(last.stock.gold).toBe(100);
    expect(last.stock.stone).toBe(200);
    expect(tl.anomalies.some((a) => a.type === 'timeout')).toBe(false);
  });
  it('no initial farm-buffer credit, extra villagers, housing or free stock is introduced', () => {
    const p = stockProbe();
    const actual = run(p);
    const generic = run(p, E, 2, 'Generic');
    expect(actual.steps[0]!.stock).toEqual({ food: 200, wood: 200, gold: 100, stone: 200 });
    expect(actual.steps[0]!.stock).toEqual(generic.steps[0]!.stock);
    expect(actual.steps[0]!.pop).toEqual({ used: 4, cap: 5 });
    expect(actual.villagerEvents).toEqual(generic.villagerEvents);
    expect(actual.buildingsDone).toEqual([]);
  });
  it('whole farm-bonus omission preserves the independent physical Slavic supply model', () => {
    const e = clone();
    const row = tree(e);
    e.civEco.Slavs = e.civEco.Slavs!.filter((r) => r !== row);
    expect(simSupport(e, 'Slavs', buildOrders).supported).toBe(true);
    expect(gatherRate(e, 'Slavs', 'farm', 2)).toEqual({ ...gatherRate(e, 'Generic', 'farm', 2), rate: unbonusedRate(e, 2) });
    const s = checkpoint(100, 2, 'Slavs', e);
    closeStock(s.stock.food, 150 + 3 * unbonusedRate(e, 2) * s.startAt);
    expect(s.stock.food).toBeLessThan(checkpoint(100, 2, 'Generic', e).stock.food);
  });
  it.each([510, 511])('the original #317 positive-tech removal %s leaves farm source active', (tech) => {
    const e = clone();
    e.civEco.Slavs = e.civEco.Slavs!.filter((r) => r.tech !== tech);
    expect(simSupport(e, 'Slavs', buildOrders).supported).toBe(true);
    expect(gatherRate(e, 'Slavs', 'farm', 2).rate).toBeCloseTo(supply, 12);
    expect(checkpoint(100, 2, 'Slavs', e).stock.food).toBe(checkpoint(100, 2).stock.food);
  });
  it.each(['sheep', 'hunt', 'berries', 'fish', 'wood', 'gold', 'stone', 'build'])('%s has no Slavic farm multiplier or supply cap', (task) => {
    expect(gatherRate(E, 'Slavs', task)).toEqual(gatherRate(E, 'Generic', task));
  });
  it('an unknown non-team row cannot enter the direct generic-attribute path', () => {
    const e = clone();
    e.civEco.Slavs!.push({ source: 'bonus', tech: 99999, age: 1, effects: [{ kind: 'attr', target: 'task:wood', attr: 'workRate', op: 'mul', v: 2 }] });
    expect(simSupport(e, 'Slavs', buildOrders).supported).toBe(false);
    expect(gatherRate(e, 'Slavs', 'wood')).toEqual(gatherRate(e, 'Generic', 'wood'));
  });
  it.each(['partial', 'duplicate', 'wrongAge', 'wrongSource', 'extraKnown', 'unknownOnly'])(
    'bad farm family %s is rejected atomically by public APIs',
    (kind) => {
      const e = clone();
      const row = tree(e);
      if (kind === 'partial') row.effects = row.effects.filter((x) => x.target !== 'unit:1187');
      if (kind === 'duplicate') e.civEco.Slavs!.push(structuredClone(row));
      if (kind === 'wrongAge') row.age = 2;
      if (kind === 'wrongSource') row.source = 'bonus';
      if (kind === 'extraKnown') row.effects.push({ kind: 'attr', target: 'task:wood', attr: 'workRate', op: 'mul', v: 2 });
      if (kind === 'unknownOnly') row.effects = [];
      expect(simSupport(e, 'Slavs', buildOrders).supported).toBe(false);
      expect(gatherRate(e, 'Slavs', 'farm', 2)).toEqual({ ...gatherRate(e, 'Generic', 'farm', 2), rate: unbonusedRate(e, 2) });
      expect(gatherRate(e, 'Slavs', 'wood')).toEqual(gatherRate(e, 'Generic', 'wood'));
    },
  );
  it('canonical Slavic farm source copied to another civ is refused', () => {
    const e = clone();
    e.civEco.Generic = [structuredClone(tree(e))];
    expect(simSupport(e, 'Generic', buildOrders).supported).toBe(false);
    expect(gatherRate(e, 'Generic', 'farm', 2)).toEqual(gatherRate(E, 'Generic', 'farm', 2));
  });
  it.each([1, 2, 3, 4])('independent realCost age%s retains its original sourced ×1.15 contract', (age) => {
    const r = gatherModel(age, 'Slavs');
    const generic = gatherModel(age, '');
    expect(r.applied.map((x) => x.label)).toEqual(['农田采集 +15%']);
    expect(r.unsupported).toEqual([]);
    expect(r.rate.farm / generic.rate.farm).toBeCloseTo(1.15, 12);
    expect(r.rate.wood).toBe(generic.rate.wood);
    expect(r.rate.gold).toBe(generic.rate.gold);
    expect(r.rate.stone).toBe(generic.rate.stone);
  });
});
