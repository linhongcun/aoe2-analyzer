import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import type { BuildOrder, Step } from '../../src/domain/buildOrder';
import { simulateBuild, simSupport, gatherRate, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { chineseContext, CHINESE_OPENING_NOTE } from '../../src/domain/chineseEconomy';

const E = eco as unknown as EcoData;
const ups = Object.fromEntries(units.filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const row = (e: EcoData, id: number) => e.civEco.Chinese!.find((r) => r.tech === id)!;
const without = (id: number) => {
  const e = structuredClone(E);
  e.civEco.Chinese = e.civEco.Chinese!.filter((r) => r.tech !== id);
  return e;
};
const order = (steps: Step[]): BuildOrder => ({
  ...buildOrders[0]!,
  id: 'chinese197-controlled-source-probe',
  target: { age: 3, vils: 6 },
  steps,
});
const funded = () => {
  const e = structuredClone(E);
  delete e.ageReq;
  e.civEco.Chinese!.push({
    source: 'bonus',
    age: 1,
    effects: [
      { kind: 'res', res: 91, op: 'add', v: 5000 },
      { kind: 'res', res: 92, op: 'add', v: 4850 },
      { kind: 'res', res: 94, op: 'add', v: 4900 },
      { kind: 'res', res: 93, op: 'add', v: 4800 },
    ],
  });
  return e;
};
const run = (steps: Step[], e = funded()) => simulateBuild(order(steps), 'Chinese', e, ups, { autoHouses: false });
const step = (actions: Step['actions'], phase?: Step['phase']): Step => ({ vils: 6, actions, ...(phase ? { phase } : {}) });
const age = (to: 2 | 3) => step([{ type: 'ageUp', age: to }], to === 2 ? 'feudal-click' : 'castle-click');

describe('#197 Chinese complete fixed-source gate', () => {
  it('admits all seven production source records and current eight openings', () => {
    expect(chineseContext(E).complete).toBe(true);
    expect(simSupport(E, 'Chinese', buildOrders)).toEqual({ supported: true, reasons: [] });
  });
  it.each([226, 302, 304, 350, 351, 352, 425])('missing source %i cannot unlock Chinese', (id) => {
    expect(simSupport(without(id), 'Chinese', buildOrders).supported).toBe(false);
  });
  it.each(['raw omitted', 'wrong civ', 'unknown companion', 'wrong decoded value', 'duplicate'])(
    'rejects %s without applying that malformed source',
    (kind) => {
      const e = structuredClone(E),
        r = row(e, 425);
      if (kind === 'raw omitted') delete r.chineseTech;
      else if (kind === 'wrong civ') r.chineseTech!.civ = 7;
      else if (kind === 'unknown companion') r.chineseTech!.commands.push({ Type: 999, A: -1, B: -1, C: -1, D: 1 });
      else if (kind === 'wrong decoded value') r.effects.push({ kind: 'res', res: 91, op: 'add', v: 999 });
      else e.civEco.Chinese!.push(structuredClone(r));
      expect(simSupport(e, 'Chinese', buildOrders).supported).toBe(false);
      expect(simulateBuild(buildOrders[0]!, 'Chinese', e, ups).steps[0]!.pop.cap).toBe(5);
    },
  );
  it('rejects a Chinese marker moved to another civilization', () => {
    const e = structuredClone(E);
    e.civEco.Generic = [structuredClone(row(e, 350))];
    expect(simSupport(e, 'Generic', buildOrders).supported).toBe(false);
  });
});

describe('#197 Chinese opening economy', () => {
  it.each(buildOrders)('$id starts with six villagers, zero food, 150 wood and total TC capacity fifteen', (bo) => {
    const tl = simulateBuild(bo, 'Chinese', E, ups);
    expect(tl.steps[0]!.stock).toEqual({ food: 0, wood: 150, gold: 100, stone: 200 });
    expect(tl.steps[0]!.pop).toEqual({ used: 7, cap: 15 });
    expect(tl.model.assumptions).toContain(CHINESE_OPENING_NOTE);
    expect(tl.ageUps).toHaveLength(bo.target.age - 1);
    expect(tl.anomalies.filter((a) => a.type === 'timeout')).toEqual([]);
  });
  it('keeps TC population, house population and completed Age changes separate', () => {
    const tl = run([
      step([
        { type: 'gather', task: 'build', count: 6 },
        { type: 'build', building: 70 },
      ]),
      age(2),
      step([{ type: 'build', building: 109 }], 'feudal'),
      age(3),
      step([], 'castle'),
    ]);
    expect(tl.steps[0]!.pop.cap).toBe(15);
    expect(tl.steps[2]!.pop.cap).toBe(20); // one completed house, no bonus for Age change
    expect(tl.steps.at(-1)!.pop.cap).toBe(35); // a new TC adds another fifteen
    expect(tl.buildingsDone.filter((b) => b.building === 109)).toHaveLength(1);
  });
  it('charges full Age prices, then applies current-Age costs only to ordinary research', () => {
    const tl = run([
      step([{ type: 'research', tech: 22 }]),
      age(2),
      step([{ type: 'research', tech: 202 }], 'feudal'),
      age(3),
      step([{ type: 'research', tech: 203 }], 'castle'),
      step([], 'castle'),
    ]);
    expect(tl.steps[1]!.stock.gold).toBe(4950); // dark-age Loom: 50 gold
    expect(tl.steps[2]!.stock).toMatchObject({ food: 4500, wood: 5000, gold: 4950 }); // Feudal: full 500 food
    expect(tl.steps[3]!.stock).toMatchObject({ food: 4405, wood: 4952, gold: 4950 }); // Axe: 95 food, rounded 48 wood
    expect(tl.steps[4]!.stock).toMatchObject({ food: 3605, wood: 4952, gold: 4750 }); // Castle: full 800 food / 200 gold
    expect(tl.steps[5]!.stock).toMatchObject({ food: 3470, wood: 4862, gold: 4750 }); // Bow Saw: 135 food / 90 wood
  });
  it('discounts the current Men-at-Arms unit technology, preserving research time and training costs', () => {
    const tl = run([age(2), step([{ type: 'upgrade', unit: 75 }], 'feudal'), step([], 'feudal')]);
    expect(tl.steps[2]!.stock).toMatchObject({ food: 4405, gold: 4962 }); // 100 food / 40 gold at 95%
    expect(tl.steps[1]!.doneAt - tl.steps[1]!.startAt).toBe(ups[75]![1]);
  });
  it('applies discount only once after Age completion and does not retroactively alter a paid research', () => {
    const tl = run([
      age(2),
      step(
        [
          { type: 'research', tech: 202 },
          { type: 'ageUp', age: 3 },
        ],
        'feudal',
      ),
      step([], 'castle'),
    ]);
    expect(tl.steps[2]!.stock).toMatchObject({ food: 3605, wood: 4952, gold: 4800 });
    const off = funded();
    off.civEco.Chinese = off.civEco.Chinese!.filter((r) => r.tech !== 350);
    const unDiscounted = run([age(2), step([{ type: 'research', tech: 202 }], 'feudal'), step([], 'feudal')], off);
    expect(unDiscounted.steps[2]!.stock).toMatchObject({ food: 4400, wood: 4950 });
    expect(unDiscounted.steps[0]!.pop.cap).toBe(15); // removing the discount does not remove population
  });
  it('removing only starting villagers does not remove source-verified TC population or starting resources', () => {
    const tl = simulateBuild(buildOrders[0]!, 'Chinese', without(302), ups);
    expect(tl.steps[0]!.pop).toEqual({ used: 4, cap: 15 });
    expect(tl.steps[0]!.stock).toMatchObject({ food: 0, wood: 150 });
  });
  it('leaves independent per-worker gather rates and default-off team resource storage outside the opening bonus', () => {
    for (const task of ['sheep', 'wood', 'berries', 'farm', 'gold']) expect(gatherRate(E, 'Chinese', task, 4)).toEqual(gatherRate(E, 'Generic', task, 4));
    const bo = buildOrders.find((b) => b.id === 'fast-castle-boom')!;
    const normal = simulateBuild(bo, 'Chinese', E, ups);
    const team = simulateBuild(bo, 'Chinese', E, ups, { team: true });
    expect(team.steps).toEqual(normal.steps);
    expect(team.ageUps).toEqual(normal.ageUps);
  });
});
