/** Fixed DE185872 Slavic farm supply and independently removable tree bonus. */
import type { BuildOrder } from './buildOrder';
import type { EcoData } from './buildSim';

export interface SlavicCommand {
  Type: number;
  A: number;
  B: number;
  C: number;
  D: number;
}
export interface SlavicRawTree {
  civId: number;
  treeId: number;
  commands: SlavicCommand[];
}
export interface SlavicRawTech {
  tech: number;
  civ: number;
  effectId: number;
  requiredCount: number;
  requires: number[];
  researchLocation: number;
  researchAt: number[][];
  researchTime: number;
  cost: number[][];
  commands: SlavicCommand[];
}
export interface SlavicFarm {
  civId: number;
  farms: { unit: number; type: number; class: number; workRate: number; capacity: number }[];
}
type Row = EcoData['civEco'][string][number] & { name?: string };
export interface SlavicContext {
  physical: SlavicFarm | null;
  bonus: boolean;
  supplyMultiplier: number;
  reasons: string[];
}
export const SLAVIC_FARM_NOTE = '农田按供给上限连续估算，近距离可能低于原通用估算，不代表游戏内加成减益';
export const SLAVIC_FARM_DETAIL = '斯拉夫农田先按携带与往返计算采集均速，再与独立供给上限取较小值；食物池启动、田块完成与人数绑定、耗尽和续种未模拟。';
export const SLAVIC_TEAM_NOTE = '团队军事建筑提供人口未模拟';
export const SLAVIC_SOURCE_REASON = '斯拉夫农田或加成缺少完整已核来源，未计入';
const PHYSICAL: SlavicFarm = {
  civId: 23,
  farms: [
    { unit: 50, type: 80, class: 49, workRate: 0.4, capacity: 15 },
    { unit: 1187, type: 80, class: 49, workRate: 0.4, capacity: 15 },
  ],
};
const TREE: SlavicRawTree = {
  civId: 23,
  treeId: 7,
  commands: [
    { Type: 102, A: -1, B: -1, C: -1, D: 15.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 51.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 54.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 63.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 64.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 201.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 244.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 279.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 252.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 439.0 },
    { Type: 5, A: 214, B: -1, C: 13, D: 1.2300000190734863 },
    { Type: 5, A: 259, B: -1, C: 13, D: 1.2300000190734863 },
    { Type: 102, A: -1, B: -1, C: -1, D: 188.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 265.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 237.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 85.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 436.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 437.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 380.0 },
    { Type: 103, A: 602, B: -1, C: 0, D: 0.0 },
    { Type: 101, A: 602, B: 0, C: 0, D: 0.0 },
    { Type: 101, A: 602, B: 3, C: 0, D: 0.0 },
    { Type: 103, A: 875, B: -1, C: 0, D: 0.0 },
    { Type: 101, A: 875, B: 0, C: 0, D: 0.0 },
    { Type: 101, A: 875, B: 3, C: 0, D: 0.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 376.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 373.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 608.0 },
    { Type: 5, A: 50, B: -1, C: 13, D: 1.149999976158142 },
    { Type: 5, A: 1187, B: -1, C: 13, D: 1.149999976158142 },
    { Type: 102, A: -1, B: -1, C: -1, D: 1138.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 1142.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 909.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 910.0 },
  ],
};
const TECHS: Record<number, SlavicRawTech> = {
  '510': {
    tech: 510,
    civ: 23,
    effectId: 566,
    requiredCount: 0,
    requires: [],
    researchLocation: -1,
    researchAt: [],
    researchTime: 0,
    cost: [],
    commands: [
      { Type: 5, A: -1, B: 18, C: 5, D: 1.2000000476837158 },
      { Type: 5, A: -1, B: 43, C: 5, D: 1.2000000476837158 },
      { Type: 5, A: 1811, B: -1, C: 5, D: 1.2000000476837158 },
      { Type: 5, A: 1826, B: -1, C: 5, D: 1.2000000476837158 },
      { Type: 5, A: 1827, B: -1, C: 5, D: 1.2000000476837158 },
    ],
  },
  '511': {
    tech: 511,
    civ: 23,
    effectId: 567,
    requiredCount: 0,
    requires: [],
    researchLocation: -1,
    researchAt: [],
    researchTime: 0,
    cost: [],
    commands: [
      { Type: 5, A: -1, B: 13, C: 100, D: 0.8500000238418579 },
      { Type: 5, A: -1, B: 55, C: 100, D: 0.8500000238418579 },
      { Type: 5, A: 1923, B: -1, C: 100, D: 0.8500000238418579 },
      { Type: 5, A: 1120, B: -1, C: 100, D: 0.8500000238418579 },
      { Type: 5, A: 1122, B: -1, C: 100, D: 0.8500000238418579 },
      { Type: 5, A: 1744, B: -1, C: 100, D: 0.8500000238418579 },
      { Type: 5, A: 1746, B: -1, C: 100, D: 0.8500000238418579 },
      { Type: 5, A: 1962, B: -1, C: 100, D: 0.8500000238418579 },
      { Type: 5, A: 1980, B: -1, C: 100, D: 0.8500000238418579 },
    ],
  },
  '721': {
    tech: 721,
    civ: 23,
    effectId: 758,
    requiredCount: 0,
    requires: [],
    researchLocation: -1,
    researchAt: [],
    researchTime: 0,
    cost: [],
    commands: [
      { Type: 10, A: 12, B: -1, C: 21, D: 5.0 },
      { Type: 10, A: 20, B: -1, C: 21, D: 5.0 },
      { Type: 10, A: 132, B: -1, C: 21, D: 5.0 },
      { Type: 10, A: 498, B: -1, C: 21, D: 5.0 },
      { Type: 10, A: 10, B: -1, C: 21, D: 5.0 },
      { Type: 10, A: 14, B: -1, C: 21, D: 5.0 },
      { Type: 10, A: 87, B: -1, C: 21, D: 5.0 },
      { Type: 10, A: 86, B: -1, C: 21, D: 5.0 },
      { Type: 10, A: 101, B: -1, C: 21, D: 5.0 },
      { Type: 10, A: 153, B: -1, C: 21, D: 5.0 },
      { Type: 10, A: 150, B: -1, C: 21, D: 5.0 },
      { Type: 10, A: 49, B: -1, C: 21, D: 5.0 },
    ],
  },
};
const DECODED: Record<number, Row['effects']> = {
  '510': [
    { attr: 'speed', kind: 'attr', op: 'mul', target: 'class:18', v: 1.2 },
    { attr: 'speed', kind: 'attr', op: 'mul', target: 'class:43', v: 1.2 },
    { attr: 'speed', kind: 'attr', op: 'mul', target: 'unit:1811', v: 1.2 },
    { attr: 'speed', kind: 'attr', op: 'mul', target: 'unit:1826', v: 1.2 },
    { attr: 'speed', kind: 'attr', op: 'mul', target: 'unit:1827', v: 1.2 },
  ],
  '511': [
    { attr: 'cost', kind: 'attr', op: 'mul', target: 'class:13', v: 0.85 },
    { attr: 'cost', kind: 'attr', op: 'mul', target: 'class:55', v: 0.85 },
    { attr: 'cost', kind: 'attr', op: 'mul', target: 'unit:1923', v: 0.85 },
    { attr: 'cost', kind: 'attr', op: 'mul', target: 'unit:1120', v: 0.85 },
    { attr: 'cost', kind: 'attr', op: 'mul', target: 'unit:1122', v: 0.85 },
    { attr: 'cost', kind: 'attr', op: 'mul', target: 'unit:1744', v: 0.85 },
    { attr: 'cost', kind: 'attr', op: 'mul', target: 'unit:1746', v: 0.85 },
    { attr: 'cost', kind: 'attr', op: 'mul', target: 'unit:1962', v: 0.85 },
    { attr: 'cost', kind: 'attr', op: 'mul', target: 'unit:1980', v: 0.85 },
  ],
  '721': [],
};

