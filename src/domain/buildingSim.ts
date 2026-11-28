/**
 * 建筑科技模拟器：复用 simulator.ts 的效果引擎（applyEffects / civStatus / totalCost / prereq）。
 * 效果数值来自 .dat 生成的 data/game/effects.json（经 effects.ts 合成，手工表仅作回退）。
 */
import type { Building, Effect, StatSet } from './types';
import { ballisticsAffectsBuilding } from './ballistics';
import { DAT } from './datEffects';
import { getProjectileGuidanceScope, projectileGuidanceBuildingScopeNote } from './duelUnmodeledEco';
import { applyEffects, civStatus, type SimContext, type SimTech } from './simulator';
import {
  ageAutoGenericFx,
  BUILDING_CIV_BONUSES,
  BUILDING_EFFECTS,
  BUILDING_TEXT_ONLY,
  buildingCivBonusesForAge,
  conditionalGenericFx,
  GENERIC_FX,
  TEAM_BUILDING_BONUSES,
  genericBuildingTriggerReqs,
} from './effects';
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
  const bonus: Record<string, number> = {};
  for (const a of b.atks ?? []) {
    if (a.classId === 3 || a.classId === 4) continue;
    const label = a.label?.trim();
    if (!label || label === '近战' || label === '穿刺') continue;
    bonus[label] = a.amount;
  }
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
    bonus,
    armc: {},
    ca: 0,
    bdr: 0,
    rofx: 1,
  };
}

/** 仅文本层中的进攻类建筑科技（无攻建筑同样过滤） */
const OFFENSIVE_TEXT_ONLY = new Set(['Heated Shot']);

function directBuildingSimTechs(
  ctx: SimContext,
  b: Building,
  civ: string,
  canAttack: boolean,
  st: Record<string, number>,
): { t: SimTech['t']; ef: Effect[] }[] {
  const r: { t: SimTech['t']; ef: Effect[] }[] = [];
  const seen = new Set<number>();
  Object.keys(BUILDING_EFFECTS).forEach((n) => {
    const t = ctx.techByEn[n];
    if (!t || !st['t' + t.id] || seen.has(t.id)) return;
    if (t.type === 'UniqueTech' && !t.civs.includes(civ)) return;
    const rawEf = BUILDING_EFFECTS[n]!.filter(([f]) => f(b)).flatMap((x) => x[1]);
    const ef = canAttack ? rawEf : rawEf.filter((e) => !OFFENSIVE_BUILDING_STATS.has(e.s));
    if (ef.length) {
      seen.add(t.id);
      r.push({ t, ef });
    }
  });
  return r;
}

