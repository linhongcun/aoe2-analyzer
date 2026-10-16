/**
 * #24 PK 等资源 · 文明训练费用加成（纯函数）。
 * 口径（Steve 终版，#24）：
 *  1. 折扣档位跟随 PK 所选时代；未选时代时按单位最早可用时代取档，界面注明「按X时代价格」。
 *  2. 数值只来自 .dat 导出（scripts/effects_build.py → effects.json 的 costDiscounts：属性 100/103–106 的乘法效果逐时代累计），
 *     不从 civs.json 文本抄数；文本只用于对账。
 *  3. 读不出或与文本对不上的加成（ok=false）显示「折扣未计入」，按原价，不出估算值。
 * 折后价取整（issue 129，Steve 在 issue 133 按游戏实测定）：就近取到 0.5，x.25 往小、x.75 往大（26.25 → 26，168.75 → 169），
 * 与开局页共用 roundHalfPrice；显示价与计算用价为同一个值。恰好落在 .5 的直接显示 .5，不再记「未计入」。
 * 精确算术：每档用 .dat 乘数换算的整数百分比 p（构建时已与加成文本逐时代对账一致），
 * 折后价 = 原价 × Π(100 − p) / 100^k，分子分母全程整数，最后一步才取整。
 */
import civsRaw from '../data/civs.json';
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
  /** 每种资源的精确有理数价 num / den（整数） */
  const num: Record<string, number> = {},
    den: Record<string, number> = {};
  Object.entries(base).forEach(([r, v]) => ((num[r] = v), (den[r] = 1)));
  const applied: AppliedLine[] = [],
    unsupported: CostBonusLine[] = [],
    half: (CostBonusLine & { res: string[] })[] = [];
  (table[civEn] ?? []).forEach((d) => {
    const gs = d.groups.filter((g) => g.units.includes(u.id));
    if (!gs.length) return;
    const touched = gs.flatMap((g) => g.res).filter((r) => base[r]);
    if (!touched.length) return;
    if (!d.ok) return unsupported.push(lineOf(civEn, d));
    const live = gs.filter((g) => g.tiers[String(age)] !== undefined);
    if (!live.length) return; // 该时代尚未生效
    const step: Record<string, number> = {},
      cnt: Record<string, number> = {};
    let pct = 0;
    live.forEach((g) => {
      pct = Math.round((1 - g.tiers[String(age)]!) * 100);
      g.res.forEach((r) => {
        if (!base[r]) return;
        step[r] = (step[r] ?? 1) * (100 - pct);
        cnt[r] = (cnt[r] ?? 0) + 1;
      });
    });
    const scale = (r: string) => 100 ** cnt[r]!;
    Object.keys(step).forEach((r) => {
      num[r] = num[r]! * step[r]!;
      den[r] = den[r]! * scale(r);
    });
    const res = [...new Set(live.flatMap((g) => g.res))];
    applied.push({ ...lineOf(civEn, d), pct, res: ALL.every((r) => res.includes(r)) ? null : res });
  });
  const exact: Cost = {},
    cost: Cost = {};
  Object.keys(base).forEach((r) => {
    exact[r] = num[r]! / den[r]!;
    cost[r] = roundHalfPrice(num[r]! / den[r]!);
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
