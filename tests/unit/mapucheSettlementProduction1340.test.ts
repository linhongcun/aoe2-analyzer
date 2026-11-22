import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import { ECO as eco } from '../../src/data/eco';
import { evaluateArmyCost } from '../../src/domain/armyCost';
import { emptyArmyCost } from '../../src/domain/armyCostConfig';
import { projectArmySupply } from '../../src/domain/armySupply';
import { DAT } from '../../src/domain/datEffects';
import { formatProductionNumber } from '../../src/domain/formatTime';
import {
  calculateProduction,
  decodeProduction,
  DEFAULT_PRODUCTION,
  mapucheSettlementFooterSummary,
  mapucheSettlementUnitTimes,
  productionBuildings,
  type ProductionConfig,
  type ProductionContext,
} from '../../src/domain/production';
import { productionToTrainTotal, trainTotalToProduction } from '../../src/domain/productionTransfer';
import { fitShapes } from '../../src/domain/teamFit';
import { planPotentialBuildings } from '../../src/domain/teamPlan';
import { evaluateTrainTotal } from '../../src/domain/trainTotal';
import { MAPUCHE_CIV, MAPUCHE_SETTLEMENT_UNITS, SETTLEMENT, trainingAtBuilding, trainingSites } from '../../src/domain/unitTrainingSites';

let ctx: ProductionContext;
beforeAll(async () => {
  ctx = { core: await loadCore(), trees: await loadTrees() };
});

const plan = (overrides: Partial<ProductionConfig> = {}): ProductionConfig => ({
  ...DEFAULT_PRODUCTION,
  civ: MAPUCHE_CIV,
  techs: [],
  rows: [],
  ...overrides,
});

