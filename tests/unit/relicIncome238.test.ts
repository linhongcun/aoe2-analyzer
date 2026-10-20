import { describe, expect, it } from 'vitest';
import raw from '../../src/data/relic_income.json';
import civs from '../../src/data/civs.json';
import {
  calculateRelicIncome,
  decodeRelicIncome,
  encodeRelicIncome,
  newRelicIncomeConfig,
  RELIC_INPUT_MAX,
  RELIC_RESOURCES,
  relicIncomeShareUrl,
  validRelicIncomeData,
  type RelicIncomeConfig,
  type RelicIncomeData,
} from '../../src/domain/relicIncome';
const data = raw as unknown as RelicIncomeData;
const config = (extra: Partial<RelicIncomeConfig> = {}): RelicIncomeConfig => ({ ...newRelicIncomeConfig(), ...extra });
const run = (extra: Partial<RelicIncomeConfig> = {}) => calculateRelicIncome(config(extra), data);

describe('#238 固定圣物收入与逐来源对账', () => {
  it('全部56文明有固定数据，参数与引擎语义证据分开且不声称客户端实测', () => {
    expect(validRelicIncomeData(raw)).toBe(true);
    expect(Object.keys(data.civs).sort()).toEqual(civs.map((c) => c.en).sort());
    expect(data.meta.engineVerifiedInPinnedBuild).toBe(false);
    expect(data.meta.fieldSemantics.resources).toContain('3dab81b6');
    expect(run().resources.Gold).toEqual({ perMinute: 30, total: 300 });
    for (const civilization of civs) expect(run({ civ: civilization.en }).status).toBe('valid');
  });
  it('0数量的速率及总量均0；0时长保留非零数量速率而总量0', () => {
    for (const resource of RELIC_RESOURCES) expect(run({ count: '0' }).resources[resource]).toEqual({ perMinute: 0, total: 0 });
    expect(run({ minutes: '0', count: '2' }).resources.Gold).toEqual({ perMinute: 60, total: 0 });
    expect(run({ count: '3', minutes: '2.5' }).resources.Gold).toEqual({ perMinute: 90, total: 225 });
  });
  it.each([
    [false, false, false, 30, 0],
    [false, true, false, 39.9, 0],
    [false, false, true, 30, 20],
    [false, true, true, 39.9, 20],
    [true, false, false, 33, 0],
    [true, true, false, 43.89, 0],
    [true, false, true, 33, 20],
    [true, true, true, 43.89, 20],
  ] as const)('大干道=%s 阿兹特克=%s 勃艮第=%s 的单件速率与单来源无神论', (grandTrunkRoad, aztecs, burgundians, gold, food) => {
    for (const atheism of ['none', 'one'] as const) {
      const r = run({
        civ: 'Hindustanis',
        grandTrunkRoad,
        allies: [aztecs ? 'Aztecs' : '', burgundians ? 'Burgundians' : '', ''],
        atheism,
        count: '2',
        minutes: '10',
      });
      const multiplier = atheism === 'one' ? 0.5 : 1;
      expect(r.errors).toEqual([]);
      const rawGold = 30 * (grandTrunkRoad ? 1.100000023841858 : 1) * (aztecs ? 1.3300000429153442 : 1);
      expect(r.resources.Gold.perMinute).toBeCloseTo(rawGold * 2 * multiplier, 8);
      expect(r.resources.Gold.perMinute).toBeCloseTo(gold * 2 * multiplier, 4);
      expect(r.resources.Food.perMinute).toBeCloseTo(food * 2 * multiplier, 8);
      for (const resource of RELIC_RESOURCES) {
        const rows = r.sources.filter((row) => row.resource === resource);
        expect(rows.reduce((sum, row) => sum + row.perMinute!, 0)).toBeCloseTo(r.resources[resource].perMinute!, 8);
        expect(rows.reduce((sum, row) => sum + row.total!, 0)).toBeCloseTo(r.resources[resource].total!, 8);
      }
    }
  });
  it('同一团队来源重复选择、本方和盟友重复均只计一次，保留所有提供者', () => {
    const a = run({ civ: 'Aztecs', allies: ['Aztecs', 'Aztecs', 'Burgundians'] });
    expect(a.resources.Gold.perMinute).toBeCloseTo(39.9);
    expect(a.resources.Food.perMinute).toBe(20);
    expect(a.sources.filter((row) => row.id === 'aztecs-Gold')).toHaveLength(1);
    expect(a.sources.find((row) => row.id === 'aztecs-Gold')?.providers).toHaveLength(3);
    expect(run({ civ: 'Burgundians', allies: ['Burgundians', 'Burgundians', 'Aztecs'] }).resources.Food.perMinute).toBe(20);
    expect(run({ allies: ['Aztecs', 'Aztecs', ''] }).resources.Gold.perMinute).toBeCloseTo(39.9);
    expect(run({ allies: ['', '', ''] }).resources.Gold.perMinute).toBe(30);
  });
  it('印度斯坦大干道仅本方有效；立陶宛修道院工作速度不是收入倍率', () => {
    expect(run({ allies: ['Hindustanis', 'Lithuanians', 'Spanish'] }).resources.Gold.perMinute).toBe(30);
    expect(run({ civ: 'Lithuanians' }).resources.Gold.perMinute).toBe(30);
    expect(run({ civ: 'Franks', grandTrunkRoad: true }).status).toBe('invalid');
    expect(run({ civ: 'Hindustanis', grandTrunkRoad: true }).resources.Gold.perMinute).toBe(30 * 1.100000023841858);
    expect(data.modifiers.aztecs.value).toBe(1.3300000429153442);
    expect(data.modifiers.grandTrunkRoad.value).toBe(1.100000023841858);
  });
  it.each(['multiple', 'unknown', 'changing'] as const)('%s 暂停黄金食物及覆盖，其他资源0不被冒充为完整结果', (atheism) => {
    const r = run({ atheism, allies: ['Aztecs', 'Burgundians', ''], target: '100' });
    expect(r.status).toBe('paused');
    expect(r.errors).toEqual([]);
    expect(r.resources.Gold).toEqual({ perMinute: null, total: null });
    expect(r.resources.Food).toEqual({ perMinute: null, total: null });
    expect(r.resources.Wood).toEqual({ perMinute: 0, total: 0 });
    expect(r.covered).toBeNull();
    expect(r.gap).toBeNull();
    expect(r.sources.filter((row) => row.resource === 'Gold').every((row) => row.perMinute === null && row.total === null)).toBe(true);
  });
  it('目标零不除零，覆盖额不大于目标且缺口不为负', () => {
    expect(run({ target: '0' }).covered).toBe(0);
    expect(run({ target: '0' }).gap).toBe(0);
    expect(run({ target: '100' }).covered).toBe(30);
    expect(run({ target: '100' }).gap).toBe(70);
    expect(run({ target: '20' }).covered).toBe(20);
    expect(run({ target: '20' }).gap).toBe(0);
    expect(run({ count: '0', target: '100' }).gap).toBe(100);
  });
  it('亚美尼亚免费圣物不再次加数量；立陶宛阈值与适用目标不影响PK', () => {
    expect(run({ civ: 'Armenians', count: '2' }).resources.Gold.perMinute).toBe(60);
    expect(run({ civ: 'Armenians' }).warnings.join('')).toContain('不会再加一件');
    expect(data.lithuanians.units.map((u) => u.id)).toEqual([38, 283, 569, 1234, 1236]);
    expect(data.lithuanians.extraRawTargets.map((u) => u.id)).toEqual([1813]);
    for (const count of [0, 1, 2, 3, 4, 5, 100]) expect(run({ civ: 'Lithuanians', count: String(count) }).lithuanian?.bonus).toBe(Math.min(count, 4));
    expect(run({ civ: 'Lithuanians' }).lithuanian?.thresholds).toEqual([1, 2, 3, 4]);
  });
  it.each(['', '-1', '0.5', 'NaN', 'Infinity', '1e3', '0x10', ' 1', '1000001', '1'.repeat(33)])('非法数量%j不退回默认结果', (count) => {
    const r = run({ count });
    expect(r.status).toBe('invalid');
    expect(r.resources.Gold.perMinute).toBeNull();
  });
  it.each(['', '-1', 'NaN', 'Infinity', '1e3', ' 1', '1000001'])('非法时长或目标%j不计算', (value) => {
    expect(run({ minutes: value }).errors.length).toBeGreaterThan(0);
    expect(run({ target: value }).errors.length).toBeGreaterThan(0);
  });
  it('输入上限保持有限，坏数据/文明/队友/枚举明确失败', () => {
    const r = run({
      civ: 'Hindustanis',
      grandTrunkRoad: true,
      count: String(RELIC_INPUT_MAX),
      minutes: String(RELIC_INPUT_MAX),
      allies: ['Aztecs', 'Burgundians', ''],
    });
    expect(r.status).toBe('valid');
    expect(Number.isFinite(r.resources.Gold.total)).toBe(true);
    expect(run({ civ: 'missing' }).errors.length).toBeGreaterThan(0);
    expect(run({ allies: ['missing', '', ''] }).errors.length).toBeGreaterThan(0);
    expect(run({ atheism: 'bad' as RelicIncomeConfig['atheism'] }).errors.length).toBeGreaterThan(0);
    expect(validRelicIncomeData({})).toBe(false);
    const broken = { ...data, baseRates: { ...data.baseRates, Gold: NaN } };
    expect(calculateRelicIncome(config(), broken).status).toBe('invalid');
  });
});

