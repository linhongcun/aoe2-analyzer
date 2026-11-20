import { civByEn } from '../data';
import type { TechSpec } from './duelState';
import { applicableTrainingTechs, selectTrainingIds } from './duelTrainingCost';
import {
  DEFAULT_PRODUCTION,
  DEFAULT_PRODUCTION_COUNT,
  effectiveProductionTechs,
  freeProductionTechs,
  productionBuildings,
  productionTechs,
  type ProductionConfig,
  type ProductionContext,
} from './production';
import { makeSimContext, simTechs } from './simulator';
import { emptyTrainTotal, evaluateTrainTotal, type TrainTotalConfig } from './trainTotal';
import type { Unit } from './types';

export interface TransferSkippedRow {
  name: string;
  reason: 'current' | 'pending' | 'target';
}

export type ProductionTransferNotice =
  | { source: 'duel'; side: 'a' | 'b'; civ: string; age: number; unit: string; qty: string }
  | { source: 'mixed-duel'; side: 'a' | 'b'; civ: string; age: number; count: number; search: string; pricing: string[]; unlocks: string[]; omitted: string[] }
  | { source: 'total' | 'production'; count: number; skipped: TransferSkippedRow[] };

export interface ProductionTransfer<T> {
  config: T;
  notice: ProductionTransferNotice | null;
}

function shell(civ: string, age: number, techs: number[] = []): ProductionConfig {
  return { ...DEFAULT_PRODUCTION, civ, age, techs, rows: [] };
}

function totalTechs(ctx: ProductionContext, config: TrainTotalConfig): number[] {
  return evaluateTrainTotal(ctx, config)
    .techs.filter((choice) => choice.selected && choice.selectable && !choice.free && !choice.invalidReason)
    .map((choice) => choice.id);
}

function notice(source: 'total' | 'production', count: number, skipped: TransferSkippedRow[]): ProductionTransferNotice | null {
  return count || skipped.length ? { source, count, skipped } : null;
}

export function duelToTrainTotal(
  ctx: ProductionContext,
  source: { side: 'a' | 'b'; unit: Unit; civ: string; age: number; count: number; techs: TechSpec; selected?: ReadonlySet<number> },
): ProductionTransfer<TrainTotalConfig> {
  const { unit, civ, age } = source;
  const sim = makeSimContext(ctx.core.techs, ctx.trees);
  const selected = source.selected ?? selectTrainingIds(source.techs, simTechs(sim, unit, civ), age, applicableTrainingTechs(sim, unit, civ, age));
  const explicit = Array.isArray(source.techs) ? source.techs : [];
  const config = { ...emptyTrainTotal(civ, age), rows: [{ unit: unit.id, qty: String(source.count) }], techs: [...new Set([...selected, ...explicit])] };
  config.techs = evaluateTrainTotal(ctx, config)
    .techs.filter(
      (choice) =>
        choice.selectable && !choice.free && !choice.invalidReason && (selected.has(choice.id) || (choice.panel === 'unlock' && explicit.includes(choice.id))),
    )
    .map((choice) => choice.id);
  return { config, notice: { source: 'duel', side: source.side, civ, age, unit: unit.zh, qty: String(source.count) } };
}

export function trainTotalToProduction(ctx: ProductionContext, source: TrainTotalConfig): ProductionTransfer<ProductionConfig> {
  const config = shell(civByEn(source.civ) ? source.civ : DEFAULT_PRODUCTION.civ, source.age ?? DEFAULT_PRODUCTION.age);
  const evaluated = evaluateTrainTotal(ctx, source);
  const selected = evaluated.techs
    .filter((choice) => choice.selected && !choice.invalidReason && (choice.selectable || choice.free))
    .map((choice) => choice.id);
  const available = new Set(productionTechs(ctx, config).map((tech) => tech.id));
  const free = freeProductionTechs(ctx, config);
  config.techs = selected.filter((id) => available.has(id) && !free.has(id));
  const skipped: TransferSkippedRow[] = [];
  for (const [index, line] of evaluated.lines.entries()) {
    if (line.status === 'pending') {
      skipped.push({ name: '', reason: 'pending' });
    } else if (evaluated.blocked.length || line.status === 'unavail' || !line.unit) {
      skipped.push({ name: line.unit?.zh ?? `单位 ${source.rows[index]!.unit}`, reason: 'current' });
    } else {
      const building = productionBuildings(ctx, config, line.unit)[0];
      if (building == null) skipped.push({ name: line.unit.zh, reason: 'target' });
      else if (!config.rows.some((row) => row.unit === line.unit!.id)) config.rows.push({ unit: line.unit.id, building, count: DEFAULT_PRODUCTION_COUNT });
    }
  }
  const carried = config.rows.length;
  if (!carried) config.rows = DEFAULT_PRODUCTION.rows.map((row) => ({ ...row }));
  return { config, notice: notice('total', carried, skipped) };
}

export function isDefaultProduction(config: ProductionConfig): boolean {
  const defaults = DEFAULT_PRODUCTION;
  const techs = (ids: number[]) => [...new Set(ids)].sort((a, b) => a - b).join(',');
  return (
    config.civ === defaults.civ &&
    config.age === defaults.age &&
    config.walk === defaults.walk &&
    config.farm === defaults.farm &&
    techs(config.techs) === techs(defaults.techs) &&
    config.rows.length === defaults.rows.length &&
    config.rows.every((row, index) => {
      const expected = defaults.rows[index]!;
      return row.unit === expected.unit && row.building === expected.building && row.count === expected.count;
    })
  );
}

export function productionToTrainTotal(ctx: ProductionContext, source: ProductionConfig): ProductionTransfer<TrainTotalConfig> {
  const config = emptyTrainTotal(source.civ, source.age);
  if (isDefaultProduction(source)) return { config, notice: null };
  config.techs = totalTechs(ctx, { ...config, techs: [...effectiveProductionTechs(ctx, source)] });
  const target = shell(config.civ, source.age, config.techs);
  const skipped: TransferSkippedRow[] = [];
  for (const row of source.rows) {
    const unit = ctx.core.unitById[row.unit];
    if (!unit || !productionBuildings(ctx, source, unit).length) skipped.push({ name: unit?.zh ?? `单位 ${row.unit}`, reason: 'current' });
    else if (!productionBuildings(ctx, target, unit).length) skipped.push({ name: unit.zh, reason: 'target' });
    else if (!config.rows.some((item) => item.unit === unit.id)) config.rows.push({ unit: unit.id, qty: '' });
  }
  return { config, notice: notice('production', config.rows.length, skipped) };
}
