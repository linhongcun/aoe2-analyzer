import { beforeAll, expect, it } from 'vitest';
import { civs, loadCore, loadTrees } from '../../src/data';
import { litTreeIds } from '../../src/domain/availabilityAge';
import { calculateProduction, decodeProduction, productionTechAge, productionTechs, type ProductionContext } from '../../src/domain/production';
import { defaultTeamPlan, teamPlanErrors } from '../../src/domain/teamPlan';
import { compareTraining } from '../../src/features/production/trainCompareModel';

let ctx: ProductionContext;
beforeAll(async () => {
  ctx = { core: await loadCore(), trees: await loadTrees() };
});

it('各文明和时代保留可研究的单位费用科技，排除纯建筑造价科技', () => {
  const unitCosts = [373, 488, 499, 514, 625, 782, 785, 835, 1380, 1496];
  const costIds = new Set([...unitCosts, 455]);
  for (const { en: civ } of civs) {
    const lit = litTreeIds(ctx.trees, civ, 't');
    for (const age of [1, 2, 3, 4]) {
      const expected = unitCosts.filter((id) => {
        const tech = ctx.core.techById[id]!;
        return lit.has(id) && tech.civs.includes(civ) && productionTechAge(tech, civ) <= age;
      });
      expect(
        productionTechs(ctx, { civ, age })
          .map((t) => t.id)
          .filter((id) => costIds.has(id))
          .sort((a, b) => a - b),
        `${civ}/${age}`,
      ).toEqual(expected);
    }
  }
});
it('旧生产链接与团战计划沿用既有错误，训练对照不再选入建筑造价', () => {
  const { config } = decodeProduction('?civ=Slavs&age=4&techs=455&rows=878:82:2');
  expect(calculateProduction(ctx, config).errors).toContain('方案含当前文明或时代不可用的科技，请清除不可用科技。');
  const plan = defaultTeamPlan();
  plan.players[0]!.civ = 'Slavs';
  for (const phase of plan.phases.filter((p) => p.age >= 3)) phase.players[0]!.completedUnlockTechIds = [455];
  expect(teamPlanErrors(plan, ctx).filter((s) => s.includes('罗斯堡垒研究确认与文明、时代或本工具范围不符'))).toHaveLength(2);
  const result = compareTraining(ctx, { civs: ['Slavs'], unit: 38, n: 1, age: 3 });
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0]!.techs).not.toContain(455);
});
