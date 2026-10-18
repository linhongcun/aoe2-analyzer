import { expect, it } from 'vitest';
import { ageComparison, unitAtAge } from '../../src/domain/ageComparison';
import { duel, fighterFrom } from '../../src/domain/duel';
import { presetUpTo, simTechs, simulate } from '../../src/domain/simulator';
import { ctx, units } from './helpers';

const byId = Object.fromEntries(units.map((u) => [u.id, u]));
it('同一升级线按时代取已解锁的前置版本', () => {
  expect(unitAtAge(byId, 567, 'Japanese', 1)?.en).toBe('Militia');
  expect(unitAtAge(byId, 567, 'Japanese', 2)?.en).toBe('Man-at-Arms');
  expect(unitAtAge(byId, 567, 'Japanese', 3)?.en).toBe('Long Swordsman');
  expect(unitAtAge(byId, 567, 'Japanese', 4)?.en).toBe('Champion');
  expect(unitAtAge(byId, 569, 'Franks', 2)).toBeNull();
});
it('各时代每一项战斗结果等于链接对应单位、文明和时代的独立满科技 PK', () => {
  const a = { uid: 567, civ: 'Japanese', team: [] },
    b = { uid: 569, civ: 'Franks', team: [] };
  for (const row of ageComparison(ctx, byId, a, b)) {
    if (!row.a || !row.b) {
      expect(row.result).toBeNull();
      continue;
    }
    const standalone = (u: (typeof units)[number], civ: string) =>
      fighterFrom(u, simulate(ctx, u, civ, row.age, presetUpTo(simTechs(ctx, u, civ), row.age), new Set()));
    expect(row.result).toEqual(duel(standalone(row.a.u, a.civ), standalone(row.b.u, b.civ)));
  }
});
it('不存在的单位或文明没有虚构结果', () => {
  expect(unitAtAge(byId, -1, 'Franks', 4)).toBeNull();
  expect(unitAtAge(byId, 569, 'Unknown', 4)).toBeNull();
});
