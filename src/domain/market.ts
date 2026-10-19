/** Ordered market budgets. Fees come from pinned .dat; engine assumptions are audited separately. */
import raw from '../data/market.json';
import { civs } from '../data';
import { RES_ZH } from './ratings';

export const MARKET_RESOURCES = ['Food', 'Wood', 'Stone'] as const;
export const STOCK_RESOURCES = ['Food', 'Wood', 'Gold', 'Stone'] as const;
export type MarketResource = (typeof MARKET_RESOURCES)[number];
export type StockResource = (typeof STOCK_RESOURCES)[number];
export type MarketStock = Record<StockResource, number>;
export interface MarketOrder {
  resource: MarketResource;
  direction: 'buy' | 'sell';
  lots: string;
}
export interface MarketPlan {
  civ: string;
  guilds: boolean;
  unique: boolean;
  stock: Record<StockResource, string>;
  base: Record<MarketResource, string>;
  orders: MarketOrder[];
}
export interface MarketConfig {
  plans: [MarketPlan, MarketPlan];
}
export interface MarketQuote {
  base: number;
  buy: number;
  sell: number;
}
export interface MarketTrade {
  order: number;
  lot: number;
  resource: MarketResource;
  direction: 'buy' | 'sell';
  gold: number;
  stock: MarketStock;
  next: MarketQuote;
}
export interface MarketFailure {
  order: number;
  lot: number;
  resource: StockResource;
  needed: number;
  available: number;
}
export interface MarketResult {
  errors: string[];
  fee: number;
  trades: MarketTrade[];
  stock: MarketStock;
  delta: MarketStock;
  quotes: Record<MarketResource, MarketQuote>;
  spent: number;
  received: number;
  failure?: MarketFailure;
}
interface Fee {
  fee: number;
  tech: number;
}
export const MARKET_DATA = raw as typeof raw & {
  civFees: Record<string, Fee | undefined>;
  uniqueFees: Record<string, (Fee & { name: string }) | undefined>;
};
export const MARKET_ORDER_LIMIT = 20;
export const MARKET_LOT_LIMIT = 10000;
export const MARKET_STOCK_LIMIT = 1_000_000_000;
export const defaultMarketPlan = (): MarketPlan => ({
  civ: 'Britons',
  guilds: false,
  unique: false,
  stock: { Food: '0', Wood: '0', Gold: '0', Stone: '200' },
  base: Object.fromEntries(MARKET_RESOURCES.map((r) => [r, String(raw.engine.initial[r])])) as Record<MarketResource, string>,
  orders: [
    { resource: 'Stone', direction: 'sell', lots: '2' },
    { resource: 'Food', direction: 'buy', lots: '1' },
  ],
});
export const defaultMarketConfig = (): MarketConfig => ({ plans: [defaultMarketPlan(), defaultMarketPlan()] });
export const marketHasGuilds = (civ: string) => (MARKET_DATA.guilds.civs as string[]).includes(civ);

export function marketFee(plan: Pick<MarketPlan, 'civ' | 'guilds' | 'unique'>): number {
  if (MARKET_DATA.civFees[plan.civ]) return MARKET_DATA.civFees[plan.civ]!.fee;
  if (plan.unique && MARKET_DATA.uniqueFees[plan.civ]) return MARKET_DATA.uniqueFees[plan.civ]!.fee;
  return plan.guilds && marketHasGuilds(plan.civ) ? MARKET_DATA.guilds.fee : MARKET_DATA.baseFee;
}

/** Decimal percentage arithmetic avoids binary .5 drift; rounding is applied to each lot. */
export function marketQuote(base: number, fee: number): MarketQuote {
  const percent = Math.round(fee * 100);
  return {
    base,
    buy: Math.floor((base * (100 + percent) + 50) / 100),
    sell: Math.floor((base * (100 - percent) + 50) / 100),
  };
}
const zeroStock = (): MarketStock => ({ Food: 0, Wood: 0, Gold: 0, Stone: 0 });
const integer = (value: unknown, min: number, max: number): value is string =>
  typeof value === 'string' && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max;

export function marketErrors(plan: MarketPlan): string[] {
  const errors: string[] = [];
  if (!civs.some((c) => c.en === plan.civ)) errors.push('请选择有效文明。');
  if (plan.guilds && !marketHasGuilds(plan.civ)) errors.push('该文明没有行会，请取消已研究状态。');
  if (plan.unique && !MARKET_DATA.uniqueFees[plan.civ]) errors.push('该文明没有改变手续费的特色科技。');
  if (typeof plan.guilds !== 'boolean' || typeof plan.unique !== 'boolean') errors.push('科技状态无效。');
  for (const r of STOCK_RESOURCES) if (!integer(plan.stock[r], 0, MARKET_STOCK_LIMIT)) errors.push(`${RES_ZH[r]}初始库存须为 0–${MARKET_STOCK_LIMIT} 的整数。`);
  for (const r of MARKET_RESOURCES)
    if (!integer(plan.base[r], raw.engine.minBase, raw.engine.maxBase))
      errors.push(`${RES_ZH[r]}手续费前基价须为 ${raw.engine.minBase}–${raw.engine.maxBase} 的整数。`);
  if (plan.orders.length > MARKET_ORDER_LIMIT) errors.push(`最多 ${MARKET_ORDER_LIMIT} 项操作。`);
  let total = 0;
  plan.orders.forEach((order, index) => {
    if (!(MARKET_RESOURCES as readonly string[]).includes(order.resource) || !['buy', 'sell'].includes(order.direction))
      errors.push(`第 ${index + 1} 项交易方向或资源无效。`);
    if (!integer(order.lots, 1, MARKET_LOT_LIMIT)) errors.push(`第 ${index + 1} 项数量须为 1–${MARKET_LOT_LIMIT} 笔的整数。`);
    else total += Number(order.lots);
  });
  if (total > MARKET_LOT_LIMIT) errors.push(`每个方案合计最多 ${MARKET_LOT_LIMIT} 笔交易。`);
  return errors;
}

