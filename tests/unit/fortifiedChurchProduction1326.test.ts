import { beforeAll, describe, expect, it } from 'vitest';
import { civs, loadCore, loadTrees } from '../../src/data';
import { ECO as eco } from '../../src/data/eco';
import { evaluateArmyCost } from '../../src/domain/armyCost';
import { emptyArmyCost } from '../../src/domain/armyCostConfig';
import { projectArmySupply } from '../../src/domain/armySupply';
import {
  calculateProduction,
  decodeProduction,
  DEFAULT_PRODUCTION,
  productionBuildings,
  productionTechs,
  productionUnits,
  type ProductionConfig,
  type ProductionContext,
} from '../../src/domain/production';
import { productionToTrainTotal, trainTotalToProduction } from '../../src/domain/productionTransfer';
import { makeSimContext } from '../../src/domain/simulator';
import { fitShapes } from '../../src/domain/teamFit';
import { planPotentialBuildings } from '../../src/domain/teamPlan';
import { evaluateTrainTotal } from '../../src/domain/trainTotal';
import { resolveMixedSide } from '../../src/features/duel/logic/mixedDuel';
import { mixedTrainingTransfer } from '../../src/features/duel/logic/mixedTrainingTransfer';
import { decodeTrainTotal } from '../../src/features/production/trainTotalCodec';

let ctx: ProductionContext;
beforeAll(async () => {
  ctx = { core: await loadCore(), trees: await loadTrees() };
});

const plan = (overrides: Partial<ProductionConfig> = {}): ProductionConfig => ({
  ...DEFAULT_PRODUCTION,
  techs: [],
  rows: [],
  ...overrides,
});

