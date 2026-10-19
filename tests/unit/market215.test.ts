import { describe, expect, it } from 'vitest';
import {
  MARKET_DATA,
  MARKET_LOT_LIMIT,
  calculateMarket,
  decodeMarket,
  defaultMarketConfig,
  defaultMarketPlan,
  encodeMarket,
  marketErrors,
  marketFee,
  marketHasGuilds,
  marketQuote,
  type MarketPlan,
} from '../../src/domain/market';

const funded = (): MarketPlan => ({ ...defaultMarketPlan(), stock: { Food: '1000000', Wood: '1000000', Gold: '1000000000', Stone: '1000000' }, orders: [] });

describe('issue 215 pinned market fees', () => {
  it('keeps engine assumptions distinct from the pinned fee evidence', () => {
    expect(MARKET_DATA.meta.datSha256).toBe('4aa2f0a719e88e5f1502517eddb27c669aeb40c2fe9d8c4f3eec7751c01e7baa');
    expect(MARKET_DATA.meta.feeResource).toBe(78);
    expect(MARKET_DATA.meta.engineVerifiedInPinnedBuild).toBe(false);
    expect(MARKET_DATA.engine.sources.every((source) => source.url.startsWith('https://'))).toBe(true);
  });
  it('resolves available Guilds, Saracens and Grand Trunk Road without stacking', () => {
    const plan = funded();
    expect(marketFee(plan)).toBe(0.3);
    expect(marketFee({ ...plan, guilds: true })).toBe(0.15);
    expect(marketFee({ ...plan, civ: 'Saracens' })).toBe(0.05);
    expect(marketFee({ ...plan, civ: 'Hindustanis', unique: true })).toBe(0.1);
    expect(marketHasGuilds('Saracens')).toBe(false);
    expect(marketHasGuilds('Hindustanis')).toBe(false);
    expect(marketErrors({ ...plan, civ: 'Saracens', guilds: true })).toContain('该文明没有行会，请取消已研究状态。');
  });
});

