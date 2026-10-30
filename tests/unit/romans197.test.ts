/** #197 Roman worker and independent supplier regressions against fixed DE188329. */
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import type { BuildOrder } from '../../src/domain/buildOrder';
import { gatherRate, simSupport, simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import {
  romanBuilderMultiplier,
  romanContext,
  romanFarmRate,
  romanNotes,
  romanRowClass,
  ROMAN_FARM_NOTE,
  ROMAN_SOURCE_REASON,
  ROMAN_WORK_NOTE,
  type RomanFarm,
  type RomanRawTech,
} from '../../src/domain/romanEconomy';

const E = eco as unknown as EcoData;
const upgrades = Object.fromEntries(units.filter((unit) => unit.up).map((unit) => [unit.id, unit.up])) as UpgradeData;
const clone = () => structuredClone(E);
const bonus = (e: EcoData) => e.civEco.Romans!.find((row) => row.tech === 887)!;
const withoutBonus = () => {
  const e = clone();
  e.civEco.Romans = e.civEco.Romans!.filter((row) => row.tech !== 887);
  return e;
};
// Independent consumer/supplier oracle: farmer .53 * 1.05 * 1.038095,
// supplier .4 * 1.05. Farm-unit multipliers never enter the consumer trip.
const farmOracle = (e: EcoData, tiles: number, boosted = true) => {
  const task = e.villager.tasks.farm!;
  const work = task.workRate * (boosted ? 1.05 * 1.038095 : 1);
  const average = task.carry / (task.carry / work + (2 * tiles) / e.villager.speed);
  return Math.min(average, boosted ? 0.42 : 0.4);
};
const probe = (actions: BuildOrder['steps'][number]['actions'], nextVils = 3): BuildOrder => ({
  id: 'roman-source-probe',
  name: { zh: '罗马来源核对', en: 'Roman source probe' },
  style: 'other',
  civs: [],
  map: 'test',
  difficulty: 'beginner',
  target: { age: 2, vils: nextVils },
  summary: 'test',
  sources: [],
  license: 'test',
  review: { status: 'draft' },
  steps: [
    { vils: 3, actions },
    { vils: nextVils, actions: [] },
  ],
});
const run = (bo: BuildOrder, e = E, autoHouses = false, civ = 'Romans') => simulateBuild(bo, civ, e, upgrades, { autoHouses });

describe('#197 Roman complete fixed-source guards', () => {
  it('guards both complete worker genders, separate suppliers, tree and team', () => {
    expect(romanContext(E)).toMatchObject({ complete: true, bonus: true, supplyMultiplier: 1.05, buildMultiplier: 1.05, reasons: [] });
    const raw = (bonus(E) as { romanTech?: RomanRawTech }).romanTech!;
    expect(raw.commands).toHaveLength(5);
    expect(raw.commands.filter((command) => [214, 259].includes(command.A))).toHaveLength(2);
    expect(bonus(E).effects).toHaveLength(4);
    expect(romanBuilderMultiplier(romanContext(E))).toBe(1.05);
  });
  it('whole 887 omission preserves physical supply and disables every worker bonus', () => {
    const context = romanContext(withoutBonus());
    expect(context).toMatchObject({ complete: true, bonus: false, supplyMultiplier: 1, buildMultiplier: 1, reasons: [] });
    expect(romanFarmRate(context, 0.9)).toBe(0.4);
    expect(romanBuilderMultiplier(context)).toBe(1);
  });
  it('whole scorpion discount removal leaves the independently sourced worker bonus', () => {
    const e = clone();
    e.civEco.Romans = e.civEco.Romans!.filter((row) => row.tech !== 892);
    expect(romanContext(e)).toMatchObject({ complete: true, bonus: true });
  });
  const corruptions: [string, (e: EcoData) => void][] = [
    [
      'missing raw',
      (e) => {
        delete (bonus(e) as { romanTech?: RomanRawTech }).romanTech;
      },
    ],
    [
      'female raw command missing',
      (e) => {
        (bonus(e) as { romanTech: RomanRawTech }).romanTech.commands.splice(1, 1);
      },
    ],
    [
      'extra raw command',
      (e) => {
        const raw = (bonus(e) as { romanTech: RomanRawTech }).romanTech;
        raw.commands.push({ ...raw.commands[0]! });
      },
    ],
    [
      'changed raw command',
      (e) => {
        (bonus(e) as { romanTech: RomanRawTech }).romanTech.commands[0]!.D = 2;
      },
    ],
    [
      'foreign raw civ',
      (e) => {
        (bonus(e) as { romanTech: RomanRawTech }).romanTech.civ = 23;
      },
    ],
    [
      'renumbered raw source',
      (e) => {
        (bonus(e) as { romanTech: RomanRawTech }).romanTech.tech = 99999;
      },
    ],
    [
      'renumbered decoded source',
      (e) => {
        bonus(e).tech = 99999;
      },
    ],
    [
      'empty decoded bundle',
      (e) => {
        bonus(e).effects = [];
      },
    ],
    [
      'missing decoded supplier',
      (e) => {
        bonus(e).effects.pop();
      },
    ],
    [
      'extra generic worker multiplier',
      (e) => {
        bonus(e).effects.push({ kind: 'attr', target: 'class:4', attr: 'workRate', op: 'mul', v: 2 });
      },
    ],
    [
      'wrong age',
      (e) => {
        bonus(e).age = 2;
      },
    ],
    [
      'wrong source',
      (e) => {
        bonus(e).source = 'team';
      },
    ],
    [
      'wrong prerequisite',
      (e) => {
        bonus(e).requires = [101];
      },
    ],
    [
      'duplicate bonus',
      (e) => {
        e.civEco.Romans!.push(structuredClone(bonus(e)));
      },
    ],
    [
      'missing tree',
      (e) => {
        e.civEco.Romans = e.civEco.Romans!.filter((row) => row.source !== 'tree');
      },
    ],
    [
      'missing team',
      (e) => {
        e.civEco.Romans = e.civEco.Romans!.filter((row) => row.source !== 'team');
      },
    ],
    [
      'duplicate tree',
      (e) => {
        e.civEco.Romans!.push(structuredClone(e.civEco.Romans!.find((row) => row.source === 'tree')!));
      },
    ],
    [
      'unknown generic worker row',
      (e) => {
        e.civEco.Romans!.push({ source: 'bonus', age: 1, tech: 99999, effects: [{ kind: 'attr', target: 'class:4', attr: 'workRate', op: 'mul', v: 2 }] });
      },
    ],
  ];
  it.each(corruptions)('%s atomically disables worker consumption and construction', (_name, change) => {
    const e = clone();
    change(e);
    const context = romanContext(e);
    expect(context).toMatchObject({ complete: false, bonus: false, reasons: [ROMAN_SOURCE_REASON] });
    expect(romanBuilderMultiplier(context)).toBe(1);
    expect(romanRowClass(bonus(e) ?? e.civEco.Romans![0]!, 'Romans', context)?.kind).toBe('unhandled');
    expect(romanFarmRate(context, 0.9)).toBe(0.4);
    expect(gatherRate(e, 'Romans', 'wood')).toEqual(gatherRate(e, 'Generic', 'wood'));
    expect(simSupport(e, 'Romans', buildOrders).supported).toBe(false);
  });
  it.each(['missing', 'extra farm', 'wrong class', 'changed rate'])('physical source %s cannot retain the bonus', (mode) => {
    const e = clone() as EcoData & { romanFarm?: RomanFarm };
    if (mode === 'missing') delete e.romanFarm;
    else if (mode === 'extra farm') e.romanFarm!.farms.push({ ...e.romanFarm!.farms[0]! });
    else if (mode === 'wrong class') e.romanFarm!.farms[0]!.class = 4;
    else e.romanFarm!.farms[0]!.workRate = 0.5;
    const context = romanContext(e);
    expect(context.physical).toBeNull();
    expect(context.complete).toBe(false);
    expect(romanBuilderMultiplier(context)).toBe(1);
    expect(gatherRate(e, 'Romans', 'wood')).toEqual(gatherRate(e, 'Generic', 'wood'));
  });
  it('Roman markers and globally unique Roman bonus IDs cannot be copied to another civ', () => {
    const e = clone();
    e.civEco.Generic = [structuredClone(bonus(e))];
    expect(romanRowClass(e.civEco.Generic[0]!, 'Generic', undefined)?.kind).toBe('unhandled');
    expect(simSupport(e, 'Generic', buildOrders).supported).toBe(false);
    expect(gatherRate(e, 'Generic', 'wood')).toEqual(gatherRate(E, 'Generic', 'wood'));
    delete (e.civEco.Generic[0] as { romanTech?: RomanRawTech }).romanTech;
    expect(romanRowClass(e.civEco.Generic[0]!, 'Generic', undefined)?.kind).toBe('unhandled');
  });
});

describe('#197 Roman public economy and construction paths', () => {
  it('all eight current templates are supported and complete without timeout', () => {
    expect(simSupport(E, 'Romans', buildOrders)).toEqual({ supported: true, reasons: [] });
    for (const bo of buildOrders)
      expect(
        run(bo, E, true).anomalies.some((anomaly) => anomaly.type === 'timeout'),
        bo.id,
      ).toBe(false);
  });
  it.each(['sheep', 'hunt', 'berries', 'fish', 'wood', 'gold', 'stone', 'build'])('%s consumes the worker multiplier once', (task) => {
    const actual = gatherRate(E, 'Romans', task);
    const generic = gatherRate(E, 'Generic', task);
    const base = E.villager.tasks[task]!;
    expect(actual.workRate).toBeCloseTo(base.workRate * 1.05, 12);
    expect(actual.carry).toBe(generic.carry);
    const expected = base.carry / (base.carry / (base.workRate * 1.05) + 4 / E.villager.speed);
    expect(actual.rate).toBeCloseTo(expected, 12);
    expect(actual.extraIncome).toEqual({});
  });
  it.each([0, 1, 2, 4, 7])('farm distance %s caps the completed consumer trip, not raw workRate', (tiles) => {
    const actual = gatherRate(E, 'Romans', 'farm', tiles);
    expect(actual.workRate).toBeCloseTo(E.villager.tasks.farm!.workRate * 1.05 * 1.038095, 12);
    expect(actual.rate).toBeCloseTo(farmOracle(E, tiles), 12);
    expect(actual.rate).toBeLessThanOrEqual(0.42 + 1e-12);
    expect(gatherRate(withoutBonus(), 'Romans', 'farm', tiles).rate).toBeCloseTo(farmOracle(E, tiles, false), 12);
  });
  it.each([5, 20])('carry %s remains inside the trip and never multiplies supply', (carry) => {
    const e = clone();
    e.villager.tasks.farm!.carry = carry;
    expect(gatherRate(e, 'Romans', 'farm', 4).rate).toBeCloseTo(farmOracle(e, 4), 12);
  });
  it.each([0.4, 1.6])('walking speed %s changes only consumer travel', (speed) => {
    const e = clone();
    e.villager.speed = speed;
    expect(gatherRate(e, 'Romans', 'farm', 4).rate).toBeCloseTo(farmOracle(e, 4), 12);
  });
  it('100/200-second windows book actual independently capped farm income without startup credit', () => {
    const bo = probe([{ type: 'gather', task: 'farm', count: 3 }], 4);
    const checkpoints = [100, 200].map((seconds) => {
      const e = clone();
      e.villager.trainTime = seconds;
      const timeline = run(bo, e);
      expect(timeline.steps[0]!.stock).toEqual({ food: 200, wood: 200, gold: 100, stone: 200 });
      return timeline.steps[1]!;
    });
    for (const point of checkpoints) {
      expect(point.villagers).toMatchObject({ food: 3, idle: 1 });
      expect(Math.abs(point.stock.food - (150 + 3 * farmOracle(E, 2) * point.startAt))).toBeLessThanOrEqual(1.2);
    }
    const [a, b] = checkpoints;
    expect(Math.abs(b!.stock.food - a!.stock.food - 3 * farmOracle(E, 2) * (b!.startAt - a!.startAt))).toBeLessThanOrEqual(2.2);
  });
  it.each([1, 3])('%s explicit builders receive one 5% progress multiplier', (builders) => {
    const bo = probe([
      { type: 'gather', task: 'build', count: builders },
      { type: 'build', building: 70 },
    ]);
    const actual = run(bo).buildingsDone.find((building) => building.building === 70)!;
    const ordinary = run(bo, withoutBonus()).buildingsDone.find((building) => building.building === 70)!;
    const expected = (3 * E.buildings[70]!.buildTime) / ((builders + 2) * 1.05);
    expect(Math.abs(actual.at - expected)).toBeLessThanOrEqual(0.1 + 1e-9);
    expect(actual.at).toBeLessThan(ordinary.at);
  });
  it('a borrowed builder gets the same construction multiplier', () => {
    const bo = probe([
      { type: 'gather', task: 'wood', count: 3 },
      { type: 'build', building: 562 },
    ]);
    const actual = run(bo).buildingsDone.find((building) => building.building === 562)!;
    expect(Math.abs(actual.at - E.buildings[562]!.buildTime / 1.05)).toBeLessThanOrEqual(0.1 + 1e-9);
  });
  it('automatic houses use the worker multiplier without accelerating villager training', () => {
    const bo = probe([{ type: 'gather', task: 'sheep', count: 3 }], 4);
    const e = clone(),
      baseline = withoutBonus();
    e.villager.trainTime = baseline.villager.trainTime = 24;
    const actual = run(bo, e, true),
      ordinary = run(bo, baseline, true);
    // Auto houses intentionally do not enter buildingsDone. At 24 seconds only
    // the accelerated 25 / 1.05 second house has completed and supplies housing.
    expect(actual.steps[1]!.pop.cap).toBe(10);
    expect(ordinary.steps[1]!.pop.cap).toBe(5);
    expect(actual.villagerEvents).toEqual(ordinary.villagerEvents);
    expect(Math.abs(actual.steps[1]!.startAt - 24)).toBeLessThanOrEqual(0.1 + 1e-9);
  });
  it('the worker construction hook leaves TC research duration unchanged', () => {
    const bo = probe([{ type: 'research', tech: 22 }]);
    const actual = run(bo).steps[0]!,
      ordinary = run(bo, withoutBonus()).steps[0]!;
    expect(actual.researchAt).toBeDefined();
    expect(actual.doneAt - actual.researchAt!).toBeCloseTo(ordinary.doneAt - ordinary.researchAt!, 8);
    expect(Math.abs(actual.doneAt - actual.researchAt! - E.techs[22]!.researchTime)).toBeLessThanOrEqual(0.1 + 1e-9);
  });
  it('the worker construction hook leaves age research duration unchanged', () => {
    const bo = probe([
      { type: 'gather', task: 'sheep', count: 3 },
      { type: 'ageUp', age: 2 },
    ]);
    const e = clone(),
      baseline = withoutBonus();
    e.ageReq = baseline.ageReq = undefined;
    const actual = run(bo, e).ageUps[0]!,
      ordinary = run(bo, baseline).ageUps[0]!;
    expect(actual.clickAt).toBeLessThan(ordinary.clickAt);
    expect(actual.reachAt - actual.clickAt).toBeCloseTo(ordinary.reachAt - ordinary.clickAt, 8);
    expect(Math.abs(actual.reachAt - actual.clickAt - E.techs[101]!.researchTime)).toBeLessThanOrEqual(0.1 + 1e-9);
  });
  it('construction hooks remain neutral without complete source and notes follow actual modeled paths', () => {
    expect(romanBuilderMultiplier(undefined)).toBe(1);
    const farmers = probe([{ type: 'gather', task: 'farm', count: 3 }], 4);
    const loggers = probe([{ type: 'gather', task: 'wood', count: 3 }], 4);
    expect(romanNotes(E, farmers)).toContain(ROMAN_FARM_NOTE);
    expect(romanNotes(E, loggers)).toEqual([ROMAN_WORK_NOTE]);
    expect(romanNotes(withoutBonus(), farmers)).not.toContain(ROMAN_WORK_NOTE);
    expect(romanNotes(withoutBonus(), loggers)).toEqual([]);
  });
});
