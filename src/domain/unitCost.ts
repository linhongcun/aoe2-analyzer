/**
 * 单位折后费用的唯一叠加实现（issue 858 / D3）。
 *
 * 基础价取 discountedCost 的 exact。已选科技的费用效果按出现顺序做 set / mul / add，
 * 每一步资源都用 Math.max(0, …) 归零，显示价统一 roundHalfPrice。
 * 带资源标记或无法解码的费用操作整项不套用，并列入 undecoded。
 *
 * 开局模拟仍先把文明效果收成 costAdd / costMul，再调用 applyAggregatedResource。
 * 那条路径的取整也在这里：legacy 文明用 Math.round，其余用 roundHalfPrice。
 */
import { priceFromRawFactor } from './costPolicy';
import { DAT, type DatCostDiscount } from './datEffects';
import { discountedCost, type CostDiscount } from './costDiscount';
import { applyEffectValue } from './numericEffects';
import type { Cost } from './types';

export const UNIT_COST_RESOURCES = ['Food', 'Wood', 'Gold', 'Stone'] as const;
export type UnitCostResource = (typeof UNIT_COST_RESOURCES)[number];

const COST_ATTR: Record<number, UnitCostResource | 'all'> = {
  100: 'all',
  103: 'Food',
  104: 'Wood',
  105: 'Gold',
  106: 'Stone',
};
const COST_OPS = new Set(['set', 'mul', 'add']);

export interface UnitCostEffect {
  a?: number;
  op: string;
  v: number;
  t?: number[];
  res?: number;
}

export interface UnitCostTech {
  id: number;
  en: string;
  zh: string;
  /** 缺省时读 DAT.techs[en].eco。测试可注入，避免改数据文件。 */
  effects?: readonly UnitCostEffect[];
}

export interface UnitCostApplied {
  id: number;
  zh: string;
}

export interface UnitCostUndecoded {
  techId: number;
  tech: string;
  reason: string;
  res?: number;
  attr?: number;
  op?: string;
}

export interface UnitCostResult {
  exact: Cost;
  /** 显示价，与计算用价相同，就近 0.5 */
  cost: Cost;
  appliedTechs: UnitCostApplied[];
  undecoded: UnitCostUndecoded[];
  discount: CostDiscount;
}

export interface UnitCostOptions {
  techIds?: ReadonlySet<number>;
  table?: Record<string, DatCostDiscount[]>;
}

/** legacy 开局沿用整数 Math.round；其余口径统一 roundHalfPrice。 */
export function finalizeUnitPrice(exact: number, legacy = false): number {
  return priceFromRawFactor(exact, 1, legacy);
}

export interface AggregatedResourceMod {
  /** 缺省表示这一资源没有加减。 */
  add?: number;
  /**
   * 缺省表示不乘、也不取整。
   * 开局里没有任何费用倍率时保持这个旧口径，避免把整数基础价再取一次整。
   */
  factor?: number;
}

/** 开局聚合：先加并归零，有倍率时再乘并取整。乘和取整只走 priceFromRawFactor。 */
export function applyAggregatedResource(base: number, mod: AggregatedResourceMod, legacy = false): number {
  const added = mod.add !== undefined ? Math.max(0, base + mod.add) : base;
  if (mod.factor === undefined) return added;
  return priceFromRawFactor(added, mod.factor, legacy);
}

function techEffects(tech: UnitCostTech): readonly UnitCostEffect[] {
  if (tech.effects) return tech.effects;
  return DAT.techs[tech.en]?.eco ?? [];
}

function applyCostEffect(exact: Cost, effect: UnitCostEffect) {
  const which = COST_ATTR[effect.a!];
  if (!which) return;
  const keys = which === 'all' ? UNIT_COST_RESOURCES : [which];
  for (const key of keys) exact[key] = Math.max(0, applyEffectValue(exact[key] ?? 0, effect.op, effect.v));
}

export function unitCost(
  u: { id: number; cost: Cost },
  civEn: string,
  age: number,
  techs: readonly UnitCostTech[] = [],
  opts: UnitCostOptions = {},
): UnitCostResult {
  const discount = discountedCost(u, civEn, age, opts);
  const exact: Cost = { ...discount.exact };
  const appliedTechs: UnitCostApplied[] = [];
  const undecoded: UnitCostUndecoded[] = [];
  for (const tech of techs) {
    const effects = techEffects(tech);
    const markers = effects.filter((effect) => effect.res !== undefined);
    if (markers.length) {
      for (const effect of markers) undecoded.push({ techId: tech.id, tech: tech.zh, reason: '含未解码的资源或条件效果', res: effect.res, op: effect.op });
      continue;
    }
    const costEffects = effects.filter((effect) => effect.a !== undefined && COST_ATTR[effect.a] !== undefined && effect.t?.includes(u.id));
    const invalid = costEffects.filter((effect) => !COST_OPS.has(effect.op));
    if (invalid.length) {
      for (const effect of invalid)
        undecoded.push({
          techId: tech.id,
          tech: tech.zh,
          reason: '费用效果操作未解码',
          attr: effect.a,
          op: effect.op,
        });
      continue;
    }
    if (!costEffects.length) continue;
    for (const effect of costEffects) applyCostEffect(exact, effect);
    appliedTechs.push({ id: tech.id, zh: tech.zh });
  }
  const cost: Cost = {};
  for (const [resource, value] of Object.entries(exact)) cost[resource] = finalizeUnitPrice(value!);
  return { exact, cost, appliedTechs, undecoded, discount };
}
