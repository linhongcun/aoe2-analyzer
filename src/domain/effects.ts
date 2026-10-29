/**
 * 效果的单一事实来源（合成层）：
 *   1. .dat 原始效果表 → src/data/effects.json（scripts/effects_build.py 生成）——优先；
 *   2. 手工表 effects.manual.ts / buildingEffects.manual.ts ——仅在 .dat 无战斗数据（2025-06 之后的新科技/新文明），
 *      或 .dat 数值与当前补丁的游戏内加成文本不一致（新鲜度检查失败）时回退。
 * 每条科技/加成的来源记录在 TECH_SRC / BONUS_SRC，页面据此标注；差异清单见 docs/EFFECTS-AUDIT.md。
 */
import civsRaw from '../data/raw/civs';
import { MANUAL_BUILDING_CIV_BONUSES, MANUAL_BUILDING_EFFECTS, type BCivBonus, type BPred } from './buildingEffects.manual';
import { DAT, idPred, toEffects, type DatEco, type DatEntry } from './datEffects';
import { MANUAL_CIV_BONUSES, MANUAL_TECH_EFFECTS, MANUAL_TEAM_BONUSES, type CivBonus, type EffectRule } from './effects.manual';
import type { Effect, UnitPred } from './types';

export type { CivBonus, EffectRule } from './effects.manual';
export { BUILDING_TEXT_ONLY } from './buildingEffects.manual';
/** 仅显示文本、不计入数值的通用科技 */
export const TEXT_ONLY_TECHS = ['Ballistics', 'Conscription'] as const;

export type Src = 'dat' | 'manual';
/** 加成数值来源：dat = .dat 生成；manual = 手工回退；eco = 只有经济/费用类 .dat 效果（结构化文本）；text = 仅文本 */
export type BonusSrc = Src | 'eco' | 'text';

const civs = civsRaw as { en: string; zh: string; bon: string[]; tb: string }[];

// ---------------- 科技 ----------------
export const TECH_SRC: Record<string, Src> = {};
export const TECH_EFFECTS: Record<string, EffectRule[]> = {};
export const BUILDING_EFFECTS: Record<string, [BPred, Effect[]][]> = {};
for (const [en, t] of Object.entries(DAT.techs)) {
  if (!t.combat) continue;
  const u: EffectRule[] = [],
    b: [BPred, Effect[]][] = [];
  t.rules.forEach((r) => {
    const fx = toEffects(r.fx);
    if (fx.length) (r.b ? b : u).push([idPred(r.t), fx]);
  });
  if (u.length) TECH_EFFECTS[en] = u;
  if (b.length) BUILDING_EFFECTS[en] = b;
  if (u.length || b.length) TECH_SRC[en] = 'dat';
}
const datCombat = (en: string) => DAT.techs[en]?.combat === true;
/** 站内存在而 .dat 中缺失的单位/建筑 id（当前应为空） */
export const NEW_IDS: ReadonlySet<number> = new Set(DAT.meta.newIds);
// .dat 缺少的科技才回退手工表（标注为 manual）
Object.entries(MANUAL_TECH_EFFECTS).forEach(([en, r]) => {
  if (datCombat(en)) return;
  TECH_EFFECTS[en] = r;
  TECH_SRC[en] = 'manual';
});
Object.entries(MANUAL_BUILDING_EFFECTS).forEach(([en, r]) => {
  if (datCombat(en)) return;
  BUILDING_EFFECTS[en] = r;
  TECH_SRC[en] ??= 'manual';
});
/** 科技的经济/费用类 .dat 效果 */
export const techEco = (en: string): DatEco[] => DAT.techs[en]?.eco ?? [];

// ---------------- 文明加成 ----------------
export const CIV_BONUSES: Record<string, CivBonus[]> = {};
export const BUILDING_CIV_BONUSES: Record<string, BCivBonus[]> = {};
/** 由科技触发的文明加成（如印加村民吃步兵铁匠铺、契丹近战攻击升级翻倍）：civ → 科技英文名 → 规则 */
export interface TechExtra {
  age: number;
  pred: (x: { id: number }) => boolean;
  fx: Effect[];
  b: boolean;
  idx: number | null;
}
export const CIV_TECH_EXTRAS: Record<string, Record<string, TechExtra[]>> = {};
/** civ → 序号或 'team' → 来源 */
export const BONUS_SRC: Record<string, Record<string, BonusSrc>> = {};
/** civ → 序号 → 关联的 .dat 条目（含经济项、新鲜度未通过的条目也保留，供页面/审计展示） */
export const BONUS_DAT: Record<string, Record<string, DatEntry[]>> = {};

