import raw from '../../data/game/army_cost_usage.json';

export type EcoOnlyUnitId = 83 | 128 | 17;

export interface ArmyCostUsageEntry {
  readonly tids: readonly number[];
  readonly allFree: boolean;
  readonly ecoOnlyUnits: readonly EcoOnlyUnitId[];
}

interface ArmyCostUsageData {
  readonly meta: {
    readonly generatedBy: string;
    readonly patch: string;
    readonly commit: string;
    readonly sha256: string;
  };
  readonly bonuses: Readonly<Record<string, ArmyCostUsageEntry>>;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry);
  }
  return value;
}

export const ARMY_COST_USAGE = deepFreeze(raw as ArmyCostUsageData);
