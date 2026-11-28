/** 科技模拟器同源研究费用计算（纯函数，无 React 与 311 KiB army_research.json 依赖；issue 1496）。 */
import { SIM_RESEARCH_PRICES, type SimResearchAgeKey, type SimResearchPriceEntry, type SimResearchPricesData } from '../data/simResearchPrices';
import { RES_ZH } from './ratings';
import { ARMY_RES, addArmyCost, hasDecimalCost, roundArmyCost } from './researchCostMath';
import type { Cost, Tech } from './types';

export type SimTechPriceState = 'normal' | 'discounted' | 'free' | 'unverified';

export interface SimTechResearchQuote {
  state: SimTechPriceState;
  cost: Cost | null;
  baseCost: Cost;
  free: boolean;
  zero: boolean;
  discounted: boolean;
  hasDecimal: boolean;
  reason: string;
}

export interface SimOrderConflict {
  modifierIds: number[];
  modifierNames: string[];
  affectedIds: number[];
  affectedNames: string[];
}

export type SimResearchSummaryState = 'empty' | 'normal' | 'discounted' | 'free' | 'partial' | 'unverified-only';

export interface SimResearchSummary {
  state: SimResearchSummaryState;
  cost: Cost;
  baseCost: Cost;
  time: number;
  selectedCount: number;
  verifiedCount: number;
  unverifiedCount: number;
  discountedCount: number;
  freeCount: number;
  decimalCount: number;
  discounted: boolean;
  allFree: boolean;
  allVerifiedFree: boolean;
  costDiffersFromBase: boolean;
  orderConflict: SimOrderConflict | null;
}

const EPS = 1e-9;

function normalizeBaseCost(cost: Cost): Cost {
  const out: Cost = {};
  for (const r of ARMY_RES) {
    const v = cost[r];
    if (v !== undefined && v > 0) out[r] = roundArmyCost(v);
  }
  return out;
}

function costsDiffer(a: Cost, b: Cost): boolean {
  return ARMY_RES.some((r) => Math.abs((a[r] ?? 0) - (b[r] ?? 0)) > EPS);
}

function lookupPriceEntry(prices: SimResearchPricesData, civ: string, age: number, techId: number): SimResearchPriceEntry | undefined {
  const record = prices.civs[civ]?.[String(techId)];
  if (!record) return undefined;
  if (record.kind === 'all') return record.entry;
  const ageKey = String(Math.max(1, Math.min(4, Math.trunc(age)))) as SimResearchAgeKey;
  return record.ages[ageKey];
}

/** 固定顺位（食物 / 木材 / 黄金 / 石料）格式化目录原价说明，供悬停 title 使用。 */
export function formatBaseCostText(baseCost: Cost): string {
  return ARMY_RES.filter((r) => (baseCost[r] ?? 0) > 0)
    .map((r) => `${baseCost[r]} ${RES_ZH[r]}`)
    .join(' / ');
}

/** 按与 #/production?mode=army-cost 同源的被动文明/时代研究价规则对单条科技报价。 */
export function quoteSimTechPrice(
  tech: Pick<Tech, 'id' | 'cost'>,
  civ: string,
  age: number,
  prices: SimResearchPricesData = SIM_RESEARCH_PRICES,
): SimTechResearchQuote {
  const baseCost = normalizeBaseCost(tech.cost);
  const entry = lookupPriceEntry(prices, civ, age, tech.id);
  if (!entry) {
    return {
      state: 'normal',
      cost: baseCost,
      baseCost,
      free: false,
      zero: false,
      discounted: false,
      hasDecimal: hasDecimalCost(baseCost),
      reason: '',
    };
  }
  if (entry.cost === null) {
    return {
      state: 'unverified',
      cost: null,
      baseCost,
      free: false,
      zero: false,
      discounted: false,
      hasDecimal: false,
      reason: entry.reason ?? '影响本项研究费用的规则尚未核实',
    };
  }
  const free = entry.free === true;
  const zero = free || entry.zero === true || ARMY_RES.every((r) => !(entry.cost![r] ?? 0));
  if (free || zero) {
    return {
      state: 'free',
      cost: {},
      baseCost,
      free,
      zero: true,
      discounted: costsDiffer({}, baseCost),
      hasDecimal: false,
      reason: '',
    };
  }
  const effective: Cost = {};
  for (const r of ARMY_RES) {
    const v = entry.cost[r];
    if (v !== undefined) effective[r] = roundArmyCost(v);
  }
  const discounted = costsDiffer(effective, baseCost);
  return {
    state: discounted ? 'discounted' : 'normal',
    cost: discounted ? effective : baseCost,
    baseCost,
    free: false,
    zero: false,
    discounted,
    hasDecimal: hasDecimalCost(discounted ? effective : baseCost),
    reason: '',
  };
}

