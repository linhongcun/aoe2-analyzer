/**
 * 建筑科技模拟器：复用 simulator.ts 的效果引擎（applyEffects / civStatus / totalCost / prereq）。
 * 效果数值来自 .dat 生成的 src/data/effects.json（经 effects.ts 合成，手工表仅作回退）。
 */
import type { Building, StatSet } from './types';
import { applyEffects, civStatus, type SimContext, type SimTech } from './simulator';
import { BUILDING_CIV_BONUSES, BUILDING_EFFECTS, BUILDING_TEXT_ONLY, genericFx } from './effects';
export type { BPred, BCivBonus } from './buildingEffects.manual';
export { BUILDING_CIV_BONUSES, BUILDING_EFFECTS };

export function buildingBase(b: Building): StatSet {
  return {
    hp: b.hp,
    atk: b.atk,
    ma: b.ma,
    pa: b.pa,
    rng: b.rng,
    spd: 0,
    los: b.los,
    rof: b.rof,
    acc: 100,
    minr: b.minr,
    gar: b.gar,
    bt: b.bt,
    barm: b.barm,
    bonus: {},
    rofx: 1,
  };
}

export function buildingSimTechs(ctx: SimContext, b: Building, civ: string): SimTech[] {
  const st = civStatus(ctx.trees, civ);
  const r: SimTech[] = [];
  const has = (n: string) => {
    const t = ctx.techByEn[n];
    return t && st['t' + t.id] ? t : null;
  };
  Object.keys(BUILDING_EFFECTS).forEach((n) => {
    const t = has(n);
    if (!t) return;
    const ef = BUILDING_EFFECTS[n]!.filter(([f]) => f(b)).flatMap((x) => x[1]);
    if (ef.length) r.push({ t, ef });
  });
  Object.entries(BUILDING_TEXT_ONLY).forEach(([n, f]) => {
    const t = has(n);
    if (t && f(b) && !r.some((x) => x.t.id === t.id)) r.push({ t, ef: null });
  });
  // 在该建筑研究的独特科技：仅文本
  ctx.techs.filter((t) => t.type === 'UniqueTech' && t.civs.includes(civ) && b.techs.includes(t.id)).forEach((t) => r.push({ t, ef: null }));
  return r;
}

export const buildingCivNotes = (b: Building, civ: string) => (BUILDING_CIV_BONUSES[civ] ?? []).filter(([f]) => f(b)).map((x) => x[2]);

export function simulateBuilding(ctx: SimContext, b: Building, civ: string, age: number, sel: ReadonlySet<number>): StatSet {
  const S = buildingBase(b);
  (BUILDING_CIV_BONUSES[civ] ?? []).forEach(([f, g]) => {
    if (f(b)) applyEffects(S, g(age));
  });
  buildingSimTechs(ctx, b, civ).forEach(({ t, ef }) => {
    if (ef && sel.has(t.id)) applyEffects(S, ef);
  });
  applyEffects(
    S,
    genericFx(b, true, age, (n) => !!ctx.techByEn[n] && sel.has(ctx.techByEn[n]!.id)),
  );
  S.hp = Math.round(S.hp);
  S.bt = Math.round(S.bt * 10) / 10;
  return S;
}
