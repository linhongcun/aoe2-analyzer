import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import ecoRaw from '../../src/data/eco.json';
import { DAT } from '../../src/domain/datEffects';
import { gatherModel } from '../../src/domain/realCost';
import {
  calculateProduction,
  decodeProduction,
  encodeProduction,
  freeProductionTechs,
  productionBuildings,
  productionTechs,
  toggleProductionTech,
  DEFAULT_PRODUCTION,
  type ProductionConfig,
  type ProductionContext,
} from '../../src/domain/production';

let ctx: ProductionContext;
const eco = ecoRaw as unknown as {
  units: Record<string, { trainTime: number; timeAt?: Record<string, number>; cost: Record<string, number> }>;
  civEco: Record<string, { tech?: number; effects: { attr?: string; target?: string; v?: number }[] }[]>;
};
beforeAll(async () => {
  ctx = { core: await loadCore(), trees: await loadTrees() };
});
const plan = (overrides: Partial<ProductionConfig> = {}): ProductionConfig => ({
  ...DEFAULT_PRODUCTION,
  rows: [{ unit: 83, building: 109, count: '1' }],
  techs: [],
  ...overrides,
});
const run = (overrides: Partial<ProductionConfig> = {}) => calculateProduction(ctx, plan(overrides));

describe('#204 持续生产固定数据回归', () => {
  it('村民持续训练：单价与每分钟消耗从固定基础训练秒数推导', () => {
    const r = run();
    expect(r.errors).toEqual([]);
    expect(r.lines[0]!.perMinute).toBeCloseTo(60 / eco.units['83']!.trainTime, 10);
    expect(r.resources[0]!.spend).toBeCloseTo((eco.units['83']!.cost.Food! * 60) / eco.units['83']!.trainTime, 10);
  });
  it('多条异种需求的同资源先汇总，再除收入和取整', () => {
    const r = run({
      rows: [
        { unit: 83, building: 109, count: '1' },
        { unit: 38, building: 101, count: '2' },
      ],
    });
    expect(r.errors).toEqual([]);
    const food = (eco.units['83']!.cost.Food! * 60) / eco.units['83']!.trainTime + (2 * eco.units['38']!.cost.Food! * 60) / eco.units['38']!.trainTime;
    expect(r.resources[0]!.spend).toBeCloseTo(food, 10);
    expect(r.resources[0]!.rounded).toBe(Math.ceil(food / r.resources[0]!.income));
  });
  it('建筑数翻倍同比增长，拆成多行不改变最终取整配置', () => {
    const one = run(),
      twice = run({ rows: [{ unit: 83, building: 109, count: '2' }] });
    const split = run({
      rows: [
        { unit: 83, building: 109, count: '1' },
        { unit: 83, building: 109, count: '1' },
      ],
    });
    expect(twice.resources[0]!.villagers).toBeCloseTo(one.resources[0]!.villagers * 2, 10);
    expect(split.resources).toEqual(twice.resources);
  });
  it('匈奴自身团队加成是马厩生产分母', () => {
    const r = run({ civ: 'Huns', rows: [{ unit: 38, building: 101, count: '1' }] });
    const v = eco.civEco.Huns!.flatMap((r) => r.effects).find((e) => e.attr === 'workRate' && e.target === 'unit:101')!.v!;
    expect(r.errors).toEqual([]);
    expect(r.lines[0]!.seconds).toBeCloseTo(eco.units['38']!.trainTime / v, 8);
  });
  it('波斯城堡时代只用对应TC形态，不误用黑暗时代倍率', () => {
    const r = run({ civ: 'Persians' });
    const v = eco.civEco.Persians!.find((r) => r.tech === 409)!.effects.find((e) => e.target === 'unit:141')!.v!;
    expect(r.lines[0]!.seconds).toBeCloseTo(eco.units['83']!.trainTime / v, 8);
  });
  it('阿兹特克单位训练倍率在分子且和携带加成分开', () => {
    const r = run({ civ: 'Aztecs', rows: [{ unit: 74, building: 12, count: '1' }] });
    const v = eco.civEco.Aztecs!.flatMap((r) => r.effects).find((e) => e.attr === 'trainTime' && e.target === 'class:6')!.v!;
    expect(r.lines[0]!.seconds).toBeCloseTo(eco.units['74']!.trainTime * v, 8);
    expect(r.warnings.some((w) => w.includes('携带'))).toBe(true);
  });
  it('征招与井喷显式选择后才加速，攻城厂不受征招影响', () => {
    const config = { civ: 'Goths', age: 4, rows: [{ unit: 74, building: 12, count: '1' }] };
    const base = run(config),
      fast = run({ ...config, techs: [315, 457] });
    const conscription = DAT.techs.Conscription!.eco.find((e) => e.t?.includes(12))!.v;
    const perfusion = DAT.techs.Perfusion!.eco.find((e) => e.t?.includes(12))!.v;
    expect(fast.lines[0]!.seconds).toBeCloseTo(base.lines[0]!.seconds / conscription / perfusion, 8);
    const siege = { age: 4, rows: [{ unit: 1258, building: 49, count: '1' }] };
    expect(run({ ...siege, techs: [315] }).lines[0]!.seconds).toBe(run(siege).lines[0]!.seconds);
  });
  it('卡曼达兰明确改变已选弓兵资源种类，而不是只生成说明', () => {
    const rows = [{ unit: 4, building: 87, count: '1' }];
    const base = run({ civ: 'Persians', rows }),
      upgraded = run({ civ: 'Persians', rows, techs: [488] });
    expect(upgraded.lines[0]!.cost.Gold).toBe(0);
    const extra = DAT.techs.Kamandaran!.eco.filter((e) => e.a === 104 && e.t?.includes(4)).reduce((n, e) => n + e.v, 0);
    expect(upgraded.lines[0]!.cost.Wood).toBe(base.lines[0]!.cost.Wood! + extra);
  });
  it('近卫军兵营需无政府，并使用生产地点独立训练时间', () => {
    const u = ctx.core.unitById[759]!;
    expect(productionBuildings(ctx, plan({ civ: 'Goths' }), u)).not.toContain(12);
    const r = run({ civ: 'Goths', techs: [16], rows: [{ unit: 759, building: 12, count: '1' }] });
    const team = eco.civEco.Goths!.flatMap((r) => r.effects).find((e) => e.target === 'unit:12' && e.attr === 'workRate')!.v!;
    expect(r.errors).toEqual([]);
    expect(r.lines[0]!.seconds).toBeCloseTo(eco.units['759']!.timeAt!['12']! / team, 8);
  });
  it('维京免费推车自动生效且手动勾选不重复计算；越南经济科技不误判免费', () => {
    expect(freeProductionTechs(ctx, plan({ civ: 'Vikings' }))).toEqual(new Set([213, 249]));
    expect(freeProductionTechs(ctx, plan({ civ: 'Vietnamese' }))).not.toContain(213);
    const a = run({ civ: 'Vikings' }),
      b = run({ civ: 'Vikings', techs: [213, 249] });
    expect(a.resources).toEqual(b.resources);
    expect(freeProductionTechs(ctx, plan({ civ: 'Vietnamese', age: 4 }))).toContain(315);
  });
  it('经济科技显式集合才改变采集，前置联动且免费科技无法取消', () => {
    const rows = [{ unit: 4, building: 87, count: '1' }];
    expect(run({ rows, techs: [202] }).resources[1]!.income).toBeGreaterThan(run({ rows }).resources[1]!.income);
    const selected = toggleProductionTech(ctx, plan(), 203);
    expect(selected).toContain(202);
    expect(selected).toContain(203);
    expect(toggleProductionTech(ctx, plan({ techs: selected }), 202)).not.toContain(203);
    expect(toggleProductionTech(ctx, plan({ civ: 'Vikings' }), 213)).toContain(213);
  });
  it('新显式参数不改变旧真实费用默认口径', () => {
    const a = gatherModel(3);
    gatherModel(3, 'Franks', { techIds: new Set(), walkTiles: 1, farmTiles: 1 });
    expect(gatherModel(3)).toEqual(a);
    expect(gatherModel(3, '', { techIds: new Set() }).rate.wood).toBeLessThan(a.rate.wood);
  });
  it('提前解锁仍须文明和时代，火药必须化学', () => {
    expect(productionTechs(ctx, plan({ civ: 'Burgundians', age: 1 })).some((t) => t.id === 202)).toBe(true);
    expect(productionBuildings(ctx, plan({ civ: 'Armenians', age: 2 }), ctx.core.unitById[77]!)).toContain(12);
    expect(productionBuildings(ctx, plan({ civ: 'Franks', age: 2 }), ctx.core.unitById[77]!)).toEqual([]);
    expect(productionBuildings(ctx, plan({ civ: 'Bohemians', age: 3 }), ctx.core.unitById[5]!)).toEqual([]);
    expect(productionBuildings(ctx, plan({ civ: 'Bohemians', age: 3, techs: [47] }), ctx.core.unitById[5]!)).toContain(87);
    expect(productionBuildings(ctx, plan({ civ: 'Turks', age: 4 }), ctx.core.unitById[5]!)).toContain(87);
    expect(productionBuildings(ctx, plan({ civ: 'Aztecs' }), ctx.core.unitById[38]!)).toEqual([]);
  });
  it('丹麦存放食物收益及未知条件科技有具体未计入说明', () => {
    expect(run({ civ: 'Danes' }).warnings.some((w) => w.includes('存放'))).toBe(true);
    const r = run({ civ: 'Berbers', age: 4, techs: [578], rows: [{ unit: 1007, building: 82, count: '1' }] });
    expect(r.warnings.some((w) => w.includes('土堡') && w.includes('未计入'))).toBe(true);
  });
  it('空、零和非法需求不会输出无穷、NaN或负数配置', () => {
    expect(run({ rows: [] }).total).toBe(0);
    expect(run({ rows: [{ unit: 83, building: 109, count: '0' }] }).total).toBe(0);
    for (const count of ['-1', '1.5', 'NaN', 'Infinity', '', '101']) {
      const r = run({ rows: [{ unit: 83, building: 109, count }] });
      expect(r.errors.length).toBeGreaterThan(0);
      expect(r.total).toBe(0);
      expect(r.resources.every((x) => Number.isFinite(x.villagers) && x.villagers >= 0)).toBe(true);
    }
  });
  it('非法科技、时代、文明、生产地点均拒绝部分计算', () => {
    for (const fields of [{ techs: [99999] }, { age: 9 }, { civ: 'invalid' }, { rows: [{ unit: 83, building: 82, count: '1' }] }]) {
      const r = run(fields);
      expect(r.errors.length).toBeGreaterThan(0);
      expect(r.total).toBe(0);
    }
  });
  it('方案URL可往返，非法参数明确报告且保留可修正的数量', () => {
    const config = plan({
      civ: 'Huns',
      age: 4,
      techs: [315, 483],
      walk: 5,
      rows: [
        { unit: 886, building: 101, count: '3' },
        { unit: 83, building: 109, count: '0' },
      ],
    });
    expect(decodeProduction('?' + encodeProduction(config))).toEqual({ config: { ...config, techs: [315, 483] }, errors: [] });
    const bad = decodeProduction('?civ=unknown&age=NaN&techs=x&rows=83:109:-1');
    expect(bad.errors).toHaveLength(3);
    expect(bad.config.rows[0]!.count).toBe('-1');
    expect(decodeProduction('?rows=').config.rows).toEqual([]);
    expect(decodeProduction('?rows=not-valid').errors.length).toBeGreaterThan(0);
  });
});