describe('issue 215 ordered budget model (not a live-game regression fixture)', () => {
  it('matches the official initial food quote and keeps base price separate', () => {
    expect(marketQuote(115, 0.3)).toEqual({ base: 115, buy: 150, sell: 81 });
    expect(marketQuote(100, 0.3)).toEqual({ base: 100, buy: 130, sell: 70 });
    expect(marketQuote(130, 0.3)).toEqual({ base: 130, buy: 169, sell: 91 });
  });
  it('accounts for selling stone before buying food, with per-resource balances', () => {
    const result = calculateMarket(defaultMarketPlan());
    expect(result.errors).toEqual([]);
    expect(result.failure).toBeUndefined();
    expect(result.trades.map((trade) => trade.gold)).toEqual([91, 90, -150]);
    expect(result.stock).toEqual({ Food: 100, Wood: 0, Gold: 31, Stone: 0 });
    expect(result.delta).toEqual({ Food: 100, Wood: 0, Gold: 31, Stone: -200 });
    expect(result.spent).toBe(150);
    expect(result.received).toBe(181);
    expect(result.quotes.Stone.base).toBe(126);
    expect(result.quotes.Food.base).toBe(117);
    expect(result.quotes.Wood.base).toBe(100);
  });
  it('rounds each lot before accumulating and expands bulk into identical single lots', () => {
    const plan = funded();
    plan.orders = [{ resource: 'Food', direction: 'buy', lots: '3' }];
    const bulk = calculateMarket(plan);
    expect(bulk.trades.map((trade) => trade.gold)).toEqual([-150, -152, -155]);
    expect(bulk.spent).toBe(457);
    const singles = calculateMarket({
      ...plan,
      orders: Array.from({ length: 3 }, () => ({ resource: 'Food' as const, direction: 'buy' as const, lots: '1' })),
    });
    expect(singles.stock).toEqual(bulk.stock);
    expect(singles.quotes).toEqual(bulk.quotes);
    expect(singles.spent).toBe(bulk.spent);
  });
  it('reorders transactions and recalculates the later quote', () => {
    const plan = funded();
    plan.orders = [
      { resource: 'Wood', direction: 'buy', lots: '1' },
      { resource: 'Wood', direction: 'sell', lots: '1' },
    ];
    expect(calculateMarket(plan).trades.map((trade) => trade.gold)).toEqual([-130, 71]);
    expect(calculateMarket({ ...plan, orders: [...plan.orders].reverse() }).trades.map((trade) => trade.gold)).toEqual([70, -127]);
  });
  it('stops inside an operation at the first unaffordable lot and preserves only the executed prefix', () => {
    const plan = funded();
    plan.stock.Gold = '302';
    plan.orders = [
      { resource: 'Food', direction: 'buy', lots: '3' },
      { resource: 'Stone', direction: 'sell', lots: '1' },
    ];
    const result = calculateMarket(plan);
    expect(result.failure).toEqual({ order: 1, lot: 3, resource: 'Gold', needed: 155, available: 0 });
    expect(result.trades).toHaveLength(2);
    expect(result.spent).toBe(302);
    expect(result.received).toBe(0);
    expect(result.stock.Gold).toBe(0);
    expect(result.quotes.Food.base).toBe(119);
    expect(result.quotes.Stone.base).toBe(130);
    expect(
      calculateMarket({ ...funded(), stock: { ...funded().stock, Stone: '99' }, orders: [{ resource: 'Stone', direction: 'sell', lots: '1' }] }).failure,
    ).toEqual({ order: 1, lot: 1, resource: 'Stone', needed: 100, available: 99 });
  });
  it('clamps both base-price boundaries and uses the official minimum quotes without an obsolete 25-gold floor', () => {
    const plan = funded();
    plan.base.Wood = '21';
    plan.orders = [{ resource: 'Wood', direction: 'sell', lots: '2' }];
    expect(calculateMarket(plan).trades.map((trade) => trade.next.base)).toEqual([20, 20]);
    plan.base.Wood = '9998';
    plan.orders[0]!.direction = 'buy';
    expect(calculateMarket(plan).trades.map((trade) => trade.next.base)).toEqual([9999, 9999]);
    expect(marketQuote(20, 0.05).buy).toBe(21);
    expect(marketQuote(20, 0.15).buy).toBe(23);
  });
  it('executes large orders across the boundary while retaining exact sums', () => {
    const plan = funded();
    plan.orders = [{ resource: 'Wood', direction: 'buy', lots: '5000' }];
    const result = calculateMarket(plan);
    expect(result.trades).toHaveLength(5000);
    expect(result.quotes.Wood.base).toBe(MARKET_DATA.engine.maxBase);
    expect(result.spent).toBe(result.trades.reduce((sum, trade) => sum - trade.gold, 0));
  });
  it('leaves a no-transaction inventory unchanged and never mutates input', () => {
    const plan = funded(),
      before = structuredClone(plan);
    const result = calculateMarket(plan);
    expect(result.stock.Gold).toBe(Number(plan.stock.Gold));
    expect(result.delta).toEqual({ Food: 0, Wood: 0, Gold: 0, Stone: 0 });
    expect(result.trades).toEqual([]);
    expect(plan).toEqual(before);
  });
  it.each(['', '-1', '1.5', '1e3', 'Infinity', 'NaN', '1000000001'])('rejects invalid stock %s instead of quietly computing', (bad) => {
    const plan = funded();
    plan.stock.Gold = bad;
    expect(calculateMarket(plan).errors.length).toBeGreaterThan(0);
    expect(calculateMarket(plan).trades).toEqual([]);
  });
  it('rejects invalid quantities, prices, civilization and total work limit', () => {
    const plan = funded();
    plan.base.Food = '19';
    expect(marketErrors(plan).length).toBeGreaterThan(0);
    plan.base.Food = '10000';
    expect(marketErrors(plan).length).toBeGreaterThan(0);
    plan.base.Food = '115';
    plan.civ = 'invalid';
    expect(marketErrors(plan).length).toBeGreaterThan(0);
    plan.civ = 'Britons';
    for (const lots of ['0', '-1', '1.5', '', String(MARKET_LOT_LIMIT + 1)]) {
      plan.orders = [{ resource: 'Food', direction: 'buy', lots }];
      expect(marketErrors(plan).length).toBeGreaterThan(0);
    }
    plan.orders = Array.from({ length: 2 }, () => ({ resource: 'Food' as const, direction: 'buy' as const, lots: '6000' }));
    expect(marketErrors(plan)).toContain('每个方案合计最多 10000 笔交易。');
  });
});

describe('issue 215 shared plans', () => {
  it('rejects duplicate version and state parameters even when the first value is valid', () => {
    const valid = encodeMarket(defaultMarketConfig());
    for (const suffix of ['&v=2', '&v=1', '&state=bad', '&state=%7B%7D']) {
      expect(decodeMarket('?' + valid + suffix).errors).toHaveLength(1);
    }
  });
  it('roundtrips both independent plans, ordered operations, base prices and raw editing input', () => {
    const config = defaultMarketConfig();
    config.plans[1].civ = 'Saracens';
    config.plans[1].base.Food = '201';
    config.plans[1].orders.reverse();
    config.plans[1].stock.Gold = '';
    expect(decodeMarket('?' + encodeMarket(config))).toEqual({ config, errors: [] });
    expect(config.plans[0].civ).toBe('Britons');
  });
  it.each(['?v=2&state={}', '?v=1&state=null', '?v=1&state=%7Bbad', '?v=1&state=%7B%22plans%22:%5Bnull,null%5D%7D', '?v=1&foo=x'])(
    'rejects malformed links %s',
    (search) => {
      expect(decodeMarket(search).errors).toHaveLength(1);
    },
  );
});
