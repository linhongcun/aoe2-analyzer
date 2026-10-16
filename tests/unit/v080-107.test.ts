import { describe, expect, it } from 'vitest';
import { ctx, units } from './helpers';
import { discountedCost, priceAge } from '../../src/domain/costDiscount';
import { countForBudget, duel, fighterFrom, groupFight } from '../../src/domain/duel';
import { presetUpTo, simTechs, simulate } from '../../src/domain/simulator';
// 草案：#107 需要的纯函数（模块尚不存在，实现时由 Linus 落地；名字可改）
import { tradeLosses } from '../../src/domain/trade';

/** 与 Duel.tsx resolve() 同口径：满科技、按所选时代取折后价（#24/#129） */
const byId = Object.fromEntries(units.map((u) => [u.id, u]));
function side(uid: number, civ: string, age: number) {
  const u = byId[uid]!;
  const avail = simTechs(ctx, u, civ);
  const ok = new Set(avail.map((x) => x.t.id));
  const a = Math.max(u.age, age);
  const S = simulate(ctx, u, civ, a, presetUpTo(avail, a), new Set());
  const disc = discountedCost(u, civ, priceAge(u.age, age), { techIds: ok });
  return { disc, F: { ...fighterFrom(u, S), cost: disc.cost } };
}
function run(a: ReturnType<typeof side>, na: number, b: ReturnType<typeof side>, nb: number) {
  const g = groupFight(a.F, na, b.F, nb);
  return { g, t: tradeLosses({ na, nb, aAlive: g.aAlive, bAlive: g.bAlive, costA: a.disc.cost, costB: b.disc.cost }) };
}

describe('#107 数据前提（来自 units.json / effects.json / roundHalfPrice）', () => {
  it('法兰克游侠 60 食 75 金 = 135；日本长戟兵 35 食 25 木 = 60', () => {
    expect(side(569, 'Franks', 4).disc.cost).toEqual({ Food: 60, Gold: 75 });
    expect(side(359, 'Japanese', 4).disc.cost).toEqual({ Food: 35, Wood: 25 });
  });
  it('拜占庭长戟兵帝王时代 精确 26.25 食 18.75 木，取整后 26 食 19 木 = 45', () => {
    const d = side(359, 'Byzantines', 4).disc;
    expect(d.exact).toEqual({ Food: 26.25, Wood: 18.75 });
    expect(d.cost).toEqual({ Food: 26, Wood: 19 });
  });
  it('哥特冠军剑士 35 食 14 金 = 49', () => {
    expect(side(567, 'Goths', 4).disc.cost).toEqual({ Food: 35, Gold: 14 });
  });
});

describe('#107 损失 = 阵亡数 × 折后单价（逐资源）', () => {
  it('N vs M 10v10 法兰克游侠 vs 日本长戟兵：A 阵亡 3 损失 405，B 阵亡 10 损失 600，交换比 1.48', () => {
    const { g, t } = run(side(569, 'Franks', 4), 10, side(359, 'Japanese', 4), 10);
    expect([g.aAlive, g.bAlive]).toEqual([7, 0]);
    expect(t.a).toEqual({ dead: 3, res: { Food: 180, Gold: 225 }, total: 405 });
    expect(t.b).toEqual({ dead: 10, res: { Food: 350, Wood: 250 }, total: 600 });
    expect(t.ratio).toBeCloseTo(600 / 405, 9);
  });
  it('等资源 3000 拜占庭长戟兵 x66 vs 法兰克游侠 x22：A 损失 405（用取整后的 26/19，不是 26.25/18.75），B 损失 2970，交换比 7.33', () => {
    const A = side(359, 'Byzantines', 4),
      B = side(569, 'Franks', 4);
    const na = countForBudget(A.disc.cost, 3000),
      nb = countForBudget(B.disc.cost, 3000);
    expect([na, nb]).toEqual([66, 22]);
    const { g, t } = run(A, na, B, nb);
    expect([g.aAlive, g.bAlive]).toEqual([57, 0]);
    expect(t.a).toEqual({ dead: 9, res: { Food: 234, Wood: 171 }, total: 405 });
    expect(t.b).toEqual({ dead: 22, res: { Food: 1320, Gold: 1650 }, total: 2970 });
    expect(t.ratio).toBeCloseTo(2970 / 405, 9);
  });
  it('10v10 哥特冠军剑士 vs 日本长戟兵：A 损失 98，B 损失 600，交换比 6.12', () => {
    const { t } = run(side(567, 'Goths', 4), 10, side(359, 'Japanese', 4), 10);
    expect(t.a.total).toBe(98);
    expect(t.b.total).toBe(600);
    expect(t.ratio).toBeCloseTo(600 / 98, 9);
  });
  it('一方零损失：10v10 拜占庭精锐掷矛手 vs 法兰克游侠，B 损失 0，交换比为 null（不出 Infinity / NaN）', () => {
    const { t } = run(side(6, 'Byzantines', 4), 10, side(569, 'Franks', 4), 10);
    expect(t.a.total).toBe(450);
    expect(t.b.total).toBe(0);
    expect(t.ratio).toBeNull();
  });
  it('1v1 默认对阵：游侠剩 81 血不算损失，A 损失 0，B 损失 60，交换比为 null', () => {
    const A = side(569, 'Franks', 4),
      B = side(359, 'Japanese', 4);
    const d = duel(A.F, B.F);
    expect([d.winner, d.remaining]).toEqual(['a', 81]);
    const t = tradeLosses({ na: 1, nb: 1, aAlive: 1, bAlive: 0, costA: A.disc.cost, costB: B.disc.cost });
    expect([t.a.total, t.b.total, t.ratio]).toEqual([0, 60, null]);
  });
});
