import { describe, expect, it } from 'vitest';
import { SPECIAL_INCOME } from '../../src/domain/specialIncome';

describe('#816 特殊收入主表', () => {
  it('每个渠道只登记一次，收入/修饰/放行都有对应字段', () => {
    const keys = SPECIAL_INCOME.map((rule) => `${rule.flag ?? 'no-flag'}:${rule.res ?? 'no-res'}:${rule.op ?? 'no-op'}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(
      SPECIAL_INCOME.filter((rule) => rule.flag)
        .map((rule) => rule.flag)
        .sort(),
    ).toEqual(['foragerFood', 'foragerWood', 'lumberFood', 'malianGold', 'mayanResource', 'tatarShepherd', 'varangianGold'].sort());
    for (const rule of SPECIAL_INCOME) {
      if (rule.flag) expect(rule.allows, `${rule.flag} allows`).toBeTypeOf('function');
      if (rule.res !== undefined) expect(rule.op, `${rule.res} op`).toBeTruthy();
      if (rule.apply) expect(rule.res, `${rule.flag} res`).toBeDefined();
    }
    expect(SPECIAL_INCOME.some((rule) => !rule.flag && rule.income)).toBe(true);
  });

  it('收入渠道覆盖 5 个 flag 加波兰采石', () => {
    const incomeFlags = SPECIAL_INCOME.filter((rule) => rule.income).map((rule) => rule.flag ?? 'stoneGold');
    expect(incomeFlags.sort()).toEqual(['foragerFood', 'foragerWood', 'lumberFood', 'stoneGold', 'varangianGold'].sort());
  });
});
