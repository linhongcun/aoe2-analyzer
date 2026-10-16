import { describe, expect, it } from 'vitest';
import units from '../../src/data/units.json';
import { discountedCost } from '../../src/domain/costDiscount';

const by = Object.fromEntries((units as unknown as { id: number; cost: Record<string, number> }[]).map((u) => [u.id, u]));
const pk = (id: number, civ: string, age: number) => discountedCost(by[id]!, civ, age);
// [单位, 文明, 时代, 规则B 就近 0.5, 规则C 整数四舍五入]；精确值由 effects.json costDiscounts 推出
const CASES: [number, string, number, Record<string, number>, Record<string, number>][] = [
  [74, 'Goths', 1, { Food: 42.5, Gold: 17 }, { Food: 43, Gold: 17 }],
  [83, 'Hindustanis', 2, { Food: 43.5 }, { Food: 44 }],
  [4, 'Mayans', 2, { Gold: 40.5, Wood: 22.5 }, { Gold: 41, Wood: 23 }],
  [1948, 'Wei', 4, { Gold: 169, Wood: 187.5 }, { Gold: 169, Wood: 188 }],
];
describe('#129 统一取整：PK 页不再出「未计入」(.5)', () => {
  it.each(CASES)('unit %i %s age%i：half 为空', (id, civ, age) => {
    expect(pk(id, civ, age).half).toEqual([]);
  });
  const RULE = process.env.R129; // 'B' | 'C'，待 Steve 定
  it.runIf(RULE === 'B').each(CASES)('规则B unit %i %s age%i', (id, civ, age, b) => expect(pk(id, civ, age).cost).toEqual(b));
  it.runIf(RULE === 'C').each(CASES)('规则C unit %i %s age%i', (id, civ, age, _b, c) => expect(pk(id, civ, age).cost).toEqual(c));
});
