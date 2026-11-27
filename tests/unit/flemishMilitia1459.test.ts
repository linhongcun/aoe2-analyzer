/** Issue #1459: DE 188329 勃艮第弗拉芒民兵（1699）封建兵营直训，移除过时的弗拉芒革命（755）硬编码门控。 */
import { describe, expect, it } from 'vitest';
import { CORE } from '../../src/data/core';
import { loadTrees } from '../../src/data';
import { emptyArmyCost, evaluateArmyCost } from '../../src/domain/armyCost';
import { calculateGeneralGarrison, getGarrisonCandidates, getGarrisonTechs } from '../../src/domain/garrisonGeneral';
import {
  availableHealingTechs,
  calculateGarrisonHealing,
  DEFAULT_HEALING_CONFIG,
  getHealingCandidates,
  readHealingConfig,
} from '../../src/domain/garrisonHealing';
import {
  calculateProduction,
  DEFAULT_PRODUCTION,
  PRODUCTION_UNLOCK_TECH_IDS,
  productionBuildings,
  productionTechs,
  type ProductionConfig,
} from '../../src/domain/production';
import { makeSimContext } from '../../src/domain/simulator';
import { emptyTrainTotal, evaluateTrainTotal } from '../../src/domain/trainTotal';
import { resolveMixedSide } from '../../src/features/duel/logic/mixedDuel';
import { mixedTrainingTransfer } from '../../src/features/duel/logic/mixedTrainingTransfer';

const ctx = { core: CORE, trees: await loadTrees() };
const sim = makeSimContext(CORE.techs, ctx.trees);
const flemish = CORE.unitById[1699]!;
const barracks = CORE.buildingById[12]!;
const range = CORE.buildingById[87]!;
const stable = CORE.buildingById[101]!;

const prodConfig = (extra: Partial<ProductionConfig> = {}): ProductionConfig => ({
  ...DEFAULT_PRODUCTION,
  civ: 'Burgundians',
  age: 3,
  techs: [],
  rows: [{ unit: 1699, building: 12, count: '2' }],
  ...extra,
});

