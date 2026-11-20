import { evaluateArmyCost, type ResearchEntry } from './armyCost';
import type { ArmyCostConfig } from './armyCostConfig';
import { BUILDING_LIMIT, PRODUCTION_UNLOCK_TECH_IDS, productionBuildings, productionTechs, type ProductionConfig, type ProductionContext } from './production';

export interface ArmySupplyRow {
  building: number;
  count: string;
  confirmed: boolean;
}
export interface ArmySupplySettings {
  stance: '' | 'current' | 'plan';
  planned: number[];
  walk: number;
  farm: number;
  rows: ArmySupplyRow[];
}

export function armySupplyResearch(ctx: ProductionContext, source: ArmyCostConfig) {
  const production = { civ: source.civ, age: Number(source.age) };
  const available = new Set(productionTechs(ctx, production).map((tech) => tech.id));
  const ledger = evaluateArmyCost(ctx, source).ledger;
  const withSupport = (entry: ResearchEntry) => ({ entry, supported: entry.id !== null && available.has(entry.id) && entry.status !== 'invalid' });
  return {
    completed: ledger
      .filter((entry) => entry.status === 'done' || entry.status === 'inferred-done' || (entry.status === 'invalid' && source.done.includes(entry.key)))
      .map(withSupport),
    planned: ledger.filter((entry) => entry.status === 'planned' || (entry.status === 'invalid' && !source.done.includes(entry.key))).map(withSupport),
    automatic: ledger.filter((entry) => entry.status === 'free'),
  };
}

export function projectArmySupply(ctx: ProductionContext, source: ArmyCostConfig, settings: ArmySupplySettings, research = armySupplyResearch(ctx, source)) {
  const availablePlan = research.planned.flatMap(({ entry, supported }) => (supported && entry.id !== null ? [entry.id] : []));
  const invalidPlan = settings.planned.some((id) => !availablePlan.includes(id));
  const researchIssue =
    settings.stance === ''
      ? '请选择科技口径。'
      : settings.stance !== 'plan'
        ? ''
        : invalidPlan
          ? '有计划研究在当前供给模型中不可用。'
          : settings.planned.length
            ? ''
            : '请明确选择要纳入的计划研究。';
  const completed = research.completed.flatMap(({ entry, supported }) => (supported && entry.id !== null ? [entry.id] : []));
  const config: ProductionConfig = {
    civ: source.civ,
    age: Number(source.age),
    techs: [...(settings.stance ? completed : []), ...(settings.stance === 'plan' ? settings.planned.filter((id) => availablePlan.includes(id)) : [])],
    walk: settings.walk,
    farm: settings.farm,
    rows: [],
  };
  const unlockedConfig = { ...config, techs: [...PRODUCTION_UNLOCK_TECH_IDS] };
  const rows = source.rows.map((original, index) => {
    const setup = settings.rows[index]!;
    const unit = ctx.core.unitById[original.unit];
    const buildings = unit ? productionBuildings(ctx, config, unit) : [];
    const availableBuilding = buildings.includes(setup.building);
    const validCount = /^\d+$/.test(setup.count) && Number(setup.count) <= BUILDING_LIMIT;
    let issue = '';
    if (!unit) issue = original.unit ? '无法识别来源兵种形态。' : '请返回账本补选兵种形态。';
    else if (!buildings.length) {
      const potential = productionBuildings(ctx, unlockedConfig, unit);
      if (!potential.length) issue = '现有供给模型无法确认这个形态的生产地点。';
      else {
        const unlocks = PRODUCTION_UNLOCK_TECH_IDS.filter((id) => productionBuildings(ctx, { ...config, techs: [...config.techs, id] }, unit).length).flatMap(
          (id) => ctx.core.techById[id]?.zh ?? [],
        );
        issue = unlocks.length ? `供给模型需要确认相关研究：${unlocks.join('、')}。` : '当前科技口径下，供给模型无法确认生产地点。';
      }
    } else if (!setup.confirmed) issue = '请确认所列形态可训练。';
    else if (!availableBuilding) issue = '请选择当前口径下的专用生产建筑。';
    else if (!validCount) issue = '请填写有效的建筑座数。';
    if (!issue) config.rows.push({ unit: original.unit, building: setup.building, count: setup.count });
    return { original, setup, unit, buildings, issue, availableBuilding, validCount };
  });
  const ready = !researchIssue && rows.length > 0 && config.rows.length === rows.length;
  return { rows, research, researchIssue, invalidPlan, availablePlan, config: ready ? config : null };
}
