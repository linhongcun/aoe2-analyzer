/**
 * #24 PK 等资源 · 文明训练费用加成（纯函数）。
 * 口径：
 *  1. 折扣档位跟随 PK 所选时代；未选时代时按单位最早可用时代取档，界面注明「按X时代价格」。
 *  2. 乘数只用 .dat 累计原始值（costDiscounts.tiers）。文本整数百分比只决定这一组算不算（costPolicy）。
 *  3. 对不上任何费用句子的组显示「折扣未计入」，该组不乘，不出估算值。
 * 取整与开局相同：priceFromRawFactor，再走到 roundHalfPrice（issue 129）。恰好落在半数的直接显示半数。
 */
import civsRaw from '../data/raw/civs';
import { matchCostGroup, priceFromRawFactor } from './costPolicy';
import { DAT, type DatCostDiscount } from './datEffects';
import type { Cost } from './types';
import { roundHalfPrice } from './roundHalfPrice';

const civs = civsRaw as unknown as { en: string; zh: string; bon: string[] }[];

export interface CostBonusLine {
  idx: number | null;
  /** 加成原文（civs.json） */
  text: string;
  /** 原文去掉末尾百分比，用作「已计入：{文明} {label} −p%」 */
  label: string;
  techs: number[];
}
export interface AppliedLine extends CostBonusLine {
  /** 当前时代该档的减免百分比（由 .dat 累计乘数算出） */
  pct: number;
  /** 只减部分资源时列出（如葡萄牙只减黄金） */
  res: string[] | null;
}
export interface CostDiscount {
  civ: string;
  /** 取价时代 */
  age: number;
  base: Cost;
  /** 计算与显示共用的价格（就近 0.5） */
  cost: Cost;
  exact: Cost;
  applied: AppliedLine[];
  /** 「折扣未计入」：数据读不出或与文本对不上，按原价 */
  unsupported: CostBonusLine[];
  /** 已废弃（issue 129 起恒为空）：原「折后价恰好落在 .5 记未计入」。保留字段以免牵动界面代码 */
  half: (CostBonusLine & { res: string[] })[];
  /** 改科技费用/研究时间、不影响单位费用的加成 */
  noCost: CostBonusLine[];
}

const stripPct = (s: string) => s.replace(/\s*[-−]\s*[\d/]+%\s*(黄金|金)?\s*$/, '').trim();
function lineOf(civEn: string, d: { idx: number | null; techs: number[] }): CostBonusLine {
  const text = d.idx !== null && d.idx >= 0 ? (civs.find((c) => c.en === civEn)?.bon[d.idx] ?? '') : '';
  return { idx: d.idx, text, label: stripPct(text) || text, techs: d.techs };
}
export { roundHalfPrice };
const ALL = ['Food', 'Wood', 'Gold', 'Stone'];

/** 取价时代：选了时代用所选（不低于单位最早时代），没选用单位最早可用时代 */
export const priceAge = (unitAge: number, selected: number | null) => Math.max(unitAge, selected ?? unitAge);

export function discountedCost(
  u: { id: number; cost: Cost },
  civEn: string,
  age: number,
  opts: { techIds?: ReadonlySet<number>; table?: Record<string, DatCostDiscount[]> } = {},
): CostDiscount {
  const table = opts.table ?? DAT.costDiscounts ?? {};
  const base = { ...u.cost };
  const factor: Record<string, number> = {};
  Object.keys(base).forEach((r) => (factor[r] = 1));
  const applied: AppliedLine[] = [],
    unsupported: CostBonusLine[] = [],
    half: (CostBonusLine & { res: string[] })[] = [];
  (table[civEn] ?? []).forEach((d) => {
    d.groups.forEach((g) => {
      if (!g.units.includes(u.id)) return;
      const tier = g.tiers[String(age)];
      if (tier === undefined) return;
      const touched = g.res.filter((r) => base[r]);
      if (!touched.length) return;
      const match = matchCostGroup(civEn, d, g, age, tier);
      if (!match) {
        unsupported.push(lineOf(civEn, d));
        return;
      }
      touched.forEach((r) => (factor[r] = (factor[r] ?? 1) * tier));
      const res = [...new Set(touched)];
      applied.push({ ...lineOf(civEn, { idx: match.idx, techs: d.techs }), pct: match.pct, res: ALL.every((r) => res.includes(r)) ? null : res });
    });
  });
  const exact: Cost = {},
    cost: Cost = {};
  Object.keys(base).forEach((r) => {
    exact[r] = base[r]! * (factor[r] ?? 1);
    cost[r] = priceFromRawFactor(base[r]!, factor[r] ?? 1);
  });
  const noCost: CostBonusLine[] = [];
  if (opts.techIds) {
    const byIdx = new Map<number, number[]>();
    (DAT.civs[civEn]?.bonus ?? []).forEach((e) =>
      e.eco.forEach((x) => {
        if (x.tid !== undefined && opts.techIds!.has(x.tid) && e.idx !== null && e.idx >= 0) byIdx.set(e.idx, [...(byIdx.get(e.idx) ?? []), x.tid]);
      }),
    );
    byIdx.forEach((tids, idx) => noCost.push(lineOf(civEn, { idx, techs: [...new Set(tids)] })));
  }
  return { civ: civEn, age, base, cost, exact, applied, unsupported, half, noCost };
}
