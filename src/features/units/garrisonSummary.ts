import {
  calculateGeneralGarrison,
  GENERAL_GARRISON_DATA,
  getGarrisonBuildingAge,
  getGarrisonBuildings,
  getGarrisonCandidates,
  writeGeneralGarrison,
  type GeneralGarrisonConfig,
  type GeneralGarrisonContext,
  type GeneralGarrisonData,
  type GeneralGarrisonResult,
} from '../../domain/garrisonGeneral';
import { civStatus } from '../../domain/simulator';
import type { Building } from '../../domain/types';

export interface UnitGarrisonHost {
  building: Building;
  age: number | null;
  config: GeneralGarrisonConfig | null;
  result: GeneralGarrisonResult | null;
  href: string | null;
}

export interface UnitGarrisonSummary {
  kind: 'select' | 'unavailable' | 'hosts';
  rows: UnitGarrisonHost[];
}

const validCapacity = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= 255;

function exactRow(result: GeneralGarrisonResult, unitId: number, count: string) {
  const row = result.rows[0];
  return result.rows.length === 1 && row?.unitId === unitId && row.entry === 'enter' && row.count === count && row.countValue === Number(count);
}

function earliestHost(ctx: GeneralGarrisonContext, building: Building, unitId: number, civ: string, data: GeneralGarrisonData): UnitGarrisonHost | null {
  const pending: UnitGarrisonHost = { building, age: null, config: null, result: null, href: null };
  try {
    if (!data.units[unitId] || !data.civs[civ]) return pending;
    const firstAge = getGarrisonBuildingAge(building, civ, ctx.trees);
    if (!Number.isSafeInteger(firstAge) || firstAge < 1 || firstAge > 4) return pending;
    for (let age = firstAge; age <= 4; age++) {
      const probe: GeneralGarrisonConfig = { civ, age, techs: [], rows: [{ unitId, count: '0', entry: 'enter' }] };
      const initial = calculateGeneralGarrison(ctx, building, probe, data);
      // A processed exact zero row proves that the model passed its capacity preflight.
      if (!exactRow(initial, unitId, '0') || !validCapacity(initial.capacity) || initial.usedSlots !== 0 || initial.remainingSlots !== initial.capacity)
        return pending;
      const canEnter = getGarrisonCandidates(ctx, building, probe, data).find((u) => u.id === unitId)?.canEnter ?? false;
      if (canEnter !== initial.rows[0]!.canEnter) return pending;
      if (!canEnter) {
        const control = calculateGeneralGarrison(ctx, building, { ...probe, rows: [] }, data);
        // Empty rows can change implicit shape techs; only matching capacity proves a safe negative.
        if (
          initial.errors.length !== 1 ||
          control.errors.length ||
          control.rows.length ||
          !validCapacity(control.capacity) ||
          control.capacity !== initial.capacity ||
          control.usedSlots !== 0 ||
          control.remainingSlots !== control.capacity
        )
          return pending;
        continue;
      }
      if (initial.errors.length || initial.capacity === 0) return pending;
      const count = String(initial.capacity);
      const config: GeneralGarrisonConfig = { ...probe, rows: [{ unitId, count, entry: 'enter' }] };
      const result = calculateGeneralGarrison(ctx, building, config, data);
      if (
        result.errors.length ||
        !validCapacity(result.capacity) ||
        result.capacity !== initial.capacity ||
        result.usedSlots !== result.capacity ||
        result.remainingSlots !== 0 ||
        !exactRow(result, unitId, count) ||
        !result.rows[0]!.canEnter
      )
        return pending;
      return { building, age, config, result, href: `/building/${building.id}?${writeGeneralGarrison(config)}` };
    }
    return null;
  } catch {
    return pending;
  }
}

export function unitGarrisonSummary(
  ctx: GeneralGarrisonContext,
  unitId: number,
  civ: string,
  data: GeneralGarrisonData = GENERAL_GARRISON_DATA,
): UnitGarrisonSummary {
  if (!civ) return { kind: 'select', rows: [] };
  const unit = ctx.core.unitById[unitId];
  if (!unit?.civs.includes(civ) || civStatus(ctx.trees, civ)['u' + unitId] === 0) return { kind: 'unavailable', rows: [] };
  const rows: UnitGarrisonHost[] = [];
  for (const building of getGarrisonBuildings(ctx).filter((b) => b.civs.includes(civ))) {
    const host = earliestHost(ctx, building, unitId, civ, data);
    if (host) rows.push(host);
  }
  return { kind: 'hosts', rows };
}
