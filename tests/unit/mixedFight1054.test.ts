import { describe, expect, it } from 'vitest';
import { CORE } from '../../src/data/core';
import { groupFight, type Fighter } from '../../src/domain/duel';
import { mixedFight, type MixedFighter, type MixedFightResult } from '../../src/domain/mixedFight';
import { makeSimContext } from '../../src/domain/simulator';
import { resolve, isUnavail } from '../../src/features/duel/logic/duelSide';
import { trees } from './helpers';

const fighter = (overrides: Partial<Fighter> = {}): Fighter => ({
  name: '手算战士',
  hp: 10,
  attack: { 近战: 5 },
  armor: { 近战: 0, 穿刺: 0 },
  rof: 1,
  acc: 1,
  ranged: false,
  rng: 0,
  cost: {},
  ...overrides,
});
const row = (uid: number, count = 1, changes: Partial<Fighter> = {}): MixedFighter => ({ uid, count, fighter: fighter(changes) });
const valid = (value: MixedFightResult) => {
  expect(value.status).not.toBe('error');
  if (value.status === 'error') throw Error(value.reason);
  return value;
};
const harmless: Partial<Fighter> = { ranged: true, acc: 0 };

describe('#1054 受击队列集火 v1', () => {
  it('首击为0；双方先快照，因此被击杀的单位仍完成本次攻击', () => {
    const r = valid(mixedFight([row(1, 1, { hp: 5 })], [row(2, 1, { hp: 5 })]));
    expect(r.status).toBe('draw');
    expect(r.duration).toBe(0);
    expect(r.a.rows[0]).toEqual({ uid: 1, initial: 1, lost: 1, alive: 0, hp: 0 });
    expect(r.b.total).toEqual(r.a.total);
  });
  it('每击重新定位当前目标并按其护甲取伤害；不使用首行伤害打后续行', () => {
    const r = valid(mixedFight([row(1, 2)], [row(2, 1, { hp: 5 }), row(3, 1, { armor: { 近战: 4 } })], { maxTime: 0 }));
    expect(r.b.rows.map((r) => [r.alive, r.hp])).toEqual([
      [0, 0],
      [1, 9],
    ]);
    expect(r.a.rows[0]).toMatchObject({ alive: 1, hp: 10 });
  });
  it('单击超额伤害丢弃，不转移给下一个个体', () => {
    const r = valid(mixedFight([row(1, 1, { hp: 100, attack: { 近战: 100 } })], [row(2, 2)], { maxTime: 0 }));
    expect(r.status).toBe('timeout');
    expect(r.b.total).toEqual({ initial: 2, lost: 1, alive: 1, hp: 10 });
  });
  it('已在前一事件死亡的行不再出手；后排从0就参战而不等接敌', () => {
    const r = valid(
      mixedFight([row(1, 1, { hp: 100 })], [row(2, 1, { hp: 5, attack: { 近战: 1 }, rof: 2 }), row(3, 1, { hp: 100, ...harmless })], { maxTime: 2 }),
    );
    expect(r.a.total.hp).toBe(99);
    expect(r.b.rows[1]?.hp).toBe(90);
  });
  it('同方同刻行序稳定，调序既改变攻击序也改变受击序', () => {
    const a = [row(1, 1, { attack: { 近战: 10 } }), row(2, 1, { attack: { 穿刺: 10 } })];
    const b = [row(3, 1, harmless), row(4, 1, { ...harmless, armor: { 近战: 0, 穿刺: 8 } })];
    const first = valid(mixedFight(a, b, { maxTime: 0 }));
    expect(first.status).toBe('timeout');
    expect(first.b.total.hp).toBe(8);
    const second = valid(mixedFight([...a].reverse(), b, { maxTime: 0 }));
    expect(second).toMatchObject({ status: 'win', winner: 'a' });
    expect(valid(mixedFight(a, [...b].reverse(), { maxTime: 0 })).b.rows[0]?.alive).toBe(0);
    expect(mixedFight(a, b)).toEqual(mixedFight(a, b));
  });
  it('各行有独立攻击间隔，不将全军简化为平均攻击', () => {
    const r = valid(
      mixedFight(
        [row(1, 1, { hp: 100, attack: { 近战: 1 }, rof: 2 }), row(2, 1, { hp: 100, attack: { 近战: 2 }, rof: 3 })],
        [row(3, 1, { hp: 100, ...harmless })],
        { maxTime: 6 },
      ),
    );
    expect(r.b.total.hp).toBe(90);
  });
  it('600边界的攻击结算，首个界外事件不结算', () => {
    const b = [row(2, 1, { hp: 2, ...harmless })];
    expect(mixedFight([row(1, 1, { attack: { 近战: 1 }, rof: 600 })], b)).toMatchObject({ status: 'win', winner: 'a', duration: 600 });
    const out = valid(mixedFight([row(1, 1, { attack: { 近战: 1 }, rof: 600.000001 })], b));
    expect(out).toMatchObject({ status: 'timeout', duration: 600 });
    expect(out.b.total.hp).toBe(1);
  });
  it('同刻容差不得把600之外的攻击拉入边界事件', () => {
    const r = valid(mixedFight([row(1, 1, { hp: 2, attack: { 近战: 1 }, rof: 600 + 5e-10 })], [row(2, 1, { hp: 2, attack: { 近战: 1 }, rof: 600 })]));
    expect(r).toMatchObject({ status: 'win', winner: 'b', duration: 600 });
    expect(r.b.total.hp).toBe(1);
  });
  it('超时双方存活为无胜者，不按剩余数判胜', () => {
    const r = valid(mixedFight([row(1, 2, { hp: 100, rof: 1000 })], [row(2, 1, { hp: 100, rof: 1000 })]));
    expect(r.status).toBe('timeout');
    expect(r.duration).toBe(600);
    expect('winner' in r).toBe(false);
    expect(r.b.total.hp).toBe(90);
  });
  it('A/B交换保持镜像统计；输入不被修改，逐行及合计账目可对上', () => {
    const a = [row(1, 3), row(2, 2, { hp: 20, rof: 2 })],
      b = [row(3, 4, { rof: 1.5 })];
    const before = structuredClone({ a, b }),
      r = valid(mixedFight(a, b)),
      swapped = valid(mixedFight(b, a));
    expect(r.a).toEqual(swapped.b);
    expect(r.b).toEqual(swapped.a);
    expect({ a, b }).toEqual(before);
    for (const army of [r.a, r.b]) {
      for (const row of [...army.rows, army.total]) {
        expect(row.initial).toBe(row.lost + row.alive);
        expect(row.hp).toBeGreaterThanOrEqual(0);
      }
      expect(army.total.hp).toBe(army.rows.reduce((s, row) => s + row.hp, 0));
    }
  });
  it('200 vs 200及三行上界有界完成，命中率为0不会捏造最低命中伤害', () => {
    const a = [row(1, 100, harmless), row(2, 99, harmless), row(3, 1, harmless)];
    const r = valid(mixedFight(a, [row(4, 200, harmless)]));
    expect(r.status).toBe('timeout');
    expect(r.a.total.hp).toBe(2000);
    expect(r.b.total.hp).toBe(2000);
  });
  it('资源护栏返回error，不泄漏半成品胜负/军队统计', () => {
    for (const options of [{ maxEvents: 1 }, { maxAttacks: 1 }]) {
      const r = mixedFight([row(1, 2, harmless)], [row(2, 2, harmless)], options);
      expect(r.status).toBe('error');
      expect(Object.keys(r).sort()).toEqual(['reason', 'status']);
    }
  });
  it('非法数量、重复ID、超过3行、无持续攻击或非有限属性均fail closed', () => {
    for (const a of [
      [],
      [row(1), row(1)],
      [row(1), row(2), row(3), row(4)],
      [row(1, 201)],
      [row(1, 0)],
      [row(1, 1.5)],
      [row(1, 1, { hp: Infinity })],
      [row(1, 1, { rof: 0 })],
      [row(1, 1, { rof: NaN })],
      [row(1, 1, { attack: {} })],
      [row(1, 1, { armor: { 近战: NaN } })],
      [row(1, 1, { acc: 2 })],
      [row(1, 200, { hp: 1e308 })],
    ]) {
      expect(mixedFight(a, [row(5)]).status).toBe('error');
    }
  });
});

