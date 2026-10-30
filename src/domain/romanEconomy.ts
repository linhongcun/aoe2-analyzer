/** Fixed DE188329 Roman worker bonus and independently sourced farm supply. */
import type { BuildOrder } from './buildOrder';
import type { EcoData, EffectRow } from './buildSim';

export interface RomanCommand {
  Type: number;
  A: number;
  B: number;
  C: number;
  D: number;
}
export interface RomanRawTree {
  civId: number;
  treeId: number;
  commands: RomanCommand[];
}
export interface RomanRawTeam {
  civId: number;
  teamId: number;
  commands: RomanCommand[];
}
export interface RomanRawTech {
  tech: number;
  civ: number;
  effectId: number;
  requiredCount: number;
  requires: number[];
  researchLocation: number;
  researchAt: number[][];
  researchTime: number;
  cost: number[][];
  commands: RomanCommand[];
}
export interface RomanFarm {
  civId: number;
  farms: { unit: number; type: number; class: number; workRate: number; capacity: number }[];
}
type Row = EffectRow & { name?: string; romanTech?: RomanRawTech; romanTree?: RomanRawTree; romanTeam?: RomanRawTeam };
export interface RomanContext {
  physical: RomanFarm | null;
  complete: boolean;
  bonus: boolean;
  supplyMultiplier: number;
  buildMultiplier: number;
  reasons: string[];
}

export const ROMAN_SOURCE_REASON = '罗马农田或村民加成缺少完整已核来源，未计入';
export const ROMAN_WORK_NOTE = '村民采集与建造加成已计入；修理未模拟';
export const ROMAN_FARM_NOTE = '农田按供给上限连续估算，近距离可能低于原通用估算，不代表游戏内加成减益';
export const ROMAN_FARM_DETAIL = '罗马农田先按携带与往返计算采集均速，再与独立供给上限取较小值；食物池启动、田块完成与人数绑定、耗尽和续种未模拟。';
export const ROMAN_TEAM_NOTE = '蝎式弩最小射程团队加成不影响当前开局经济';
const PHYSICAL: RomanFarm = {
  civId: 43,
  farms: [
    { unit: 50, type: 80, class: 49, workRate: 0.4, capacity: 15 },
    { unit: 1187, type: 80, class: 49, workRate: 0.4, capacity: 15 },
  ],
};
// Full command identities from the pinned DAT, including every disabled technology.
const TREE: RomanRawTree = {
  civId: 43,
  treeId: 890,
  commands: [
    ...[
      244, 37, 376, 375, 608, 64, 380, 231, 438, 439, 217, 264, 716, 77, 85, 436, 428, 265, 379, 188, 54, 437, 237, 201, 320, 221, 279, 875, 602, 1138, 1142,
      904, 909, 910,
    ].map((D) => ({ Type: 102, A: -1, B: -1, C: -1, D })),
    { Type: 8, A: 886, B: 12, C: -1, D: 1 },
  ],
};
const TEAM: RomanRawTeam = {
  civId: 43,
  teamId: 891,
  commands: [
    { Type: 0, A: 279, B: -1, C: 20, D: 1 },
    { Type: 0, A: 542, B: -1, C: 20, D: 1 },
  ],
};
const rawTech = (tech: number, effectId: number, commands: RomanCommand[]): RomanRawTech => ({
  tech,
  civ: 43,
  effectId,
  requiredCount: 0,
  requires: [],
  researchLocation: -1,
  researchAt: [],
  researchTime: 0,
  cost: [],
  commands,
});
const TECHS: Record<number, RomanRawTech> = {
  887: rawTech(887, 898, [
    { Type: 5, A: -1, B: 4, C: 13, D: 1.0499999523162842 },
    { Type: 5, A: 214, B: -1, C: 13, D: 1.038095235824585 },
    { Type: 5, A: 259, B: -1, C: 13, D: 1.038095235824585 },
    { Type: 5, A: 50, B: -1, C: 13, D: 1.0499999523162842 },
    { Type: 5, A: 1187, B: -1, C: 13, D: 1.0499999523162842 },
  ]),
  892: rawTech(892, 900, [
    { Type: 5, A: 279, B: -1, C: 105, D: 0.5 },
    { Type: 5, A: 542, B: -1, C: 105, D: 0.5 },
  ]),
};
const DECODED: Record<number, Row['effects']> = {
  887: [
    { kind: 'attr', target: 'class:4', attr: 'workRate', op: 'mul', v: 1.05 },
    { kind: 'attr', target: 'task:farm', attr: 'workRate', op: 'mul', v: 1.038095 },
    { kind: 'attr', target: 'unit:50', attr: 'workRate', op: 'mul', v: 1.05 },
    { kind: 'attr', target: 'unit:1187', attr: 'workRate', op: 'mul', v: 1.05 },
  ],
  892: [
    { kind: 'attr', target: 'unit:279', attr: 'goldCost', op: 'mul', v: 0.5 },
    { kind: 'attr', target: 'unit:542', attr: 'goldCost', op: 'mul', v: 0.5 },
  ],
};
const NAMES: Record<number, string> = { 887: 'C-Bonus, Villagers work faster', 892: 'C-Bonus, Cheaper scorpions' };
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, v]) => [key, canonical(v)]),
        )
      : value;
