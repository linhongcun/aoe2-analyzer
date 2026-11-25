/**
 * 建筑科技模拟器：复用 simulator.ts 的效果引擎（applyEffects / civStatus / totalCost / prereq）。
 * 效果数值来自 .dat 生成的 data/game/effects.json（经 effects.ts 合成，手工表仅作回退）。
 */
import type { Building, Effect, StatSet } from './types';
import { DAT } from './datEffects';
import { applyEffects, civStatus, type SimContext, type SimTech } from './simulator';
import { BUILDING_CIV_BONUSES, BUILDING_EFFECTS, BUILDING_TEXT_ONLY, genericFx } from './effects';
export type { BPred, BCivBonus } from './buildingEffects.manual';
export { BUILDING_CIV_BONUSES, BUILDING_EFFECTS };

/** 仅对具备攻击能力的建筑生效的进攻类效果属性 */
const OFFENSIVE_BUILDING_STATS: ReadonlySet<Effect['s']> = new Set(['atk', 'rng', 'minr', 'rof', 'bonus', 'acc', 'ca']);

/**
 * 判断建筑是否具备攻击能力。
 * 不能仅看基础 b.atk === 0：西西里城楼（1665）基础 atk=0，但含 5 项攻击类别及 minr=1、rof=2，随时代加成获得攻击力。
 */
function buildingCanAttack(b: Pick<Building, 'atk' | 'rng' | 'minr' | 'rof' | 'atks'>): boolean {
  return b.atk > 0 || b.rng > 0 || b.minr > 0 || b.rof > 0 || (b.atks?.length ?? 0) > 0;
}

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
    armc: {},
    ca: 0,
    rofx: 1,
  };
}

/** 仅文本层中的进攻类建筑科技（无攻建筑同样过滤） */
const OFFENSIVE_TEXT_ONLY = new Set(['Heated Shot', 'Ballistics']);

export function buildingSimTechs(ctx: SimContext, b: Building, civ: string): SimTech[] {
  const st = civStatus(ctx.trees, civ);
  const r: SimTech[] = [];
  const seen = new Set<number>();
  const canAttack = buildingCanAttack(b);
  const has = (n: string) => {
    const t = ctx.techByEn[n];
    return t && st['t' + t.id] ? t : null;
  };
  Object.keys(BUILDING_EFFECTS).forEach((n) => {
    const t = has(n);
    if (!t || seen.has(t.id)) return;
    const rawEf = BUILDING_EFFECTS[n]!.filter(([f]) => f(b)).flatMap((x) => x[1]);
    const ef = canAttack ? rawEf : rawEf.filter((e) => !OFFENSIVE_BUILDING_STATS.has(e.s));
    if (ef.length) {
      seen.add(t.id);
      r.push({ t, ef });
    }
  });
  Object.entries(BUILDING_TEXT_ONLY).forEach(([n, f]) => {
    if (!canAttack && OFFENSIVE_TEXT_ONLY.has(n)) return;
    const t = has(n);
    if (t && f(b) && !seen.has(t.id)) {
      seen.add(t.id);
      r.push({ t, ef: null });
    }
  });
  // 投射物剧毒科技（如箭毒 1393，按 DAT.projectilePoison 仅命中具备攻击能力的适用建筑；先于 b.techs 去重）
  if (canAttack) {
    Object.entries(DAT.projectilePoison ?? {}).forEach(([en, scope]) => {
      if (!scope.buildings.includes(b.id)) return;
      const t = has(en);
      if (!t || seen.has(t.id)) return;
      if (t.type === 'UniqueTech' && !t.civs.includes(civ)) return;
      seen.add(t.id);
      r.push({ t, ef: null, scopeNote: '研究后本建筑的攻击附带中毒持续伤害；面板数值未计入。' });
    });
  }
  // 在该建筑研究的独特科技：仅文本（已由上方效果/文本表纳入的按 t.id 去重）
  ctx.techs.forEach((t) => {
    if (t.type === 'UniqueTech' && t.civs.includes(civ) && b.techs.includes(t.id) && !seen.has(t.id)) {
      seen.add(t.id);
      r.push({ t, ef: null });
    }
  });
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
    genericFx(b, true, age, (n) => !!ctx.techByEn[n] && sel.has(ctx.techByEn[n]!.id), civ),
  );
  S.bt = Math.round(S.bt * 10) / 10;
  return S;
}
