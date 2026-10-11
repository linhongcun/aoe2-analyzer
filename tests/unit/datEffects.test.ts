/** 生成效果（scripts/effects_build.py → src/data/effects.json）的已知值断言；来源：HSZemi/aoe2dat（DE 147949）EffectCommands + 当前补丁文本 */
import { describe, expect, it } from 'vitest';
import { DAT } from '../../src/domain/datEffects';
import { BONUS_SRC, TEAM_BONUSES, TECH_SRC, bonusCoverage } from '../../src/domain/effects';
import { simulate } from '../../src/domain/simulator';
import { ctx, unit } from './helpers';

const none = new Set<number>();
const team = new Set<number>();
const fx = (en: string) => DAT.techs[en]!.rules.flatMap((r) => r.fx);

describe('generated .dat effects', () => {
  it('generated from the pinned 185872 .dat (sha256 + patch recorded by scripts/dat_source.py)', () => {
    const s = DAT.meta.sources.find((x) => x.id === 'DAT') as { sha256?: string; patch: string; commit: string } | undefined;
    expect(s?.sha256).toBe('4aa2f0a719e88e5f1502517eddb27c669aeb40c2fe9d8c4f3eec7751c01e7baa');
    expect(s?.commit).toBe('0c38027');
    expect(s?.patch).toContain('185872');
    expect(DAT.meta.sources.map((x) => x.repo)).not.toContain('HSZemi/aoe2dat');
  });
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
  it('current-patch values (185872): Byzantine Dromon +25% attack speed, Saracen team +3 vs buildings', () => {
    const d = unit('Dromon');
    expect(simulate(ctx, d, 'Byzantines', 4, none, team).rof).toBeCloseTo(d.rof / 1.25, 2);
    expect(BONUS_SRC.Byzantines!['4']).toBe('dat');
    expect(DAT.civs.Saracens!.team.rules[0]!.fx).toContainEqual({ s: 'bonus', v: 3, vs: '标准建筑' });
  });
  it('newest civs from the same .dat: Danes team siege LOS +2, Mapuche team spear/skirm LOS +2', () => {
    const i = TEAM_BONUSES.findIndex((x) => x[0] === 'Danes');
    const m = unit('Mangonel');
    expect(simulate(ctx, m, 'Britons', 4, none, new Set([i])).los).toBe(simulate(ctx, m, 'Britons', 4, none, team).los + 2);
    const j = TEAM_BONUSES.findIndex((x) => x[0] === 'Mapuche');
    const p = unit('Pikeman');
    expect(simulate(ctx, p, 'Britons', 4, none, new Set([j])).los).toBe(simulate(ctx, p, 'Britons', 4, none, team).los + 2);
    expect(BONUS_SRC.Danes!.team).toBe('dat');
  });
  it('no fallbacks needed: every civ and unit is in the .dat', () => {
    expect(DAT.meta.newIds).toEqual([]);
    expect(Object.values(BONUS_SRC).flatMap((m) => Object.values(m))).not.toContain('manual');
  });
  it('coverage beyond the 66 hand-encoded bonuses', () => {
    const c = bonusCoverage();
    expect(c.dat + c.manual).toBeGreaterThan(66);
    expect(Object.keys(TECH_SRC).length).toBeGreaterThan(32);
  });
});
