/**
 * #86 缺口用例：非单调 / 平局 / 上限档平局 / 默认上限 200 / 民兵平局。
 * 真实数据里找不到非单调样本，所以这几条用注入的 FightFn 构造胜负序列（W=A 胜，L=B 胜，D=平局）。
 */
import { describe, expect, it } from 'vitest';
import { fighterFrom, type Fighter, type GroupResult } from '../../src/domain/duel';
import { breakEven, type FightFn } from '../../src/domain/breakEven';
import { allNumeric, presetUpTo, simTechs, simulate } from '../../src/domain/simulator';
import { ctx, unit } from './helpers';

const F = (en: string, civ: string, age: number): Fighter => {
  const u = unit(en);
  const av = simTechs(ctx, u, civ);
  return fighterFrom(u, simulate(ctx, u, civ, age, age === 4 ? allNumeric(av) : presetUpTo(av, age), new Set()));
};
const halb = F('Halberdier', 'Byzantines', 4),
  pala = F('Paladin', 'Franks', 4),
  militia = F('Militia', 'Britons', 3);

const seq =
  (s: string): FightFn =>
  (_a, na): GroupResult => {
    const c = s[na - 1];
    const winner = c === 'W' ? 'a' : c === 'D' ? 'draw' : 'b';
    return { winner, aAlive: 0, bAlive: 0, hpLeft: 0, duration: na, timeline: [] };
  };

describe('breakEven 缺口：非单调 / 平局 / 上限', () => {
  it('非单调：3、5 能赢但 6 不赢，N 取末尾全胜后缀起点 7，不是第一次赢的 3', () => {
    const r = breakEven(halb, pala, 10, 20, seq('LLWLWL' + 'W'.repeat(14)));
    expect(r.n).toBe(7);
    expect(r.rows.map((x) => [x.n, x.win])).toEqual([
      [6, false],
      [7, true],
      [8, true],
    ]);
    expect(r.isolatedWins).toEqual([3, 5]);
  });

  it('N−1 为平局也算不赢', () => {
    const r = breakEven(halb, pala, 10, 10, seq('LLLD' + 'W'.repeat(6)));
    expect(r.n).toBe(5);
    expect(r.rows[0]!.r.winner).toBe('draw');
    expect(r.rows[0]!.win).toBe(false);
  });

  it('上限档平局：即使中间赢过，也判为上限内打不赢', () => {
    const r = breakEven(halb, pala, 10, 10, seq('LLWWWWWWWD'));
    expect(r.n).toBeNull();
    expect(r.capReached).toBe(true);
    expect(r.rows.map((x) => [x.n, x.r.winner])).toEqual([[10, 'draw']]);
    expect(r.isolatedWins).toEqual([3, 4, 5, 6, 7, 8, 9]);
  });

  it('默认上限为 200：第 200 档才赢，N = 200，行只含 199 与 200，不含 201', () => {
    const r = breakEven(halb, pala, 10, undefined, seq('L'.repeat(199) + 'W'));
    expect(r.cap).toBe(200);
    expect(r.n).toBe(200);
    expect(r.rows.map((x) => x.n)).toEqual([199, 200]);
  });

  it('默认上限为 200：第 200 档仍不赢，判为上限内打不赢', () => {
    const r = breakEven(halb, pala, 10, undefined, seq('L'.repeat(200)));
    expect(r.cap).toBe(200);
    expect(r.n).toBeNull();
    expect(r.capReached).toBe(true);
    expect(r.rows.map((x) => x.n)).toEqual([200]);
  });
});

describe('breakEven 缺口：民兵平局（真实 groupFight）', () => {
  it('民兵 vs 民兵 × 10：第 10 档平局算不赢，N = 11', () => {
    const r = breakEven(militia, militia, 10);
    expect(r.n).toBe(11);
    expect(r.rows[0]!.n).toBe(10);
    expect(r.rows[0]!.r.winner).toBe('draw');
    expect(r.rows[0]!.win).toBe(false);
  });
});
