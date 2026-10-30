import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import type { BuildOrder, Step, Task } from '../../src/domain/buildOrder';
import { ageReqOk, gatherRate, simulateBuild, simSupport, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import {
  mapucheBuildOrder,
  mapucheContext,
  mapucheNotes,
  MAPUCHE_CAVALRY_NOTE,
  MAPUCHE_MILITIA_NOTE,
  MAPUCHE_OPENING_NOTE,
} from '../../src/domain/mapucheEconomy';
const E = eco as unknown as EcoData;
const ups = Object.fromEntries(units.filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const row = (e: EcoData, id: number) => e.civEco.Mapuche!.find((r) => r.tech === id)!;
const without = (id: number) => {
  const e = structuredClone(E);
  e.civEco.Mapuche = e.civEco.Mapuche!.filter((r) => r.tech !== id);
  return e;
};
const step = (actions: Step['actions'], phase?: Step['phase']): Step => ({ vils: 3, actions, ...(phase ? { phase } : {}) });
const order = (steps: Step[]): BuildOrder => ({ ...buildOrders[0]!, id: 'mapuche197-controlled-source-probe', target: { age: 3, vils: 3 }, steps });
const funded = () => {
  const e = structuredClone(E);
  delete e.ageReq;
  e.civEco.Mapuche!.push({
    source: 'bonus',
    age: 1,
    effects: [
      { kind: 'res', res: 91, op: 'add', v: 4800 },
      { kind: 'res', res: 92, op: 'add', v: 4800 },
      { kind: 'res', res: 94, op: 'add', v: 4900 },
    ],
  });
  return e;
};
const run = (steps: Step[], e = funded()) => simulateBuild(order(steps), 'Mapuche', e, ups, { autoHouses: false });

describe('#197 Mapuche complete fixed-source admission', () => {
  it('admits the fixed infrastructure and all five complete bonus source rows', () => {
    expect(mapucheContext(E).complete).toBe(true);
    expect(simSupport(E, 'Mapuche', buildOrders)).toEqual({ supported: true, reasons: [] });
  });
  it.each([1381, 1382, 1405, 1406, 1407])('missing technology%i does not unlock support', (id) =>
    expect(simSupport(without(id), 'Mapuche', buildOrders).supported).toBe(false),
  );
  it.each(['missing infrastructure', 'changed population', 'unknown tree command', 'unknown raw command', 'wrong decoded', 'duplicate row', 'wrong owner'])(
    'rejects %s',
    (kind) => {
      const e = structuredClone(E);
      if (kind === 'missing infrastructure') delete e.mapucheInfrastructure;
      else if (kind === 'changed population') e.mapucheInfrastructure!.settlements[0]!.populationSource.amount = 10;
      else if (kind === 'unknown tree command') e.mapucheInfrastructure!.treeCommands.push({ Type: 999, A: -1, B: -1, C: -1, D: 1 });
      else if (kind === 'unknown raw command') row(e, 1381).mapucheTech!.commands.push({ Type: 999, A: -1, B: -1, C: -1, D: 1 });
      else if (kind === 'wrong decoded') row(e, 1381).effects[0]!.v = 50;
      else if (kind === 'duplicate row') e.civEco.Mapuche!.push(structuredClone(row(e, 1381)));
      else row(e, 1381).mapucheTech!.civ = 59;
      expect(simSupport(e, 'Mapuche', buildOrders).supported).toBe(false);
      if (!kind.includes('infrastructure') && !kind.includes('population') && !kind.includes('tree'))
        expect(gatherRate(e, 'Mapuche', 'berries', 4).extraIncome.food).toBeUndefined();
    },
  );
  it('rejects a Mapuche source row displaced to another civilization', () => {
    const e = structuredClone(E);
    e.civEco.Generic = [structuredClone(row(e, 1381))];
    expect(simSupport(e, 'Generic', buildOrders).supported).toBe(false);
    expect(gatherRate(e, 'Generic', 'berries', 4).extraIncome.food).toBeUndefined();
  });
});

describe('#197 Mapuche economy and completed settlements', () => {
  it('maps all twenty camp actions individually and keeps their source orders immutable', () => {
    const original = JSON.stringify(buildOrders);
    let count = 0;
    for (const bo of buildOrders) {
      const adapted = mapucheBuildOrder(bo, 'Mapuche', E);
      const originalCamps = bo.steps.flatMap((s) => s.actions).filter((a) => a.type === 'build' && [68, 562, 584].includes(a.building));
      const settlement = adapted.steps.flatMap((s) => s.actions).filter((a) => a.type === 'build' && a.building === 2556);
      expect(settlement).toHaveLength(originalCamps.length);
      count += settlement.length;
      expect(mapucheBuildOrder(adapted, 'Mapuche', E)).toEqual(adapted);
      const tl = simulateBuild(bo, 'Mapuche', E, ups);
      expect(tl.steps[0]!.stock).toEqual({ food: 200, wood: 200, gold: 100, stone: 200 });
      expect(tl.steps[0]!.pop).toEqual({ used: 4, cap: 5 });
      expect(tl.ageUps).toHaveLength(bo.target.age - 1);
      expect(tl.buildingsDone.filter((b) => b.building === 2556)).toHaveLength(originalCamps.length);
      expect(tl.model.assumptions).toContain(MAPUCHE_OPENING_NOTE);
    }
    expect(count).toBe(20);
    expect(JSON.stringify(buildOrders)).toBe(original);
  });
  it.each([0, 4, 7])('adds only berry income after the original carry/walk calculation at %i tiles', (tiles) => {
    const bonus = gatherRate(E, 'Mapuche', 'berries', tiles),
      base = gatherRate(without(1381), 'Mapuche', 'berries', tiles);
    expect({ ...bonus, extraIncome: {} }).toEqual({ ...base, extraIncome: {} });
    expect(bonus.extraIncome.food).toBeCloseTo(base.rate * 0.25, 12);
    for (const task of ['sheep', 'hunt', 'farm', 'fish', 'wood', 'gold', 'stone'])
      expect(gatherRate(E, 'Mapuche', task, tiles)).toEqual(gatherRate(without(1381), 'Mapuche', task, tiles));
  });
  it.each(['berries', 'sheep'] as Task[])('extra food is paid into only the %s inventory stream', (task) => {
    const bo = order([
      step([
        { type: 'gather', task, count: 3 },
        { type: 'ageUp', age: 2 },
      ]),
      step([], 'feudal'),
    ]);
    const off = funded();
    off.civEco.Mapuche = off.civEco.Mapuche!.filter((r) => r.tech !== 1381);
    const full = simulateBuild(bo, 'Mapuche', funded(), ups, { autoHouses: false, nearTiles: 4 });
    const base = simulateBuild(bo, 'Mapuche', off, ups, { autoHouses: false, nearTiles: 4 });
    const rate = gatherRate(off, 'Mapuche', task, 4).rate,
      elapsed = full.steps[1]!.startAt;
    expect(elapsed).toBe(130);
    // Stock snapshots floor each resource to integers; assert both actual inventories from the source rate.
    expect(full.steps[1]!.stock.food).toBe(Math.floor(4500 + 3 * rate * (task === 'berries' ? 1.25 : 1) * elapsed));
    expect(base.steps[1]!.stock.food).toBe(Math.floor(4500 + 3 * rate * elapsed));
    expect(full.steps[1]!.stock.wood).toBe(base.steps[1]!.stock.wood);
  });
  it('pays125wood for each separate settlement and adds5population only after completion', () => {
    const tl = run([
      step([
        { type: 'gather', task: 'build', count: 3 },
        { type: 'build', building: 68 },
      ]),
      step([{ type: 'research', tech: 22 }]),
      step([{ type: 'research', tech: 14 }]),
      step([]),
    ]);
    expect(tl.steps[0]!.pop.cap).toBe(5);
    expect(tl.steps[1]!.pop.cap).toBe(5);
    expect(tl.steps[1]!.stock.wood).toBe(4875);
    expect(tl.steps[3]!.pop.cap).toBe(10);
    const second = run([
      step([
        { type: 'gather', task: 'build', count: 3 },
        { type: 'build', building: 68 },
      ]),
      step([{ type: 'research', tech: 14 }]),
      step([{ type: 'build', building: 562 }]),
      step([{ type: 'research', tech: 202 }]),
      step([{ type: 'ageUp', age: 2 }]),
      step([], 'feudal'),
    ]);
    expect(second.buildingsDone.filter((b) => b.building === 2556)).toHaveLength(2);
    expect(second.steps.at(-1)!.pop.cap).toBe(15);
    expect(5000 - second.steps[3]!.stock.wood - E.techs[14]!.cost.Wood!).toBe(250);
  });
  it('waits for the real settlement before economic research and farm/market prerequisites', () => {
    const tl = run([
      step([
        { type: 'gather', task: 'build', count: 3 },
        { type: 'build', building: 584 },
      ]),
      step([{ type: 'research', tech: 202 }]),
      step([{ type: 'build', building: 50 }]),
      step([]),
    ]);
    const completed = tl.buildingsDone.find((b) => b.building === 2556)!.at;
    expect(tl.steps[1]!.doneAt).toBeGreaterThanOrEqual(completed + E.techs[202]!.researchTime - 0.1);
    const physical = mapucheContext(E).infrastructure!;
    expect(physical.farmTech.requires).toContain(physical.buildingTech.tech);
    expect(ageReqOk(E.ageReq!['2']!.req, new Map([[2556, 3]]), 'Mapuche')).toBe(true);
    expect(ageReqOk(E.ageReq!['3']!.req, new Map([[2556, 3]]), 'Mapuche')).toBe(false);
  });
  it('keeps the original Barracks22second spear route and ignores settlement-entry time multipliers', () => {
    const steps = [
      step([
        { type: 'gather', task: 'build', count: 3 },
        { type: 'build', building: 12 },
      ]),
      step([{ type: 'ageUp', age: 2 }]),
      step([{ type: 'train', unit: 93 }], 'feudal'),
      step([], 'feudal'),
    ];
    const normal = run(steps),
      removed = funded();
    removed.civEco.Mapuche = removed.civEco.Mapuche!.filter((r) => ![1405, 1406, 1407].includes(r.tech ?? -1));
    expect(normal.steps).toEqual(run(steps, removed).steps);
    expect(normal.steps[2]!.doneAt - normal.steps[2]!.startAt).toBe(22);
    const barracks = normal.buildingsDone.find((b) => b.building === 12)!;
    expect(normal.steps[2]!.startAt).toBeGreaterThan(barracks.at);
  });
  it('removes berry bonus without removing paid infrastructure and keeps ordinary worker costs unchanged', () => {
    const off = without(1381);
    expect(mapucheContext(off).infrastructure).not.toBeNull();
    for (const bo of buildOrders) expect(mapucheBuildOrder(bo, 'Mapuche', off)).toEqual(mapucheBuildOrder(bo, 'Mapuche', E));
  });
  it('discloses exactly the five templates that require unavailable military units/buildings', () => {
    for (const bo of buildOrders) {
      const notes = mapucheNotes(E, bo.id);
      expect(notes.includes(MAPUCHE_CAVALRY_NOTE)).toBe(['scouts-18', 'fast-castle-knights'].includes(bo.id));
      expect(notes.includes(MAPUCHE_MILITIA_NOTE)).toBe(['drush-fc', 'feudal-drush-18', 'maa-archers-18'].includes(bo.id));
    }
  });
});