describe('#238 严格分享与可修正语义输入', () => {
  it('首次访问默认；完整恢复全部状态，同文明的不同玩家槽位不丢失', () => {
    expect(decodeRelicIncome('').config).toEqual(newRelicIncomeConfig());
    const c = config({
      civ: 'Hindustanis',
      grandTrunkRoad: true,
      count: '7',
      minutes: '2.75',
      target: '100.5',
      allies: ['Aztecs', 'Aztecs', 'Burgundians'],
      atheism: 'unknown',
    });
    expect(decodeRelicIncome('?' + encodeRelicIncome(c))).toEqual({ config: c, errors: [], structuralErrors: [] });
  });
  it.each([
    (s: string) => s + '&count=2',
    (s: string) => s + '&extra=1',
    (s: string) => s.replace('v=1', 'v=2'),
    (s: string) => s.replace('gtr=0', 'gtr=bad'),
    (s: string) => s.replace('count=1&', ''),
    (s: string) => s.replace('count=1', 'count=%E0%A4'),
    (s: string) => s + '&' + 'x'.repeat(8001),
  ])('结构错误禁止伪装默认恢复', (change) => {
    const decoded = decodeRelicIncome(change(encodeRelicIncome(config())));
    expect(decoded.structuralErrors.length).toBeGreaterThan(0);
    expect(decoded.errors.length).toBeGreaterThan(0);
  });
  it('语义无效值保持原文，结构可恢复，允许页面修正', () => {
    const c = config({ count: '-3', minutes: '', target: 'NaN', civ: 'missing', allies: ['missing', '', ''] });
    const decoded = decodeRelicIncome(encodeRelicIncome(c));
    expect(decoded.config).toEqual(c);
    expect(decoded.structuralErrors).toEqual([]);
    expect(decoded.errors.length).toBeGreaterThan(0);
    expect(decodeRelicIncome(encodeRelicIncome(config())).errors).toEqual([]);
  });
  it('分享清除外层无关查询并保留部署项目base，状态放完整hash不截断', () => {
    const c = config({ allies: ['Aztecs', 'Burgundians', 'Armenians'], count: '999999' });
    const url = new URL(relicIncomeShareUrl(c, 'https://linhongcun.github.io/aoe2-analyzer/?unrelated=1#/old'));
    expect(url.pathname).toBe('/aoe2-analyzer/');
    expect(url.search).toBe('');
    expect(url.hash).toBe('#/relic-income?' + encodeRelicIncome(c));
    expect(decodeRelicIncome(url.hash.split('?')[1]!).config).toEqual(c);
    expect(() => relicIncomeShareUrl(config({ target: '' }), url.href)).toThrow();
  });
});
