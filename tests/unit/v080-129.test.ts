import { describe, expect, it } from 'vitest';
import units from '../../src/data/units.json';
import { discountedCost } from '../../src/domain/costDiscount';

const by = Object.fromEntries((units as unknown as { id: number; cost: Record<string, number> }[]).map((u) => [u.id, u]));
const pk = (id: number, civ: string, age: number) => discountedCost(by[id]!, civ, age);
// [单位, 文明, 时代, 规则B 就近 0.5（x.25 往小取、x.75 往大取，对齐游戏实测 #24）]；精确值由 effects.json costDiscounts 推出
const CASES: [number, string, number, Record<string, number>][] = [
  [74, 'Goths', 1, { Food: 42.5, Gold: 17 }],
  [83, 'Hindustanis', 2, { Food: 43.5 }],
  [4, 'Mayans', 2, { Gold: 40.5, Wood: 22.5 }],
  [1948, 'Wei', 4, { Gold: 169, Wood: 187.5 }],
];
describe('#129 统一取整：PK 页不再出「未计入」(.5)', () => {
  it.each(CASES)('unit %i %s age%i：half 为空', (id, civ, age) => {
    expect(pk(id, civ, age).half).toEqual([]);
  });
  it.each(CASES)('规则B unit %i %s age%i', (id, civ, age, b) => expect(pk(id, civ, age).cost).toEqual(b));
});
describe('#129 x.25 往小取、x.75 往大取（游戏实测，Steve #133）', () => {
  it.each([[168.75, 169], [131.25, 131], [42.5, 42.5], [17.25, 17], [26.25, 26], [18.75, 19]])('%d to %d', async (x, y) => {
    const { roundHalfPrice } = await import('../../src/domain/costDiscount');
    expect(roundHalfPrice(x)).toBe(y);
  });
});
