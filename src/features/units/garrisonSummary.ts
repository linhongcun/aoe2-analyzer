import { trainingUnitAge } from '../../domain/availabilityAge';
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
  age: number;
  config: GeneralGarrisonConfig | null;
  result: GeneralGarrisonResult | null;
  href: string | null;
}

export interface UnitGarrisonSummary {
  kind: 'select' | 'unavailable' | 'hosts';
  rows: UnitGarrisonHost[];
}

const validCapacity = (n: number) => Number.isSafeInteger(n) && n >= 0;

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
    const age = Math.max(trainingUnitAge(civ, unitId, unit.age), getGarrisonBuildingAge(building, civ, ctx.trees));
    const pending: UnitGarrisonHost = { building, age, config: null, result: null, href: null };
    try {
      const probe: GeneralGarrisonConfig = { civ, age, techs: [], rows: [{ unitId, count: '0', entry: 'enter' }] };
      const initial = calculateGeneralGarrison(ctx, building, probe, data);
      const processed = initial.rows[0];
      // Only a processed, exact zero row proves that the model passed its capacity preflight.
      if (
        initial.rows.length !== 1 ||
        processed?.unitId !== unitId ||
        processed.entry !== 'enter' ||
        processed.count !== '0' ||
        processed.countValue !== 0 ||
        !validCapacity(initial.capacity)
      ) {
        rows.push(pending);
        continue;
      }
      const canEnter = getGarrisonCandidates(ctx, building, probe, data).find((u) => u.id === unitId)?.canEnter ?? false;
      if (canEnter !== processed.canEnter) {
        rows.push(pending);
        continue;
      }
      if (!canEnter) continue;
      if (initial.errors.length || initial.capacity === 0) {
        rows.push(pending);
        continue;
      }
      const config: GeneralGarrisonConfig = { ...probe, rows: [{ unitId, count: String(initial.capacity), entry: 'enter' }] };
      const result = calculateGeneralGarrison(ctx, building, config, data);
      const finalRow = result.rows[0];
      if (
        result.errors.length ||
        !validCapacity(result.capacity) ||
        result.capacity !== initial.capacity ||
        result.usedSlots !== result.capacity ||
        result.rows.length !== 1 ||
        finalRow?.unitId !== unitId ||
        finalRow.entry !== 'enter' ||
        !finalRow.canEnter ||
        finalRow.countValue !== result.capacity
      ) {
        rows.push(pending);
        continue;
      }
      rows.push({ building, age, config, result, href: `/building/${building.id}?${writeGeneralGarrison(config)}` });
    } catch {
      rows.push(pending);
    }
  }
  return { kind: 'hosts', rows };
}
