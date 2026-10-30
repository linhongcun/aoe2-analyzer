import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import type { BuildOrder, Step } from '../../src/domain/buildOrder';
import { ageReqOk, gatherRate, simulateBuild, simSupport, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import {
  polishBuildOrder,
  polishContext,
  polishResearchSites,
  polishBuildingReady,
  polishBuildingPopulation,
  polishStoneGold,
  polishNotes,
  POLISH_FARM_NOTE,
} from '../../src/domain/polishEconomy';
const E = eco as unknown as EcoData;
const ups = Object.fromEntries(units.filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const row = (e: EcoData, id: number) => e.civEco.Poles!.find((r) => r.tech === id)!;
const without = (id: number) => {
  const e = structuredClone(E);
  e.civEco.Poles = e.civEco.Poles!.filter((r) => r.tech !== id);
  return e;
};
const step = (actions: Step['actions'], phase?: Step['phase']): Step => ({ vils: 3, actions, ...(phase ? { phase } : {}) });
const order = (steps: Step[]): BuildOrder => ({ ...buildOrders[0]!, id: 'poles197-controlled-source-probe', target: { age: 3, vils: 3 }, steps });
const funded = () => {
  const e = structuredClone(E);
  delete e.ageReq;
  e.civEco.Poles!.push({
    source: 'bonus',
    age: 1,
    effects: [
      { kind: 'res', res: 91, op: 'add', v: 4800 },
      { kind: 'res', res: 92, op: 'add', v: 4800 },
    ],
  });
  return e;
};
const run = (steps: Step[], e = funded()) => simulateBuild(order(steps), 'Poles', e, ups, { autoHouses: false });

describe('#197 Poles complete fixed-source admission', () => {
  it('admits complete fixed Folwark infrastructure and five canonical rows', () => {
    expect(polishContext(E).complete).toBe(true);
    expect(simSupport(E, 'Poles', buildOrders)).toEqual({ supported: true, reasons: [] });
  });
  it.each([793, 794, 795, 796, 805])('missing%i keeps the current civilization unsupported', (id) => {
    expect(simSupport(without(id), 'Poles', buildOrders).supported).toBe(false);
    expect(gatherRate(without(id), 'Poles', 'stone', 4).extraIncome.gold).toBeUndefined();
  });
  it.each([
    'missing infrastructure',
    'population',
    'build cost',
    'tree command',
    'research site',
    'farm requirement',
    'age requirement',
    'unknown raw',
    'wrong decoded',
    'missing function13',
    'duplicate',
    'owner',
    'renumbered',
    'injected marker',
  ])('rejects malformed %s and suppresses stone gold', (kind) => {
    const e = structuredClone(E);
    if (kind === 'missing infrastructure') delete e.polesInfrastructure;
    else if (kind === 'population') e.polesInfrastructure!.folwarks[0]!.populationSource.amount = 10;
    else if (kind === 'build cost') e.buildings[1734]!.cost.Wood = 50;
    else if (kind === 'tree command') e.polesInfrastructure!.treeCommands.push({ Type: 999, A: -1, B: -1, C: -1, D: 1 });
    else if (kind === 'research site') e.polesInfrastructure!.researchSites[14]![0]![0] = 84;
    else if (kind === 'farm requirement') e.polesInfrastructure!.farmTech.requires = [];
    else if (kind === 'age requirement') e.polesInfrastructure!.ageNode.requiredCount = 1;
    else if (kind === 'unknown raw') row(e, 805).polesTech!.commands.push({ Type: 999, A: -1, B: -1, C: -1, D: 1 });
    else if (kind === 'wrong decoded') row(e, 805).effects[0]!.v = 100;
    else if (kind === 'missing function13') row(e, 805).polesTech!.commands.pop();
    else if (kind === 'duplicate') e.civEco.Poles!.push(structuredClone(row(e, 805)));
    else if (kind === 'owner') row(e, 805).polesTech!.civ = 43;
    else if (kind === 'renumbered') row(e, 805).tech = 1805;
    else e.civEco.Poles!.push({ source: 'bonus', age: 1, tech: 1805, effects: [{ kind: 'res', res: 241, op: 'set', v: 100 }] });
    expect(simSupport(e, 'Poles', buildOrders).supported).toBe(false);
    expect(gatherRate(e, 'Poles', 'stone', 4).extraIncome.gold).toBeUndefined();
  });
  it('rejects a Polish source moved to a foreign civilization before generic application', () => {
    const e = structuredClone(E);
    e.civEco.Generic = [structuredClone(row(e, 805))];
    expect(simSupport(e, 'Generic', buildOrders).supported).toBe(false);
    expect(gatherRate(e, 'Generic', 'stone', 4).extraIncome.gold).toBeUndefined();
  });
});

describe('#197 Poles real Folwarks and bounded harvest model', () => {
  it('replaces seven mills individually without changing the original eight orders or their farm actions', () => {
    const original = JSON.stringify(buildOrders);
    let count = 0,
      farms = 0;
    for (const bo of buildOrders) {
      const adapted = polishBuildOrder(bo, 'Poles', E);
      const builds = (order: BuildOrder, ids: number[]) => order.steps.flatMap((s) => s.actions).filter((a) => a.type === 'build' && ids.includes(a.building));
      const mills = builds(bo, [68, 129, 130, 131]),
        folwarks = builds(adapted, [1734, 1711, 1720]);
      expect(folwarks).toHaveLength(mills.length);
      expect(builds(adapted, [50, 1187])).toEqual(builds(bo, [50, 1187]));
      count += folwarks.length;
      farms += builds(bo, [50, 1187]).reduce((sum, action) => sum + (action.type === 'build' ? (action.count ?? 1) : 0), 0);
      expect(polishBuildOrder(adapted, 'Poles', E)).toEqual(adapted);
      expect(polishBuildOrder(bo, 'Generic', E)).toBe(bo);
      const tl = simulateBuild(bo, 'Poles', E, ups);
      expect(tl.ageUps).toHaveLength(bo.target.age - 1);
      expect(tl.buildingsDone.filter((building) => [1734, 1711, 1720].includes(building.building))).toHaveLength(mills.length);
      expect(tl.steps[0]!.stock).toEqual({ food: 200, wood: 200, gold: 100, stone: 200 });
      expect(tl.steps[0]!.pop).toEqual({ used: 4, cap: 5 });
      expect(polishNotes(E, bo.id)).toContain(POLISH_FARM_NOTE);
    }
    expect(count).toBe(7);
    expect(farms).toBe(11);
    expect(JSON.stringify(buildOrders)).toBe(original);
  });
  it('uses the fixed age form for new mills, while previously built forms remain a valid research location', () => {
    const adapted = polishBuildOrder(
      order([
        step([{ type: 'build', building: 68 }]),
        step([{ type: 'build', building: 68 }], 'feudal'),
        step([{ type: 'build', building: 68 }], 'castle'),
        step([{ type: 'build', building: 68 }], 'imperial'),
      ]),
      'Poles',
      E,
    );
    expect(adapted.steps.map((s) => s.actions[0])).toEqual([1734, 1711, 1720, 1720].map((building) => ({ type: 'build', building })));
    expect(polishResearchSites(E, 14)).toEqual([1734, 1711, 1720]);
    expect(polishResearchSites(E, 202)).toEqual([562]);
  });
  it('pays100wood per Folwark and grants5population only after actual40second construction', () => {
    const tl = run([
      step([
        { type: 'gather', task: 'build', count: 3 },
        { type: 'build', building: 68 },
      ]),
      step([{ type: 'research', tech: 14 }]),
      step([{ type: 'build', building: 68 }]),
      step([{ type: 'research', tech: 14 }]),
      step([{ type: 'ageUp', age: 2 }]),
      step([], 'feudal'),
    ]);
    const folwarks = tl.buildingsDone.filter((building) => building.building === 1734);
    expect(folwarks).toHaveLength(2);
    // The simulator records completion at the start of the finishing0.1second tick.
    expect(folwarks[0]!.at + 0.1).toBeCloseTo((40 * 3) / 5, 9);
    expect(tl.steps[0]!.pop.cap).toBe(5);
    expect(tl.steps[1]!.pop.cap).toBe(5);
    expect(tl.steps[2]!.pop.cap).toBe(10);
    expect(tl.steps.at(-1)!.pop.cap).toBe(15);
    expect(tl.steps[1]!.stock.wood).toBe(4900);
    expect(tl.steps[3]!.stock.wood).toBe(4800 - E.techs[14]!.cost.Wood!);
    expect(tl.steps[1]!.doneAt).toBeGreaterThanOrEqual(folwarks[0]!.at + E.techs[14]!.researchTime - 0.1);
  });
  it('requires a completed Folwark for farms and market, and counts it as one age prerequisite kind', () => {
    const context = polishContext(E),
      none = new Map<number, number>(),
      completed = new Map([[1734, 1]]);
    for (const id of [50, 1187, 84, 116, 137]) {
      expect(polishBuildingReady(context, id, none)).toBe(false);
      expect(polishBuildingReady(context, id, completed)).toBe(true);
    }
    expect(polishBuildingPopulation(context, 68)).toBe(0);
    expect(polishBuildingPopulation(context, 1734)).toBe(5);
    expect(ageReqOk(E.ageReq!['2']!.req, completed, 'Poles')).toBe(false);
    expect(ageReqOk(E.ageReq!['2']!.req, new Map([[1734, 2]]), 'Poles')).toBe(false);
    expect(
      ageReqOk(
        E.ageReq!['2']!.req,
        new Map([
          [1734, 1],
          [562, 1],
        ]),
        'Poles',
      ),
    ).toBe(true);
    const tl = run([
      step([
        { type: 'gather', task: 'build', count: 3 },
        { type: 'build', building: 68 },
        { type: 'build', building: 50 },
      ]),
      step([{ type: 'research', tech: 14 }]),
      step([]),
    ]);
    const folwark = tl.buildingsDone.find((b) => b.building === 1734)!,
      farm = tl.buildingsDone.find((b) => b.building === 50)!;
    expect(farm.at).toBeGreaterThan(folwark.at);
  });
  it.each([0, 4, 7])('keeps ordinary farm production unchanged and creates no harvest at%i tiles', (tiles) => {
    expect(gatherRate(E, 'Poles', 'farm', tiles)).toEqual(gatherRate(E, 'Generic', 'farm', tiles));
    expect(gatherRate(E, 'Poles', 'farm', tiles).extraIncome).toEqual({});
  });
  it('removing793 removes the actual Folwark bonus while retaining independent physical evidence', () => {
    const off = without(793);
    expect(polishContext(off).infrastructure).not.toBeNull();
    const probe = order([
      step([
        { type: 'gather', task: 'build', count: 3 },
        { type: 'build', building: 68 },
      ]),
      step([{ type: 'research', tech: 14 }]),
      step([{ type: 'ageUp', age: 2 }]),
      step([], 'feudal'),
    ]);
    const full = simulateBuild(probe, 'Poles', funded(), ups, { autoHouses: false }),
      offEco = funded();
    offEco.civEco.Poles = offEco.civEco.Poles!.filter((r) => r.tech !== 793);
    const base = simulateBuild(probe, 'Poles', offEco, ups, { autoHouses: false });
    expect(full.buildingsDone[0]!.building).toBe(1734);
    expect(base.buildingsDone[0]!.building).toBe(68);
    expect(full.buildingsDone[0]!.at + 0.1).toBeCloseTo((40 * 3) / 5, 9);
    expect(base.buildingsDone[0]!.at + 0.1).toBeCloseTo((E.buildings[68]!.buildTime * 3) / 5, 9);
    expect(full.steps.at(-1)!.pop.cap - base.steps.at(-1)!.pop.cap).toBe(5);
    expect(base.ageUps).toHaveLength(1);
    for (const bo of buildOrders.filter((bo) => bo.id !== 'hybrid-fish-18')) {
      const on = simulateBuild(bo, 'Poles', E, ups),
        removed = simulateBuild(bo, 'Poles', off, ups);
      expect(on.buildingsDone).not.toEqual(removed.buildingsDone);
      expect(removed.ageUps).toHaveLength(bo.target.age - 1);
    }
  });
  it('current eight templates have no stone workers and never create stock from an unassigned task', () => {
    for (const bo of buildOrders) {
      expect(bo.steps.flatMap((s) => s.actions).some((a) => a.type === 'gather' && a.task === 'stone')).toBe(false);
      const full = simulateBuild(bo, 'Poles', E, ups),
        off = simulateBuild(bo, 'Poles', without(805), ups);
      expect(full.steps).toEqual(off.steps);
      expect(full.buildingsDone).toEqual(off.buildingsDone);
    }
  });
});

describe('#197 Poles continuous stone co-production', () => {
  it.each([0, 4, 7])('uses effective stone rate after carry/walk and affects only gold at%i tiles', (tiles) => {
    const full = gatherRate(E, 'Poles', 'stone', tiles),
      off = gatherRate(without(805), 'Poles', 'stone', tiles);
    expect({ ...full, extraIncome: {} }).toEqual({ ...off, extraIncome: {} });
    const percentage = row(E, 805).effects.find((effect) => effect.res === 241)!.v!;
    expect(full.extraIncome.gold).toBeCloseTo((off.rate * percentage) / 100, 12);
    for (const task of ['sheep', 'hunt', 'berries', 'farm', 'fish', 'wood', 'gold'])
      expect(gatherRate(E, 'Poles', task, tiles)).toEqual(gatherRate(without(805), 'Poles', task, tiles));
  });
  it('pays the source-derived extra gold into actual inventory without taking stone away', () => {
    const steps = [
      step([
        { type: 'gather', task: 'stone', count: 3 },
        { type: 'ageUp', age: 2 },
      ]),
      step([], 'feudal'),
    ];
    const on = run(steps),
      offEco = funded();
    offEco.civEco.Poles = offEco.civEco.Poles!.filter((r) => r.tech !== 805);
    const off = run(steps, offEco),
      rate = gatherRate(E, 'Poles', 'stone', 4).rate,
      elapsed = on.steps[1]!.startAt;
    expect(elapsed).toBe(130);
    expect(on.steps[1]!.stock.stone).toBe(Math.floor(200 + 3 * rate * elapsed));
    expect(on.steps[1]!.stock.gold).toBe(Math.floor(100 + 3 * polishStoneGold(polishContext(E), 'stone', rate) * elapsed));
    expect(off.steps[1]!.stock.gold).toBe(100);
    expect(on.steps[1]!.stock.stone).toBe(off.steps[1]!.stock.stone);
  });
});
