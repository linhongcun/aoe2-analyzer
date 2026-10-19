/** Issue 226 measured trade supply. Income is user evidence, never an inferred route formula. */
import { civs } from '../data';
import populationRaw from '../data/trade_income.json';
import { discountedCost } from './costDiscount';
import { calculateProduction, decodeProduction, encodeProduction, productionBuildings, type ProductionConfig, type ProductionContext } from './production';
import type { Cost, Unit } from './types';

export const TRADE_INCOME_RES = ['Food', 'Wood', 'Gold', 'Stone'] as const;
export type TradeResource = (typeof TRADE_INCOME_RES)[number];
export const TRADE_INCOME_UNITS = [128, 17] as const;
export const TRADE_INCOME_MAX = 1_000_000;
export interface TradeIncomeConfig {
  civ: string;
  age: number;
  unit: number;
  gold: string;
  cycle: string;
  count: string;
  targetMode: 'manual' | 'production';
  target: string;
  /** Original production URL query, not a rounded spend snapshot. */
  source: string;
  priceMode: 'baseline' | 'manual';
  prices: Record<TradeResource, string>;
  priceSource: string;
}
export const DEFAULT_TRADE_INCOME: TradeIncomeConfig = {
  civ: 'Franks',
  age: 4,
  unit: 128,
  gold: '100',
  cycle: '120',
  count: '10',
  targetMode: 'manual',
  target: '600',
  source: '',
  priceMode: 'baseline',
  prices: { Food: '0', Wood: '0', Gold: '0', Stone: '0' },
  priceSource: '',
};
const population = populationRaw as { units: Record<string, { population: number }> };
const decimal = /^(?:\d+)(?:\.\d+)?$/;
const integer = /^\d+$/;
const validEncoding = (s: string) => {
  try {
    decodeURIComponent(s.replace(/\+/g, ' '));
    return true;
  } catch {
    return false;
  }
};
const within = (s: string, positive = false, whole = false) =>
  s.length <= 32 && (whole ? integer : decimal).test(s) && Number.isFinite(+s) && +s <= TRADE_INCOME_MAX && (positive ? +s > 0 : +s >= 0);
export const newTradeIncomeConfig = (): TradeIncomeConfig => ({ ...DEFAULT_TRADE_INCOME, prices: { ...DEFAULT_TRADE_INCOME.prices } });

// Decimal measurements are exact ratios for the integer ceiling. Avoid adding a cart
// merely because 0.3 / (0.1 * 60 / 60) is represented as 2.9999999999999996 or 3.0000000000000004.
function measuredCeiling(target: string, gold: string, cycle: string): number {
  const fraction = (raw: string) => {
    const parts = raw.split('.');
    return { n: BigInt(parts.join('')), d: 10n ** BigInt(parts[1]?.length ?? 0) };
  };
  const t = fraction(target),
    g = fraction(gold),
    s = fraction(cycle);
  const n = t.n * s.n * g.d,
    d = t.d * s.d * g.n * 60n;
  return Number((n + d - 1n) / d);
}

export function tradeIncomeUnits(ctx: ProductionContext, c: Pick<TradeIncomeConfig, 'civ' | 'age'>): Unit[] {
  const production: ProductionConfig = { ...c, techs: [], walk: 3, farm: 1, rows: [] };
  return TRADE_INCOME_UNITS.flatMap((id) => {
    const u = ctx.core.unitById[id];
    return u && productionBuildings(ctx, production, u).length ? [u] : [];
  });
}

/** The old production decoder intentionally tolerates legacy URLs; embedded sources must be complete and strict. */
export function decodeTradeProduction(source: string): { config: ProductionConfig | null; errors: string[] } {
  const errors: string[] = [];
  const allowed = ['civ', 'age', 'walk', 'farm', 'techs', 'rows'];
  const p = new URLSearchParams(source);
  if (!source || source.length > 6000 || !validEncoding(source)) errors.push('原生产方案为空、过长或编码损坏。');
  for (const key of p.keys()) if (!allowed.includes(key)) errors.push(`原生产方案含未知参数 ${key}。`);
  for (const key of allowed) if (p.getAll(key).length !== 1) errors.push(`原生产方案参数 ${key} 缺失或重复。`);
  if (!/^[1-4]$/.test(p.get('age') ?? '')) errors.push('原生产方案时代格式无效。');
  for (const key of ['walk', 'farm']) if (!decimal.test(p.get(key) ?? '')) errors.push('原生产方案采集距离格式无效。');
  const techs = p.get('techs') ?? '';
  if (
    techs &&
    (!/^\d+(,\d+)*$/.test(techs) || new Set(techs.split(',')).size !== techs.split(',').length || techs.split(',').some((s) => !Number.isSafeInteger(+s)))
  )
    errors.push('原生产方案科技格式无效或重复。');
  const rows = p.get('rows') ?? '';
  if (rows && rows.split(',').some((s) => !/^\d+:\d+:\d+$/.test(s))) errors.push('原生产方案需求格式无效。');
  if (errors.length) return { config: null, errors: [...new Set(errors)] };
  const decoded = decodeProduction(source);
  return { config: decoded.errors.length ? null : decoded.config, errors: decoded.errors };
}

