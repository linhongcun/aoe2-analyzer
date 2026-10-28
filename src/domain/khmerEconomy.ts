/** Fixed DE185872 Khmer source gates and bounded continuous no-return farm estimate. */
import type { BuildOrder } from './buildOrder';
import type { EcoData } from './buildSim';
import { KHMER_FIXED_SOURCE } from './khmerSource';
import { KHMER_FIXED_PREREQUISITES } from './khmerPrerequisiteSource';
export interface KhmerCommand {
  Type: number;
  A: number;
  B: number;
  C: number;
  D: number;
}
export interface KhmerRawTech {
  tech: number;
  civ: number;
  effectId: number;
  requiredCount: number;
  requires: number[];
  researchLocation: number;
  researchAt: number[][];
  researchTime: number;
  cost: number[][];
  commands: KhmerCommand[];
}
export interface KhmerRawTree {
  civId: number;
  treeId: number;
  commands: KhmerCommand[];
}
export interface KhmerRawTeam {
  civId: number;
  teamId: number;
  commands: KhmerCommand[];
}
export interface KhmerFarm {
  civId: number;
  farms: { unit: number; type: number; class: number; workRate: number; capacity: number }[];
}
export interface KhmerPrerequisites {
  civId: number;
  nodes: Record<string, KhmerRawTech>;
}
type Row = EcoData['civEco'][string][number] & { name?: string };
export interface KhmerContext {
  physical: KhmerFarm | null;
  bonus: boolean;
  noPrerequisites: boolean;
  reasons: string[];
}
export const KHMER_PREREQUISITE_NOTE = '当前开局免建筑前置已计入，显式建筑照常付费建造';
export const KHMER_FARM_NOTE = '农田按免回仓与供给上限连续估算，结果可能低于原通用估算，不代表游戏内加成减益';
export const KHMER_FARM_DETAIL = '取消的是回仓往返，田内走点、食物池启动和瞬态、耗尽与续种未模拟；不绑定完成田块与农民人数。';
export const KHMER_SOURCE_REASON = '高棉农田或免前置缺少完整已核来源，未计入';
const FIXED = { ...KHMER_FIXED_SOURCE, khmerPrerequisites: KHMER_FIXED_PREREQUISITES };
const DECODED: Record<number, Row['effects']> = {
  638: [],
  654: [
    { kind: 'res', res: 33, op: 'set', v: 50 },
    { kind: 'attr', target: 'task:farm', attr: 'workRate', op: 'mul', v: 0.95 },
  ],
  657: [],
  672: [
    { kind: 'attr', target: 'unit:1132', attr: 'speed', op: 'mul', v: 1.1 },
    { kind: 'attr', target: 'unit:1134', attr: 'speed', op: 'mul', v: 1.1 },
  ],
};
const IDS = [638, 654, 657, 672];
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
const effects = (r: Row) => r.effects.map((x) => Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'label')));
export const khmerHasMarker = (r: object) => 'khmerTech' in r || 'khmerTree' in r || 'khmerTeam' in r;
const isTech = (r: Row, id: number) => r.tech === id || r.khmerTech?.tech === id;
const techValid = (r: Row, id: number) =>
  r.source === 'bonus' &&
  r.tech === id &&
  r.name === FIXED.names[id] &&
  r.age === 1 &&
  equal(r.requires, []) &&
  !('khmerTree' in r || 'khmerTeam' in r) &&
  equal(r.khmerTech, FIXED.techs[id]) &&
  equal(effects(r), DECODED[id]);
const treeRow = (r: Row) => 'khmerTree' in r || r.source === 'tree';
const teamRow = (r: Row) => 'khmerTeam' in r || r.source === 'team';
const treeValid = (r: Row) =>
  r.source === 'tree' &&
  r.name === 'Tech tree' &&
  r.age === 1 &&
  r.tech === undefined &&
  r.requires === undefined &&
  !('khmerTech' in r || 'khmerTeam' in r) &&
  equal(r.effects, []) &&
  equal(r.khmerTree, FIXED.tree);
const teamValid = (r: Row) =>
  r.source === 'team' &&
  r.name === 'Team bonus' &&
  r.age === 1 &&
  r.tech === undefined &&
  r.requires === undefined &&
  !('khmerTech' in r || 'khmerTree' in r) &&
  equal(r.effects, []) &&
  equal(r.khmerTeam, FIXED.team);
