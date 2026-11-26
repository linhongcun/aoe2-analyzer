import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { civs } from '../../src/data';
import { CORE } from '../../src/data/core';
import trees from '../../data/game/trees.json';
import planContent from '../../data/content/team-plan.json';
import { TEACHING_COMPATIBILITY_188329 } from '../../src/data/teachingCompatibility188329';
import { DAT } from '../../src/domain/datEffects';
import type { DatEntry } from '../../src/domain/datEffects';
import {
  calculateProduction,
  decodeProduction,
  encodeProduction,
  isCivEcoTech,
  mergeProductionEcoWarnings,
  productionTechs,
  resolveGatherBonusIdx,
  toggleProductionTech,
  type ProductionConfig,
  type ProductionContext,
} from '../../src/domain/production';
import { discountedCost } from '../../src/domain/costDiscount';
import { gatherModel, gatherUnsupportedSources, realCostOf, type CivGatherSource } from '../../src/domain/realCost';
import { calculateConstruction, DEFAULT_CONSTRUCTION, decodeConstruction } from '../../src/domain/construction';
import { armySupplyResearch, projectArmySupply, type ArmySupplySettings } from '../../src/domain/armySupply';
import { defaultTeamPlan, teamPlanErrors } from '../../src/domain/teamPlan';
import { calculateTradeIncome, newTradeIncomeConfig } from '../../src/domain/tradeIncome';
import { buildOrders } from '../../src/data/buildOrders';
import type { BuildOrder } from '../../src/domain/buildOrder';
import { simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { ECO } from '../../src/data/eco';
import { compareTraining } from '../../src/features/production/trainCompareModel';
import { ProductionWarningText } from '../../src/shared/ui/ProductionWarningText';
import { CompareNumberText } from '../../src/features/production/CompareNumberText';
import {
  calculateSiege,
  decodeSiege,
  encodeSiege,
  SIEGE_COMPARE_IDS,
  SIEGE_UNIT_IDS,
  siegeArmorTechs,
  siegeUnitCounter,
  siegeUnitEntryVerified,
} from '../../src/domain/siege';
import { unitSiegeHref } from '../../src/features/units/siegeEntry';
import type { Trees } from '../../src/domain/types';

const ctx: ProductionContext = { core: CORE, trees: trees as unknown as Trees };
const castle = CORE.buildingById[82]!;
const armoredElephant = CORE.unitById[1744]!;
const siegeElephant = CORE.unitById[1746]!;

describe('Issue 1410: 持续生产接入大干道 (506) 与跨工具零漂移隔离', () => {
  it('识别文明专属采集科技且只在印度斯坦城堡及以上时代开放', () => {
    expect(isCivEcoTech(506)).toBe(true);
    for (const id of [12, 13, 14, 55, 182, 202, 203, 213, 221, 249, 278, 279, 315, 47]) {
      expect(isCivEcoTech(id)).toBe(false);
    }

    expect(productionTechs(ctx, { civ: 'Hindustanis', age: 1 }).map((t) => t.id)).not.toContain(506);
    expect(productionTechs(ctx, { civ: 'Hindustanis', age: 2 }).map((t) => t.id)).not.toContain(506);

    const castleTechs = productionTechs(ctx, { civ: 'Hindustanis', age: 3 });
    expect(castleTechs.filter((t) => t.bz.replace(/\n/g, '') === '城堡').map((t) => t.id)).toEqual([506]);

    const impTechs = productionTechs(ctx, { civ: 'Hindustanis', age: 4 });
    expect(impTechs.filter((t) => t.bz.replace(/\n/g, '') === '城堡').map((t) => t.id)).toEqual([506, 315]);

    for (const civ of civs) {
      if (civ.en === 'Hindustanis') continue;
      for (const age of [1, 2, 3, 4]) {
        expect(productionTechs(ctx, { civ: civ.en, age }).map((t) => t.id)).not.toContain(506);
      }
    }
  });

  it('印度斯坦帝王样例（轻骑/火枪/手推炮）勾选大干道前后精确吻合设计数字', () => {
    const baseTechs = [13, 14, 47, 55, 182, 202, 203, 213, 221, 249, 278, 279, 315];
    const baseConfig: ProductionConfig = {
      civ: 'Hindustanis',
      age: 4,
      walk: 3,
      farm: 1,
      techs: baseTechs,
      rows: [
        { unit: 441, building: 101, count: '4' },
        { unit: 5, building: 87, count: '4' },
        { unit: 36, building: 49, count: '1' },
      ],
    };
    const withoutGtr = calculateProduction(ctx, baseConfig);
    const withGtr = calculateProduction(ctx, { ...baseConfig, techs: [...baseTechs, 506] });

    expect(withoutGtr.errors).toEqual([]);
    expect(withGtr.errors).toEqual([]);

    const goldWithout = withoutGtr.resources.find((r) => r.key === 'Gold')!;
    const goldWith = withGtr.resources.find((r) => r.key === 'Gold')!;
    const foodWithout = withoutGtr.resources.find((r) => r.key === 'Food')!;
    const foodWith = withGtr.resources.find((r) => r.key === 'Food')!;
    const woodWithout = withoutGtr.resources.find((r) => r.key === 'Wood')!;
    const woodWith = withGtr.resources.find((r) => r.key === 'Wood')!;

    expect(goldWithout.rounded).toBe(28);
    expect(goldWith.rounded).toBe(26);
    expect(Number(goldWithout.villagers.toFixed(2))).toBe(27.42);
    expect(Number(goldWith.villagers.toFixed(2))).toBe(25.27);
    expect(Number(goldWithout.income.toFixed(2))).toBe(25.91);
    expect(Number(goldWith.income.toFixed(2))).toBe(28.11);
    expect(withoutGtr.total).toBe(79);
    expect(withGtr.total).toBe(77);

    // 仅提高采金效率，食物与木材配置零变动，也不出现未解码资源告警。
    expect(foodWith).toEqual(foodWithout);
    expect(woodWith).toEqual(woodWithout);
    expect(withGtr.warnings.some((w) => w.includes('大干道'))).toBe(false);

    // 链接编解码往返保留 506；勾选/取消勾选正常。
    const encoded = encodeProduction({ ...baseConfig, techs: [...baseTechs, 506] });
    const decoded = decodeProduction('?' + encoded);
    expect(decoded.errors).toEqual([]);
    expect(decoded.config.techs).toContain(506);

    const toggledOn = toggleProductionTech(ctx, baseConfig, 506);
    expect(toggledOn).toContain(506);
    const toggledOff = toggleProductionTech(ctx, { ...baseConfig, techs: toggledOn }, 506);
    expect(toggledOff).not.toContain(506);
  });

  it('非印度斯坦或城堡前携带 506 触发不可用科技报错', () => {
    const franksRes = calculateProduction(ctx, {
      civ: 'Franks',
      age: 4,
      walk: 3,
      farm: 1,
      techs: [506],
      rows: [{ unit: 83, building: 109, count: '1' }],
    });
    expect(franksRes.errors).toContain('方案含当前文明或时代不可用的科技，请清除不可用科技。');

    const feudalRes = calculateProduction(ctx, {
      civ: 'Hindustanis',
      age: 2,
      walk: 3,
      farm: 1,
      techs: [506],
      rows: [{ unit: 83, building: 109, count: '1' }],
    });
    expect(feudalRes.errors).toContain('方案含当前文明或时代不可用的科技，请清除不可用科技。');
  });

  it('默认真实费用、施工停采、持续供给、团战计划、训练对照、商路供给、开局模拟与 #486 ECO 指纹全部零漂移', () => {
    // 1. 默认 gatherModel / realCostOf（未显式传 includeCivEcoTechs）：全 56 文明 × 4 时代零变化
    for (const civ of civs) {
      for (const age of [1, 2, 3, 4]) {
        const g1 = gatherModel(age, civ.en);
        const g2 = gatherModel(age, civ.en, { techIds: new Set([506]) });
        const g3 = gatherModel(age, civ.en, { techIds: new Set() });
        expect(g2.rate).toEqual(g3.rate);
        const rc = realCostOf(discountedCost(CORE.unitById[329]!, civ.en, age), age, civ.en);
        expect(rc.g.rate).toEqual(g1.rate);
      }
    }

    // 2. 施工停采 (#/construction) 接受合法的印度斯坦城堡链接 techs=506，但停采量零漂移
    const baseSearch = '?cv=1&building=12&civ=Hindustanis&age=3&techs=&builders=1&baseline=1&tc=1&task=gold&walk=3&farm=1';
    const gtrSearch = '?cv=1&building=12&civ=Hindustanis&age=3&techs=506&builders=1&baseline=1&tc=1&task=gold&walk=3&farm=1';
    const decBase = decodeConstruction(baseSearch, ctx);
    const decGtr = decodeConstruction(gtrSearch, ctx);
    expect(decBase.errors).toEqual([]);
    expect(decGtr.errors).toEqual([]);
    const resBase = calculateConstruction(ctx, { ...DEFAULT_CONSTRUCTION, ...decBase.config });
    const resGtr = calculateConstruction(ctx, { ...DEFAULT_CONSTRUCTION, ...decGtr.config });
    expect(resGtr.target?.forgone).toBe(resBase.target?.forgone);

    // 3. 持续供给 (#/production?mode=army-supply) 旧链接 done: ['t:506'] 保持原口径：supported=false，金农=10
    const supplySource = {
      civ: 'Hindustanis',
      age: '3' as const,
      rows: [{ unit: 329, qty: '10' }],
      done: ['t:506'],
      planned: [],
      targets: [],
    };
    const research = armySupplyResearch(ctx, supplySource);
    const gtrEntry = research.completed.find((x) => x.entry.id === 506);
    expect(gtrEntry).toBeDefined();
    expect(gtrEntry?.supported).toBe(false);
    const supplySettings: ArmySupplySettings = {
      stance: 'current',
      planned: [],
      walk: 3,
      farm: 1,
      rows: [{ building: 101, count: '1', confirmed: true }],
    };
    const projected = projectArmySupply(ctx, supplySource, supplySettings, research);
    expect(projected.config).not.toBeNull();
    expect(projected.config!.techs).not.toContain(506);
    const supplyCalc = calculateProduction(ctx, projected.config!);
    expect(supplyCalc.resources.find((r) => r.key === 'Gold')!.rounded).toBe(10);

    // 4. 团战计划 (#/team-plan) completedUnlockTechIds 仍拒绝纯采集独科 506
    const plan = defaultTeamPlan();
    plan.players[0]!.civ = 'Hindustanis';
    plan.phases[1]!.players[0]!.completedUnlockTechIds = [506];
    expect(teamPlanErrors(plan, ctx).some((e) => e.includes('大干道'))).toBe(true);

    // 5. 训练对照 (#/production?mode=train-compare) 使用让印度斯坦进入结果行的非空过夹具，断言结果行存在且 techs 排除 506
    const knight = CORE.unitById[38]!;
    const clonedKnight = { ...knight, civs: [...knight.civs, 'Hindustanis'] };
    const clonedTrees: Trees = {
      ...ctx.trees,
      t: {
        ...ctx.trees.t,
        Hindustanis: ctx.trees.t.Hindustanis!.map((block) =>
          block[0] === 101 ? [block[0], block[1], block[2], [...block[3], [0, 0, 'u', 38, 1, null]]] : block,
        ),
      },
    };
    const clonedCtx: ProductionContext = {
      core: {
        ...CORE,
        units: CORE.units.map((u) => (u.id === 38 ? clonedKnight : u)),
        unitById: { ...CORE.unitById, 38: clonedKnight },
      },
      trees: clonedTrees,
    };
    const trainRes = compareTraining(clonedCtx, { age: 3, unit: 38, n: 10, civs: ['Hindustanis'] });
    expect(trainRes.errors).toEqual([]);
    const hindRow = trainRes.rows.find((r) => r.civ === 'Hindustanis');
    expect(hindRow).toBeDefined();
    expect(hindRow!.techs).not.toContain(506);

    // 6. 商路供给 (#/trade-income) 带入含/不含 506 的印度斯坦方案均合法且目标金耗一致
    const tradeProdBase: ProductionConfig = {
      civ: 'Hindustanis',
      age: 3,
      walk: 3,
      farm: 1,
      techs: [],
      rows: [{ unit: 329, building: 101, count: '1' }],
    };
    const tradeWithout = calculateTradeIncome(ctx, {
      ...newTradeIncomeConfig(),
      civ: 'Hindustanis',
      age: 3,
      targetMode: 'production',
      source: encodeProduction(tradeProdBase),
    });
    const tradeWith = calculateTradeIncome(ctx, {
      ...newTradeIncomeConfig(),
      civ: 'Hindustanis',
      age: 3,
      targetMode: 'production',
      source: encodeProduction({ ...tradeProdBase, techs: [506] }),
    });
    expect(tradeWithout.errors).toEqual([]);
    expect(tradeWith.errors).toEqual([]);
    expect(Number(tradeWithout.target!.toFixed(2))).toBe(163.64);
    expect(tradeWith.target).toBe(tradeWithout.target);

    // 7. 开局模拟 (buildSim) 显式手动研究 506 不触发大干道采金倍率（可达检查点 + 研究先于采样 + 正对照防空过）
    const ecoClone = structuredClone(ECO as unknown as EcoData);
    ecoClone.villager.trainTime = 100;
    ecoClone.buildings[82] = { ...(ecoClone.buildings[82] ?? { buildTime: 1, cost: {} }), buildTime: 1, cost: {} };
    ecoClone.techs[506] = { ...(ecoClone.techs[506] ?? { at: 82, cost: {}, researchTime: 10 }), at: 82, cost: {}, researchTime: 10 };
    const ups = Object.fromEntries(CORE.units.filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
    const makeGoldBo = (withResearch: boolean): BuildOrder => ({
      ...buildOrders[0]!,
      id: 'probe-1410',
      target: { age: 4, vils: 4 },
      steps: [
        {
          vils: 3,
          actions: [
            { type: 'build', building: 82 },
            { type: 'gather', task: 'gold', count: 3 },
          ],
        },
        { vils: 3, actions: withResearch ? [{ type: 'research' as const, tech: 506 }] : [] },
        { vils: 4, actions: [] },
      ],
    });
    for (const civ of ['Franks', 'Hindustanis'] as const) {
      const no506 = simulateBuild(makeGoldBo(false), civ, ecoClone, ups, { autoHouses: true });
      const with506 = simulateBuild(makeGoldBo(true), civ, ecoClone, ups, { autoHouses: true });
      expect(with506.steps.flatMap((s) => s.anomalies).some((a) => a.type === 'timeout')).toBe(false);
      expect(with506.steps[1]!.action).toBe('research');
      expect(with506.steps[1]!.doneAt).toBeLessThan(with506.steps[2]!.startAt);
      expect(with506.steps[2]!.startAt).toBeLessThan(3600);
      expect(with506.steps[2]!.stock.gold).toBeGreaterThan(100);
      expect(with506.steps[2]!.stock.gold).toBe(no506.steps[2]!.stock.gold);
    }
    // 正对照：若 506 错误注入 ecoTechs，同一可达探针黄金库存必严格升高，确保上述零漂移断言非空过
    const leakedEco = structuredClone(ecoClone);
    leakedEco.ecoTechs['506'] = structuredClone(ecoClone.civEcoTechs!['506']!);
    const baselineHind = simulateBuild(makeGoldBo(true), 'Hindustanis', ecoClone, ups, { autoHouses: true });
    const leakedHind = simulateBuild(makeGoldBo(true), 'Hindustanis', leakedEco, ups, { autoHouses: true });
    expect(leakedHind.steps[2]!.stock.gold).toBeGreaterThan(baselineHind.steps[2]!.stock.gold);

    // 8. #486 教学审计 ECO 指纹保持精确一致
    const ecoJson = JSON.parse(readFileSync(new URL('../../data/game/eco.json', import.meta.url), 'utf8')) as {
      units: Record<string, unknown>;
      ageReq: unknown;
      ecoTechs: unknown;
      civEco: unknown;
    };
    const ids = [...planContent.unitIds, 83];
    const ecoProjection = {
      units: ids.map((id) => [id, ecoJson.units[id]]),
      ageReq: ecoJson.ageReq,
      ecoTechs: ecoJson.ecoTechs,
      civEco: ecoJson.civEco,
    };
    const ecoHash = createHash('sha256').update(JSON.stringify(ecoProjection)).digest('hex');
    expect(ecoHash).toBe(TEACHING_COMPATIBILITY_188329.audit.eco);
  });
});

describe('Issue 1410: 六国同源经济告警去重与窄屏括注渲染', () => {
  const expectedMerged: Record<string, string[]> = {
    Malians: ['村民存放的黄金额外 +10%：该文明经济机制未计入，使用已支持的基础采集模型。'],
    Aztecs: ['村民携带量 +3：该文明经济机制未计入，使用已支持的基础采集模型。'],
    Khmer: ['农民不需要磨坊或城镇中心就可以存放食物（该加成另含农田采集 −5%）：该文明经济机制未计入，使用已支持的基础采集模型。'],
    Poles: [
      '波兰庄园农田加成：采集加成未计入，使用已支持的基础采集模型。',
      '石矿工不仅能产生石料，还能产生黄金：该文明经济机制未计入，使用已支持的基础采集模型。',
    ],
    Shu: ['伐木工不仅能产生木材，还能产生食物：该文明经济机制未计入，使用已支持的基础采集模型。'],
    Sicilians: ['农田升级提供的食物 +125%：该文明经济机制未计入，使用已支持的基础采集模型。'],
  };

  it('六国在全部 4 个时代输出逐字匹配的合并后告警，波兰保留庄园行且顺序不变', () => {
    for (const [civ, expected] of Object.entries(expectedMerged)) {
      for (const age of [1, 2, 3, 4]) {
        const res = calculateProduction(ctx, {
          civ,
          age,
          walk: 3,
          farm: 1,
          techs: [],
          rows: [{ unit: 83, building: 109, count: '1' }],
        });
        expect(res.errors).toEqual([]);
        expect(res.warnings, `${civ} age ${age}`).toEqual(expected);
      }
    }
  });

  it('非同源经济文本文明保留「（已单独列明的基础属性加成除外）」原口径，全站 56 国无同源重复行', () => {
    for (const civ of ['Danes', 'Dravidians', 'Goths', 'Khitans', 'Mapuche']) {
      const res = calculateProduction(ctx, {
        civ,
        age: 3,
        walk: 3,
        farm: 1,
        techs: [],
        rows: [{ unit: 83, building: 109, count: '1' }],
      });
      expect(
        res.warnings.some((w) => w.includes('（已单独列明的基础属性加成除外）')),
        civ,
      ).toBe(true);
    }

    for (const civ of civs) {
      for (const age of [1, 2, 3, 4]) {
        const sources = gatherUnsupportedSources(age, civ.en);
        const datEntries = DAT.civs[civ.en]?.bonus ?? [];
        const res = calculateProduction(ctx, {
          civ: civ.en,
          age,
          walk: 3,
          farm: 1,
          techs: [],
          rows: [{ unit: 83, building: 109, count: '1' }],
        });
        // 每条能唯一归属到经济 bon 的来源都不应再单独出现「：采集加成未计入」行
        for (const source of sources) {
          const idx = resolveGatherBonusIdx(source, datEntries);
          if (idx !== null && res.warnings.some((w) => w.startsWith(civ.bon[idx]!))) {
            expect(res.warnings.includes(`${source.label}：采集加成未计入，使用已支持的基础采集模型。`), `${civ.en} age ${age}`).toBe(false);
          }
        }
      }
    }
  });

  it('resolveGatherBonusIdx 与 mergeProductionEcoWarnings 严格拒绝混合来源、idx: null 与多归属，正确支持 idx: 0 与多项拼接', () => {
    const entry = (tech: number, idx: number | null, eco: DatEntry['eco'] = []): DatEntry => ({
      tech,
      name: `t${tech}`,
      age: 1,
      req: [],
      combat: false,
      rules: [],
      eco,
      idx,
      linked: 'auto',
    });

    // 混合来源（正科技 + 科技树）必须拒绝
    expect(resolveGatherBonusIdx({ key: 'class:4:carry', label: '村民携带量', techs: [10], fromTree: true }, [entry(10, 0)])).toBeNull();

    // 含 idx: null 与有效 idx 并存必须拒绝
    expect(resolveGatherBonusIdx({ key: 'res:276', label: '测试', techs: [10, 11], fromTree: false }, [entry(10, 1), entry(11, null)])).toBeNull();
    expect(resolveGatherBonusIdx({ key: 'res:276', label: '测试', techs: [10], fromTree: false }, [entry(10, 1), entry(10, null)])).toBeNull();

    // 多值归属必须拒绝
    expect(resolveGatherBonusIdx({ key: 'res:276', label: '测试', techs: [10, 11], fromTree: false }, [entry(10, 0), entry(11, 1)])).toBeNull();

    // idx: 0 正常匹配（不能被 falsy 吞掉）
    expect(resolveGatherBonusIdx({ key: 'res:502', label: '伐木附带产食物', techs: [1071], fromTree: false }, [entry(1071, 0)])).toBe(0);

    // 多条带数值来源合并到同一条 bon 时用顿号拼接
    const multiSources: CivGatherSource[] = [
      { key: 'task:farm:workRate', label: '农田采集 −5%', techs: [901], fromTree: false },
      { key: 'task:wood:workRate', label: '伐木 +10%', techs: [902], fromTree: false },
    ];
    const merged = mergeProductionEcoWarnings(multiSources, ['农民可直接存放食物'], new Set(), [entry(901, 0), entry(902, 0)]);
    expect(merged).toEqual(['农民可直接存放食物（该加成另含农田采集 −5%、伐木 +10%）：该文明经济机制未计入，使用已支持的基础采集模型。']);

    // 首条可合并、次条无配对且原文已含相同数值（兼容 ASCII - 与 Unicode −）：保持原位行序，且不重复追加括号
    const inPlaceSources: CivGatherSource[] = [
      { key: 'task:farm:workRate', label: '农田采集 −5%', techs: [901], fromTree: false },
      { key: 'res:267', label: '独立未配对加成', techs: [999], fromTree: false },
    ];
    expect(mergeProductionEcoWarnings(inPlaceSources, ['农民直接存放食物（农田采集 -5%）'], new Set(), [entry(901, 0)])).toEqual([
      '农民直接存放食物（农田采集 -5%）：该文明经济机制未计入，使用已支持的基础采集模型。',
      '独立未配对加成：采集加成未计入，使用已支持的基础采集模型。',
    ]);

    // 原文出现其他项的相同数值（如移速 +5%）不应误抑不同项的「伐木 +5%」
    expect(
      mergeProductionEcoWarnings(
        [{ key: 'task:wood:workRate', label: '伐木 +5%', techs: [903], fromTree: false }],
        ['农民直接存放食物且村民移速 +5%'],
        new Set(),
        [entry(903, 0)],
      ),
    ).toEqual(['农民直接存放食物且村民移速 +5%（该加成另含伐木 +5%）：该文明经济机制未计入，使用已支持的基础采集模型。']);
  });

  it('ProductionWarningText 与 CompareNumberText 对括注整段标签套 .num.nw 并保持普通数值分段', () => {
    const khmerWarn = '农民不需要磨坊或城镇中心就可以存放食物（该加成另含农田采集 −5%）：该文明经济机制未计入，使用已支持的基础采集模型。';
    const prodHtml = renderToStaticMarkup(createElement(ProductionWarningText, { text: khmerWarn }));
    expect(prodHtml).toContain('（该加成另含<span class="num nw">农田采集 −5%</span>）');

    const compareHtml = renderToStaticMarkup(createElement(CompareNumberText, { text: khmerWarn }));
    expect(compareHtml).toContain('（该加成另含<span class="num nw">农田采集 −5%</span>）');

    const compareNumeric = renderToStaticMarkup(createElement(CompareNumberText, { text: '目标数量须为 1–1000 的整数，村民存放的黄金额外 +10%' }));
    expect(compareNumeric).toContain('<span class="num nw">1–1000</span>');
    expect(compareNumeric).toContain('<span class="num nw">10%</span>');

    const multiHtml = renderToStaticMarkup(createElement(ProductionWarningText, { text: '测试（该加成另含农田采集 −5%、伐木 +10%）：该文明经济机制未计入。' }));
    expect(multiHtml).toContain('（该加成另含<span class="num nw">农田采集 −5%</span>、<span class="num nw">伐木 +10%</span>）');
  });
});

describe('Issue 1410: 攻城拆建筑接入南亚装甲战象 (1744) 与攻城战象 (1746)', () => {
  it('单位顺序、量词函数、URL 编解码与单位详情入口正确', () => {
    expect(SIEGE_UNIT_IDS).toEqual([1258, 422, 548, 1744, 1746, 331, 280, 550, 588, 36]);
    expect(siegeUnitCounter(1744)).toBe('头');
    expect(siegeUnitCounter(1746)).toBe('头');
    for (const id of [1258, 422, 548, 331, 280, 550, 588, 36]) {
      expect(siegeUnitCounter(id)).toBe('台');
    }

    const decoded = decodeSiege('?unit=1744&n=4&bldg=82&civ=Gurjaras', CORE);
    expect(decoded).toEqual({ unit: 1744, n: 4, bldg: 82, civ: 'Gurjaras', armor: [] });
    expect(encodeSiege(decoded)).toBe('unit=1744&n=4&bldg=82&civ=Gurjaras');

    expect(siegeUnitEntryVerified(armoredElephant, castle)).toBe(true);
    expect(siegeUnitEntryVerified(siegeElephant, castle)).toBe(true);
    expect(unitSiegeHref(armoredElephant, castle)).toBe('/siege?unit=1744');
    expect(unitSiegeHref(siegeElephant, castle)).toBe('/siege?unit=1746');
  });

  it('4 头拆城堡基准值（不限文明、四国、瞿折罗 +25% 附伤）精确吻合', () => {
    for (const civ of ['', 'Hindustanis', 'Bengalis', 'Dravidians']) {
      const r1744 = calculateSiege(armoredElephant, castle, 4, civ, []);
      expect(r1744.verified, `1744 ${civ}`).toBe(true);
      if (r1744.verified) {
        expect(r1744.hits).toBe(15);
        expect(r1744.gameSeconds).toBe(42);
        expect(r1744.realSeconds.toFixed(1)).toBe('24.7');
      }

      const r1746 = calculateSiege(siegeElephant, castle, 4, civ, []);
      expect(r1746.verified, `1746 ${civ}`).toBe(true);
      if (r1746.verified) {
        expect(r1746.hits).toBe(13);
        expect(r1746.gameSeconds).toBe(36);
        expect(r1746.realSeconds.toFixed(1)).toBe('21.2');
      }
    }

    const gur1744 = calculateSiege(armoredElephant, castle, 4, 'Gurjaras', []);
    expect(gur1744.verified).toBe(true);
    if (gur1744.verified) {
      expect(gur1744.hits).toBe(11);
      expect(gur1744.gameSeconds).toBe(30);
      expect(gur1744.realSeconds.toFixed(1)).toBe('17.6');
    }

    const gur1746 = calculateSiege(siegeElephant, castle, 4, 'Gurjaras', []);
    expect(gur1746.verified).toBe(true);
    if (gur1746.verified) {
      expect(gur1746.hits).toBe(9);
      expect(gur1746.gameSeconds).toBe(24);
      expect(gur1746.realSeconds.toFixed(1)).toBe('14.1');
    }
  });

  it('南亚 4 国与不限文明在全部 5 座对照建筑及护甲组合下均核实通过，非南亚文明拒算', () => {
    for (const unit of [armoredElephant, siegeElephant]) {
      for (const civ of ['', 'Hindustanis', 'Bengalis', 'Dravidians', 'Gurjaras']) {
        for (const bldgId of SIEGE_COMPARE_IDS) {
          const target = CORE.buildingById[bldgId]!;
          const armorIds = siegeArmorTechs(target).map((t) => t.id);
          const armorCombos: number[][] = [[]];
          for (const id of armorIds) armorCombos.push([id]);
          if (armorIds.length > 1) armorCombos.push(armorIds);
          for (const armor of armorCombos) {
            const res = calculateSiege(unit, target, 4, civ, armor);
            expect(res.verified, `${unit.id} ${civ} bldg=${bldgId} armor=${armor.join(',')}`).toBe(true);
            if (res.verified) {
              expect(res.hits).toBeGreaterThanOrEqual(1);
              expect(Number.isFinite(res.gameSeconds)).toBe(true);
            }
          }
        }
      }

      for (const nonSouthAsian of ['Franks', 'Britons', 'Persians', 'Chinese']) {
        const res = calculateSiege(unit, castle, 4, nonSouthAsian, []);
        expect(res.verified, `${unit.id} ${nonSouthAsian}`).toBe(false);
      }
    }
  });
});