export interface TradeIncomeResult {
  errors: string[];
  warnings: string[];
  unit: Unit | undefined;
  single: number | null;
  total: number | null;
  target: number | null;
  needed: number | null;
  additional: number | null;
  balance: number | null;
  populationEach: number | null;
  currentPopulation: number | null;
  neededPopulation: number | null;
  cost: Cost;
  investment: Cost;
  neededInvestment: Cost | null;
  costNotes: string[];
  production: ProductionConfig | null;
}
export function calculateTradeIncome(ctx: ProductionContext, c: TradeIncomeConfig): TradeIncomeResult {
  const errors: string[] = [],
    warnings: string[] = [],
    costNotes: string[] = [];
  const unit = ctx.core.unitById[c.unit];
  if (!civs.some((v) => v.en === c.civ)) errors.push('文明不存在，请重新选择。');
  if (![1, 2, 3, 4].includes(c.age)) errors.push('时代无效。');
  if (!tradeIncomeUnits(ctx, c).some((u) => u.id === c.unit)) errors.push('当前文明和时代不能训练所选贸易单位，请重新选择。');
  if (!within(c.gold)) errors.push('每次交金量须为 0–1000000 的有限数。');
  if (!within(c.cycle, true)) errors.push('完整周期须为大于 0、不超过 1000000 的有限游戏秒。');
  if (!within(c.count, false, true)) errors.push('当前数量须为 0–1000000 的整数。');
  if (!['manual', 'production'].includes(c.targetMode)) errors.push('目标来源无效。');
  if (!['baseline', 'manual'].includes(c.priceMode)) errors.push('单价来源无效。');
  let target: number | null = null,
    production: ProductionConfig | null = null;
  if (c.targetMode === 'manual') {
    if (!within(c.target)) errors.push('目标黄金须为 0–1000000 的有限数。');
    else target = +c.target;
  } else if (c.targetMode === 'production') {
    const decoded = decodeTradeProduction(c.source);
    errors.push(...decoded.errors.map((s) => `${s} 请显式切换手动目标，或回生产工具重新带入。`));
    if (decoded.config) {
      const result = calculateProduction(ctx, decoded.config);
      errors.push(...result.errors.map((s) => `原生产方案：${s}`));
      if (!result.errors.length) {
        production = decoded.config;
        target = result.resources.find((r) => r.key === 'Gold')!.spend;
        warnings.push(...result.warnings.map((s) => `原生产方案：${s}`));
      }
    }
  }
  const cost: Cost = {};
  if (c.priceMode === 'manual') {
    for (const r of TRADE_INCOME_RES) {
      if (!within(c.prices[r]))
        errors.push(`手填${{ Food: '食物', Wood: '木材', Gold: '黄金', Stone: '石料' }[r]}单价须为 0–1000000 的有限数；未知价格请先核对，不能填作零。`);
      else cost[r] = +c.prices[r];
    }
    if (!c.priceSource.trim() || c.priceSource.length > 200) errors.push('请填写实际单价来源（1–200 字），例如本局生产面板。');
    costNotes.push(`手填实际单价：${c.priceSource}`);
  } else if (unit) {
    const discounted = discountedCost(unit, c.civ, c.age);
    Object.assign(cost, discounted.cost);
    costNotes.push(...discounted.applied.map((a) => a.text || a.label));
    warnings.push(...discounted.unsupported.map((a) => `${a.text || '文明常驻折扣'}：未核实，按基础价。`));
  }
  const result: TradeIncomeResult = {
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    unit,
    single: null,
    total: null,
    target: null,
    needed: null,
    additional: null,
    balance: null,
    populationEach: null,
    currentPopulation: null,
    neededPopulation: null,
    cost,
    investment: {},
    neededInvestment: null,
    costNotes,
    production,
  };
  if (errors.length || target === null) return result;
  const single = (+c.gold * 60) / +c.cycle;
  const total = single * +c.count;
  const needed = target === 0 ? 0 : single === 0 ? null : c.targetMode === 'manual' ? measuredCeiling(c.target, c.gold, c.cycle) : Math.ceil(target / single);
  if (
    ![single, total, target].every((n) => Number.isFinite(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER) ||
    (needed !== null && !Number.isSafeInteger(needed))
  ) {
    return { ...result, errors: ['交金量与周期的比值超出可计算范围，请核对测量值。'] };
  }
  const each = population.units[c.unit]?.population;
  const pop = Number.isFinite(each) && each !== undefined ? each : null;
  const investment = Object.fromEntries(TRADE_INCOME_RES.map((r) => [r, (cost[r] ?? 0) * +c.count]));
  const neededInvestment = needed === null ? null : Object.fromEntries(TRADE_INCOME_RES.map((r) => [r, (cost[r] ?? 0) * needed]));
  if (neededInvestment && Object.values(neededInvestment).some((n) => !Number.isSafeInteger(n) && Math.abs(n) > Number.MAX_SAFE_INTEGER))
    return { ...result, errors: ['目标所需投资超出精确计算范围，请降低目标或核对测量值。'] };
  return {
    ...result,
    single,
    total,
    target,
    needed,
    additional: needed === null ? null : Math.max(0, needed - +c.count),
    balance: total - target,
    populationEach: pop,
    currentPopulation: pop === null ? null : pop * +c.count,
    neededPopulation: pop === null || needed === null ? null : pop * needed,
    investment,
    neededInvestment,
  };
}

const keys = ['v', 'civ', 'age', 'unit', 'gold', 'cycle', 'count', 'mode', 'target', 'source', 'price', 'food', 'wood', 'priceGold', 'stone', 'priceSource'];
export function encodeTradeIncome(c: TradeIncomeConfig): string {
  return new URLSearchParams({
    v: '1',
    civ: c.civ,
    age: String(c.age),
    unit: String(c.unit),
    gold: c.gold,
    cycle: c.cycle,
    count: c.count,
    mode: c.targetMode,
    target: c.target,
    source: c.source,
    price: c.priceMode,
    food: c.prices.Food,
    wood: c.prices.Wood,
    priceGold: c.prices.Gold,
    stone: c.prices.Stone,
    priceSource: c.priceSource,
  }).toString();
}
export function decodeTradeIncome(search: string): { config: TradeIncomeConfig; errors: string[] } {
  const c = newTradeIncomeConfig(),
    errors: string[] = [];
  if (!search || search === '?') return { config: c, errors };
  const p = new URLSearchParams(search);
  if (search.length > 12000 || !validEncoding(search)) errors.push('方案链接过长或编码损坏。');
  for (const key of p.keys()) if (!keys.includes(key)) errors.push(`链接含未知参数 ${key}。`);
  for (const key of keys) if (p.getAll(key).length !== 1) errors.push(`链接参数 ${key} 缺失或重复。`);
  if (p.get('v') !== '1') errors.push('方案链接版本不支持。');
  for (const key of ['civ', 'gold', 'cycle', 'count', 'target', 'source', 'priceSource'] as const) if (p.has(key)) c[key] = p.get(key)!;
  for (const key of ['age', 'unit'] as const) {
    if (integer.test(p.get(key) ?? '') && Number.isSafeInteger(+p.get(key)!)) c[key] = +p.get(key)!;
    else errors.push(`链接参数 ${key} 不是有效整数。`);
  }
  if (!civs.some((v) => v.en === c.civ) || ![1, 2, 3, 4].includes(c.age) || !(TRADE_INCOME_UNITS as readonly number[]).includes(c.unit))
    errors.push('链接中的文明、时代或贸易单位无效。');
  const mode = p.get('mode'),
    price = p.get('price');
  if (mode === 'manual' || mode === 'production') c.targetMode = mode;
  else errors.push('链接中的目标来源无效。');
  if (price === 'manual' || price === 'baseline') c.priceMode = price;
  else errors.push('链接中的单价来源无效。');
  for (const [r, k] of [
    ['Food', 'food'],
    ['Wood', 'wood'],
    ['Gold', 'priceGold'],
    ['Stone', 'stone'],
  ] as const)
    if (p.has(k)) c.prices[r] = p.get(k)!;
  for (const [key, ok] of [
    ['gold', within(c.gold)],
    ['cycle', within(c.cycle, true)],
    ['count', within(c.count, false, true)],
    ['target', within(c.target)],
  ] as const)
    if (!ok) errors.push(`链接参数 ${key} 的数字无效。`);
  if (c.priceSource.length > 200) errors.push('链接中的单价来源过长。');
  if (TRADE_INCOME_RES.some((r) => !within(c.prices[r]))) errors.push('链接中的资源单价无效。');
  return { config: c, errors: [...new Set(errors)] };
}

export function tradeIncomeFromProduction(config: ProductionConfig): TradeIncomeConfig {
  return { ...newTradeIncomeConfig(), civ: config.civ, age: config.age, targetMode: 'production', source: encodeProduction(config) };
}
export const tradeIncomeProductionHref = (config: ProductionConfig): string => '/trade-income?' + encodeTradeIncome(tradeIncomeFromProduction(config));
