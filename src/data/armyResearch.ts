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
}
export interface ArmyResearchData {
  meta: { generatedBy: string; patch: string; commit: string; sha256: string };
  nodes: Record<string, ResearchNode>;
  civs: Record<string, { id: number; disabled: number[]; mods: ResearchCommand[] }>;
  buildingTechs: number[];
  buildingTriggers: Record<string, number>;
}
export const ARMY_RESEARCH = raw as ArmyResearchData;
