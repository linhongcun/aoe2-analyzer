import { beforeAll, describe, expect, it } from 'vitest';
import { civs, loadCore, loadTrees } from '../../src/data';
import ecoRaw from '../../data/game/eco.json';
import { litTreeIds } from '../../src/domain/availabilityAge';
import { DAT, type DatFx } from '../../src/domain/datEffects';
import { gatherModel } from '../../src/domain/realCost';
import { defaultTeamPlan, teamPlanErrors } from '../../src/domain/teamPlan';
import { compareTraining } from '../../src/features/production/trainCompareModel';
import {
  calculateProduction,
  decodeProduction,
  encodeProduction,
  freeProductionTechs,
  productionBuildings,
  productionTechAge,
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
  it('#1051 亚美尼亚长矛兵可在黑暗时代训练，其他文明仍须封建', () => {
    const spear = ctx.core.unitById[93]!;
    expect(productionBuildings(ctx, plan({ civ: 'Armenians', age: 1 }), spear)).toEqual([12]);
    expect(productionBuildings(ctx, plan({ civ: 'Franks', age: 1 }), spear)).toEqual([]);
    expect(productionBuildings(ctx, plan({ civ: 'Franks', age: 2 }), spear)).toEqual([12]);
    expect(productionBuildings(ctx, plan({ civ: 'Armenians', age: 1 }), ctx.core.unitById[77]!)).toEqual([]);
  });
  it('丹麦存放食物收益保留未计入说明，土堡按可解码城堡加速计入并提示仅为估算', () => {
    expect(run({ civ: 'Danes' }).warnings.some((w) => w.includes('存放'))).toBe(true);
    const base = run({ civ: 'Berbers', age: 4, techs: [], rows: [{ unit: 1007, building: 82, count: '1' }] });
    const withKasbah = run({ civ: 'Berbers', age: 4, techs: [578], rows: [{ unit: 1007, building: 82, count: '1' }] });
    expect(withKasbah.errors).toEqual([]);
    expect(withKasbah.lines[0]!.seconds).toBeCloseTo(base.lines[0]!.seconds / 1.25, 8);
    expect(withKasbah.lines[0]!.applied).toContain('土堡');
    expect(withKasbah.warnings).toContain('土堡：已按可解码生产或费用效果计入；另含未解码资源或条件效果，结果仅为估算。');
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

describe('#1463 带 res 标记独特科技过滤与 fail-closed 回归', () => {
  it('AC1：葡萄牙环游世界（1404）经共享 res:203 白名单静默放行，全站仅 1404 命中该白名单', () => {
    const base = run({ civ: 'Portuguese', age: 4, techs: [], rows: [{ unit: 442, building: 45, count: '4' }] });
    const with1404 = run({ civ: 'Portuguese', age: 4, techs: [1404], rows: [{ unit: 442, building: 45, count: '4' }] });
    expect(base.errors).toEqual([]);
    expect(with1404.errors).toEqual([]);
    expect(base.lines[0]!.seconds).toBeCloseTo(27, 8);
    expect(with1404.lines[0]!.seconds).toBeCloseTo(20.25, 8);
    expect(base.lines[0]!.perMinute).toBeCloseTo(8.8888889, 5);
    expect(with1404.lines[0]!.perMinute).toBeCloseTo(11.8518519, 5);
    expect(with1404.lines[0]!.applied).toContain('环游世界');
    expect(with1404.total).toBeGreaterThan(base.total);
    expect(with1404.warnings.some((w) => w.includes('环游世界'))).toBe(false);

    // 全站仅 1404 含 res:203 标记，无其他科技受白名单误伤
    const techsWith203 = Object.entries(DAT.techs)
      .filter(([, d]) => d.eco.some((e) => e.res === 203))
      .map(([, d]) => d.id);
    expect(techsWith203).toEqual([1404]);
  });

  it('AC2：柏柏尔土堡（578）单勾与叠征招（315）均生效并输出逐字估算告警', () => {
    const rows = [{ unit: 1009, building: 82, count: '2' }];
    const base = run({ civ: 'Berbers', age: 4, techs: [], rows });
    const only578 = run({ civ: 'Berbers', age: 4, techs: [578], rows });
    const with315 = run({ civ: 'Berbers', age: 4, techs: [315], rows });
    const with315And578 = run({ civ: 'Berbers', age: 4, techs: [315, 578], rows });
    expect(base.lines[0]!.seconds).toBeCloseTo(25, 8);
    expect(only578.lines[0]!.seconds).toBeCloseTo(20, 8);
    expect(with315.lines[0]!.seconds).toBeCloseTo(25 / 1.33, 8);
    expect(with315And578.lines[0]!.seconds).toBeCloseTo(25 / (1.33 * 1.25), 8);
    expect(with315And578.lines[0]!.applied).toEqual(expect.arrayContaining(['征招', '土堡']));
    expect(with315And578.warnings).toContain('土堡：已按可解码生产或费用效果计入；另含未解码资源或条件效果，结果仅为估算。');
    expect(with315And578.warnings.some((w) => w.includes('整项未计入'))).toBe(false);
  });

  it('AC3：马普切布图马普（1380）对 2568/2571 双行折后价参与每分钟开销与村民核算并保留估算告警', () => {
    const rows = [
      { unit: 2568, building: 82, count: '2' },
      { unit: 2571, building: 87, count: '4' },
    ];
    const base = run({ civ: 'Mapuche', age: 4, techs: [315], rows });
    const with1380 = run({ civ: 'Mapuche', age: 4, techs: [315, 1380], rows });
    expect(with1380.errors).toEqual([]);
    expect(with1380.lines[0]!.cost).toEqual({ Food: 55, Gold: 34 });
    expect(with1380.lines[0]!.spend.Food).toBeLessThan(base.lines[0]!.spend.Food);
    expect(with1380.lines[0]!.spend.Gold).toBeLessThan(base.lines[0]!.spend.Gold);
    expect(with1380.lines[0]!.applied).toContain('布图马普');
    expect(with1380.lines[1]!.cost).toEqual({ Wood: 42.5, Gold: 47 });
    expect(with1380.lines[1]!.spend.Wood).toBeLessThan(base.lines[1]!.spend.Wood);
    expect(with1380.lines[1]!.spend.Gold).toBeLessThan(base.lines[1]!.spend.Gold);
    expect(with1380.total).toBeLessThan(base.total);
    expect(with1380.lines[1]!.applied).toContain('布图马普');
    expect(with1380.warnings).toContain('布图马普：已按可解码生产或费用效果计入；另含未解码资源或条件效果，结果仅为估算。');
  });

  it('AC5：非法 op 或非正/非有限 mul 倍率在 calculateProduction 中仍 fail-closed 整项跳过', () => {
    const originalKasbah = DAT.techs.Kasbah!;
    const originalCircum = DAT.techs.Circumnavigation!;
    const berberBase = run({ civ: 'Berbers', age: 4, techs: [], rows: [{ unit: 1009, building: 82, count: '1' }] });
    const portBase = run({ civ: 'Portuguese', age: 4, techs: [], rows: [{ unit: 442, building: 45, count: '1' }] });
    try {
      for (const badEco of [
        { a: 13, op: 'div', v: 2, t: [82], cls: null, unit: 82 },
        { a: 13, op: 'mul', v: 0, t: [82], cls: null, unit: 82 },
        { a: 13, op: 'mul', v: -1.25, t: [82], cls: null, unit: 82 },
        { a: 13, op: 'mul', v: Number.NaN, t: [82], cls: null, unit: 82 },
        { a: 13, op: 'set', v: 0, t: [82], cls: null, unit: 82 },
      ]) {
        DAT.techs.Kasbah = { ...originalKasbah, eco: [{ res: 33, name: '资源33', op: 'set', v: 52 }, badEco] };
        const res = run({ civ: 'Berbers', age: 4, techs: [578], rows: [{ unit: 1009, building: 82, count: '1' }] });
        expect(res.errors).toEqual([]);
        expect(res.lines[0]!.seconds).toBe(berberBase.lines[0]!.seconds);
        expect(res.lines[0]!.applied).not.toContain('土堡');
        expect(res.warnings).toContain('土堡：含未解码的资源或条件效果，生产效果整项未计入。');
      }

      for (const badFx of [
        { s: 'bt', op: 'div', v: 2 },
        { s: 'bt', op: 'mul', v: 0 },
        { s: 'bt', op: 'mul', v: -0.75 },
        { s: 'bt', op: 'mul', v: Number.NaN },
      ]) {
        DAT.techs.Circumnavigation = {
          ...originalCircum,
          rules: [{ t: [442], fx: [badFx as unknown as DatFx] }],
        };
        const res = run({ civ: 'Portuguese', age: 4, techs: [1404], rows: [{ unit: 442, building: 45, count: '1' }] });
        expect(res.errors).toEqual([]);
        expect(res.lines[0]!.seconds).toBe(portBase.lines[0]!.seconds);
        expect(res.lines[0]!.applied).not.toContain('环游世界');
        expect(res.warnings).toContain('环游世界：含未解码的资源或条件效果，生产效果整项未计入。');
      }
    } finally {
      DAT.techs.Kasbah = originalKasbah;
      DAT.techs.Circumnavigation = originalCircum;
    }
  });
});

describe('#1504 持续生产费用科技目标实体校验（排除纯建筑造价科技）', () => {
  it('动态遍历全库费用科技：56 文明 × 4 时代排除纯建筑造价 455，保留全部单位费用与非费用生产科技', () => {
    const costAttrSet = new Set([100, 103, 104, 105, 106]);
    const unitCostIds: number[] = [];
    const buildingOnlyCostIds: number[] = [];
    for (const tech of ctx.core.techs) {
      const costEco = (DAT.techs[tech.en]?.eco ?? []).filter((e) => e.a !== undefined && costAttrSet.has(e.a));
      if (!costEco.length) continue;
      const targetsUnit = costEco.some((e) => e.t?.some((id) => !!ctx.core.unitById[id]));
      const targetsBuilding = costEco.some((e) => e.t?.some((id) => !!ctx.core.buildingById[id]));
      if (targetsUnit) unitCostIds.push(tech.id);
      else if (targetsBuilding) buildingOnlyCostIds.push(tech.id);
    }
    unitCostIds.sort((a, b) => a - b);
    buildingOnlyCostIds.sort((a, b) => a - b);
    expect(buildingOnlyCostIds).toEqual([455]);
    expect(unitCostIds).toEqual([373, 488, 499, 514, 625, 782, 785, 835, 1380, 1496]);

    const allCostIds = new Set([...unitCostIds, ...buildingOnlyCostIds]);
    for (const { en: civ } of civs) {
      const lit = litTreeIds(ctx.trees, civ, 't');
      for (const age of [1, 2, 3, 4]) {
        const expected = unitCostIds.filter((id) => {
          const tech = ctx.core.techById[id]!;
          return lit.has(id) && tech.civs.includes(civ) && productionTechAge(tech, civ) <= age;
        });
        const actual = productionTechs(ctx, { civ, age })
          .map((t) => t.id)
          .filter((id) => allCostIds.has(id))
          .sort((a, b) => a - b);
        expect(actual, `${civ}/${age}`).toEqual(expected);
      }
    }

    // 确认三类非费用生产科技（a=13 建筑工作效率、rules bt 训练时间、采集与解锁科技）无回归
    const has = (civ: string, age: number, id: number) => productionTechs(ctx, { civ, age }).some((t) => t.id === id);
    expect(has('Slavs', 4, 315)).toBe(true);
    expect(has('Goths', 4, 457)).toBe(true);
    expect(has('Franks', 4, 493)).toBe(true);
    expect(has('Berbers', 3, 578)).toBe(true);
    expect(has('Portuguese', 3, 1404)).toBe(true);
    expect(has('Goths', 3, 16)).toBe(true);
    expect(has('Bohemians', 3, 47)).toBe(true);
    expect(has('Huns', 3, 483)).toBe(true);
    expect(has('Slavs', 2, 202)).toBe(true);
  });

  it('旧链接 techs=455 与团战计划均报既有不可用错误，训练对照排除 455 且计算口径不变', () => {
    const { config } = decodeProduction('?civ=Slavs&age=4&techs=455&rows=878:82:2');
    expect(calculateProduction(ctx, config).errors).toContain('方案含当前文明或时代不可用的科技，请清除不可用科技。');

    const plan = defaultTeamPlan();
    plan.players[0]!.civ = 'Slavs';
    for (const phase of plan.phases.filter((p) => p.age >= 3)) phase.players[0]!.completedUnlockTechIds = [455];
    expect(teamPlanErrors(plan, ctx).filter((s) => s.includes('罗斯堡垒研究确认与文明、时代或本工具范围不符'))).toHaveLength(2);

    const compare = compareTraining(ctx, { civs: ['Slavs'], unit: 38, n: 1, age: 3 });
    expect(compare.rows).toHaveLength(1);
    const row = compare.rows[0]!;
    expect(row.techs).not.toContain(455);
    expect(row.line.cost).toEqual({ Food: 60, Gold: 75 });
    expect(row.line.seconds).toBeCloseTo(eco.units['38']!.trainTime, 8);
    expect(row.line.applied).not.toContain('罗斯堡垒');
  });
});

describe('Issue 1473 持续生产亚美尼亚骡车科技与波希米亚前置过滤', () => {
  it('AC2：亚美尼亚帝王 4 营冠军剑士 + 2 堡精锐复合弓精确计入 960/961/963/964/965，合计 81 人且零告警', () => {
    const decoded = decodeProduction('?civ=Armenians&age=4&walk=3&farm=1&techs=202,203,55,182,278,213,249,315&rows=567:12:4,1802:82:2');
    expect(decoded.errors).toEqual([]);
    const res = calculateProduction(ctx, decoded.config);
    expect(res.errors).toEqual([]);
    expect(res.warnings).toEqual([]);
    expect(res.applied).toEqual(['伐木 +14%', '采金 +11%', '采石 +5%']);
    const byKey = Object.fromEntries(res.resources.map((r) => [r.key, r]));
    expect(byKey.Food!.income).toBeCloseTo(30.07, 2);
    expect(byKey.Wood!.income).toBeCloseTo(31.74, 2);
    expect(byKey.Gold!.income).toBeCloseTo(28.26, 2);
    expect(byKey.Stone!.income).toBeCloseTo(22.89, 2);
    expect(byKey.Food!.villagers).toBeCloseTo(25.27, 2);
    expect(byKey.Wood!.villagers).toBeCloseTo(17.6, 2);
    expect(byKey.Gold!.villagers).toBeCloseTo(36.17, 2);
    expect(byKey.Food!.rounded).toBe(26);
    expect(byKey.Wood!.rounded).toBe(18);
    expect(byKey.Gold!.rounded).toBe(37);
    expect(byKey.Stone!.rounded === 0).toBe(true);
    expect(res.total).toBe(81);
  });

  it('AC2 反例：未勾骡车经济科技时不触发 +40% 采集加速也不输出伪告警', () => {
    const res = run({ civ: 'Armenians', age: 4, techs: [], rows: [{ unit: 567, building: 12, count: '4' }] });
    expect(res.errors).toEqual([]);
    expect(res.applied).toEqual([]);
    expect(res.warnings).toEqual([]);
    const generic = gatherModel(4, '', { techIds: new Set(), walkTiles: 3, farmTiles: 1 });
    expect(res.resources.find((r) => r.key === 'Wood')!.income).toBeCloseTo(generic.rate.wood * 60, 10);
    expect(res.resources.find((r) => r.key === 'Gold')!.income).toBeCloseTo(generic.rate.gold * 60, 10);
  });

  it('AC3：波希米亚城堡/帝王时代未含狂热 252 时不再输出村民移速 +15% 伪告警', () => {
    for (const age of [3, 4]) {
      const res = run({ civ: 'Bohemians', age, techs: [], rows: [{ unit: 83, building: 109, count: '1' }] });
      expect(res.errors).toEqual([]);
      expect(res.warnings.some((w) => w.includes('村民移速 +15%'))).toBe(false);
    }
  });
});