describe('#1054 复用真实生产属性，与旧单行groupFight正常终止对账', () => {
  const ctx = makeSimContext(CORE.techs, trees);
  const get = (uid: number, civ: string, techs: number[] | 'f' = []) => {
    const r = resolve(ctx, CORE.unitById, { uid, civ, age: 4, ageSet: true, techs, team: [] }, uid);
    if (isUnavail(r)) throw Error('fixture unavailable');
    return r.F;
  };
  it('保持日本2长戟兵 vs 1冠军剑士同相位攻击，精确剩余20生命', () => {
    const a = get(359, 'Japanese'),
      b = get(567, 'Japanese');
    const r = valid(mixedFight([{ uid: 359, count: 2, fighter: a }], [{ uid: 567, count: 1, fighter: b }]));
    expect(r).toMatchObject({ status: 'win', winner: 'b' });
    expect(r.b.total.hp).toBe(20);
  });
  it('多数量、交换双方、类别负攻击、远程命中期望和文明科技复用原公式', () => {
    for (const [ua, ca, ub, cb] of [
      [359, 'Japanese', 567, 'Japanese'],
      [569, 'Franks', 359, 'Japanese'],
      [4, 'Britons', 567, 'Japanese'],
    ] as const) {
      const a = get(ua, ca, 'f'),
        b = get(ub, cb, 'f');
      for (const na of [1, 2, 5, 12])
        for (const nb of [1, 2, 5, 12]) {
          const old = groupFight(a, na, b, nb);
          expect(old.duration).toBeLessThan(600);
          const r = valid(mixedFight([{ uid: ua, count: na, fighter: a }], [{ uid: ub, count: nb, fighter: b }]));
          expect(r.status === 'win' ? r.winner : r.status).toBe(old.winner);
          expect(r.a.total.alive).toBe(old.aAlive);
          expect(r.b.total.alive).toBe(old.bAlive);
          expect(r.status === 'win' ? r[r.winner].total.hp : 0).toBeCloseTo(old.hpLeft, 10);
          expect(r.duration).toBeCloseTo(old.duration, 8);
        }
    }
  });
});
