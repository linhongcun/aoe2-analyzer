/** 生成效果（scripts/effects_build.py → src/data/effects.json）的已知值断言；来源：HSZemi/aoe2dat（DE 147949）EffectCommands + 当前补丁文本 */
import { describe, expect, it } from 'vitest';
import { DAT } from '../../src/domain/datEffects';
import { BONUS_SRC, TECH_SRC, bonusCoverage } from '../../src/domain/effects';
import { simulate } from '../../src/domain/simulator';
import { ctx, unit } from './helpers';

const none = new Set<number>();
const team = new Set<number>();
const fx = (en: string) => DAT.techs[en]!.rules.flatMap((r) => r.fx);

describe('generated .dat effects', () => {
  it('Blacksmith techs: Forging +1, Blast Furnace +2 attack (techs 67/75)', () => {
    expect(fx('Forging')).toContainEqual({ s: 'atk', v: 1 });
    expect(fx('Blast Furnace')).toContainEqual({ s: 'atk', v: 2 });
  });
  it('Bengalis monks +3/+3 armor (tech 870)', () => {
    const m = unit('Monk');
    const s = simulate(ctx, m, 'Bengalis', 1, none, team);
    expect([s.ma - m.ma, s.pa - m.pa]).toEqual([3, 3]);
    expect(BONUS_SRC.Bengalis!['3']).toBe('dat');
  });
  it('Britons foot archer range +1/+2 in Castle/Imperial (techs 382/403)', () => {
    const a = unit('Arbalester');
    expect(simulate(ctx, a, 'Britons', 3, none, team).rng).toBe(a.rng + 1);
    expect(simulate(ctx, a, 'Britons', 4, none, team).rng).toBe(a.rng + 2);
  });
  it('Celts siege attack +25% faster (tech 386): reload / 1.25', () => {
    const u = unit('Mangonel');
    expect(simulate(ctx, u, 'Celts', 4, none, team).rof).toBeCloseTo(u.rof / 1.25, 2);
  });
  it('generic hidden tech 20: Scout Cavalry +2 attack in Feudal Age', () => {
    const u = unit('Scout Cavalry');
    expect(simulate(ctx, u, 'Aztecs', 2, none, team).atk - simulate(ctx, u, 'Aztecs', 1, none, team).atk).toBe(2);
  });
  it('stale .dat values fall back (current patch text disagrees)', () => {
    expect(DAT.civs.Byzantines!.fresh['4']!.ok).toBe(false); // .dat 20% vs text 25%
    expect(BONUS_SRC.Byzantines!['4']).toBe('manual');
    expect(DAT.civs.Saracens!.fresh.team!.ok).toBe(false); // .dat +3 vs text +2
    expect(BONUS_SRC.Saracens!.team).toBe('manual');
  });
  it('coverage beyond the 66 hand-encoded bonuses', () => {
    const c = bonusCoverage();
    expect(c.dat + c.manual).toBeGreaterThan(66);
    expect(Object.keys(TECH_SRC).length).toBeGreaterThan(32);
  });
});
