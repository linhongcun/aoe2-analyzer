import { describe, expect, it } from 'vitest';
import buildings from '../../src/data/buildings.json';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { baseDrifts, discountDrifts, type EcoSlice } from '../../scripts/check-cost-drift';

const catalog = units as unknown as { id: number; zh?: string; age: number; civs: string[]; cost?: Record<string, number>; tt?: number }[];
const blds = buildings as unknown as { id: number; zh?: string; cost?: Record<string, number> }[];
const slice = eco as unknown as EcoSlice;

describe('费用防漂移', () => {
  it('已提交的目录与 eco 基价、折后价一致', () => {
    expect(baseDrifts(catalog, slice.units, blds, slice.buildings)).toEqual([]);
    expect(discountDrifts(catalog, slice)).toEqual([]);
  });

  it('故意改高丽步弓手一边的木材造价，检查会报错', () => {
    const changed = catalog.map((unit) => (unit.id === 4 ? { ...unit, cost: { ...unit.cost, Wood: 26 } } : unit));
    const problems = baseDrifts(changed, slice.units, blds, slice.buildings);
    expect(problems.some((line) => line.includes('单位 4') && line.includes('造价'))).toBe(true);
  });

  it('故意改 eco 里的高丽木材乘数，折后价检查会报错', () => {
    const changed: EcoSlice = {
      ...slice,
      civEco: {
        ...slice.civEco,
        Koreans: slice.civEco.Koreans!.map((row) => ({
          ...row,
          effects: row.effects?.map((effect) => (effect.attr === 'woodCost' && effect.v === 0.5 ? { ...effect, v: 0.4 } : effect)),
        })),
      },
    };
    const problems = discountDrifts(catalog, changed);
    expect(problems.some((line) => line.startsWith('Koreans') && line.includes('Wood'))).toBe(true);
  });
});
