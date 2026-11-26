import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees, type Core } from '../../src/data';
import { RELIC_INCOME_RAW } from '../../src/data/relicIncome';
import { evaluateArmyCost } from '../../src/domain/armyCost';
import { buildBuildingCivRank } from '../../src/domain/buildingCivRank';
import { calculateConstruction, DEFAULT_CONSTRUCTION, type ConstructionTask } from '../../src/domain/construction';
import { payoffAvailable } from '../../src/domain/ecoPayoff';
import { calculateGeneralGarrison, GENERAL_GARRISON_DATA, getGarrisonTechs } from '../../src/domain/garrisonGeneral';
import { GARRISON_NUMERIC_EFFECT_TECH_IDS } from '../../src/domain/garrisonTechs';
import { marketFee } from '../../src/domain/market';
import { calculateProduction } from '../../src/domain/production';
import { gatherModel } from '../../src/domain/realCost';
import { calculateRelicIncome, newRelicIncomeConfig, validRelicIncomeData } from '../../src/domain/relicIncome';
import { classifyTechDataConsumption } from '../../src/domain/techDetailCost';
import type { Trees } from '../../src/domain/types';

let core: Core;
let trees: Trees;

beforeAll(async () => {
  core = await loadCore();
  trees = await loadTrees();
});

