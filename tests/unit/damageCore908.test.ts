import { describe, expect, it } from 'vitest';
import { damageRows, hitCount, totalDamage } from '../../src/domain/damageCore';

describe('共享伤害核（issue 908）', () => {
  it('单位 PK 保留负攻击扣减，建筑伤害从 0 起算', () => {
    const attacks = { 近战: 10, 对村民: -3 };
    const armors = { 近战: 2, 对村民: 1 };
    const pk = damageRows(attacks, armors, { negativeAttack: true });
    expect(pk.rows.map((row) => [row.category, row.damage])).toEqual([
      ['近战', 8],
      ['对村民', -3],
    ]);
    const building = damageRows(attacks, armors, { negativeAttack: false });
    expect(building.rows.map((row) => [row.category, row.damage])).toEqual([
      ['近战', 8],
      ['对村民', 0],
    ]);
  });

  it('缺失护甲按 skip/error 处理，非有限攻击进入 problems', () => {
    const attacks = { 近战: 5, 船只: 4, 石质防御: NaN };
    const skip = damageRows(attacks, { 近战: 1 }, { negativeAttack: false });
    expect(skip.rows.map((row) => row.category)).toEqual(['近战']);
    expect(skip.problems).toEqual(['石质防御']);
    const error = damageRows({ 近战: 5, 船只: 4 }, { 近战: 1 }, { negativeAttack: false, missingArmor: 'error' });
    expect(error.problems).toEqual(['船只']);
    const ordered = damageRows({ 船只: 4, 近战: 5, 石质防御: NaN }, { 近战: 1 }, { negativeAttack: false, missingArmor: 'error' });
    expect(ordered.problems).toEqual(['船只', '石质防御']);
  });

  it('PK 允许非有限值参与，保持旧行为', () => {
    const rows = damageRows({ 近战: NaN }, { 近战: 1 }, { allowInvalid: true }).rows;
    expect(rows).toHaveLength(1);
    expect(Number.isNaN(rows[0]!.damage)).toBe(true);
    expect(totalDamage(rows)).toBeNaN();
  });

  it('单次伤害至少 1，负总和也钳制', () => {
    expect(totalDamage([{ category: '对村民', attack: -3, armor: 1, damage: -3 }])).toBe(1);
    expect(totalDamage([{ category: '近战', attack: 5, armor: 1, damage: 4 }])).toBe(4);
  });

  it('击数按生命值与每次伤害计算，攻城可先取整生命值', () => {
    expect(hitCount(100, 30)).toBe(4);
    expect(hitCount(100.4, 30, { roundHp: true, epsilon: 0 })).toBe(4);
    expect(hitCount(100.6, 30, { roundHp: true, epsilon: 0 })).toBe(4);
    expect(hitCount(100, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});
