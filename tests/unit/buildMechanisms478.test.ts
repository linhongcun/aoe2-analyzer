/** #478 refactoring contracts: preserve consumer behavior and the two original source gates. */
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import { gatherRate, simSupport, simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';

const E = eco as unknown as EcoData;
const upgrades = Object.fromEntries(units.filter((unit) => unit.up).map((unit) => [unit.id, unit.up])) as UpgradeData;
const boom = buildOrders.find((order) => order.id === 'fast-castle-boom')!;

/** Synthetic data isolates dispatch semantics; these numbers do not describe a game bonus. */
function withUnknownCompanion(civ: string): EcoData {
  const data = structuredClone(E);
  (data.civEco[civ] ??= []).push({
    source: 'bonus',
    age: 1,
    tech: 99999,
    effects: [
      { kind: 'attr', target: 'task:wood', attr: 'workRate', op: 'mul', v: 2 },
      { kind: 'not-yet-classified', v: 1 },
    ],
  });
  return data;
}

describe('#478 existing source atomicity boundaries', () => {
  it('the standalone rate helper retains the generic partial-row behavior, while timelines reject the entire row', () => {
    const changed = withUnknownCompanion('Generic');
    expect(gatherRate(changed, 'Generic', 'wood').workRate).toBe(gatherRate(E, 'Generic', 'wood').workRate * 2);
    expect(simulateBuild(boom, 'Generic', changed, upgrades)).toEqual(simulateBuild(boom, 'Generic', E, upgrades));
  });

  it.each(['Tatars', 'Mayans', 'Sicilians', 'Slavs', 'Khmer'])('the paired-source gate for %s also rejects partial rows in the rate helper', (civ) => {
    const changed = withUnknownCompanion(civ);
    expect(gatherRate(changed, civ, 'wood')).toEqual(gatherRate(E, civ, 'wood'));
    if (civ !== 'Khmer') expect(simulateBuild(boom, civ, changed, upgrades)).toEqual(simulateBuild(boom, civ, E, upgrades));
  });

  it('an unknown Khmer source row invalidates its complete source context and removes the advertised bonuses', () => {
    const changed = withUnknownCompanion('Khmer');
    expect(simSupport(changed, 'Khmer', buildOrders).supported).toBe(false);
    const assumptions = simulateBuild(boom, 'Khmer', changed, upgrades).model.assumptions;
    expect(assumptions).not.toContain('当前开局免建筑前置已计入，显式建筑照常付费建造');
    expect(assumptions).not.toContain('农田按免回仓与供给上限连续估算，结果可能低于原通用估算，不代表游戏内加成减益');
  });
});

describe('#478 simulator dispatch is pure and keeps its public output shape', () => {
  it.each(['Armenians', 'Georgians'])('%s infrastructure substitution does not mutate inputs or change repeated results', (civ) => {
    const data = structuredClone(E);
    const order = structuredClone(boom);
    const original = { data: structuredClone(data), order: structuredClone(order) };
    const first = simulateBuild(order, civ, data, upgrades, { team: true });
    expect({ data, order }).toEqual(original);
    expect(simulateBuild(order, civ, data, upgrades, { team: true })).toEqual(first);
    expect({ data, order }).toEqual(original);
  });

  it.each(['Generic', 'Portuguese', 'Armenians', 'Georgians'])('%s omits the optional free-villager event property', (civ) => {
    expect(Object.hasOwn(simulateBuild(boom, civ, E, upgrades), 'bonusVillagerEvents')).toBe(false);
  });

  it.each(['Wei', 'Bengalis'])('%s exposes its independent free-villager event list', (civ) => {
    const result = simulateBuild(boom, civ, E, upgrades);
    expect(Object.hasOwn(result, 'bonusVillagerEvents')).toBe(true);
    expect(result.bonusVillagerEvents!.length).toBeGreaterThan(0);
  });
});