/** Compute full source identity once per scope/run, independently for farm and prerequisite groups. */
export function khmerContext(eco: EcoData): KhmerContext {
  const rows = (eco.civEco.Khmer ?? []) as Row[];
  const physical = equal(eco.khmerFarm, FIXED.khmerFarm) ? eco.khmerFarm! : null;
  const topology = equal(eco.khmerPrerequisites, FIXED.khmerPrerequisites);
  const trees = rows.filter(treeRow),
    teams = rows.filter(teamRow);
  const treeOk = trees.length === 1 && treeValid(trees[0]!);
  const teamOk = teams.length === 1 && teamValid(teams[0]!);
  const group = (id: number) => rows.filter((r) => isTech(r, id));
  const valid = (id: number) => {
    const g = group(id);
    return g.length === 1 && techValid(g[0]!, id);
  };
  const optional = (id: number) => group(id).length === 0 || valid(id);
  const bonus = !!physical && valid(654);
  const noPrerequisites = topology && treeOk && valid(638);
  const known = rows.every((r) => (treeRow(r) ? treeValid(r) : teamRow(r) ? teamValid(r) : IDS.some((id) => isTech(r, id))));
  return {
    physical,
    bonus,
    noPrerequisites,
    reasons: physical && topology && treeOk && teamOk && optional(638) && optional(654) && valid(657) && valid(672) && known ? [] : [KHMER_SOURCE_REASON],
  };
}
/** Reject malformed/foreign Khmer groups before the generic attribute fallback, even when decode is empty. */
export function khmerRowClass(row: Row, civ: string | undefined, context: KhmerContext | undefined) {
  if (civ !== 'Khmer') return khmerHasMarker(row) || IDS.includes(row.tech ?? -1) ? { kind: 'unhandled' as const, reason: KHMER_SOURCE_REASON } : null;
  if (treeRow(row))
    return treeValid(row)
      ? { kind: 'irrelevant' as const, reason: '当前开局不涉及的高棉科技树属性' }
      : { kind: 'unhandled' as const, reason: KHMER_SOURCE_REASON };
  if (teamRow(row))
    return teamValid(row)
      ? { kind: 'irrelevant' as const, reason: '蝎式弩团队射程不影响当前开局' }
      : { kind: 'unhandled' as const, reason: KHMER_SOURCE_REASON };
  const id = IDS.find((id) => isTech(row, id));
  if (id === undefined || !techValid(row, id) || (id === 654 && !context?.bonus) || (id === 638 && !context?.noPrerequisites))
    return { kind: 'unhandled' as const, reason: KHMER_SOURCE_REASON };
  if (id === 654 || id === 638) return { kind: 'handled' as const };
  return { kind: 'irrelevant' as const, reason: id === 657 ? '房屋驻扎不作为住房或资源加成' : '当前开局不训练战象，移动速度不影响时间线' };
}
export const khmerFarmRate = (context: KhmerContext | undefined, consumer: number) =>
  context?.physical ? Math.min(consumer, context.physical.farms[0]!.workRate) : consumer;
const MILL = [68, 129, 130, 131, 1711, 1720, 1734];
const BARRACKS = [12, 20, 132, 498];
/** Only the current Khmer farm/Range/Stable/Market paths; preserve every explicit paid action. */
export function khmerBuildingReady(context: KhmerContext | undefined, id: number, age: number, built: ReadonlyMap<number, number>) {
  const has = (ids: number[]) => ids.some((x) => (built.get(x) ?? 0) > 0);
  if (id === 50 || id === 1187) return !!context?.noPrerequisites || has(MILL);
  if (id === 87 || id === 101) return age >= 2 && (!!context?.noPrerequisites || has(BARRACKS));
  if (id === 84) return age >= 2 && (!!context?.noPrerequisites || has(MILL));
  return true;
}
export const khmerHasFarmAssignment = (bo: BuildOrder) => bo.steps.some((s) => s.actions.some((a) => a.type === 'gather' && a.task === 'farm'));
export function khmerNotes(context: KhmerContext, bo?: BuildOrder): string[] {
  if (context.reasons.length) return [];
  return [
    ...(context.noPrerequisites ? [KHMER_PREREQUISITE_NOTE] : []),
    ...(context.physical && context.bonus && bo && khmerHasFarmAssignment(bo) ? [KHMER_FARM_NOTE] : []),
  ];
}
