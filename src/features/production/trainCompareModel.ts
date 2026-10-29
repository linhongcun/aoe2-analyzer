import { civs } from '../../data';
import {
  calculateProduction,
  effectiveProductionTechs,
  productionBuildings,
  productionTechs,
  type ProductionConfig,
  type ProductionContext,
  type ProductionLine,
} from '../../domain/production';
import { orderedCivs, trainCompareErrors, type TrainCompareConfig } from './trainCompareCodec';

export interface TrainCompareRow {
  civ: string;
  line: ProductionLine;
  total: number;
  warnings: string[];
  techs: number[];
}
export interface TrainCompareResult {
  rows: TrainCompareRow[];
  unavailable: { civ: string; reason: string; warnings?: string[] }[];
  civs: string[];
  errors: string[];
}
function fullConfig(ctx: ProductionContext, civ: string, unit: number): ProductionConfig {
  const config: ProductionConfig = {
    civ,
    age: 3,
    walk: 3,
    farm: 1,
    techs: productionTechs(ctx, { civ, age: 3 }).map((tech) => tech.id),
    rows: [{ unit, building: 101, count: '1' }],
  };
  return { ...config, techs: [...effectiveProductionTechs(ctx, config)] };
}
export function availableTrainingCivs(ctx: ProductionContext, unitId: number): string[] {
  const unit = ctx.core.unitById[unitId];
  if (!unit) return [];
  return civs.filter((civ) => productionBuildings(ctx, fullConfig(ctx, civ.en, unitId), unit).includes(101)).map((civ) => civ.en);
}
export function compareTraining(ctx: ProductionContext, config: TrainCompareConfig): TrainCompareResult {
  const errors = trainCompareErrors(config);
  const result: TrainCompareResult = { rows: [], unavailable: [], civs: [], errors };
  if (errors.length) return result;
  const unit = ctx.core.unitById[config.unit];
  if (!unit) {
    result.errors.push('当前资料没有所请求的单位形态。');
    return result;
  }
  const selected = config.civs === null ? availableTrainingCivs(ctx, config.unit) : orderedCivs(config.civs);
  result.civs = selected;
  for (const civ of selected) {
    const plan = fullConfig(ctx, civ, config.unit);
    if (!productionBuildings(ctx, plan, unit).includes(101)) {
      result.unavailable.push({ civ, reason: '该文明在城堡时代无法在马厩生产所选形态。' });
      continue;
    }
    const calculated = calculateProduction(ctx, plan),
      line = calculated.lines[0];
    const total = line ? line.seconds * config.n : NaN;
    if (calculated.errors.length || !line || !Number.isFinite(total) || total <= 0) {
      result.unavailable.push({ civ, reason: calculated.errors.join(' ') || '无法核实有效训练时间。', warnings: calculated.warnings });
      continue;
    }
    result.rows.push({ civ, line, total, warnings: calculated.warnings, techs: [...calculated.techs] });
  }
  result.rows.sort((a, b) => a.total - b.total || civs.findIndex((civ) => civ.en === a.civ) - civs.findIndex((civ) => civ.en === b.civ));
  return result;
}
