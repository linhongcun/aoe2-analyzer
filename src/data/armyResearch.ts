import raw from '../../data/game/army_research.json';

export interface ResearchCommand {
  Type: number;
  A: number;
  B: number;
  C: number;
  D: number;
}
export interface ResearchNode {
  name: string | null;
  civ: number;
  requires: number[];
  count: number;
  location: number;
  time: number;
  cost: number[][];
  upgrades: number[][];
  enables: number[];
  mods: ResearchCommand[];
  combatUnits: number[];
  chargeOnlyCombatUnits?: number[];
  populationUnits?: number[];
}
export interface ArmyResearchData {
  meta: { generatedBy: string; patch: string; commit: string; sha256: string };
  nodes: Record<string, ResearchNode>;
  civs: Record<string, { id: number; disabled: number[]; enabled?: number[]; mods: ResearchCommand[] }>;
  buildingTechs: number[];
  fxTriggeredTechs?: number[];
  buildingTriggers: Record<string, number>;
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry);
  }
  return value;
}

export const ARMY_RESEARCH = deepFreeze(raw as ArmyResearchData);
