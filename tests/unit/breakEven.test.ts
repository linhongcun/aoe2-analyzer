/**
 * #25 盈亏平衡点：结果必须与逐档跑 groupFight（「N vs M」同一引擎）一致。
 * 场景来自 #25 评论（Reid）：拜占庭长戟兵 vs 法兰克游侠 × 10；城堡时代法兰克骑士 vs 柏柏尔骆驼 × 10。
 */
import { describe, expect, it } from 'vitest';
import { fighterFrom, groupFight, type Fighter } from '../../src/domain/duel';
import { breakEven, BREAK_EVEN_CAP, BREAK_EVEN_DEFAULT_B } from '../../src/domain/breakEven';
import { allNumeric, presetUpTo, simTechs, simulate } from '../../src/domain/simulator';
import { ctx, unit } from './helpers';

const F = (en: string, civ: string, age: number) => {
  const u = unit(en);
  const av = simTechs(ctx, u, civ);
  return fighterFrom(u, simulate(ctx, u, civ, age, age === 4 ? allNumeric(av) : presetUpTo(av, age), new Set()));
};
const halb = F('Halberdier', 'Byzantines', 4),
  pala = F('Paladin', 'Franks', 4),
  knight = F('Knight', 'Franks', 3),
  camel = F('Camel Rider', 'Berbers', 3);

/** 逐档参照：独立地用 groupFight 求「末尾全胜后缀」起点 */
function stepwise(a: Fighter, b: Fighter, nb: number, cap: number) {
  const w = Array.from({ length: cap }, (_, i) => groupFight(a, i + 1, b, nb).winner === 'a');
  if (!w[cap - 1]) return null;
  let n = cap;
  while (n > 1 && w[n - 2]) n--;
  return n;
}

describe('breakEven 口径', () => {
  it('默认 B = 10，上限 200', () => {
    expect(BREAK_EVEN_DEFAULT_B).toBe(10);
    expect(BREAK_EVEN_CAP).toBe(200);
  });
  it('场景 1：16 个拜占庭长戟兵才能打赢 10 个法兰克游侠（满科技）', () => {
    const r = breakEven(halb, pala, 10);
    expect(r.n).toBe(16);
    expect(r.rows.map((x) => [x.n, x.win])).toEqual([
      [15, false],
      [16, true],
      [17, true],
    ]);
  });
  it('场景 1 · 1v1：2 个长戟兵才能打赢 1 个游侠，N−1 档负', () => {
    const r = breakEven(halb, pala, 1);
    expect(r.n).toBe(2);
    expect(r.rows[0]!.r.winner).toBe('b');
  });
  it('场景 2：城堡时代 11 个法兰克骑士才能打赢 10 个柏柏尔骆驼', () => {
    expect(breakEven(knight, camel, 10).n).toBe(11);
  });
  it('三档结果与直接调用 groupFight 完全相同', () => {
    for (const [a, b] of [
      [halb, pala],
      [knight, camel],
    ] as const)
      for (const row of breakEven(a, b, 10).rows) expect(row.r).toEqual(groupFight(a, row.n, b, 10));
  });
  it('与逐档模拟一致（多组 B 数量）', () => {
    for (const [a, b] of [
      [halb, pala],
      [knight, camel],
      [camel, knight],
    ] as const)
      for (const nb of [1, 3, 5, 10]) expect(breakEven(a, b, nb, 60).n).toBe(stepwise(a, b, nb, 60));
  });
  it('N 及以上直到上限每一档都严格获胜；N=1 时不给 N−1 档', () => {
    const r = breakEven(pala, halb, 1);
    for (let n = r.n!; n <= 40; n++) expect(groupFight(pala, n, halb, 1).winner).toBe('a');
    if (r.n === 1) expect(r.rows[0]!.n).toBe(1);
  });
  it('上限内无法取胜：返回 null、只给上限一档，扫描有界', () => {
    const r = breakEven(halb, pala, 10, 8);
    expect(r.n).toBeNull();
    expect(r.capReached).toBe(true);
    expect(r.rows.map((x) => x.n)).toEqual([8]);
    expect(r.rows[0]!.r).toEqual(groupFight(halb, 8, pala, 10));
  });
  it('平局不算获胜', () => {
    const r = breakEven(halb, halb, 3, 10);
    expect(groupFight(halb, 3, halb, 3).winner).not.toBe('a');
    expect(r.n).toBe(4);
  });
});