const equal = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
export const hasRomanMarker = (row: object): boolean => 'romanTech' in row || 'romanTree' in row || 'romanTeam' in row;
const isTech = (row: Row, id: number) => row.tech === id || row.romanTech?.tech === id;
const treeRow = (row: Row) => row.source === 'tree' || 'romanTree' in row;
const teamRow = (row: Row) => row.source === 'team' || 'romanTeam' in row;
const techValid = (row: Row, id: number) =>
  equal(row, { source: 'bonus', age: 1, tech: id, name: NAMES[id], requires: [], romanTech: TECHS[id], effects: DECODED[id] });
const treeValid = (row: Row) => equal(row, { source: 'tree', age: 1, name: 'Tech tree', romanTree: TREE, effects: [] });
const teamValid = (row: Row) => equal(row, { source: 'team', age: 1, name: 'Team bonus', romanTeam: TEAM, effects: [] });

/** Whole bonus removal is a counterfactual; partial or unknown source families fail closed. */
export function romanContext(eco: EcoData): RomanContext {
  const rows = (eco.civEco.Romans ?? []) as Row[];
  const physicalInput = (eco as EcoData & { romanFarm?: RomanFarm }).romanFarm;
  const physical = equal(physicalInput, PHYSICAL) ? physicalInput! : null;
  const trees = rows.filter(treeRow),
    teams = rows.filter(teamRow);
  const group = (id: number) => rows.filter((row) => isTech(row, id));
  const valid = (id: number) => {
    const found = group(id);
    return found.length === 1 && techValid(found[0]!, id);
  };
  const optional = (id: number) => group(id).length === 0 || valid(id);
  const known = rows.every((row) => (treeRow(row) ? treeValid(row) : teamRow(row) ? teamValid(row) : [887, 892].some((id) => techValid(row, id))));
  const complete =
    !!physical && trees.length === 1 && treeValid(trees[0]!) && teams.length === 1 && teamValid(teams[0]!) && optional(887) && optional(892) && known;
  const bonus = complete && valid(887);
  const bonusRow = bonus ? group(887)[0]! : undefined;
  return {
    physical,
    complete,
    bonus,
    supplyMultiplier: bonusRow?.effects.find((effect) => effect.target === 'unit:50')?.v ?? 1,
    buildMultiplier: bonusRow?.effects.find((effect) => effect.target === 'class:4')?.v ?? 1,
    reasons: complete ? [] : [ROMAN_SOURCE_REASON],
  };
}
/** This runs before generic workRate application, including direct gather helpers. */
export function romanRowClass(row: Row, civ: string | undefined, context: RomanContext | undefined) {
  const rejected = { kind: 'unhandled' as const, reason: ROMAN_SOURCE_REASON };
  if (civ !== 'Romans') return hasRomanMarker(row) || [887, 892].includes(row.tech ?? -1) ? rejected : null;
  if (!context?.complete) return rejected;
  if (treeValid(row) || techValid(row, 887)) return { kind: 'handled' as const };
  // Its complete source is checked above; the shared classifier determines
  // whether the actual order trains either discounted Scorpion unit.
  if (techValid(row, 892)) return null;
  if (teamValid(row)) return { kind: 'irrelevant' as const, reason: ROMAN_TEAM_NOTE };
  return rejected;
}
/** The supplier's workRate never multiplies the consumer's workRate or walking time. */
export function romanFarmRate(context: RomanContext | undefined, consumer: number): number {
  return context?.physical ? Math.min(consumer, context.physical.farms[0]!.workRate * context.supplyMultiplier) : consumer;
}
/** Apply only to construction progress; research and training keep their own timers. */
export const romanBuilderMultiplier = (context: RomanContext | undefined): number => (context?.complete && context.bonus ? context.buildMultiplier : 1);
export const romanHasFarmAssignment = (bo: BuildOrder): boolean =>
  bo.steps.some((step) => step.actions.some((action) => action.type === 'gather' && action.task === 'farm'));
export function romanNotes(eco: EcoData, bo: BuildOrder): string[] {
  const context = romanContext(eco);
  return context.complete ? [...(context.bonus ? [ROMAN_WORK_NOTE] : []), ...(romanHasFarmAssignment(bo) ? [ROMAN_FARM_NOTE, ROMAN_FARM_DETAIL] : [])] : [];
}