describe('#1448 科技来源说明与站内工具真实消费行为一致', () => {
  it('8 项采集科技在多人施工与真实成本中的实际生效边界与分类一致', () => {
    const ctx = { core, trees };
    const cases: readonly {
      tid: number;
      task: ConstructionTask;
      farm: string;
      rateKey: 'wood' | 'gold' | 'stone' | 'farm';
      affectsDefaultRealCost: boolean;
    }[] = [
      { tid: 202, task: 'wood', farm: '0', rateKey: 'wood', affectsDefaultRealCost: true },
      { tid: 203, task: 'wood', farm: '0', rateKey: 'wood', affectsDefaultRealCost: true },
      { tid: 221, task: 'wood', farm: '0', rateKey: 'wood', affectsDefaultRealCost: true },
      { tid: 55, task: 'gold', farm: '0', rateKey: 'gold', affectsDefaultRealCost: true },
      { tid: 182, task: 'gold', farm: '0', rateKey: 'gold', affectsDefaultRealCost: true },
      { tid: 278, task: 'stone', farm: '0', rateKey: 'stone', affectsDefaultRealCost: true },
      { tid: 279, task: 'stone', farm: '0', rateKey: 'stone', affectsDefaultRealCost: true },
      { tid: 13, task: 'farm', farm: '1', rateKey: 'farm', affectsDefaultRealCost: false },
    ];
    for (const { tid, task, farm, rateKey, affectsDefaultRealCost } of cases) {
      const baseCfg = { ...DEFAULT_CONSTRUCTION, civ: 'Byzantines', age: 4, builders: '4', task, farm };
      const before = calculateConstruction(ctx, { ...baseCfg, techs: [] });
      const after = calculateConstruction(ctx, { ...baseCfg, techs: [tid] });
      expect(before.errors, `#${tid} before`).toEqual([]);
      expect(after.errors, `#${tid} after`).toEqual([]);
      expect(after.target!.forgone!, `#${tid} construction forgone`).toBeGreaterThan(before.target!.forgone!);

      const rcBefore = gatherModel(4, 'Byzantines', { techIds: new Set() }).rate[rateKey];
      const rcAfter = gatherModel(4, 'Byzantines', { techIds: new Set([tid]) }).rate[rateKey];
      if (affectsDefaultRealCost) expect(rcAfter, `#${tid} default realCost`).toBeGreaterThan(rcBefore);
      else expect(rcAfter, `#${tid} default realCost unchanged when farmTiles=0`).toBe(rcBefore);

      const domains = classifyTechDataConsumption(core.techById[tid]!, false, {
        unitById: core.unitById,
        buildingById: core.buildingById,
      }).domains;
      expect(domains).toContain('construction');
      if (affectsDefaultRealCost) expect(domains).toEqual(['eco-payoff', 'production', 'construction', 'real-cost', 'eco-build']);
      else expect(domains).toEqual(['eco-farm', 'production', 'construction', 'eco-build']);
    }
  });

  it('建筑驻军（101-103/64/484/485/576/1069）、圣物收益（21/506）、578 土堡、756 与工作速率科技均与实际引擎一致', () => {
    const ctx = { core, trees };
    const deps = { unitById: core.unitById, buildingById: core.buildingById };

    // 578 土堡：持续生产跳过并提示整项未计入，建筑满科技对照在城堡行读取作未计入提示
    const prodBefore578 = calculateProduction(ctx, { civ: 'Berbers', age: 3, techs: [], rows: [{ unit: 1007, building: 82, count: '1' }], walk: 0, farm: 0 });
    const prodAfter578 = calculateProduction(ctx, { civ: 'Berbers', age: 3, techs: [578], rows: [{ unit: 1007, building: 82, count: '1' }], walk: 0, farm: 0 });
    expect(prodBefore578.errors).toEqual([]);
    expect(prodAfter578.errors).toEqual([]);
    expect(prodAfter578.lines[0]!.seconds).toBe(prodBefore578.lines[0]!.seconds);
    expect(prodAfter578.warnings.some((w) => w.includes('土堡') && w.includes('整项未计入'))).toBe(true);
    expect(
      buildBuildingCivRank(ctx, core.buildingById[82]!, 3)
        .rows.find((r) => r.civ === 'Berbers')
        ?.tags.some((t) => t.includes('土堡')),
    ).toBe(true);
    expect(classifyTechDataConsumption(core.techById[578]!, false, deps).domains).toEqual(['building-combat-notice']);

    // 484 射箭孔 / 576 蛮王 / 996 强化堡垒
    const towerRank = buildBuildingCivRank(ctx, core.buildingById[79]!, 4);
    const tcRank = buildBuildingCivRank(ctx, core.buildingById[109]!, 4);
    expect(towerRank.rows.find((r) => r.civ === core.techById[484]!.civs[0]!)?.tags.some((t) => t.includes('射箭孔'))).toBe(true);
    expect(tcRank.rows.find((r) => r.civ === core.techById[576]!.civs[0]!)?.tags.some((t) => t.includes('蛮王'))).toBe(true);
    expect(towerRank.rows.find((r) => r.civ === core.techById[996]!.civs[0]!)?.tags.some((t) => t.includes('强化堡垒'))).toBe(true);
    expect(classifyTechDataConsumption(core.techById[484]!, false, deps).domains).toEqual(['building-garrison', 'building-civ-rank']);
    expect(classifyTechDataConsumption(core.techById[576]!, false, deps).domains).toEqual(['building-garrison', 'building-civ-rank']);
    expect(classifyTechDataConsumption(core.techById[996]!, false, deps).domains).toEqual(['building-combat-notice']);

    // 101-103 时代规则、64 炮塔、485 胡尔切掷矛兵与 1069 弩箭匣：均在建筑驻军真实改变数值
    const donjon = core.buildingById[1665]!;
    expect(
      [2, 3, 4].map((age) => {
        const res = calculateGeneralGarrison(ctx, donjon, { civ: 'Sicilians', age, techs: [], rows: [] });
        return [res.baseProjectiles, res.maxProjectiles];
      }),
    ).toEqual([
      [1, 5],
      [2, 8],
      [3, 12],
    ]);
    for (const [tid, age] of [
      [101, 2],
      [102, 3],
      [103, 4],
    ] as const) {
      const withoutAge = {
        ...GENERAL_GARRISON_DATA,
        ageRules: { ...GENERAL_GARRISON_DATA.ageRules, [tid]: { ...GENERAL_GARRISON_DATA.ageRules[tid]!, effects: [] } },
      };
      const withRes = calculateGeneralGarrison(ctx, donjon, { civ: 'Sicilians', age, techs: [], rows: [] });
      const withoutRes = calculateGeneralGarrison(ctx, donjon, { civ: 'Sicilians', age, techs: [], rows: [] }, withoutAge);
      expect(withRes.baseProjectiles).toBeGreaterThan(withoutRes.baseProjectiles);
      expect(withRes.maxProjectiles).toBeGreaterThan(withoutRes.maxProjectiles);
      expect(classifyTechDataConsumption(core.techById[tid]!, false, deps).domains).toEqual(['building-garrison']);
    }

    const tc = core.buildingById[109]!;
    expect(getGarrisonTechs(ctx, tc, { civ: 'Turks', age: 4, techs: [], rows: [] }).some((t) => t.id === 64)).toBe(true);
    const tcTurksBefore64 = calculateGeneralGarrison(ctx, tc, { civ: 'Turks', age: 4, techs: [], rows: [{ unitId: 83, count: '10', entry: 'enter' }] });
    const tcTurksAfter64 = calculateGeneralGarrison(ctx, tc, { civ: 'Turks', age: 4, techs: [64], rows: [{ unitId: 83, count: '10', entry: 'enter' }] });
    expect(tcTurksBefore64.errors).toEqual([]);
    expect(tcTurksAfter64.errors).toEqual([]);
    expect(tcTurksAfter64.buildingPower).toBeGreaterThan(tcTurksBefore64.buildingPower!);
    expect(classifyTechDataConsumption(core.techById[64]!, false, deps).domains).toEqual(['building-garrison']);

    const mayanBefore485 = calculateGeneralGarrison(ctx, tc, { civ: 'Mayans', age: 3, techs: [], rows: [{ unitId: 6, count: '5', entry: 'enter' }] });
    const mayanAfter485 = calculateGeneralGarrison(ctx, tc, { civ: 'Mayans', age: 3, techs: [485], rows: [{ unitId: 6, count: '5', entry: 'enter' }] });
    expect(mayanAfter485.garrisonPower).toBeGreaterThan(mayanBefore485.garrisonPower!);
    expect(classifyTechDataConsumption(core.techById[485]!, false, deps).domains).toEqual(['building-garrison', 'duel-unmodeled', 'unit-civ-rank-notice']);

    const castle = core.buildingById[82]!;
    const shuBefore1069 = calculateGeneralGarrison(ctx, castle, { civ: 'Shu', age: 4, techs: [], rows: [{ unitId: 492, count: '5', entry: 'enter' }] });
    const shuAfter1069 = calculateGeneralGarrison(ctx, castle, { civ: 'Shu', age: 4, techs: [1069], rows: [{ unitId: 492, count: '5', entry: 'enter' }] });
    expect(shuAfter1069.garrisonPower).toBeGreaterThan(shuBefore1069.garrisonPower!);
    expect(shuAfter1069.totalProjectiles).toBeGreaterThan(shuBefore1069.totalProjectiles!);
    expect(classifyTechDataConsumption(core.techById[1069]!, false, deps).domains).toEqual(['building-garrison', 'duel-unmodeled', 'unit-civ-rank-notice']);
    expect(GARRISON_NUMERIC_EFFECT_TECH_IDS.has(623)).toBe(false);
    expect(GARRISON_NUMERIC_EFFECT_TECH_IDS.has(1080)).toBe(false);

    // 21 无神论 & 506 大干道：圣物收益工具直接套用固定倍率（21: ×0.5，506: ×1.1）
    expect(validRelicIncomeData(RELIC_INCOME_RAW)).toBe(true);
    if (!validRelicIncomeData(RELIC_INCOME_RAW)) throw new Error('invalid relic data');
    const relicBase = calculateRelicIncome({ ...newRelicIncomeConfig(), civ: 'Burgundians', count: '1', minutes: '1' }, RELIC_INCOME_RAW);
    const relicAtheism = calculateRelicIncome({ ...newRelicIncomeConfig(), civ: 'Burgundians', count: '1', minutes: '1', atheism: 'one' }, RELIC_INCOME_RAW);
    expect(relicBase.resources.Gold.perMinute).toBe(30);
    expect(relicBase.resources.Food.perMinute).toBe(20);
    expect(relicAtheism.resources.Gold.perMinute).toBe(15);
    expect(relicAtheism.resources.Food.perMinute).toBe(10);
    expect(classifyTechDataConsumption(core.techById[21]!, false, deps).domains).toEqual(['relic-income']);

    const relicHindBase = calculateRelicIncome(
      { ...newRelicIncomeConfig(), civ: 'Hindustanis', count: '1', minutes: '1', grandTrunkRoad: false },
      RELIC_INCOME_RAW,
    );
    const relicHindGtr = calculateRelicIncome(
      { ...newRelicIncomeConfig(), civ: 'Hindustanis', count: '1', minutes: '1', grandTrunkRoad: true },
      RELIC_INCOME_RAW,
    );
    expect(relicHindBase.resources.Gold.perMinute).toBe(30);
    expect(relicHindGtr.resources.Gold.perMinute).toBeCloseTo(33, 5);

    // 506 大干道：持续生产 + 市场 + 圣物收益，不在经济收益工具可选清单中
    expect(payoffAvailable(ctx, { civ: 'Hindustanis', age: 4 }).map((t) => t.id)).not.toContain(506);
    expect(marketFee({ civ: 'Hindustanis', guilds: false, unique: true })).toBe(0.1);
    const prodBefore506 = calculateProduction(ctx, {
      civ: 'Hindustanis',
      age: 3,
      techs: [],
      rows: [{ unit: 329, building: 101, count: '1' }],
      walk: 0,
      farm: 0,
    });
    const prodAfter506 = calculateProduction(ctx, {
      civ: 'Hindustanis',
      age: 3,
      techs: [506],
      rows: [{ unit: 329, building: 101, count: '1' }],
      walk: 0,
      farm: 0,
    });
    expect(prodBefore506.errors).toEqual([]);
    expect(prodAfter506.errors).toEqual([]);
    expect(prodAfter506.resources.find((r) => r.key === 'Gold')!.income).toBeGreaterThan(prodBefore506.resources.find((r) => r.key === 'Gold')!.income);
    expect(classifyTechDataConsumption(core.techById[506]!, false, deps).domains).toEqual(['production', 'market', 'relic-income']);

    // 756 第一次十字军东征：阵容账本从混合规则提取 res:178/179 抗招降
    const army756 = evaluateArmyCost(ctx, { civ: 'Sicilians', age: '3', rows: [{ unit: 38, qty: '1' }], done: [], targets: ['t:756'] });
    expect(army756.blocked).toEqual([]);
    expect(army756.partial).toBe(false);
    expect(army756.researchTotal).toMatchObject({ Food: 400, Gold: 300 });
    expect(classifyTechDataConsumption(core.techById[756]!, false, deps).domains).toEqual(['army-cost']);

    // 457 井喷 / 493 骑士精神 / 315 征招
    expect(
      buildBuildingCivRank(ctx, core.buildingById[12]!, 4)
        .rows.find((r) => r.civ === 'Goths')
        ?.tags.some((t) => t.includes('井喷')),
    ).toBe(true);
    expect(
      buildBuildingCivRank(ctx, core.buildingById[101]!, 4)
        .rows.find((r) => r.civ === 'Franks')
        ?.tags.some((t) => t.includes('骑士精神')),
    ).toBe(true);
    expect(
      buildBuildingCivRank(ctx, core.buildingById[12]!, 4)
        .rows.find((r) => r.civ === 'Franks')
        ?.tags.some((t) => t.includes('征招')),
    ).toBe(false);
    expect(classifyTechDataConsumption(core.techById[457]!, false, deps).domains).toEqual(['production', 'building-combat-notice']);
    expect(classifyTechDataConsumption(core.techById[493]!, false, deps).domains).toEqual(['production', 'building-combat-notice']);
    expect(classifyTechDataConsumption(core.techById[315]!, false, deps).domains).toEqual(['production']);
  });
});
