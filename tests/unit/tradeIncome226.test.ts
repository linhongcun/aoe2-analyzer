import { beforeAll, describe, expect, it } from 'vitest';
import { civs, loadCore, loadTrees } from '../../src/data';
import { discountedCost } from '../../src/domain/costDiscount';
import { calculateProduction, DEFAULT_PRODUCTION, type ProductionConfig, type ProductionContext } from '../../src/domain/production';
import {
  calculateTradeIncome,
  decodeTradeIncome,
  decodeTradeProduction,
  encodeTradeIncome,
  newTradeIncomeConfig,
  tradeIncomeFromProduction,
  tradeIncomeProductionHref,
  tradeIncomeUnits,
  TRADE_INCOME_RES,
  type TradeIncomeConfig,
} from '../../src/domain/tradeIncome';

let ctx: ProductionContext;
beforeAll(async () => {
  ctx = { core: await loadCore(), trees: await loadTrees() };
});
const plan = (c: Partial<TradeIncomeConfig> = {}): TradeIncomeConfig => ({ ...newTradeIncomeConfig(), ...c });
const run = (c: Partial<TradeIncomeConfig> = {}) => calculateTradeIncome(ctx, plan(c));
const production = (p: Partial<ProductionConfig> = {}): ProductionConfig => ({
  ...DEFAULT_PRODUCTION,
  techs: [],
  rows: [{ unit: 38, building: 101, count: '2' }],
  ...p,
});

