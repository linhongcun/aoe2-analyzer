import raw from './construction.json';

interface Command {
  Type: number;
  A: number;
  B: number;
  C: number;
  D: number;
  index: number;
}
interface Rule {
  id: number;
  name: string;
  effect: number;
  requires: number[];
  count: number;
  commands: Command[];
}
interface ObjectData {
  class: number;
  time: number;
  at: number[];
  rate: number;
}
export interface ConstructionData {
  meta: { patch: string; sha256: string; source: string; engineVerifiedInPinnedBuild: boolean };
  buildings: Record<string, { forms: number[]; supported: boolean; reason: string }>;
  research: Record<string, Rule>;
  civs: Record<string, { units: Record<string, ObjectData>; tree: Command[]; team: Command[]; automatic: Rule[] }>;
}

export const CONSTRUCTION_DATA: ConstructionData = {
  meta: raw.meta,
  buildings: raw.buildings,
  research: raw.research,
  civs: Object.fromEntries(
    Object.entries(raw.civs).map(([name, civ]) => [name, { ...civ, units: raw.unitSets[civ.units]!, automatic: raw.automaticSets[civ.automatic]! }]),
  ),
};
