import { civs } from '../data';
import { DEFAULT_PRODUCTION, productionBuildings, productionTechs, type ProductionConfig, type ProductionContext } from './production';

export interface UnitProductionInput {
  unit: number;
  civ: string;
  age: number;
  techs?: readonly number[];
}

/** 只投影生产模型能解释的条件；数量留空，由玩家确定。 */
export function unitProductionEntry(ctx: ProductionContext, input: UnitProductionInput) {
  const errors: string[] = [];
  const unit = ctx.core.unitById[input.unit];
  const config: ProductionConfig = { ...DEFAULT_PRODUCTION, civ: input.civ, age: input.age, techs: [], rows: [] };
  if (!civs.some((c) => c.en === input.civ)) errors.push('当前文明不存在，请重新选择。');
  if (![1, 2, 3, 4].includes(input.age)) errors.push('当前时代无效，请重新选择。');
  if (!unit) errors.push('当前单位不存在，请重新选择。');
  const selected = [...new Set(input.techs ?? [])];
  const supported = new Set(productionTechs(ctx, config).map((t) => t.id));
  config.techs = selected.filter((id) => supported.has(id));
  const buildings = unit ? productionBuildings(ctx, config, unit) : [];
  if (unit && !buildings.length) errors.push('当前文明、时代和科技条件下没有可核实的生产地点。');
  config.rows = [{ unit: input.unit, building: buildings[0] ?? unit?.b ?? 0, count: '' }];
  return { config, omittedTechs: selected.filter((id) => !supported.has(id)), errors };
}