const FARM_EFFECTS: Row['effects'] = [
  { kind: 'attr', target: 'task:farm', attr: 'workRate', op: 'mul', v: 1.23 },
  { kind: 'attr', target: 'unit:50', attr: 'workRate', op: 'mul', v: 1.15 },
  { kind: 'attr', target: 'unit:1187', attr: 'workRate', op: 'mul', v: 1.15 },
];
const FREE_EFFECTS: Row['effects'] = [
  { kind: 'freeTech', techName: 'Arson' },
  { kind: 'freeTech', techName: 'Gambesons' },
];
const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => [k, canonical(x)]),
        )
      : v;
const equal = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const isFarmRow = (r: Row) => 'slavicTree' in r || (r.name === 'Tech tree' && r.source === 'tree');
const farmValid = (r: Row) =>
  r.source === 'tree' &&
  r.name === 'Tech tree' &&
  r.age === 1 &&
  r.requires === undefined &&
  r.tech === undefined &&
  !r.slavicTech &&
  equal(r.slavicTree, TREE) &&
  equal(r.effects, FARM_EFFECTS);
const freeValid = (r: Row) =>
  r.source === 'tree' &&
  r.age === 1 &&
  r.name === 'Free techs' &&
  r.requires === undefined &&
  r.tech === undefined &&
  !r.slavicTree &&
  !r.slavicTech &&
  equal(r.effects, FREE_EFFECTS);