describe('#226 实测商路供给', () => {
  it('周期分母、数量分子，黄金供需与整数缺口', () => {
    const one = run({ gold: '100', cycle: '120', count: '10', target: '601' });
    expect(one.errors).toEqual([]);
    expect(one.single).toBe(50);
    expect(one.total).toBe(500);
    expect(one.needed).toBe(13);
    expect(one.additional).toBe(3);
    expect(one.balance).toBe(-101);
    expect(run({ cycle: '240' }).single).toBe(one.single! / 2);
    expect(run({ count: '20' }).total).toBe(one.total! * 2);
    expect(run({ target: '1' }).needed).toBe(1);
    expect(run({ target: '500' }).additional).toBe(0);
    expect(run({ target: '500' }).balance).toBe(0);
  });
  it('零目标为零，零产出正目标无有限方案；零当前数量仍可规划', () => {
    expect(run({ gold: '0', target: '0' }).needed).toBe(0);
    const noIncome = run({ gold: '0', target: '10' });
    expect(noIncome.errors).toEqual([]);
    expect(noIncome.needed).toBeNull();
    expect(noIncome.neededInvestment).toBeNull();
    expect(noIncome.total).toBe(0);
    expect(run({ count: '0' }).needed).toBe(12);
    expect(run({ count: '0' }).investment.Wood).toBe(0);
  });
  it('整数向上取整用十进制输入的精确比例，临界值不多造或少造', () => {
    expect(run({ gold: '0.1', cycle: '180', target: '0.1' }).needed).toBe(3);
    expect(run({ gold: '0.1', cycle: '180', target: '0.10000000000000001' }).needed).toBe(4);
    expect(run({ gold: '0.1', cycle: '180', target: '0.09999999999999999' }).needed).toBe(3);
  });
  it.each(['', '0', '-1', 'NaN', 'Infinity', '1e2', ' 2', '1000001'])('完整周期 %j 不能洗成默认有效值', (cycle) => {
    const r = run({ cycle });
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.total).toBeNull();
    expect(r.needed).toBeNull();
  });
  it.each(['', '-1', 'NaN', 'Infinity', '0x10', '1000001', ' 1'])('交金量和目标 %j 拒绝', (raw) => {
    expect(run({ gold: raw }).errors.length).toBeGreaterThan(0);
    expect(run({ target: raw }).errors.length).toBeGreaterThan(0);
  });
  it.each(['', '-1', '0.5', 'NaN', 'Infinity', '1000001'])('当前数量 %j 拒绝', (count) => {
    expect(run({ count }).errors.length).toBeGreaterThan(0);
  });
  it('极端比值和需要数量超出精确范围时暂停，不显示无穷或假精度', () => {
    expect(run({ cycle: '0.00000000000000000001' }).errors.length).toBeGreaterThan(0);
    expect(run({ gold: '0.00000000000000000001' }).errors.length).toBeGreaterThan(0);
  });
  it('所有文明和时代候选复用生产模型；黑暗时代无车船', () => {
    for (const v of civs) {
      expect(tradeIncomeUnits(ctx, { civ: v.en, age: 1 })).toEqual([]);
      for (const age of [2, 3, 4])
        for (const unit of tradeIncomeUnits(ctx, { civ: v.en, age })) {
          expect([17, 128]).toContain(unit.id);
          expect(unit.civs).toContain(v.en);
          expect(unit.age).toBeLessThanOrEqual(age);
          expect(run({ civ: v.en, age, unit: unit.id }).errors).toEqual([]);
        }
    }
    for (const c of [{ civ: 'bad' }, { age: 1 }, { age: 9 }, { unit: 83 }]) expect(run(c).errors.length).toBeGreaterThan(0);
  });
  it('实测收益不再叠加西班牙、孟加拉、柏柏尔或车船科技', () => {
    const base = run();
    for (const civ of ['Spanish', 'Bengalis', 'Berbers', 'Italians', 'Portuguese'])
      for (const unit of [17, 128]) {
        const r = run({ civ, unit });
        expect(r.errors).toEqual([]);
        expect(r.single).toBe(base.single);
        expect(r.total).toBe(base.total);
      }
  });
  it('基价及已核常驻折扣直接复用 cost model，投资各资源分列', () => {
    for (const civ of ['Franks', 'Portuguese', 'Koreans', 'Italians'])
      for (const unit of [17, 128]) {
        const r = run({ civ, unit });
        const expected = discountedCost(ctx.core.unitById[unit]!, civ, 4).cost;
        expect(r.cost).toEqual(expected);
        for (const res of TRADE_INCOME_RES) expect(r.investment[res]).toBe((expected[res] ?? 0) * 10);
        expect(r.currentPopulation).toBe(r.populationEach! * 10);
        expect(r.neededPopulation).toBe(r.populationEach! * 12);
      }
  });
  it('手填价格必须逐资源已知并注明来源；确认零价格有效', () => {
    const manual = { priceMode: 'manual' as const, prices: { Food: '0', Wood: '75.5', Gold: '0', Stone: '1' }, priceSource: '本局生产面板' };
    const r = run(manual);
    expect(r.errors).toEqual([]);
    expect(r.investment.Wood).toBe(755);
    expect(r.investment.Gold).toBe(0);
    expect(r.costNotes).toContain('手填实际单价：本局生产面板');
    expect(run({ ...manual, priceSource: '' }).errors.length).toBeGreaterThan(0);
    for (const bad of ['', '-1', 'Infinity', 'NaN']) expect(run({ ...manual, prices: { ...manual.prices, Gold: bad } }).errors.length).toBeGreaterThan(0);
  });
});