describe('#1326 强化教堂生产计算（共享 unitTrainingSites 单一事实来源）', () => {
  it('验收 1：亚美尼亚僧侣/牧师战士与格鲁吉亚僧侣在强化教堂通过持续生产并给出可追溯时间与开销', () => {
    const monk = ctx.core.unitById[125]!;
    const priest = ctx.core.unitById[1811]!;

    const armUnits = productionUnits(ctx, plan({ civ: 'Armenians', age: 3 })).map((u) => u.id);
    expect(armUnits).toContain(125);
    expect(armUnits).toContain(1811);
    expect(productionBuildings(ctx, plan({ civ: 'Armenians', age: 3 }), monk)).toEqual([1806]);
    expect(productionBuildings(ctx, plan({ civ: 'Armenians', age: 3 }), priest)).toEqual([1806]);

    const armDecoded = decodeProduction('?civ=Armenians&age=3&rows=125%3A1806%3A1%2C1811%3A1806%3A1');
    expect(armDecoded.errors).toEqual([]);
    const armResult = calculateProduction(ctx, armDecoded.config);
    expect(armResult.errors).toEqual([]);
    expect(armResult.lines).toHaveLength(2);
    expect(armResult.lines[0]).toMatchObject({
      building: 1806,
      count: 1,
      seconds: eco.units[125]!.trainTime,
      cost: { Gold: 100 },
    });
    expect(armResult.lines[0]!.perMinute).toBeCloseTo(60 / 51, 10);
    expect(armResult.lines[1]).toMatchObject({
      building: 1806,
      count: 1,
      seconds: eco.units[1811]!.trainTime,
      cost: { Food: 40, Gold: 50 },
    });
    expect(armResult.lines[1]!.perMinute).toBeCloseTo(60 / 30, 10);
    expect(armResult.resources.find((r) => r.key === 'Food')!.spend).toBeCloseTo(80, 10);
    expect(armResult.resources.find((r) => r.key === 'Gold')!.spend).toBeCloseTo((100 * 60) / 51 + 100, 10);
    expect(armResult.total).toBeGreaterThan(0);

    const geoUnits = productionUnits(ctx, plan({ civ: 'Georgians', age: 3 })).map((u) => u.id);
    expect(geoUnits).toContain(125);
    expect(geoUnits).not.toContain(1811);
    expect(productionBuildings(ctx, plan({ civ: 'Georgians', age: 3 }), monk)).toEqual([1806]);

    const geoDecoded = decodeProduction('?civ=Georgians&age=3&rows=125%3A1806%3A1');
    expect(geoDecoded.errors).toEqual([]);
    const geoResult = calculateProduction(ctx, geoDecoded.config);
    expect(geoResult.errors).toEqual([]);
    expect(geoResult.lines).toHaveLength(1);
    expect(geoResult.lines[0]).toMatchObject({
      building: 1806,
      count: 1,
      seconds: eco.units[125]!.trainTime,
      cost: { Gold: 100 },
    });
    expect(geoResult.lines[0]!.perMinute).toBeCloseTo(60 / 51, 10);
    expect(geoResult.resources.find((r) => r.key === 'Gold')!.spend).toBeCloseTo((100 * 60) / 51, 10);
    expect(geoResult.total).toBeGreaterThan(0);
  });

  it('验收 2：不列颠修道院僧侣对照结果不变', () => {
    const monk = ctx.core.unitById[125]!;
    expect(productionBuildings(ctx, plan({ civ: 'Britons', age: 3 }), monk)).toEqual([104]);

    const decoded = decodeProduction('?civ=Britons&age=3&rows=125%3A104%3A1');
    expect(decoded.errors).toEqual([]);
    const result = calculateProduction(ctx, decoded.config);
    expect(result.errors).toEqual([]);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({
      building: 104,
      count: 1,
      seconds: 51,
      cost: { Gold: 100 },
    });
    expect(result.lines[0]!.perMinute).toBeCloseTo(60 / 51, 10);
    expect(result.resources.find((r) => r.key === 'Gold')!.spend).toBeCloseTo((100 * 60) / 51, 10);

    // 格鲁吉亚与不列颠均无黄金采集加成，单座强化教堂与单座修道院产僧侣所需采金村民一致。
    const geo = calculateProduction(ctx, decodeProduction('?civ=Georgians&age=3&rows=125%3A1806%3A1').config);
    expect(geo.resources).toEqual(result.resources);
    expect(geo.total).toBe(result.total);
  });

  it('验收 3：拒绝未达时代、他文明选强化教堂、亚美尼亚/格鲁吉亚选修道院及格鲁吉亚选牧师战士', () => {
    const monk = ctx.core.unitById[125]!;
    const priest = ctx.core.unitById[1811]!;

    // 未达强化教堂时代（黑暗 / 封建）
    for (const age of [1, 2]) {
      expect(productionBuildings(ctx, plan({ civ: 'Armenians', age }), monk)).toEqual([]);
      expect(productionBuildings(ctx, plan({ civ: 'Armenians', age }), priest)).toEqual([]);
      expect(productionBuildings(ctx, plan({ civ: 'Georgians', age }), monk)).toEqual([]);
      expect(calculateProduction(ctx, plan({ civ: 'Armenians', age, rows: [{ unit: 125, building: 1806, count: '1' }] })).errors.length).toBeGreaterThan(0);
      expect(calculateProduction(ctx, plan({ civ: 'Armenians', age, rows: [{ unit: 1811, building: 1806, count: '1' }] })).errors.length).toBeGreaterThan(0);
      expect(calculateProduction(ctx, plan({ civ: 'Georgians', age, rows: [{ unit: 125, building: 1806, count: '1' }] })).errors.length).toBeGreaterThan(0);
    }

    // 其他文明选强化教堂
    for (const civ of ['Britons', 'Franks', 'Aztecs']) {
      expect(productionBuildings(ctx, plan({ civ, age: 3 }), monk)).toEqual([104]);
      expect(calculateProduction(ctx, plan({ civ, age: 3, rows: [{ unit: 125, building: 1806, count: '1' }] })).errors.length).toBeGreaterThan(0);
      expect(calculateProduction(ctx, plan({ civ, age: 4, rows: [{ unit: 125, building: 1806, count: '1' }] })).errors.length).toBeGreaterThan(0);
    }

    // 亚美尼亚 / 格鲁吉亚选普通修道院
    for (const [civ, unit] of [
      ['Armenians', 125],
      ['Armenians', 1811],
      ['Georgians', 125],
    ] as const) {
      expect(calculateProduction(ctx, plan({ civ, age: 3, rows: [{ unit, building: 104, count: '1' }] })).errors.length).toBeGreaterThan(0);
      expect(calculateProduction(ctx, plan({ civ, age: 4, rows: [{ unit, building: 104, count: '1' }] })).errors.length).toBeGreaterThan(0);
    }

    // 格鲁吉亚选牧师战士
    expect(productionBuildings(ctx, plan({ civ: 'Georgians', age: 3 }), priest)).toEqual([]);
    expect(productionBuildings(ctx, plan({ civ: 'Georgians', age: 4 }), priest)).toEqual([]);
    expect(calculateProduction(ctx, plan({ civ: 'Georgians', age: 3, rows: [{ unit: 1811, building: 1806, count: '1' }] })).errors.length).toBeGreaterThan(0);
    expect(calculateProduction(ctx, plan({ civ: 'Georgians', age: 4, rows: [{ unit: 1811, building: 1806, count: '1' }] })).errors.length).toBeGreaterThan(0);
  });

  it('验收 4 与一处修好各处同步：训练总价、阵容新增费用/供给、混编 PK 带入、组队计划/适配与跨模式互转同步放行', () => {
    // 训练总价
    const armTotal = evaluateTrainTotal(ctx, {
      civ: 'Armenians',
      age: 3,
      ageRaw: null,
      techs: [],
      rows: [
        { unit: 1811, qty: '5' },
        { unit: 125, qty: '2' },
      ],
    });
    expect(armTotal.blocked).toEqual([]);
    expect(armTotal.validCount).toBe(2);
    expect(armTotal.incomplete).toBe(false);
    expect(armTotal.lines.map((line) => line.status)).toEqual(['ok', 'ok']);
    expect(armTotal.total).toEqual({ Food: 200, Gold: 450 });

    const geoTotal = evaluateTrainTotal(ctx, {
      civ: 'Georgians',
      age: 3,
      ageRaw: null,
      techs: [],
      rows: [
        { unit: 125, qty: '3' },
        { unit: 1811, qty: '1' },
      ],
    });
    expect(geoTotal.lines.map((line) => line.status)).toEqual(['ok', 'unavail']);
    expect(geoTotal.total).toEqual({ Gold: 300 });

    // 阵容新增费用与兵种供给
    const armLedger = {
      ...emptyArmyCost('Armenians', '3'),
      rows: [
        { unit: 1811, qty: '5' },
        { unit: 125, qty: '2' },
      ],
    };
    const armArmy = evaluateArmyCost(ctx, armLedger);
    expect(armArmy.blocked).toEqual([]);
    expect(armArmy.partial).toBe(false);
    expect(armArmy.training.lines.map((line) => line.status)).toEqual(['ok', 'ok']);
    expect(armArmy.trainingTotal).toMatchObject({ Food: 200, Gold: 450 });

    const armSupply = projectArmySupply(ctx, armLedger, {
      stance: 'current',
      planned: [],
      walk: 3,
      farm: 1,
      rows: [
        { building: 1806, count: '2', confirmed: true },
        { building: 1806, count: '1', confirmed: true },
      ],
    });
    expect(armSupply.rows.map((row) => row.buildings)).toEqual([[1806], [1806]]);
    expect(armSupply.config?.rows).toEqual([
      { unit: 1811, building: 1806, count: '2' },
      { unit: 125, building: 1806, count: '1' },
    ]);

    const geoArmy = evaluateArmyCost(ctx, { ...emptyArmyCost('Georgians', '3'), rows: [{ unit: 125, qty: '2' }] });
    expect(geoArmy.partial).toBe(false);
    expect(geoArmy.training.lines[0]?.status).toBe('ok');
    expect(geoArmy.trainingTotal).toMatchObject({ Gold: 200 });

    // 混编 PK 训练费带入（城堡时代，不涉及 #1334 的帝王费雷特斯）
    const sim = makeSimContext(ctx.core.techs, ctx.trees);
    const mixedInput = { civ: 'Armenians', age: '3', techs: [], team: [], rows: [{ uid: '1811', qty: '5' }] };
    const transfer = mixedTrainingTransfer(ctx, mixedInput, 'a', resolveMixedSide(sim, ctx.core, mixedInput, 'a'));
    expect(transfer).toHaveProperty('to');
    if (!('to' in transfer)) throw new Error(JSON.stringify(transfer.errors));
    const decoded = decodeTrainTotal(new URL(transfer.to, 'https://example.test').search);
    expect(decoded.warnings).toEqual([]);
    expect(evaluateTrainTotal(ctx, decoded.config).total).toEqual({ Food: 200, Gold: 250 });

    // 组队计划与组队适配
    expect(planPotentialBuildings(ctx, 'Armenians', 3, 125)).toEqual([1806]);
    expect(planPotentialBuildings(ctx, 'Armenians', 3, 1811)).toEqual([1806]);
    expect(planPotentialBuildings(ctx, 'Georgians', 3, 125)).toEqual([1806]);

    const armShapes = fitShapes(ctx.core, ctx.trees, ['Armenians']);
    expect(armShapes.find((s) => s.rawIds.includes(125))?.locations.map((l) => l.building)).toEqual([1806]);
    expect(armShapes.find((s) => s.rawIds.includes(1811))?.locations.map((l) => l.building)).toEqual([1806]);
    const geoShapes = fitShapes(ctx.core, ctx.trees, ['Georgians']);
    expect(geoShapes.find((s) => s.rawIds.includes(125))?.locations.map((l) => l.building)).toEqual([1806]);

    // 持续生产 ↔ 训练总价互转
    const toTotal = productionToTrainTotal(
      ctx,
      plan({
        civ: 'Armenians',
        age: 3,
        rows: [
          { unit: 125, building: 1806, count: '1' },
          { unit: 1811, building: 1806, count: '1' },
        ],
      }),
    );
    expect(toTotal.config.rows.map((r) => r.unit)).toEqual([125, 1811]);
    expect(toTotal.notice).toMatchObject({ count: 2, skipped: [] });

    const toProd = trainTotalToProduction(ctx, {
      civ: 'Armenians',
      age: 3,
      ageRaw: null,
      techs: [],
      rows: [
        { unit: 125, qty: '2' },
        { unit: 1811, qty: '5' },
      ],
    });
    expect(toProd.config.rows).toEqual([
      { unit: 125, building: 1806, count: '1' },
      { unit: 1811, building: 1806, count: '1' },
    ]);

    // 守卫：共享 unitTrainingSites 后哥特无政府、匈奴掠夺者门槛不变
    expect(productionBuildings(ctx, plan({ civ: 'Goths', age: 3 }), ctx.core.unitById[759]!)).toEqual([]);
    expect(productionBuildings(ctx, plan({ civ: 'Goths', age: 3, techs: [16] }), ctx.core.unitById[759]!)).toEqual([12]);
    expect(productionBuildings(ctx, plan({ civ: 'Goths', age: 3 }), ctx.core.unitById[41]!)).toEqual([82]);
    expect(productionBuildings(ctx, plan({ civ: 'Huns', age: 3 }), ctx.core.unitById[886]!)).toEqual([]);
    expect(productionBuildings(ctx, plan({ civ: 'Huns', age: 3, techs: [483] }), ctx.core.unitById[886]!)).toEqual([101]);
    expect(productionBuildings(ctx, plan({ civ: 'Huns', age: 3 }), ctx.core.unitById[755]!)).toEqual([82]);
  });

  it('验收 5：全量 56 文明对照——trees.json 中全部可训练的「单位—建筑」组合均被生产计算认可（#1326 + #1340 零遗漏）', () => {
    expect(civs).toHaveLength(56);
    const missing: { civ: string; unit: number; building: number }[] = [];

    for (const civ of civs) {
      const blocks = ctx.trees.t[civ.en] ?? [];
      expect(blocks.length, civ.en).toBeGreaterThan(0);
      const techs = productionTechs(ctx, { civ: civ.en, age: 4 }).map((t) => t.id);
      const fullConfig = plan({ civ: civ.en, age: 4, techs });

      for (const block of blocks) {
        const building = block[0];
        for (const cell of block[3]) {
          if (cell[2] !== 'u' || cell[4] !== 1) continue;
          const unitId = cell[3];
          const unit = ctx.core.unitById[unitId];
          expect(unit, `${civ.en} unit ${unitId}`).toBeDefined();
          if (!productionBuildings(ctx, fullConfig, unit!).includes(building)) {
            missing.push({ civ: civ.en, unit: unitId, building });
          }
        }
      }
    }

    missing.sort((a, b) => a.civ.localeCompare(b.civ) || a.building - b.building || a.unit - b.unit);
    expect(missing).toEqual([]);
  });
});
