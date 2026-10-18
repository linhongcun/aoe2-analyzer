import { describe, expect, it } from 'vitest';
import { damageByClass, damagePerHit, fighterFrom } from '../../src/domain/duel';
import { presetUpTo, simTechs, simulate } from '../../src/domain/simulator';
import { ctx, units } from './helpers';

const fighter = (id: number, civ: string) => {
  const u = units.find((x) => x.id === id)!;
  return fighterFrom(u, simulate(ctx, u, civ, 4, presetUpTo(simTechs(ctx, u, civ), 4), new Set()));
};

describe('#168 生效克制与伤害同源', () => {
  it.each(['Vikings', 'Varangians'])('日本冠军对 %s 瓦兰吉卫队的冲击步兵加成为 9', (civ) => {
    const a = fighter(567, 'Japanese'),
      b = fighter(2704, civ);
    const rows = damageByClass(a, b);
    expect(rows.find((x) => x.category === '冲击步兵')?.damage).toBe(9);
    expect(damagePerHit(a, b)).toBe(
      Math.max(
        1,
        rows.reduce((sum, x) => sum + x.damage, 0),
      ),
    );
  });
  it('不计防守方不存在的类别，扣除该类护甲后为零的加成不会生效', () => {
    expect(damageByClass({ attack: { 近战: 5, 骑兵: 10, 步兵: 3 } }, { armor: { 近战: 2, 步兵: 4 } })).toEqual([
      { category: '近战', attack: 5, armor: 2, damage: 3 },
      { category: '步兵', attack: 3, armor: 4, damage: 0 },
    ]);
  });
  it('保留负攻击的扣减及总伤害最低 1 点的规则', () => {
    const a = { attack: { 近战: 2, 村民: -3 } },
      b = { armor: { 近战: 0, 村民: 0 } };
    expect(damageByClass(a, b).map((x) => x.damage)).toEqual([2, -3]);
    expect(damagePerHit(a, b)).toBe(1);
  });
});
