import { describe, expect, it } from 'vitest';
import { allNumeric, parseUnitPath, simTechs, simulate, totalCost, unitPath } from '../../src/domain/simulator';
import { ctx, unit } from './helpers';

const full = (en: string, civ: string, team = new Set<number>()) => {
  const u = unit(en);
  return simulate(ctx, u, civ, 4, allNumeric(simTechs(ctx, u, civ)), team);
};

describe('simulator', () => {
  it('Franks Paladin full tech = 192 HP / 18 atk / 5-7 armor', () => {
    const s = full('Paladin', 'Franks');
    expect(s.hp).toBe(192);
    expect(s.atk).toBe(18);
    expect(s.ma).toBe(5);
    expect(s.pa).toBe(7);
  });
  it('Britons Arbalester full tech: range 5+3+2=10, atk 6+3+1=10, armor 3/4', () => {
    const s = full('Arbalester', 'Britons');
    expect(s.rng).toBe(10);
    expect(s.atk).toBe(10);
    expect(s.ma).toBe(3);
    expect(s.pa).toBe(4);
    expect(s.acc).toBe(90); // Britons 无拇指环
  });
  it('no techs selected = base stats (+ age civ bonus)', () => {
    const u = unit('Paladin');
    const s = simulate(ctx, u, 'Britons', 4, new Set(), new Set());
    expect([s.hp, s.atk, s.ma, s.pa]).toEqual([u.hp, u.atk, u.ma, u.pa]);
  });
  it('team bonus toggle (Franks: knight line LOS +2)', () => {
    const u = unit('Paladin');
    expect(simulate(ctx, u, 'Britons', 4, new Set(), new Set([0])).los).toBe(u.los + 2);
  });
  it('cost totals', () => {
    const u = unit('Paladin'),
      av = simTechs(ctx, u, 'Franks');
    const { cost, time } = totalCost(av, allNumeric(av));
    expect(cost.Food).toBeGreaterThan(0);
    expect(time).toBeGreaterThan(0);
  });
  it('URL round-trip', () => {
    const p = unitPath(569, 'Franks', 4, [1, 2], [0]);
    expect(parseUnitPath(p)).toEqual({ id: 569, civ: 'Franks', age: 4, ids: [1, 2], team: [0] });
    expect(parseUnitPath('unit/569')).toEqual({ id: 569, civ: undefined, age: undefined, ids: [], team: [] });
  });
});
