/**
 * 单位训练费的唯一计入策略（issue 864）。
 *
 * 数值来源是 .dat 效果命令的原始乘数（effects.json costDiscounts.tiers，
 * 由 effects_build.py 把属性 104 等乘法按时代累乘后保留 6 位）。
 * 加成文本里的整数百分比只用来决定这一组算不算，不再拿来当第二套乘数。
 * 生成器自己的说明也是：text_pcts「只用于与 .dat 对账，不作为数值来源」。
 *
 * 一组在该时代计入，当且仅当 round((1 - 原始乘数) * 100) 等于
 * 本条加成文本的百分比，或同一文明另一条费用句子的百分比（资源对得上）。
 * 对不上的组两边都不乘，并记未计入。高丽 0.5 对上「-50% wood」，
 * 0.8 对上另一句「Warships cost -20% wood」，不再因整条 ok=false 一起丢掉。
 *
 * 取整仍是 roundHalfPrice（issue 129 游戏内实测的是 0.75 这种原始乘数和整数百分比相同的价）。
 * 原始乘数与整数百分比取整后差 0.5 或 1 时，采用原始乘数。那一跳没有游戏内实测。
 */
import civsRaw from '../data/raw/civs';
import unitsRaw from '../data/raw/units';
import { DAT, type DatCostDiscount, type DatCostGroup } from './datEffects';
import { roundHalfPrice } from './roundHalfPrice';
import type { Cost } from './types';

const civs = civsRaw as { en: string; bon: string[]; bonEn: string[] }[];
const units = unitsRaw as unknown as { id: number; age: number; civs: string[]; cost: Cost }[];
const AGE_N: Record<string, number> = { Dark: 1, Feudal: 2, Castle: 3, Imperial: 4 };
const RES_WORDS: [string, string][] = [
  ['wood', 'Wood'],
  ['food', 'Food'],
  ['gold', 'Gold'],
  ['stone', 'Stone'],
];

export interface DiscountMatch {
  idx: number | null;
  /** 对上的那句文本里的整数百分比 */
  pct: number;
  /** 用来乘的 .dat 累计乘数 */
  raw: number;
  via: 'own' | 'other';
}

export interface ResourceDecision {
  /** 计入的原始乘数。未计入的组不乘进来。 */
  factor: number;
  /** 数据里这一资源全部组的原始乘数，含未计入的组。 */
  accumulated: number;
}

/** 加成文本里的费用百分比。读不出返回 null。与 effects_build.text_pcts 同一规则。 */
export function textPercents(text: string, start: number): Record<number, number> | null {
  const m = text.match(/-(\d+(?:\/\d+)*)%/);
  if (!m?.[1]) return null;
  let ps = m[1].split('/').map((x) => Number(x));
  const st = text.match(/starting in (Dark|Feudal|Castle|Imperial) Age/);
  const ag = text.match(/in ((?:(?:Dark|Feudal|Castle|Imperial)\/?)+) Age/);
  const startAge = st?.[1] ? AGE_N[st[1]] : undefined;
  let ages: number[];
  if (startAge) ages = [1, 2, 3, 4].filter((a) => a >= startAge);
  else if (ag?.[1])
    ages = ag[1]
      .split('/')
      .filter(Boolean)
      .map((x) => AGE_N[x] ?? NaN);
  else ages = [1, 2, 3, 4].filter((a) => a >= start);
  if (ages.some((a) => !Number.isFinite(a))) return null;
  if (ps.length === 1) ps = ages.map(() => ps[0]!);
  if (ps.length !== ages.length) return null;
  return Object.fromEntries(ages.map((a, i) => [a, ps[i]!]));
}

function namedResources(text: string): Set<string> {
  const lower = text.toLowerCase();
  return new Set(RES_WORDS.filter(([word]) => lower.includes(word)).map(([, res]) => res));
}

/** 这一组在该时代是否计入，以及应对上哪一句加成。 */
export function matchCostGroup(civEn: string, entry: DatCostDiscount, group: DatCostGroup, age: number, tier: number): DiscountMatch | null {
  const pct = Math.round((1 - tier) * 100);
  const own = entry.text?.[String(age)];
  if (own === pct) return { idx: entry.idx, pct, raw: tier, via: 'own' };
  const lines = civs.find((c) => c.en === civEn)?.bonEn ?? [];
  for (let i = 0; i < lines.length; i++) {
    if (i === entry.idx) continue;
    const parsed = textPercents(lines[i] ?? '', 1);
    if (!parsed || parsed[age] !== pct) continue;
    const named = namedResources(lines[i] ?? '');
    if (named.size && !group.res.some((r) => named.has(r))) continue;
    return { idx: i, pct, raw: tier, via: 'other' };
  }
  return null;
}

/** 原始乘数乘上去再取整。legacy 只保留开局未支持文明的 Math.round。 */
export function priceFromRawFactor(base: number, factor: number, legacy = false): number {
  const exact = base * factor;
  return legacy ? Math.round(exact) : roundHalfPrice(exact);
}

/** 该单位、文明、时代下，每种资源的计入乘数与全部分组乘数。 */
export function civDiscountFactors(
  unitId: number,
  civEn: string,
  age: number,
  table: Record<string, DatCostDiscount[]> = DAT.costDiscounts ?? {},
): Record<string, ResourceDecision> {
  const out: Record<string, ResourceDecision> = {};
  for (const entry of table[civEn] ?? []) {
    for (const group of entry.groups) {
      if (!group.units.includes(unitId)) continue;
      const tier = group.tiers[String(age)];
      if (tier === undefined) continue;
      const match = matchCostGroup(civEn, entry, group, age, tier);
      for (const res of group.res) {
        const cur = out[res] ?? { factor: 1, accumulated: 1 };
        cur.accumulated *= tier;
        if (match) cur.factor *= tier;
        out[res] = cur;
      }
    }
  }
  return out;
}

/**
 * 开局 costMul 里已经乘过全部 .dat 组。误差内视为同一笔文明折扣，改成计入后的乘数；
 * 若还有文明折扣以外的倍率，按比例保留。
 */
export function alignAggregatedFactor(aggregated: number, decision: ResourceDecision): number {
  if (decision.accumulated === 0) return aggregated;
  const ratio = aggregated / decision.accumulated;
  if (Math.abs(ratio - 1) < 1e-4) return decision.factor;
  return decision.factor * ratio;
}

/** 加成百科：这条句子是否有单位在帝王时代（或不早于其可用时代）被实际计入。 */
export function bonusDiscountCounted(civEn: string, idx: number): boolean {
  for (const unit of units) {
    if (!unit.civs.includes(civEn)) continue;
    const age = Math.max(4, unit.age);
    for (const entry of DAT.costDiscounts?.[civEn] ?? []) {
      for (const group of entry.groups) {
        if (!group.units.includes(unit.id)) continue;
        const tier = group.tiers[String(age)];
        if (tier === undefined) continue;
        if (matchCostGroup(civEn, entry, group, age, tier)?.idx === idx) return true;
      }
    }
  }
  return false;
}
