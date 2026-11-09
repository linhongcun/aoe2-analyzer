import { describe, expect, it } from 'vitest';
import { SPECIAL_INCOME, SPECIAL_INCOME_EXCEPTIONS, specialIncomeErrors } from '../../src/domain/specialIncome';
import { RESOURCE_APPLICATIONS } from '../../src/domain/buildSimEffects';
import { RESOURCE_HANDLERS } from '../../src/domain/buildSimCoverage';
import { APPLICATION_RULES } from '../../src/domain/buildSimMechanisms';

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

  it('收入渠道覆盖 4 个 flag 加波兰采石', () => {
    const incomeFlags = SPECIAL_INCOME.filter((rule) => rule.income).map((rule) => rule.flag ?? 'stoneGold');
    expect(incomeFlags.sort()).toEqual(['foragerFood', 'foragerWood', 'lumberFood', 'stoneGold', 'varangianGold'].sort());
  });

  it('三张派生表覆盖主表条目，例外集中声明', () => {
    for (const rule of SPECIAL_INCOME) {
      if (rule.res !== undefined && rule.op)
        expect(
          RESOURCE_HANDLERS.some((row) => row.res === rule.res && row.op === rule.op),
          `${rule.flag} handler`,
        ).toBe(true);
      if (rule.flag && rule.allows)
        expect(
          APPLICATION_RULES.some((row) => row.flag === rule.flag && row.allows === rule.allows),
          `${rule.flag} rule`,
        ).toBe(true);
      if (rule.flag && rule.res !== undefined && rule.op && rule.apply)
        expect(
          RESOURCE_APPLICATIONS.some((row) => row.flag === rule.flag && row.res === rule.res && row.op === rule.op && row.apply === rule.apply),
          `${rule.flag} application`,
        ).toBe(true);
    }
    for (const exception of [...SPECIAL_INCOME_EXCEPTIONS.classificationOnly, ...SPECIAL_INCOME_EXCEPTIONS.applicationOnly])
      expect(exception.reason.length, JSON.stringify(exception)).toBeGreaterThan(0);
    expect(RESOURCE_HANDLERS.some((row) => row.res === 269 && row.op === 'set')).toBe(true);
    expect(RESOURCE_HANDLERS.some((row) => row.res === 268 && row.op === 'mul')).toBe(true);
    expect(APPLICATION_RULES.some((row) => row.flag === 'buildingWood')).toBe(true);
    expect(APPLICATION_RULES.some((row) => row.flag === 'mayanWall')).toBe(true);
    expect(RESOURCE_APPLICATIONS).toHaveLength(SPECIAL_INCOME.filter((rule) => rule.flag && rule.res !== undefined && rule.op && rule.apply).length);
    expect(RESOURCE_HANDLERS).toHaveLength(
      SPECIAL_INCOME.filter((rule) => rule.res !== undefined && rule.op).length + SPECIAL_INCOME_EXCEPTIONS.classificationOnly.length,
    );
    expect(APPLICATION_RULES).toHaveLength(SPECIAL_INCOME.filter((rule) => rule.flag && rule.allows).length + SPECIAL_INCOME_EXCEPTIONS.applicationOnly.length);
    expect(APPLICATION_RULES.find((row) => row.flag === 'buildingWood')).toMatchObject({ civ: 'Malians' });
    expect(APPLICATION_RULES.find((row) => row.flag === 'mayanWall')).toMatchObject({ civ: 'Mayans' });
  });

  it('主表不变量能拒绝缺字段的假条目', () => {
    expect(specialIncomeErrors()).toEqual([]);
    expect(specialIncomeErrors([...SPECIAL_INCOME, { flag: 'foragerFood', res: 999, op: 'add' }])).not.toEqual([]);
    expect(specialIncomeErrors([...SPECIAL_INCOME, { flag: 'foragerFood', res: 999, op: 'add', allows: () => true }])).not.toEqual([]);
  });
});