const gate = (age: number, fx: Effect[]) => (a: number) => (a >= age ? fx : []);
civs.forEach((c) => {
  const d = DAT.civs[c.en];
  const src: Record<string, BonusSrc> = (BONUS_SRC[c.en] = {});
  const byIdx: Record<string, DatEntry[]> = (BONUS_DAT[c.en] = {});
  d?.bonus.forEach((e) => (byIdx[e.idx === null ? 'hidden' : String(e.idx)] ??= []).push(e));
  const U: CivBonus[] = [],
    B: BCivBonus[] = [];
  const keys = [...c.bon.map((_, i) => String(i)), 'hidden'];
  keys.forEach((k) => {
    const es = byIdx[k] ?? [];
    const idx = k === 'hidden' ? -1 : +k;
    const label = idx >= 0 ? c.bon[idx]! : '隐藏加成（.dat 中存在、加成文本未列出）';
    // .dat 为当前固定补丁：不再按文本一致性回退；fresh 仅供审计/页面提示
    const numeric = es.filter((e) => e.combat && e.rules.some((r) => toEffects(r.fx).length));
    if (numeric.length) {
      numeric.forEach((e) =>
        e.rules.forEach((r) => {
          const fx = toEffects(r.fx);
          if (!fx.length) return;
          if (e.req.length) {
            const ex = (CIV_TECH_EXTRAS[c.en] ??= {});
            e.req.forEach((tn) => (ex[tn] ??= []).push({ age: e.age, pred: idPred(r.t), fx, b: !!r.b, idx: idx >= 0 ? idx : null }));
          } else if (r.b) B.push([idPred(r.t) as BPred, gate(e.age, fx), label, idx]);
          else U.push([idPred(r.t) as UnitPred, gate(e.age, fx), label, idx]);
        }),
      );
      if (idx >= 0) src[k] = 'dat';
      return;
    }
    if (idx < 0) return;
    const mu = (MANUAL_CIV_BONUSES[c.en] ?? []).filter((x) => x[3] === idx),
      mb = (MANUAL_BUILDING_CIV_BONUSES[c.en] ?? []).filter((x) => x[3] === idx);
    if (mu.length || mb.length) {
      U.push(...mu);
      B.push(...mb);
      src[k] = 'manual';
    } else src[k] = es.some((e) => e.eco.length) ? 'eco' : 'text';
  });
  CIV_BONUSES[c.en] = U;
  BUILDING_CIV_BONUSES[c.en] = B;
});

// ---------------- 团队加成 ----------------
/** [文明, 说明, 适用判定, 该单位获得的效果] */
export type TeamBonus = [string, string, UnitPred, (u: { id: number }) => Effect[]];
export const TEAM_BONUSES: TeamBonus[] = [];
export const TEAM_ECO: Record<string, DatEco[]> = {};
/** 团队加成对建筑的数值效果（如埃塞俄比亚哨塔视野、库曼木栅栏生命值、吴房屋建造速度） */
export const TEAM_BLD: Record<string, [BPred, Effect[]][]> = {};
civs.forEach((c) => {
  const d = DAT.civs[c.en];
  const src = BONUS_SRC[c.en]!;
  const label = `${c.zh}：${c.tb}`;
  TEAM_ECO[c.en] = d?.team.eco ?? [];
  const rules = (d?.team.rules ?? []).filter((r) => !r.b).map((r) => [idPred(r.t), toEffects(r.fx)] as const);
  const brules = (d?.team.rules ?? []).filter((r) => r.b).map((r) => [idPred(r.t) as BPred, toEffects(r.fx)] as [BPred, Effect[]]);
  if (d?.team.combat && [...rules, ...brules].some((r) => r[1].length)) {
    if (rules.some((r) => r[1].length))
      TEAM_BONUSES.push([c.en, label, (u) => rules.some(([f, fx]) => fx.length && f(u)), (u) => rules.filter(([f]) => f(u)).flatMap(([, fx]) => fx)]);
    TEAM_BLD[c.en] = brules.filter((r) => r[1].length);
    src.team = 'dat';
    return;
  }
  const m = MANUAL_TEAM_BONUSES.find((t) => t[0] === c.en);
  if (m) {
    TEAM_BONUSES.push([c.en, label, m[2], () => m[3]]);
    src.team = 'manual';
  } else src.team = (d?.team.eco.length ?? 0) || (d?.team.rules.length ?? 0) ? 'eco' : 'text';
});

/** 覆盖率统计（文明加成文本条目 + 团队加成） */
export function bonusCoverage() {
  const n = { total: 0, dat: 0, manual: 0, eco: 0, text: 0 };
  Object.values(BONUS_SRC).forEach((m) =>
    Object.values(m).forEach((s) => {
      n.total++;
      n[s]++;
    }),
  );
  return n;
}

/** .dat 数值与当前补丁文本的一致性（null = 无可比数值或无 .dat 数据） */
export const DAT_FRESH = (civ: string, k: string): boolean | null => DAT.civs[civ]?.fresh[k]?.ok ?? null;

// ---------------- 通用隐藏科技（所有文明） ----------------
/**
 * .dat 中 Civ=-1 的自动科技：时代触发（req 为空，如 Tracking、城墙随时代加血、侦察骑兵封建升级）
 * 与组合触发（如 Arrowslits + Keep 再 +1、Thalassocracy + 箭术系作用于港口）。
 * req 中与目标同名的科技视为已满足（建筑/单位本身就是该升级的产物，例如 Keep）。
 */
export interface GenericFx {
  tech: number;
  name: string;
  age: number;
  req: string[];
  pred: (x: { id: number }) => boolean;
  fx: Effect[];
  b: boolean;
}
export const GENERIC_FX: GenericFx[] = DAT.generic.flatMap((g) =>
  g.rules.map((r) => ({ tech: g.tech, name: g.name, age: g.age, req: g.req, pred: idPred(r.t), fx: toEffects(r.fx), b: !!r.b })).filter((x) => x.fx.length),
);
/** 在给定时代与已选科技下，对某单位/建筑生效的通用隐藏效果 */
/** 升级线：拥有该建筑/单位即意味着已研究这些升级 */
const IMPLIED: Record<string, string[]> = {
  Keep: ['Guard Tower', 'Keep'],
  'Guard Tower': ['Guard Tower'],
  'Fortified Wall': ['Fortified Wall'],
  'Bombard Tower': ['Bombard Tower'],
};
export function genericFx(x: { id: number; en: string }, isBld: boolean, age: number, has: (tech: string) => boolean): Effect[] {
  const imp = IMPLIED[x.en] ?? [x.en];
  return GENERIC_FX.filter((g) => g.b === isBld && age >= g.age && g.pred(x) && g.req.every((r) => imp.includes(r) || has(r))).flatMap((g) => g.fx);
}
