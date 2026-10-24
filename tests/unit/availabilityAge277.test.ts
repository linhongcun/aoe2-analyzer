import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import { calculateConstruction, constructionBuildingAge, constructionBuildings, DEFAULT_CONSTRUCTION } from '../../src/domain/construction';
import { calculateGeneralGarrison, getGarrisonBuildingAge, getGarrisonCandidates } from '../../src/domain/garrisonGeneral';
import { DEFAULT_PRODUCTION, productionBuildings, type ProductionContext } from '../../src/domain/production';
import { defaultTeamPlan, teamPlanErrors } from '../../src/domain/teamPlan';
import { buildingAge } from '../../src/domain/availabilityAge';
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
