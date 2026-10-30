import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import type { Action, BuildOrder } from '../../src/domain/buildOrder';
import { simulateBuild, simSupport, gatherRate, type EcoData, type EffectRow, type UpgradeData } from '../../src/domain/buildSim';
import {
  gurjaraContext,
  gurjaraOrdersSupported,
  gurjaraNotes,
  GURJARA_OPENING_NOTE,
  GURJARA_KNIGHT_NOTE,
  GURJARA_ACTION_REASON,
} from '../../src/domain/gurjaraEconomy';
const E = eco as unknown as EcoData;
const ups = Object.fromEntries(units.filter((unit) => unit.up).map((unit) => [unit.id, unit.up])) as UpgradeData;
const row = (e: EcoData, id: number) => e.civEco.Gurjaras!.find((entry) => entry.tech === id)!;

describe('#197 Gurjara source and zero-garrison contract', () => {
  it('admits both complete pinned source records and all eight current templates', () => {
    expect(gurjaraContext(E).complete).toBe(true);
    expect(gurjaraOrdersSupported(buildOrders)).toBe(true);
    expect(simSupport(E, 'Gurjaras', buildOrders)).toEqual({ supported: true, reasons: [] });
  });
  it.each([856, 857])('does not unlock support with source%i missing', (id) => {
    const changed = structuredClone(E);
    changed.civEco.Gurjaras = changed.civEco.Gurjaras!.filter((entry) => entry.tech !== id);
    expect(simSupport(changed, 'Gurjaras', buildOrders).supported).toBe(false);
    expect(gurjaraNotes(changed)).toEqual([]);
  });
  it.each(['raw omitted', 'wrong owner', 'wrong effect', 'wrong condition', 'unknown companion', 'wrong decoded', 'duplicate', 'wrong spawned entity'])(
    'rejects %s rather than treating it as the reviewed boundary',
    (kind) => {
      const changed = structuredClone(E),
        entry = row(changed, 857);
      if (kind === 'raw omitted') delete entry.gurjaraTech;
      else if (kind === 'wrong owner') entry.gurjaraTech!.civ = 41;
      else if (kind === 'wrong effect') entry.gurjaraTech!.effectId = 871;
      else if (kind === 'wrong condition') entry.gurjaraTech!.requiredCount = 0;
      else if (kind === 'unknown companion') entry.gurjaraTech!.commands.push({ Type: 999, A: -1, B: -1, C: -1, D: 1 });
      else if (kind === 'wrong decoded') entry.effects.push({ kind: 'res', res: 91, op: 'add', v: 350 });
      else if (kind === 'duplicate') changed.civEco.Gurjaras!.push(structuredClone(entry));
      else entry.gurjaraTech!.commands[1]!.A = 83;
      expect(simSupport(changed, 'Gurjaras', buildOrders).supported).toBe(false);
      expect(gurjaraNotes(changed)).toEqual([]);
    },
  );
  it('rejects a garrison source with an unreviewed capacity or source moved to another civilization', () => {
    const changed = structuredClone(E);
    row(changed, 856).gurjaraTech!.commands[0]!.D = 32;
    expect(simSupport(changed, 'Gurjaras', buildOrders).supported).toBe(false);
    const displaced = structuredClone(E);
    displaced.civEco.Generic = [structuredClone(row(displaced, 856))];
    expect(simSupport(displaced, 'Generic', buildOrders).supported).toBe(false);
  });
  it.each(['garrison', 'ungarrison'])('does not qualify a future %s action as the zero-garrison model', (type) => {
    const order = structuredClone(buildOrders[0]!);
    order.steps[0]!.actions.push({ type } as unknown as Action);
    expect(gurjaraOrdersSupported([order])).toBe(false);
    expect(simSupport(E, 'Gurjaras', [order])).toMatchObject({ supported: false, reasons: [GURJARA_ACTION_REASON] });
  });
});

describe('#197 Gurjara ordinary quantities and explicit omissions', () => {
  it.each(buildOrders)('$id preserves ordinary inventories, villagers and all existing opening numbers', (order) => {
    const result = simulateBuild(order, 'Gurjaras', E, ups),
      generic = simulateBuild(order, 'Generic', E, ups);
    expect(result.steps[0]!.stock).toEqual({ food: 200, wood: 200, gold: 100, stone: 200 });
    expect(result.steps[0]!.pop).toEqual({ used: 4, cap: 5 });
    expect(result.steps).toEqual(generic.steps);
    expect(result.ageUps).toEqual(generic.ageUps);
    expect(result.villagerEvents).toEqual(generic.villagerEvents);
    expect(result.housePaidAt).toEqual(generic.housePaidAt);
    expect(result.model.assumptions).toContain(GURJARA_OPENING_NOTE);
    expect(gurjaraNotes(E, order.id).includes(GURJARA_KNIGHT_NOTE)).toBe(order.id === 'fast-castle-knights');
  });
  it('does not generate passive food merely because an empty mill has completed', () => {
    const changed = structuredClone(E);
    const fund: EffectRow = { source: 'bonus', age: 1, effects: [{ kind: 'res', res: 91, op: 'add', v: 1000 }] };
    changed.civEco.Gurjaras!.push(structuredClone(fund));
    changed.civEco.Generic = [structuredClone(fund)];
    const order: BuildOrder = {
      ...buildOrders[0]!,
      id: 'gurjaras197-empty-mill-probe',
      target: { age: 2, vils: 3 },
      steps: [
        {
          vils: 3,
          actions: [
            { type: 'gather', task: 'build', count: 3 },
            { type: 'build', building: 68 },
            { type: 'build', building: 562 },
          ],
        },
        { vils: 3, actions: [{ type: 'research', tech: 22 }] },
        { vils: 3, actions: [{ type: 'ageUp', age: 2 }] },
        { vils: 3, phase: 'feudal', actions: [] },
      ],
    };
    const result = simulateBuild(order, 'Gurjaras', changed, ups, { autoHouses: false });
    expect(result.buildingsDone.some((building) => building.building === 68)).toBe(true);
    expect(result.steps.at(-1)!.stock.food).toBe(700); // 200 + controlled1000, less original500 Age price; no workers collect food.
    expect(result.steps).toEqual(simulateBuild(order, 'Generic', changed, ups, { autoHouses: false }).steps);
  });
  it('does not change a worker rate or turn additional finite bushes into direct income', () => {
    for (const task of ['berries', 'sheep', 'hunt', 'farm', 'wood', 'gold', 'stone', 'fish'])
      for (const tiles of [0, 4, 7]) expect(gatherRate(E, 'Gurjaras', task, tiles)).toEqual(gatherRate(E, 'Generic', task, tiles));
  });
});
