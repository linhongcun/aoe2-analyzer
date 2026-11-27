import { beforeAll, describe, expect, it } from 'vitest';
import { civs, loadCore, loadTrees } from '../../src/data';
import { ARMY_RESEARCH } from '../../src/data/armyResearch';
import { ECO as eco } from '../../src/data/eco';
import { calculateConstruction, constructionBuildingAge, constructionBuildings, DEFAULT_CONSTRUCTION } from '../../src/domain/construction';
import { calculateGeneralGarrison, getGarrisonBuildingAge, getGarrisonCandidates } from '../../src/domain/garrisonGeneral';
import { GARRISON_TECH_DATA } from '../../src/domain/garrisonTechs';
import { DEFAULT_PRODUCTION, productionBuildings, productionTechAge, type ProductionContext } from '../../src/domain/production';
import { hasGatherAttrEffect } from '../../src/domain/realCost';
import { civStatus } from '../../src/domain/simulator';
import { defaultTeamPlan, teamPlanErrors } from '../../src/domain/teamPlan';
import {
  buildingAge,
  disabledTechSet,
  earlyEcoGatherTechAge,
  hasLitTreeNode,
  isCivTechEnabled,
  litTreeIds,
  treeNodeEarliestAge,
} from '../../src/domain/availabilityAge';
import type { Trees } from '../../src/domain/types';

let ctx: ProductionContext;
beforeAll(async () => {
  ctx = { core: await loadCore(), trees: await loadTrees() };
});

