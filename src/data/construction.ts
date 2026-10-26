import raw from './construction.json';
import validateConstruction from '../content/schema/compiled/construction.mjs';
import { constructionReferenceProblems } from '../content/schema/policy.mjs';
import { readValidatedJson } from './validatedJson';

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

export interface CompactConstructionData extends Omit<ConstructionData, 'civs'> {
  unitSets: Record<string, ObjectData>[];
  automaticSets: Rule[][];
  civs: Record<string, { units: number; automatic: number; tree: Command[]; team: Command[] }>;
}

export function parseConstructionData(value: unknown): ConstructionData {
  const data = readValidatedJson(value, validateConstruction, '多人施工');
  const invalidReference = constructionReferenceProblems(data)[0];
  if (invalidReference) throw new Error(`数据校验失败（多人施工）：${invalidReference.path} ${invalidReference.message}`);
  return {
    meta: data.meta,
    buildings: data.buildings,
    research: data.research,
    civs: Object.fromEntries(
      Object.entries(data.civs).map(([name, civ]): [string, ConstructionData['civs'][string]] => {
        const units = data.unitSets[civ.units],
          automatic = data.automaticSets[civ.automatic];
        if (!units || !automatic) throw new Error(`数据校验失败（多人施工）：${name} 共享字典索引不存在`);
        return [name, { ...civ, units, automatic }];
      }),
    ),
  };
}
export const CONSTRUCTION_DATA = parseConstructionData(raw);
