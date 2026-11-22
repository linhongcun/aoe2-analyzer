import { describe, expect, it } from 'vitest';
import { duel, fighterFrom, groupFight } from '../../src/domain/duel';
import { varangianGold } from '../../src/domain/generateResource';
import { presetUpTo, simTechs, simulate } from '../../src/domain/simulator';
import { ctx, units } from './helpers';

const side = (id: number, civ: string, age = 4) => {
  const u = units.find((x) => x.id === id)!;
  const S = simulate(ctx, u, civ, age, presetUpTo(simTechs(ctx, u, civ), age, civ), new Set());
  return { u, S, F: fighterFrom(u, S) };
};

describe('#383 瓦兰吉卫队产金', () => {
  it('精锐瓦兰吉对条顿冠军：黄金按 6 秒估算，胜负用时生命不变', () => {
    const a = side(2704, 'Varangians');
    const b = side(567, 'Teutons');
    const r = duel(a.F, b.F);
    expect(r.winner).toBe('b');
    expect(r.duration).toBe(6);
    expect(r.remaining).toBe(10);
    expect(b.F.hp).toBe(70);
    const g = varangianGold(2704, 'Varangians', r.duration);
    expect(g).toMatchObject({ resOut: 3, resMul: 297, value: 0.015909, base: 50, autoMul: 1.3333 });
    expect(g!.resource).toBeCloseTo(50 * 1.3333);
    expect(g!.gold).toBeCloseTo(6 * 0.015909 * 50 * 1.3333);
    expect(Math.round(g!.gold * 10) / 10).toBe(6.4);
  });

  it('非瓦兰吉人用资源 297 的默认值，不乘 ×1.33', () => {
    const seconds = 6;
    const vg = varangianGold(2704, 'Varangians', seconds)!;
    for (const civ of ['Byzantines', 'Danes', 'Saxons', 'Vikings', 'Teutons']) {
      const g = varangianGold(2704, civ, seconds)!;
      expect(g.autoMul).toBe(1);
      expect(g.resource).toBe(g.base);
      expect(g.base).toBe(50);
      expect(g.gold).toBeCloseTo(seconds * g.value * 50);
      expect(g.gold).toBeLessThan(vg.gold);
    }
    expect(Math.round(varangianGold(2704, 'Byzantines', seconds)!.gold * 10) / 10).toBe(4.8);
  });

  it('普通瓦兰吉卫队用自己的 work_value，怯薛不在本场产金里', () => {
    const regular = varangianGold(2703, 'Varangians', 10)!;
    expect(regular.value).toBe(0.013637);
    expect(regular.gold).toBeCloseTo(10 * 0.013637 * 50 * 1.3333);
    expect(varangianGold(1228, 'Tatars', 10)).toBeNull();
    expect(varangianGold(567, 'Varangians', 10)).toBeNull();
    expect(varangianGold(2704, 'Varangians', Number.NaN)).toBeNull();
  });

  it('群战使用可接敌单位的累计时间计算默认产金', () => {
    const a = side(2704, 'Byzantines');
    const b = side(567, 'Teutons');
    const g = groupFight(a.F, 2, b.F, 1);
    if (g.status === 'error') throw Error(g.reason);
    const before = { winner: g.winner, duration: g.duration, hpLeft: g.hpLeft, aAlive: g.aAlive, bAlive: g.bAlive };
    const seconds = g.contact.a[0]!.meleeUnitSeconds;
    expect(seconds).toBeGreaterThan(0);
    expect(varangianGold(2704, 'Byzantines', seconds)!.autoMul).toBe(1);
    expect(g).toMatchObject(before);
  });

  it('固定数据的 25 对 25 群战只计五个可接敌的瓦兰吉卫队，直到模拟时限', () => {
    const u = units.find((entry) => entry.id === 2704)!;
    const fighter = fighterFrom(u, simulate(ctx, u, 'Varangians', 4, new Set(), new Set()));
    const result = groupFight(fighter, 25, fighter, 25, 1);
    if (result.status === 'error') throw new Error(result.reason);
    expect(result).toMatchObject({ status: 'timeout', aAlive: 25, bAlive: 25 });
    expect(result.contact.meleeAt).not.toBeNull();
    const expected = 5 * (1 - result.contact.meleeAt!);
    for (const row of [result.contact.a[0]!, result.contact.b[0]!]) {
      expect(row.meleeUnitSeconds).toBeCloseTo(expected, 9);
      expect(varangianGold(2704, 'Varangians', row.meleeUnitSeconds)!.gold).toBeCloseTo(expected * 0.015909 * 50 * 1.3333);
    }
  });
});