describe('#1340 马普切聚落训练地点与分时代倍率（共享 unitTrainingSites SSOT）', () => {
  it('SSOT：unitTrainingSites 精确覆盖马普切 5 单位聚落，对非聚落建筑及他文明返回 null 防回归', () => {
    expect(SETTLEMENT).toBe(2556);
    expect(MAPUCHE_SETTLEMENT_UNITS.map((x) => x.id)).toEqual([7, 6, 93, 358, 359]);

    for (const { id, primary } of MAPUCHE_SETTLEMENT_UNITS) {
      const unit = ctx.core.unitById[id]!;
      expect(trainingSites(unit)).toEqual({
        kind: 'available',
        primary: { building: primary },
        additional: [{ building: SETTLEMENT, civ: MAPUCHE_CIV }],
      });
      expect(trainingSites(unit, MAPUCHE_CIV)).toEqual({
        kind: 'available',
        primary: { building: primary, civ: MAPUCHE_CIV },
        additional: [{ building: SETTLEMENT, civ: MAPUCHE_CIV }],
      });
      for (const otherCiv of ['Britons', 'Franks', 'Incas', 'Muisca', 'Tupi', 'Turks', 'Sicilians']) {
        expect(trainingSites(unit, otherCiv)).toBeNull();
      }
      expect(trainingAtBuilding(unit, SETTLEMENT)).toEqual({ civs: [MAPUCHE_CIV] });
      expect(trainingAtBuilding(unit, primary)).toBeNull();
      expect(trainingAtBuilding(unit, 1665)).toBeNull();
    }

    // 非目标：帝王掷矛手（1155）不纳入马普切聚落
    const impSkirm = ctx.core.unitById[1155]!;
    expect(trainingSites(impSkirm)).toBeNull();
    expect(trainingAtBuilding(impSkirm, SETTLEMENT)).toBeNull();
  });

  it('验收 1 & 2：马普切 5 单位按时代下限开放聚落，三时代倍率单次精确结算且与格式化一致', () => {
    const expectedByAge: Record<number, { unit: number; buildings: number[] }[]> = {
      1: [
        { unit: 7, buildings: [] },
        { unit: 6, buildings: [] },
        { unit: 93, buildings: [] },
        { unit: 358, buildings: [] },
        { unit: 359, buildings: [] },
      ],
      2: [
        { unit: 7, buildings: [87, SETTLEMENT] },
        { unit: 6, buildings: [] },
        { unit: 93, buildings: [12, SETTLEMENT] },
        { unit: 358, buildings: [] },
        { unit: 359, buildings: [] },
      ],
      3: [
        { unit: 7, buildings: [87, SETTLEMENT] },
        { unit: 6, buildings: [87, SETTLEMENT] },
        { unit: 93, buildings: [12, SETTLEMENT] },
        { unit: 358, buildings: [12, SETTLEMENT] },
        { unit: 359, buildings: [] },
      ],
      4: [
        { unit: 7, buildings: [87, SETTLEMENT] },
        { unit: 6, buildings: [87, SETTLEMENT] },
        { unit: 93, buildings: [12, SETTLEMENT] },
        { unit: 358, buildings: [12, SETTLEMENT] },
        { unit: 359, buildings: [12, SETTLEMENT] },
      ],
    };
    for (const [ageStr, cases] of Object.entries(expectedByAge)) {
      const age = Number(ageStr);
      for (const { unit, buildings } of cases) {
        expect(productionBuildings(ctx, plan({ age }), ctx.core.unitById[unit]!), `age=${age} u=${unit}`).toEqual(buildings);
      }
    }

    // 验收 1：封建聚落预填链接
    const feudalDecoded = decodeProduction('?civ=Mapuche&age=2&rows=7%3A2556%3A1%2C93%3A2556%3A1');
    expect(feudalDecoded.errors).toEqual([]);
    const feudal = calculateProduction(ctx, feudalDecoded.config);
    expect(feudal.errors).toEqual([]);
    expect(feudal.lines).toHaveLength(2);
    expect(feudal.lines[0]!.seconds).toBeCloseTo(26 * 2.15, 10);
    expect(formatProductionNumber(feudal.lines[0]!.seconds)).toBe('55.9');
    expect(feudal.lines[0]!.applied).toEqual(['聚落训练时间 ×2.15（马普切，至封建时代累计）']);
    expect(feudal.lines[1]!.seconds).toBeCloseTo(22 * 2.15, 10);
    expect(formatProductionNumber(feudal.lines[1]!.seconds)).toBe('47.3');
    expect(feudal.lines[1]!.applied).toEqual(['聚落训练时间 ×2.15（马普切，至封建时代累计）']);

    // 验收 2a：城堡时代（确认单次结算，无循环重复乘算）
    const castle = calculateProduction(
      ctx,
      plan({
        age: 3,
        rows: [
          { unit: 7, building: SETTLEMENT, count: '1' },
          { unit: 6, building: SETTLEMENT, count: '1' },
          { unit: 93, building: SETTLEMENT, count: '1' },
          { unit: 358, building: SETTLEMENT, count: '1' },
        ],
      }),
    );
    expect(castle.errors).toEqual([]);
    expect(castle.lines[0]!.seconds).toBeCloseTo(26 * 1.6125, 10);
    expect(formatProductionNumber(castle.lines[0]!.seconds)).toBe('41.93');
    for (const line of castle.lines.slice(1)) {
      expect(line.seconds).toBeCloseTo(22 * 1.6125, 10);
      expect(formatProductionNumber(line.seconds)).toBe('35.47');
    }
    for (const line of castle.lines) {
      expect(line.applied).toEqual(['聚落训练时间 ×1.61（马普切，至城堡时代累计）']);
      expect(line.rowWarnings).toEqual([]);
    }

    // 验收 2b：帝王时代
    const imperial = calculateProduction(
      ctx,
      plan({
        age: 4,
        rows: [
          { unit: 7, building: SETTLEMENT, count: '1' },
          { unit: 6, building: SETTLEMENT, count: '1' },
          { unit: 93, building: SETTLEMENT, count: '1' },
          { unit: 358, building: SETTLEMENT, count: '1' },
          { unit: 359, building: SETTLEMENT, count: '1' },
        ],
      }),
    );
    expect(imperial.errors).toEqual([]);
    const impMult = 2.15 * 0.75 * 0.6202;
    expect(imperial.lines[0]!.seconds).toBeCloseTo(26 * impMult, 10);
    expect(formatProductionNumber(imperial.lines[0]!.seconds)).toBe('26');
    for (const line of imperial.lines.slice(1)) {
      expect(line.seconds).toBeCloseTo(22 * impMult, 10);
      expect(formatProductionNumber(line.seconds)).toBe('22');
    }
    for (const line of imperial.lines) {
      expect(line.applied).toEqual(['聚落训练时间 ×1（马普切，至帝王时代累计）']);
    }

    // 验收 8：两条旧警告不再出现
    for (const res of [feudal, castle, imperial]) {
      expect(res.warnings.some((w) => w.includes('聚落生产暂不可选') || w.includes('暂不可选'))).toBe(false);
    }
  });

  it('验收 3 & 4：兵营/靶场三时代不受 1405-1407 影响；帝王征招只加速兵营/靶场并给聚落行提示', () => {
    for (const age of [2, 3, 4] as const) {
      const r = calculateProduction(
        ctx,
        plan({
          age,
          rows: [
            { unit: 7, building: 87, count: '1' },
            { unit: 93, building: 12, count: '1' },
            { unit: 93, building: SETTLEMENT, count: '1' },
          ],
        }),
      );
      expect(r.errors).toEqual([]);
      expect(r.lines[0]!.seconds).toBe(26);
      expect(r.lines[0]!.applied).toEqual([]);
      expect(r.lines[1]!.seconds).toBe(22);
      expect(r.lines[1]!.applied).toEqual([]);
      expect(r.lines[2]!.seconds).toBeGreaterThan(22);
      expect(r.warnings.some((w) => w.includes('聚落'))).toBe(false);
    }

    // 帝王征招：聚落不变并带行内提示；兵营/靶场按 Conscription 1.33x 加速
    const conscriptionRate = DAT.techs.Conscription!.eco.find((e) => e.a === 13 && e.t?.includes(12))!.v;
    const baseImp = calculateProduction(
      ctx,
      plan({
        age: 4,
        rows: [
          { unit: 359, building: SETTLEMENT, count: '3' },
          { unit: 359, building: 12, count: '1' },
          { unit: 7, building: 87, count: '1' },
        ],
      }),
    );
    const withConscription = calculateProduction(
      ctx,
      plan({
        age: 4,
        techs: [315],
        rows: [
          { unit: 359, building: SETTLEMENT, count: '3' },
          { unit: 359, building: 12, count: '1' },
          { unit: 7, building: 87, count: '1' },
        ],
      }),
    );
    expect(withConscription.errors).toEqual([]);
    expect(withConscription.lines[0]!.seconds).toBe(baseImp.lines[0]!.seconds);
    expect(formatProductionNumber(withConscription.lines[0]!.seconds)).toBe('22');
    expect(withConscription.lines[0]!.rowWarnings).toEqual(['征招不作用于聚落，本行训练时间未加快。']);
    expect(baseImp.lines[0]!.rowWarnings).toEqual([]);

    expect(withConscription.lines[1]!.seconds).toBeCloseTo(22 / conscriptionRate, 10);
    expect(formatProductionNumber(withConscription.lines[1]!.seconds)).toBe('16.54');
    expect(withConscription.lines[1]!.applied).toContain('征招');
    expect(withConscription.lines[1]!.rowWarnings).toEqual([]);

    expect(withConscription.lines[2]!.seconds).toBeCloseTo(26 / conscriptionRate, 10);
    expect(formatProductionNumber(withConscription.lines[2]!.seconds)).toBe('19.55');
    expect(withConscription.lines[2]!.applied).toContain('征招');
    expect(withConscription.lines[2]!.rowWarnings).toEqual([]);

    // 对照：他文明兵营/靶场结果不变
    const franks = calculateProduction(
      ctx,
      plan({
        civ: 'Franks',
        age: 4,
        techs: [315],
        rows: [
          { unit: 359, building: 12, count: '1' },
          { unit: 7, building: 87, count: '1' },
        ],
      }),
    );
    expect(franks.errors).toEqual([]);
    expect(franks.lines[0]!.seconds).toBeCloseTo(22 / conscriptionRate, 10);
    expect(franks.lines[1]!.seconds).toBeCloseTo(26 / conscriptionRate, 10);
  });

  it('验收 5：拒绝非马普切选聚落、马普切未到时代选聚落及马普切其他单位选聚落', () => {
    for (const civ of ['Incas', 'Muisca', 'Tupi', 'Britons', 'Franks']) {
      for (const { id } of MAPUCHE_SETTLEMENT_UNITS) {
        expect(productionBuildings(ctx, plan({ civ, age: 4 }), ctx.core.unitById[id]!)).not.toContain(SETTLEMENT);
      }
      expect(calculateProduction(ctx, plan({ civ, age: 2, rows: [{ unit: 93, building: SETTLEMENT, count: '1' }] })).errors.length).toBeGreaterThan(0);
    }

    // 未到时代
    for (const [age, unit] of [
      [1, 7],
      [1, 93],
      [2, 6],
      [2, 358],
      [2, 359],
      [3, 359],
    ] as const) {
      expect(calculateProduction(ctx, plan({ age, rows: [{ unit, building: SETTLEMENT, count: '1' }] })).errors.length).toBeGreaterThan(0);
    }

    // 马普切其他单位（含非目标 1155）
    for (const unit of [83, 4, 2550, 2569, 1155]) {
      expect(productionBuildings(ctx, plan({ age: 4 }), ctx.core.unitById[unit]!)).not.toContain(SETTLEMENT);
      expect(calculateProduction(ctx, plan({ age: 4, rows: [{ unit, building: SETTLEMENT, count: '1' }] })).errors.length).toBeGreaterThan(0);
    }
  });

  it('验收 6 & 7：训练总价/阵容费用单价不变，跨模式互转与组队工具同步，详情分时代秒数与持续生产严格同源', () => {
    // 详情页分时代秒数与持续生产无科技态逐项严格相等
    const expectedAges: Record<number, number[]> = { 7: [2, 3, 4], 6: [3, 4], 93: [2, 3, 4], 358: [3, 4], 359: [4] };
    for (const { id } of MAPUCHE_SETTLEMENT_UNITS) {
      const unit = ctx.core.unitById[id]!;
      const schedule = mapucheSettlementUnitTimes(unit);
      expect(schedule.map((s) => s.age)).toEqual(expectedAges[id]);
      for (const entry of schedule) {
        const calc = calculateProduction(ctx, plan({ age: entry.age, rows: [{ unit: id, building: SETTLEMENT, count: '1' }] }));
        expect(calc.errors).toEqual([]);
        expect(entry.seconds).toBe(calc.lines[0]!.seconds);
      }
    }

    // 训练总价与阵容新增费用单价不变
    const total = evaluateTrainTotal(ctx, {
      civ: MAPUCHE_CIV,
      age: 4,
      ageRaw: null,
      techs: [],
      rows: [
        { unit: 7, qty: '2' },
        { unit: 359, qty: '3' },
      ],
    });
    expect(total.blocked).toEqual([]);
    expect(total.lines.map((l) => l.cost)).toEqual([
      { Food: 25, Wood: 35 },
      { Food: 35, Wood: 25 },
    ]);
    expect(total.total).toEqual({ Food: 155, Wood: 145 });

    const armyLedger = {
      ...emptyArmyCost(MAPUCHE_CIV, '2'),
      rows: [
        { unit: 7, qty: '2' },
        { unit: 93, qty: '3' },
      ],
    };
    const army = evaluateArmyCost(ctx, armyLedger);
    expect(army.blocked).toEqual([]);
    expect(army.trainingTotal).toMatchObject({ Food: 155, Wood: 145 });

    const supply = projectArmySupply(ctx, armyLedger, {
      stance: 'current',
      planned: [],
      walk: 3,
      farm: 1,
      rows: [
        { building: SETTLEMENT, count: '2', confirmed: true },
        { building: SETTLEMENT, count: '2', confirmed: true },
      ],
    });
    expect(supply.rows.map((r) => r.buildings)).toEqual([
      [87, SETTLEMENT],
      [12, SETTLEMENT],
    ]);
    expect(supply.config?.rows).toEqual([
      { unit: 7, building: SETTLEMENT, count: '2' },
      { unit: 93, building: SETTLEMENT, count: '2' },
    ]);

    // 持续生产 <-> 训练总价互转与组队工具
    const toTotal = productionToTrainTotal(
      ctx,
      plan({
        age: 2,
        rows: [
          { unit: 7, building: SETTLEMENT, count: '2' },
          { unit: 93, building: SETTLEMENT, count: '2' },
        ],
      }),
    );
    expect(toTotal.config.rows.map((r) => r.unit)).toEqual([7, 93]);
    expect(toTotal.notice).toMatchObject({ count: 2, skipped: [] });

    const toProd = trainTotalToProduction(ctx, { civ: MAPUCHE_CIV, age: 2, ageRaw: null, techs: [], rows: [{ unit: 93, qty: '2' }] });
    expect(toProd.config.rows).toEqual([{ unit: 93, building: 12, count: '1' }]);

    expect(planPotentialBuildings(ctx, MAPUCHE_CIV, 2, 93)).toEqual([12, SETTLEMENT]);
    const mapucheShapes = fitShapes(ctx.core, ctx.trees, [MAPUCHE_CIV]);
    expect(mapucheShapes.find((s) => s.rawIds.includes(93))?.locations.map((l) => l.building)).toEqual([12, SETTLEMENT]);
  });

  it('页底汇总：正常数据返回三时代累计倍率与约×1标记，缺失/非法/跨单位不一致时 fail-closed 返回 null', () => {
    const summary = mapucheSettlementFooterSummary();
    expect(summary).not.toBeNull();
    expect(summary!.feudal).toBeCloseTo(2.15, 10);
    expect(summary!.castle).toBeCloseTo(1.6125, 10);
    expect(summary!.imperial).toBeCloseTo(2.15 * 0.75 * 0.6202, 10);
    expect(summary!.imperialApproxOne).toBe(true);
    expect(formatProductionNumber(summary!.feudal)).toBe('2.15');
    expect(formatProductionNumber(summary!.castle)).toBe('1.61');
    expect(formatProductionNumber(summary!.imperial)).toBe('1');

    const baseRows = eco.civEco[MAPUCHE_CIV]!;
    // 缺帝王 1407
    expect(mapucheSettlementFooterSummary(baseRows.filter((r) => r.tech !== 1407))).toBeNull();
    // 任一单位倍率不一致
    const skewed = structuredClone(baseRows);
    const f1405 = skewed.find((r) => r.tech === 1405)!;
    f1405.effects.find((e) => e.target === 'unit:7')!.v = 2.5;
    expect(mapucheSettlementFooterSummary(skewed)).toBeNull();
    // 存在非法操作或非正数
    const badOp = structuredClone(baseRows);
    badOp.find((r) => r.tech === 1406)!.effects[0]!.op = 'add';
    expect(mapucheSettlementFooterSummary(badOp)).toBeNull();
    // 存在重复条目导致步数不符
    const duped = [...structuredClone(baseRows), structuredClone(baseRows.find((r) => r.tech === 1405)!)];
    expect(mapucheSettlementFooterSummary(duped)).toBeNull();
  });
});
