import type { CivBonusEnt } from '../../domain/civBonus';
import { TECH_EFFECTS } from '../../domain/effects';
import { applyEffects, baseStats } from '../../domain/simulator';
import { civStatus } from '../../domain/civStatus';
import type { Effect, StatSet, Tech, Trees, Unit } from '../../domain/types';
const armor = (fx: Effect[]) => fx.length > 0 && fx.every((e) => e.s === 'ma' || e.s === 'pa');
const copy = (s: StatSet): StatSet => ({ ...s, bonus: { ...s.bonus } });
/** Separate normal effects and this bonus's extra once; never add extras to simTechs. */
export function romanArmor(b: CivBonusEnt, units: readonly Unit[], techs: readonly Tech[], trees: Trees) {
  if (b.id !== 'Romans-1' || b.civ !== 'Romans') return null;
  const st = civStatus(trees, b.civ),
    available = (t: Tech) => t.civs.includes(b.civ) && st['t' + t.id] === 1;
  const candidates = techs.filter((t) => b.techFx.some(([name, x]) => name === t.en && !x.b && armor(x.fx))).sort((a, z) => a.age - z.age || a.id - z.id);
  const delta = (t: Tech, u: Unit) => {
    const normalFx = (TECH_EFFECTS[t.en] ?? []).filter(([pred]) => pred(u)).flatMap(([, fx]) => fx);
    const extra = b.techFx.filter(([name, x]) => name === t.en && !x.b && x.age <= t.age && x.pred(u)).flatMap(([, x]) => x.fx);
    if (!armor(normalFx) || !armor(extra)) return null;
    const base = baseStats(u),
      normal = copy(base),
      roman = copy(base);
    applyEffects(normal, normalFx);
    applyEffects(roman, [...normalFx, ...extra]);
    const n = { ma: normal.ma - base.ma, pa: normal.pa - base.pa },
      r = { ma: roman.ma - base.ma, pa: roman.pa - base.pa };
    if (![n.ma, n.pa, r.ma, r.pa].every(Number.isFinite)) return null;
    return { normal: n, roman: r };
  };
  const rows = candidates.filter(available).flatMap((t) => {
    const groups = new Map<string, { t: Tech; units: Unit[]; normal: { ma: number; pa: number }; roman: { ma: number; pa: number } }>();
    for (const u of [...units].sort((a, z) => a.id - z.id)) {
      if (!u.civs.includes(b.civ) || st['u' + u.id] !== 1) continue;
      const d = delta(t, u);
      if (!d) continue;
      const key = JSON.stringify(d),
        g = groups.get(key);
      if (g) g.units.push(u);
      else groups.set(key, { t, units: [u], ...d });
    }
    return [...groups.values()];
  });
  const u = units.find((x) => x.id === 1793 && x.civs.includes(b.civ) && st['u' + x.id] === 1);
  const chain = rows.filter((r) => r.units.some((x) => x.id === u?.id));
  const legal = !!u && chain.length > 0 && chain.every((r, i) => r.t.age <= u.age && (r.t.pre == null || chain.slice(0, i).some((p) => p.t.id === r.t.pre)));
  const base = u ? baseStats(u) : null;
  const stages = legal && base ? [{ t: null as Tech | null, ma: base.ma, pa: base.pa }] : [];
  if (legal && base)
    for (const row of chain) {
      base.ma += row.roman.ma;
      base.pa += row.roman.pa;
      stages.push({ t: row.t, ma: base.ma, pa: base.pa });
    }
  return { rows, unavailable: candidates.filter((t) => !available(t)), example: legal && u ? { u, stages } : null };
}