describe('#226 生产方案原配置与 URL 边界', () => {
  it('嵌入原方案并由 calculateProduction 求未舍入金耗，保持原科技和文明', () => {
    for (const source of [production(), production({ civ: 'Huns', age: 4, techs: [315], rows: [{ unit: 38, building: 101, count: '3' }] })]) {
      const config = tradeIncomeFromProduction(source);
      const r = calculateTradeIncome(ctx, config);
      expect(r.errors).toEqual([]);
      expect(r.production).toEqual(source);
      expect(r.target).toBe(calculateProduction(ctx, source).resources.find((x) => x.key === 'Gold')!.spend);
      expect(tradeIncomeProductionHref(source)).toBe('/trade-income?' + encodeTradeIncome(config));
    }
  });
  it('原方案零金耗可用，手动目标与来源方案不互相冒充', () => {
    const r = calculateTradeIncome(ctx, tradeIncomeFromProduction(production({ rows: [{ unit: 83, building: 109, count: '1' }] })));
    expect(r.target).toBe(0);
    expect(r.needed).toBe(0);
    const manual = run({ targetMode: 'manual', target: '77', source: 'bad' });
    expect(manual.target).toBe(77);
    expect(manual.production).toBeNull();
  });
  it.each([
    '',
    'civ=Franks',
    'civ=Franks&age=3&walk=3&farm=1&techs=&rows=38:101:1&x=1',
    'civ=Franks&age=3&age=4&walk=3&farm=1&techs=&rows=38:101:1',
    'civ=Franks&age=3&walk=0x1&farm=1&techs=&rows=',
    'civ=Franks&age=3&walk=3&farm=1&techs=315,315&rows=',
    'civ=Franks&age=3&walk=3&farm=1&techs=&rows=38:101:-1',
  ])('损坏生产来源不能默认修复 %j', (source) => {
    expect(decodeTradeProduction(source).errors.length).toBeGreaterThan(0);
    const r = run({ targetMode: 'production', source });
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.total).toBeNull();
  });
  it('文明不可训练、超额数量、未知科技不能成为有效生产目标', () => {
    for (const p of [production({ civ: 'Aztecs' }), production({ rows: [{ unit: 38, building: 101, count: '101' }] }), production({ techs: [999999] })])
      expect(calculateTradeIncome(ctx, tradeIncomeFromProduction(p)).errors.length).toBeGreaterThan(0);
  });
  it('分享往返保留测量、目标来源和手填单价来源', () => {
    const c = {
      ...tradeIncomeFromProduction(production()),
      gold: '83.5',
      cycle: '211.3',
      count: '0',
      priceMode: 'manual' as const,
      prices: { Food: '0', Wood: '23.5', Gold: '0', Stone: '0' },
      priceSource: '本局，含科技 & 队友',
    };
    expect(decodeTradeIncome('?' + encodeTradeIncome(c))).toEqual({ config: c, errors: [] });
    expect(decodeTradeIncome('').config).toEqual(newTradeIncomeConfig());
  });
  it('版本、缺失、重复、未知、编码、数字或实体坏链接全部显式报告', () => {
    const good = encodeTradeIncome(newTradeIncomeConfig());
    for (const query of [
      good + '&age=3',
      good + '&x=1',
      good.replace('v=1', 'v=2'),
      good.replace('civ=Franks', 'civ=no'),
      good.replace('unit=128', 'unit=83'),
      good.replace('age=4', 'age=2e0'),
      good.replace('gold=100', 'gold=NaN'),
      good.replace('cycle=120', 'cycle=0'),
      good.replace('count=10', 'count=1.5'),
      good.replace('&target=600', ''),
      good + '&bad=%ZZ',
    ])
      expect(decodeTradeIncome(query).errors.length, query).toBeGreaterThan(0);
  });
  it('损坏嵌入来源与外层链接错误独立；只能显式切手动消除来源错误', () => {
    const c = plan({ targetMode: 'production', source: 'broken' });
    const decoded = decodeTradeIncome(encodeTradeIncome(c));
    expect(decoded.errors).toEqual([]);
    expect(calculateTradeIncome(ctx, decoded.config).errors.length).toBeGreaterThan(0);
    expect(calculateTradeIncome(ctx, { ...c, targetMode: 'manual', source: '' }).errors).toEqual([]);
    expect(decodeTradeIncome(encodeTradeIncome(c) + '&age=2').errors.length).toBeGreaterThan(0);
  });
  it('坏 UTF8 编码不能静默解码成替代字符', () => {
    expect(decodeTradeIncome(encodeTradeIncome(newTradeIncomeConfig()).replace('priceSource=', 'priceSource=%FF')).errors.length).toBeGreaterThan(0);
    expect(decodeTradeProduction('civ=Franks&age=3&walk=3&farm=1&techs=&rows=%FF').errors.length).toBeGreaterThan(0);
  });
});