export function buildingSimTechs(ctx: SimContext, b: Building, civ: string): SimTech[] {
  const st = civStatus(ctx.trees, civ);
  const canAttack = buildingCanAttack(b);
  const direct = directBuildingSimTechs(ctx, b, civ, canAttack, st);
  const r: SimTech[] = [...direct];
  const seen = new Set<number>(direct.map((x) => x.t.id));
  const has = (n: string) => {
    const t = ctx.techByEn[n];
    return t && st['t' + t.id] ? t : null;
  };
  // 条件建筑隐藏科技（如强化教堂的箭羽/锥子箭/护腕/化学/斯万箭塔）：按单一未隐含触发前置去重并入可选列表
  GENERIC_FX.forEach((g) => {
    if (!g.b || (g.civs && !g.civs.includes(civ)) || !g.pred(b)) return;
    const rem = genericBuildingTriggerReqs(g, b);
    if (rem.length !== 1) return;
    const t = has(rem[0]!);
    if (!t || seen.has(t.id)) return;
    if (t.type === 'UniqueTech' && !t.civs.includes(civ)) return;
    const ef = canAttack ? g.fx : g.fx.filter((e) => !OFFENSIVE_BUILDING_STATS.has(e.s));
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
  // 弹道学（科技 93）、投射物剧毒与追踪/弹速科技：均按固定 .dat 范围且仅命中具备攻击能力的建筑（先于 b.techs 去重）
  if (canAttack) {
    // 弹道学（科技 93）：按固定 .dat 派生的 DAT.ballistics.buildings 判定适用攻击建筑，配合运行时 canAttack 双防线（Issue 1510）
    if (ballisticsAffectsBuilding(b.id)) {
      const t = has('Ballistics');
      if (t && !seen.has(t.id)) {
        seen.add(t.id);
        r.push({ t, ef: null });
      }
    }
    Object.entries(DAT.projectilePoison ?? {}).forEach(([en, scope]) => {
      if (!scope.buildings.includes(b.id)) return;
      const t = has(en);
      if (!t || seen.has(t.id)) return;
      if (t.type === 'UniqueTech' && !t.civs.includes(civ)) return;
      seen.add(t.id);
      r.push({ t, ef: null, scopeNote: '研究后本建筑的攻击附带中毒持续伤害；面板数值未计入。' });
    });
    // 投射物追踪/弹速科技（如火绳枪，按 DAT.projectileGuidance 仅命中具备攻击能力的适用建筑；先于 b.techs 去重）
    Object.keys(DAT.projectileGuidance ?? {}).forEach((en) => {
      const scope = getProjectileGuidanceScope(en);
      if (!scope || !scope.buildings.includes(b.id)) return;
      const t = has(en);
      if (!t || seen.has(t.id)) return;
      if (t.type === 'UniqueTech' && !t.civs.includes(civ)) return;
      const scopeNote = projectileGuidanceBuildingScopeNote(scope);
      seen.add(t.id);
      r.push(scopeNote ? { t, ef: null, scopeNote } : { t, ef: null });
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

/** 严格解析建筑模拟器 ?team= 中的规范非负整数索引，防止空白或非规范字符串被 Number() 静默转为 0（库曼）。 */
export function parseBuildingTeamParam(raw: string | null): number[] {
  return (raw ?? '')
    .split(',')
    .filter((token) => /^(0|[1-9]\d*)$/.test(token) && Number.isSafeInteger(+token))
    .map(Number);
}

/** 过滤建筑模拟器的额外盟友团队索引：去重、按升序排列，并剔除越界、本方常驻及不适用于当前建筑的项。 */
export function filterBuildingExtraTeam(b: Building, civ: string, ids: Iterable<number>): number[] {
  return [...new Set(ids)]
    .filter((i) => Number.isInteger(i) && i >= 0 && i < TEAM_BUILDING_BONUSES.length && TEAM_BUILDING_BONUSES[i]![0] !== civ && TEAM_BUILDING_BONUSES[i]![2](b))
    .sort((x, y) => x - y);
}

export function simulateBuilding(
  ctx: SimContext,
  b: Building,
  civ: string,
  age: number,
  sel: ReadonlySet<number>,
  team: ReadonlySet<number> = new Set(),
): StatSet {
  const S = buildingBase(b);
  const st = civStatus(ctx.trees, civ);
  const canAttack = buildingCanAttack(b);
  const filterOff = (fx: readonly Effect[]) => (!fx.length || canAttack ? fx : fx.filter((e) => !OFFENSIVE_BUILDING_STATS.has(e.s)));
  const maxAge = Math.floor(age);
  // issue 1517（方案 B1）：按年代序逐时代先施加无前置建筑自动规则，再施加同代常驻建筑文明加成
  for (let a = 1; a <= maxAge; a++) {
    const autoFx = filterOff(ageAutoGenericFx(b, true, a, civ));
    if (autoFx.length) applyEffects(S, autoFx);
    const civFx = buildingCivBonusesForAge(civ, b, a, maxAge);
    if (civFx.length) applyEffects(S, civFx);
  }
  // 仅对直接建筑规则（BUILDING_EFFECTS）施加一次；带前置组合规则统一由下方 conditionalGenericFx 施加，结构上杜绝双重叠加
  directBuildingSimTechs(ctx, b, civ, canAttack, st).forEach(({ t, ef }) => {
    if (sel.has(t.id)) applyEffects(S, ef);
  });
  TEAM_BUILDING_BONUSES.forEach(([teamCiv, , f, ef], i) => {
    if ((teamCiv === civ || team.has(i)) && f(b)) {
      applyEffects(S, filterOff(ef(b)));
    }
  });
  const hasOwnedSelected = (n: string) => {
    const t = ctx.techByEn[n];
    return !!t && !!st['t' + t.id] && (t.type !== 'UniqueTech' || t.civs.includes(civ)) && sel.has(t.id);
  };
  const condFx = filterOff(conditionalGenericFx(b, true, age, hasOwnedSelected, civ));
  if (condFx.length) applyEffects(S, condFx);
  S.bt = Math.round(S.bt * 10) / 10;
  return S;
}