describe('#277 库曼攻城武器厂的时代在四个工具中一致', () => {
  it.each([
    ['Cumans', 2, 2, true],
    ['Cumans', 3, 2, true],
    ['Franks', 2, 3, false],
    ['Franks', 3, 3, true],
  ] as const)('%s 时代 %i：最早时代 %i，可用 %s', (civ, age, firstAge, available) => {
    const workshop = ctx.core.buildingById[49]!;
    expect(constructionBuildingAge(workshop, civ, ctx.trees)).toBe(firstAge);
    expect(constructionBuildings(ctx, { civ, age }).some((b) => b.id === workshop.id)).toBe(available);
    const construction = calculateConstruction(ctx, { ...DEFAULT_CONSTRUCTION, civ, age, buildingId: workshop.id, techs: [] });
    expect(construction.errors).toEqual(available ? [] : ['当前时代尚不能建造此建筑。']);

    expect(productionBuildings(ctx, { ...DEFAULT_PRODUCTION, civ, age, techs: [] }, ctx.core.unitById[1258]!)).toEqual(available ? [workshop.id] : []);

    expect(getGarrisonBuildingAge(workshop, civ, ctx.trees)).toBe(firstAge);
    const garrison = calculateGeneralGarrison(ctx, workshop, { civ, age, techs: [], rows: [] });
    expect(garrison.errors.includes('时代无效或早于此建筑。')).toBe(!available);

    const plan = defaultTeamPlan();
    plan.players[0]!.civ = civ;
    plan.phases[0]!.age = age;
    plan.phases[0]!.players[0]!.completedBuildings = [workshop.id];
    const errors = teamPlanErrors(plan, ctx);
    expect(errors).toHaveLength(available ? 0 : 1);
    if (!available) expect(errors[0]).toContain(`${workshop.zh}建造确认与文明或时代不符。`);
  });

  it.each([
    ['Cumans', 2, [1258]],
    ['Cumans', 3, [1258, 422]],
    ['Franks', 3, [1258]],
    ['Franks', 4, [1258, 422]],
  ] as const)('%s 时代 %i：生产和驻军保留相同的冲车形态 %j', (civ, age, expected) => {
    const workshop = ctx.core.buildingById[49]!;
    const ids = [1258, 422];
    const production = ids.filter((id) =>
      productionBuildings(ctx, { ...DEFAULT_PRODUCTION, civ, age, techs: [] }, ctx.core.unitById[id]!).includes(workshop.id),
    );
    const candidates = getGarrisonCandidates(ctx, workshop, { civ, age, techs: [], rows: [] });
    expect(production).toEqual(expected);
    expect(
      candidates
        .filter((u) => ids.includes(u.id) && u.canCreate)
        .map((u) => u.id)
        .sort((a, b) => ids.indexOf(a) - ids.indexOf(b)),
    ).toEqual(expected);
  });

  it('时代来自传入的科技树，缺少建筑格子时沿用目录', () => {
    const workshop = ctx.core.buildingById[49]!;
    const trees: Trees = { b: ctx.trees.b, t: { Copied: ctx.trees.t.Cumans! } };
    expect(buildingAge(workshop, 'Copied', trees)).toBe(2);
    expect(buildingAge(workshop, 'Missing', trees)).toBe(workshop.age);
    expect(buildingAge(ctx.core.buildingById[70]!, 'Copied', trees)).toBe(ctx.core.buildingById[70]!.age);
  });

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])('未知文明 %s 不把对象内置属性当作科技树', (civ) => {
    const workshop = ctx.core.buildingById[49]!;
    expect(buildingAge(workshop, civ, ctx.trees)).toBe(workshop.age);
  });

  it('其他所有文明/建筑组合保持通用目录时代不变', () => {
    let checked = 0;
    for (const building of ctx.core.buildings)
      for (const civ of building.civs) {
        if (civ === 'Cumans' && building.id === 49) continue;
        expect(buildingAge(building, civ, ctx.trees), `${civ}/${building.id}`).toBe(building.age);
        checked++;
      }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe('#1527 底层文明可用性原语全 56 文明对账守卫', () => {
  it('原型链键不会误命中科技树点亮、禁用集合与采集提前时代原语', () => {
    for (const civ of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(earlyEcoGatherTechAge({ age: 2 }, civ, true)).toBe(2);
      expect(treeNodeEarliestAge(ctx.trees, civ, 't', 47)).toBe(Infinity);
      expect(hasLitTreeNode(ctx.trees, civ, 't', 47)).toBe(false);
      expect(litTreeIds(ctx.trees, civ, 't').size).toBe(0);
      expect(disabledTechSet(GARRISON_TECH_DATA.civs, civ).size).toBe(0);
    }
  });

  it('全 56 文明通用采集经济科技提前时代与 trees.json 零漂移（勃艮第 11 项采集 vs 5 项非采集经济边界）', () => {
    expect(civs).toHaveLength(56);
    const mismatches: string[] = [];
    const burgundianGatherEarly: number[] = [];
    const burgundianNonGatherEarly: number[] = [];
    const nonBurgundianEcoEarly: string[] = [];
    let gatherPairsChecked = 0;

    for (const civ of civs) {
      const litTechs = litTreeIds(ctx.trees, civ.en, 't');
      for (const [idStr, ecoEntry] of Object.entries(eco.ecoTechs)) {
        const tid = Number(idStr);
        const tech = ctx.core.techById[tid];
        if (!tech || !litTechs.has(tid)) continue;
        const rowAge = treeNodeEarliestAge(ctx.trees, civ.en, 't', tid);
        expect(Number.isFinite(rowAge), `${civ.en} t${tid}`).toBe(true);
        const isGather = hasGatherAttrEffect(ecoEntry.effects);
        if (isGather) {
          gatherPairsChecked++;
          const earlyAge = earlyEcoGatherTechAge(tech, civ.en, true);
          const prodAge = productionTechAge(tech, civ.en);
          if (earlyAge !== rowAge || prodAge !== rowAge) {
            mismatches.push(`${civ.en} t${tid}(${tech.zh}): tree=${rowAge}, earlyEco=${earlyAge}, prod=${prodAge}`);
          }
          if (civ.en === 'Burgundians' && rowAge !== tech.age) burgundianGatherEarly.push(tid);
        } else {
          expect(earlyEcoGatherTechAge(tech, civ.en, false), `${civ.en} non-gather t${tid}`).toBe(tech.age);
          if (civ.en === 'Burgundians' && rowAge !== tech.age) burgundianNonGatherEarly.push(tid);
        }
        if (civ.en !== 'Burgundians' && rowAge !== tech.age) nonBurgundianEcoEarly.push(`${civ.en}:${tid}=${rowAge}`);
      }
    }

    expect(gatherPairsChecked).toBeGreaterThan(500);
    expect(mismatches).toEqual([]);
    expect(nonBurgundianEcoEarly).toEqual([]);
    expect(burgundianGatherEarly.sort((a, b) => a - b)).toEqual([13, 14, 55, 182, 202, 203, 213, 221, 249, 278, 279]);
    expect(burgundianNonGatherEarly.sort((a, b) => a - b)).toEqual([12, 15, 48, 65, 906]);
    expect(earlyEcoGatherTechAge({ age: 1 }, 'Burgundians', true)).toBe(1);
  });

  it('全 56 文明 garrison_techs 与 army_research 禁用集合一致，且底层点亮/禁用原语与 civStatus 对齐', () => {
    expect(civs).toHaveLength(56);
    const garrisonTechIds = Object.keys(GARRISON_TECH_DATA.techs).map(Number);
    expect(garrisonTechIds.length).toBeGreaterThan(0);

    for (const civ of civs) {
      const gtDisabled = disabledTechSet(GARRISON_TECH_DATA.civs, civ.en);
      const arDisabled = disabledTechSet(ARMY_RESEARCH.civs, civ.en);
      for (const tid of garrisonTechIds) {
        expect(gtDisabled.has(tid), `${civ.en} disabled parity t${tid}`).toBe(arDisabled.has(tid));
      }

      const status = civStatus(ctx.trees, civ.en);
      const litTechs = litTreeIds(ctx.trees, civ.en, 't');
      for (const tech of ctx.core.techs) {
        const expectedLit = status['t' + tech.id] === 1;
        expect(litTechs.has(tech.id), `${civ.en} litTreeIds t${tech.id}`).toBe(expectedLit);
        expect(hasLitTreeNode(ctx.trees, civ.en, 't', tech.id), `${civ.en} hasLitTreeNode t${tech.id}`).toBe(expectedLit);
        expect(isCivTechEnabled(tech, civ.en, status, gtDisabled), `${civ.en} isCivTechEnabled t${tech.id}`).toBe(
          tech.civs.includes(civ.en) && expectedLit && !gtDisabled.has(tech.id),
        );
      }
    }
  });
});