const techValid = (r: Row) => {
  const id = r.tech ?? -1,
    raw = TECHS[id];
  return (
    !!raw &&
    r.source === (id === 721 ? 'team' : 'bonus') &&
    r.age === 1 &&
    !r.slavicTree &&
    equal(r.requires, raw.requires) &&
    equal(r.slavicTech, raw) &&
    equal(r.effects, DECODED[id])
  );
};
/** Read once per scope/run. Missing bonus is a counterfactual, never missing physical source. */
export function slavicContext(eco: EcoData): SlavicContext {
  const rows = (eco.civEco.Slavs ?? []) as Row[];
  const physical = equal(eco.slavicFarm, PHYSICAL) ? eco.slavicFarm! : null;
  const farmRows = rows.filter(isFarmRow);
  const bonus = farmRows.length === 1 && farmValid(farmRows[0]!);
  let valid = farmRows.length === 0 || bonus;
  if (rows.filter((r) => r.name === 'Free techs' && r.source === 'tree').length > 1) valid = false;
  for (const id of [510, 511, 721]) {
    const group = rows.filter((r) => r.tech === id || r.slavicTech?.tech === id);
    if (group.length > 1 || (group.length === 1 && !techValid(group[0]!))) valid = false;
  }
  if (!rows.every((r) => isFarmRow(r) || freeValid(r) || [510, 511, 721].includes(r.tech ?? -1))) valid = false;
  const supplyMultiplier = bonus ? farmRows[0]!.effects.find((e) => e.target === 'unit:50')!.v! : 1;
  return { physical, bonus, supplyMultiplier, reasons: physical && valid ? [] : [SLAVIC_SOURCE_REASON] };
}
/** Reject tagged foreign rows before the generic attribute path, including direct helpers. */
export function slavicRowClass(row: Row, civ: string | undefined, context: SlavicContext | undefined) {
  if (civ !== 'Slavs') return 'slavicTree' in row || 'slavicTech' in row ? { kind: 'unhandled' as const, reason: SLAVIC_SOURCE_REASON } : null;
  if (isFarmRow(row))
    return context?.physical && context.bonus && farmValid(row) ? { kind: 'handled' as const } : { kind: 'unhandled' as const, reason: SLAVIC_SOURCE_REASON };
  if ([510, 511, 721].includes(row.tech ?? -1)) {
    if (!techValid(row)) return { kind: 'unhandled' as const, reason: SLAVIC_SOURCE_REASON };
    if (row.tech === 721) return { kind: 'irrelevant' as const, reason: SLAVIC_TEAM_NOTE };
    return null;
  }
  return freeValid(row) ? null : { kind: 'unhandled' as const, reason: SLAVIC_SOURCE_REASON };
}
/** Supply replenishes independently of walking; cap AFTER the inherited average trip. */
export function slavicFarmRate(context: SlavicContext | undefined, consumer: number): number {
  return context?.physical ? Math.min(consumer, context.physical.farms[0]!.workRate * context.supplyMultiplier) : consumer;
}
export const slavicHasFarmAssignment = (bo: BuildOrder): boolean => bo.steps.some((s) => s.actions.some((a) => a.type === 'gather' && a.task === 'farm'));