/** 检测已选集合中是否同时包含具 location>0 改费命令的科技与至少一项受其影响的已选科技，按 avail 顺序返回。 */
export function detectOrderConflicts(
  avail: readonly { t: Pick<Tech, 'id' | 'zh'> }[],
  sel: ReadonlySet<number>,
  civ: string,
  prices: SimResearchPricesData = SIM_RESEARCH_PRICES,
): SimOrderConflict | null {
  const activeModifiers: { id: number; zh: string; targets: readonly number[]; global: boolean }[] = [];
  for (const { t } of avail) {
    if (!sel.has(t.id)) continue;
    const mod = prices.orderModifiers[String(t.id)];
    if (!mod) continue;
    if (mod.civ !== null && mod.civ !== civ) continue;
    activeModifiers.push({ id: t.id, zh: t.zh, targets: mod.targets, global: mod.global === true });
  }
  if (!activeModifiers.length) return null;

  const matchedModifierIds = new Set<number>();
  const affectedIds: number[] = [];
  const affectedNames: string[] = [];
  const seenAffected = new Set<number>();
  for (const { t } of avail) {
    if (!sel.has(t.id) || seenAffected.has(t.id)) continue;
    let affected = false;
    for (const mod of activeModifiers) {
      if (mod.id === t.id) continue;
      if (mod.global || mod.targets.includes(t.id)) {
        matchedModifierIds.add(mod.id);
        affected = true;
      }
    }
    if (affected) {
      seenAffected.add(t.id);
      affectedIds.push(t.id);
      affectedNames.push(t.zh);
    }
  }
  if (!affectedIds.length) return null;
  const matchedMods = activeModifiers.filter((m) => matchedModifierIds.has(m.id));
  return {
    modifierIds: matchedMods.map((m) => m.id),
    modifierNames: matchedMods.map((m) => m.zh),
    affectedIds,
    affectedNames,
  };
}

/** 汇总科技模拟器已选项的折后研究费用、目录原价、免费/未核实/小数计数与跨科技顺序边界。 */
export function summarizeSimResearch(
  avail: readonly { t: Pick<Tech, 'id' | 'zh' | 'cost' | 'rt'> }[],
  sel: ReadonlySet<number>,
  civ: string,
  age: number,
  prices: SimResearchPricesData = SIM_RESEARCH_PRICES,
): SimResearchSummary {
  const cost: Cost = {};
  const baseCost: Cost = {};
  let time = 0;
  let verifiedCount = 0;
  let unverifiedCount = 0;
  let discountedCount = 0;
  let freeCount = 0;
  let decimalCount = 0;

  for (const { t } of avail) {
    if (!sel.has(t.id)) continue;
    time += t.rt;
    const q = quoteSimTechPrice(t, civ, age, prices);
    if (q.cost === null) {
      unverifiedCount++;
      continue;
    }
    verifiedCount++;
    addArmyCost(cost, q.cost);
    addArmyCost(baseCost, q.baseCost);
    if (q.discounted) discountedCount++;
    if (q.state === 'free') freeCount++;
    if (q.hasDecimal) decimalCount++;
  }

  const selectedCount = verifiedCount + unverifiedCount;
  const discounted = discountedCount > 0;
  const allVerifiedFree = verifiedCount > 0 && freeCount === verifiedCount;
  const allFree = selectedCount > 0 && unverifiedCount === 0 && allVerifiedFree;
  const costDiffersFromBase = verifiedCount > 0 && costsDiffer(cost, baseCost);

  let state: SimResearchSummaryState;
  if (selectedCount === 0) state = 'empty';
  else if (verifiedCount === 0) state = 'unverified-only';
  else if (unverifiedCount > 0) state = 'partial';
  else if (allFree) state = 'free';
  else if (discounted) state = 'discounted';
  else state = 'normal';

  const orderConflict = detectOrderConflicts(avail, sel, civ, prices);

  return {
    state,
    cost,
    baseCost,
    time,
    selectedCount,
    verifiedCount,
    unverifiedCount,
    discountedCount,
    freeCount,
    decimalCount,
    discounted,
    allFree,
    allVerifiedFree,
    costDiffersFromBase,
    orderConflict,
  };
}

/** 兼容入口：传入 civ 时按同源文明/时代研究价折算；省略 civ 时保持目录原价累加。 */
export function totalCost(
  avail: readonly { t: Pick<Tech, 'id' | 'zh' | 'cost' | 'rt'> }[],
  sel: ReadonlySet<number>,
  civ?: string,
  age = 4,
  prices: SimResearchPricesData = SIM_RESEARCH_PRICES,
): SimResearchSummary {
  if (civ !== undefined) return summarizeSimResearch(avail, sel, civ, age, prices);
  const cost: Cost = {};
  const baseCost: Cost = {};
  let time = 0;
  let verifiedCount = 0;
  let decimalCount = 0;
  for (const { t } of avail) {
    if (!sel.has(t.id)) continue;
    time += t.rt;
    verifiedCount++;
    const norm = normalizeBaseCost(t.cost);
    addArmyCost(cost, norm);
    addArmyCost(baseCost, norm);
    if (hasDecimalCost(norm)) decimalCount++;
  }
  return {
    state: verifiedCount === 0 ? 'empty' : 'normal',
    cost,
    baseCost,
    time,
    selectedCount: verifiedCount,
    verifiedCount,
    unverifiedCount: 0,
    discountedCount: 0,
    freeCount: 0,
    decimalCount,
    discounted: false,
    allFree: false,
    allVerifiedFree: false,
    costDiffersFromBase: false,
    orderConflict: null,
  };
}