export function calculateMarket(plan: MarketPlan): MarketResult {
  const errors = marketErrors(plan),
    fee = marketFee(plan);
  const initial = Object.fromEntries(STOCK_RESOURCES.map((r) => [r, Number(plan.stock[r])])) as MarketStock;
  const stock = errors.length ? zeroStock() : { ...initial };
  const base = Object.fromEntries(MARKET_RESOURCES.map((r) => [r, Number(plan.base[r])])) as Record<MarketResource, number>;
  const quotes = Object.fromEntries(MARKET_RESOURCES.map((r) => [r, marketQuote(base[r], fee)])) as Record<MarketResource, MarketQuote>;
  const result: MarketResult = { errors, fee, trades: [], stock, delta: zeroStock(), quotes, spent: 0, received: 0 };
  if (errors.length) return result;
  outer: for (const [orderIndex, order] of plan.orders.entries()) {
    for (let lot = 1; lot <= Number(order.lots); lot++) {
      const quote = marketQuote(base[order.resource], fee);
      const required = order.direction === 'buy' ? quote.buy : raw.engine.lot;
      const from: StockResource = order.direction === 'buy' ? 'Gold' : order.resource;
      if (stock[from] < required) {
        result.failure = { order: orderIndex + 1, lot, resource: from, needed: required, available: stock[from] };
        break outer;
      }
      const gold = order.direction === 'buy' ? -quote.buy : quote.sell;
      stock.Gold += gold;
      stock[order.resource] += order.direction === 'buy' ? raw.engine.lot : -raw.engine.lot;
      result.spent += Math.max(0, -gold);
      result.received += Math.max(0, gold);
      base[order.resource] = Math.min(
        raw.engine.maxBase,
        Math.max(raw.engine.minBase, base[order.resource] + (order.direction === 'buy' ? raw.engine.step : -raw.engine.step)),
      );
      quotes[order.resource] = marketQuote(base[order.resource], fee);
      result.trades.push({
        order: orderIndex + 1,
        lot,
        resource: order.resource,
        direction: order.direction,
        gold,
        stock: { ...stock },
        next: { ...quotes[order.resource] },
      });
    }
  }
  for (const r of STOCK_RESOURCES) result.delta[r] = stock[r] - initial[r];
  return result;
}

export const encodeMarket = (config: MarketConfig) => new URLSearchParams({ v: '1', state: JSON.stringify(config) }).toString();
/** Strict shape checks happen before accessing shared-link objects; invalid links never produce results. */
export function decodeMarket(search: string): { config: MarketConfig; errors: string[] } {
  const params = new URLSearchParams(search);
  if (!params.toString()) return { config: defaultMarketConfig(), errors: [] };
  try {
    if (
      params.getAll('v').length !== 1 ||
      params.getAll('state').length !== 1 ||
      params.get('v') !== '1' ||
      [...params.keys()].some((key) => !['v', 'state'].includes(key)) ||
      (params.get('state')?.length ?? 0) > 18000
    )
      throw new Error();
    const data: unknown = JSON.parse(params.get('state') ?? 'null');
    if (!data || typeof data !== 'object' || !('plans' in data) || !Array.isArray(data.plans) || data.plans.length !== 2) throw new Error();
    for (const plan of data.plans) {
      if (
        !plan ||
        typeof plan !== 'object' ||
        typeof plan.civ !== 'string' ||
        typeof plan.guilds !== 'boolean' ||
        typeof plan.unique !== 'boolean' ||
        !plan.stock ||
        !plan.base ||
        !Array.isArray(plan.orders) ||
        plan.orders.length > MARKET_ORDER_LIMIT
      )
        throw new Error();
      if (!STOCK_RESOURCES.every((r) => typeof plan.stock[r] === 'string') || !MARKET_RESOURCES.every((r) => typeof plan.base[r] === 'string'))
        throw new Error();
      if (!plan.orders.every((o: MarketOrder) => o && typeof o.resource === 'string' && typeof o.direction === 'string' && typeof o.lots === 'string'))
        throw new Error();
    }
    return { config: data as MarketConfig, errors: [] };
  } catch {
    return { config: defaultMarketConfig(), errors: ['方案链接无效或版本不支持，已暂停编辑与计算；请重置方案后继续。'] };
  }
}