describe('#1459 Flemish Militia (1699) direct barracks availability without Flemish Revolution (755)', () => {
  it('AC1: allows Burgundians continuous production in Feudal/Castle/Imperial without tech 755 and applies 16s / 14s training time', () => {
    expect(PRODUCTION_UNLOCK_TECH_IDS).toEqual([16, 47, 483]);

    for (const [age, expectedSeconds, expectCastleAuto] of [
      [2, 16, false],
      [3, 14, true],
      [4, 14, true],
    ] as const) {
      expect(productionTechs(ctx, { civ: 'Burgundians', age }).map((t) => t.id)).not.toContain(755);
      const cfg = prodConfig({ age });
      expect(productionBuildings(ctx, cfg, flemish)).toEqual([12]);
      const res = calculateProduction(ctx, cfg);
      expect(res.errors).toEqual([]);
      expect(res.lines).toHaveLength(1);
      expect(res.lines[0]!.seconds).toBeCloseTo(expectedSeconds, 6);
      expect(res.lines[0]!.cost).toMatchObject({ Food: 35, Gold: 25 });
      if (expectCastleAuto) {
        expect(res.lines[0]!.applied).toContain('城堡时代自动训练时间修正');
      } else {
        expect(res.lines[0]!.applied).not.toContain('城堡时代自动训练时间修正');
      }
    }
  });

  it('AC2: supports train-total and mixed-duel training transfer for Burgundians 1699 without tech 755', () => {
    for (const age of [2, 3, 4] as const) {
      const cfg = { ...emptyTrainTotal('Burgundians', age), rows: [{ unit: 1699, qty: '10' }] };
      const res = evaluateTrainTotal(ctx, cfg);
      expect(res.blocked).toEqual([]);
      expect(res.incomplete).toBe(false);
      expect(res.techs.map((t) => t.id)).not.toContain(755);
      expect(res.lines[0]).toMatchObject({ status: 'ok', cost: { Food: 35, Gold: 25 } });
      expect(res.total).toMatchObject({ Food: 350, Gold: 250 });

      const input = { civ: 'Burgundians', age: String(age), techs: [], team: [], rows: [{ uid: '1699', qty: '10' }] };
      const transfer = mixedTrainingTransfer(ctx, input, 'a', resolveMixedSide(sim, CORE, input, 'a'));
      if (!('to' in transfer)) throw new Error(JSON.stringify(transfer.errors));
      expect(transfer.notice.unlocks).toEqual([]);
      expect(transfer.to).not.toContain('755');
    }
  });

  it('AC3: quotes army-cost for 10 Flemish Militia across ages 2/3/4 with zero research cost and no forced tech 755', () => {
    for (const age of ['2', '3', '4'] as const) {
      const res = evaluateArmyCost(ctx, { ...emptyArmyCost('Burgundians', age), rows: [{ unit: 1699, qty: '10' }] });
      expect(res.blocked).toEqual([]);
      expect(res.partial).toBe(false);
      expect(res.training.lines[0]).toMatchObject({ status: 'ok', cost: { Food: 35, Gold: 25 } });
      expect(res.ledger.find((e) => e.id === 755)).toBeUndefined();
      expect(res.researchTotal).toEqual({});
      expect(res.trainingTotal).toEqual({ Food: 350, Wood: 0, Gold: 250, Stone: 0 });
      expect(res.total).toEqual({ Food: 350, Wood: 0, Gold: 250, Stone: 0 });
    }

    // 非目标：手动勾选 755 仍按既有未建模独特科技规则标记为作用域外不计入
    const manual = evaluateArmyCost(ctx, { ...emptyArmyCost('Burgundians', '4'), rows: [{ unit: 1699, qty: '10' }], targets: ['t:755'] });
    expect(manual.ledger.find((e) => e.id === 755)).toMatchObject({ status: 'invalid', cost: null });
    expect(manual.partial).toBe(true);
  });

  it('AC4: enables barracks garrison preview and garrison healing leave-in for Burgundians 1699 across ages 2/3/4 without tech 755', () => {
    for (const [age, expectedMaxHp] of [
      [2, 40],
      [3, 55],
      [4, 60],
    ] as const) {
      const gCfg = { civ: 'Burgundians', age, techs: [], rows: [{ unitId: 1699, count: '1', entry: 'created' as const }] };
      const cands = getGarrisonCandidates(ctx, barracks, gCfg);
      expect(cands.find((c) => c.id === 1699)).toMatchObject({ canCreate: true, canEnter: false });
      expect(getGarrisonTechs(ctx, barracks, gCfg).map((t) => t.id)).not.toContain(755);
      const gRes = calculateGeneralGarrison(ctx, barracks, gCfg);
      expect(gRes.errors).toEqual([]);

      const hCfg = {
        ...DEFAULT_HEALING_CONFIG,
        buildingId: 12,
        civ: 'Burgundians',
        age,
        unitId: 1699,
        entry: 'created' as const,
        techs: [],
        currentHp: '10',
        targetHp: String(expectedMaxHp),
      };
      expect(getHealingCandidates(ctx, hCfg).find((c) => c.id === 1699)).toMatchObject({ canCreate: true });
      expect(availableHealingTechs(ctx, hCfg).map((t) => t.id)).not.toContain(755);
      const hRes = calculateGarrisonHealing(ctx, hCfg);
      expect(hRes.errors).toEqual([]);
      expect(hRes.status).toBe('valid');
      expect(hRes.maxHp).toBe(expectedMaxHp);
      expect(hRes.hpPerMinute).toBeCloseTo(30, 6);
      expect(hRes.seconds).toBeCloseTo((expectedMaxHp - 10) / 0.5, 6);
    }
  });

  it('AC5: preserves real unlock gates (16/47/483), rejects non-Burgundians/Dark Age/Archery Range, and errors on legacy techs=755 links', () => {
    // 无政府 16（哥特兵营 759/761）
    for (const uid of [759, 761]) {
      const u = CORE.unitById[uid]!;
      expect(productionBuildings(ctx, prodConfig({ civ: 'Goths', age: 4, techs: [] }), u)).not.toContain(12);
      expect(productionBuildings(ctx, prodConfig({ civ: 'Goths', age: 4, techs: [16] }), u)).toContain(12);
      expect(
        calculateGeneralGarrison(ctx, barracks, { civ: 'Goths', age: 4, techs: [], rows: [{ unitId: uid, count: '1', entry: 'created' }] }).errors.length,
      ).toBeGreaterThan(0);
      expect(
        calculateGeneralGarrison(ctx, barracks, { civ: 'Goths', age: 4, techs: [16], rows: [{ unitId: uid, count: '1', entry: 'created' }] }).errors,
      ).toEqual([]);
    }

    // 掠夺者 483（匈奴马厩 886/887）
    for (const uid of [886, 887]) {
      const u = CORE.unitById[uid]!;
      expect(productionBuildings(ctx, prodConfig({ civ: 'Huns', age: 4, techs: [] }), u)).not.toContain(101);
      expect(productionBuildings(ctx, prodConfig({ civ: 'Huns', age: 4, techs: [483] }), u)).toContain(101);
      expect(
        calculateGeneralGarrison(ctx, stable, { civ: 'Huns', age: 4, techs: [], rows: [{ unitId: uid, count: '1', entry: 'created' }] }).errors.length,
      ).toBeGreaterThan(0);
      expect(
        calculateGeneralGarrison(ctx, stable, { civ: 'Huns', age: 4, techs: [483], rows: [{ unitId: uid, count: '1', entry: 'created' }] }).errors,
      ).toEqual([]);
    }

    // 化学 47（火枪手 5、手推炮 36、炮舰 420、精锐炮舰 691）
    for (const [uid, bid, civ] of [
      [5, 87, 'Franks'],
      [36, 49, 'Franks'],
      [420, 45, 'Franks'],
      [691, 45, 'Spanish'],
    ] as const) {
      const u = CORE.unitById[uid]!;
      const b = CORE.buildingById[bid]!;
      expect(productionBuildings(ctx, prodConfig({ civ, age: 4, techs: [] }), u)).toEqual([]);
      expect(productionBuildings(ctx, prodConfig({ civ, age: 4, techs: [47] }), u)).toContain(bid);
      expect(calculateGeneralGarrison(ctx, b, { civ, age: 4, techs: [], rows: [{ unitId: uid, count: '1', entry: 'created' }] }).errors.length).toBeGreaterThan(
        0,
      );
      expect(calculateGeneralGarrison(ctx, b, { civ, age: 4, techs: [47], rows: [{ unitId: uid, count: '1', entry: 'created' }] }).errors).toEqual([]);
    }

    // 非勃艮第、勃艮第黑暗时代与靶场 87 仍拒绝 1699
    expect(productionBuildings(ctx, prodConfig({ civ: 'Franks', age: 4 }), flemish)).toEqual([]);
    expect(productionBuildings(ctx, prodConfig({ civ: 'Burgundians', age: 1 }), flemish)).toEqual([]);
    expect(
      calculateGeneralGarrison(ctx, barracks, { civ: 'Franks', age: 4, techs: [], rows: [{ unitId: 1699, count: '1', entry: 'created' }] }).errors.length,
    ).toBeGreaterThan(0);
    expect(
      calculateGeneralGarrison(ctx, barracks, { civ: 'Burgundians', age: 1, techs: [], rows: [{ unitId: 1699, count: '1', entry: 'created' }] }).errors.length,
    ).toBeGreaterThan(0);
    expect(
      calculateGeneralGarrison(ctx, range, { civ: 'Burgundians', age: 4, techs: [], rows: [{ unitId: 1699, count: '1', entry: 'created' }] }).errors.length,
    ).toBeGreaterThan(0);

    // 旧分享链接含 techs=755 / gtechs=755 不静默放行
    const oldProd = calculateProduction(ctx, prodConfig({ age: 4, techs: [755] }));
    expect(oldProd.errors.some((e) => e.includes('不可用的科技'))).toBe(true);

    const oldTotal = evaluateTrainTotal(ctx, { ...emptyTrainTotal('Burgundians', 4), techs: [755], rows: [{ unit: 1699, qty: '10' }] });
    expect(oldTotal.techs.find((t) => t.id === 755)?.invalidReason).toBeTruthy();

    const oldGarrison = calculateGeneralGarrison(ctx, barracks, {
      civ: 'Burgundians',
      age: 4,
      techs: [755],
      rows: [{ unitId: 1699, count: '1', entry: 'created' }],
    });
    expect(oldGarrison.errors.some((e) => e.includes('弗拉芒革命'))).toBe(true);

    const oldHealParams = new URLSearchParams({
      hv: '1',
      b: '12',
      civ: 'Burgundians',
      age: '4',
      u: '1699',
      entry: 'created',
      techs: '755',
      current: '10',
      target: '60',
    });
    const oldHeal = readHealingConfig(oldHealParams, ctx);
    expect(oldHeal.errors.some((e) => e.includes('弗拉芒革命'))).toBe(true);
  });
});
