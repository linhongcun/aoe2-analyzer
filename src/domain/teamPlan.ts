/** Issue 243: explicit shared agreements, never a team score or automatic readiness claim. */
import content from '../content/team-plan.json';
import shapes from '../data/garrison_general.json';
import { civs } from '../data';
import { DATA_PATCH_BUILD } from '../data/meta';
import { civStatus } from './simulator';
import { productionBuildings, productionTechs, type ProductionContext } from './production';
import { buildingAge } from './availabilityAge';

export const PLAN_AGES = [2, 3, 4] as const;
export type PlanAge = (typeof PLAN_AGES)[number];
export type PlayerId = 'p1' | 'p2' | 'p3' | 'p4';
export const TASK_KINDS = ['scout', 'breach', 'screen', 'support'] as const;
export type TaskKind = (typeof TASK_KINDS)[number];
export const TASK_NAMES: Record<TaskKind, string> = { scout: '侦察', breach: '破城', screen: '掩护', support: '支援' };
export const POSITION_NAMES = { unspecified: '未指定', flank: '边位', pocket: '口袋', custom: '自记位置' } as const;
export const SUPPLY_NAMES = { unchecked: '兵力与资源未核对', 'self-reported-ready': '玩家自报已核对', 'self-reported-short': '玩家自报仍需补充' } as const;
export const PLAN_LIMITS = { name: 24, position: 48, title: 80, map: 80, note: 120, agreement: 160, buildings: 8, forms: 16, techs: 32 } as const;
// Every structurally legal string uses UTF-16 length (the same limit as HTML maxLength).
// At most three UTF-8 bytes per code unit; these bounds accommodate the full schema.
export const PLAN_JSON_BYTES = 98304;
export const PLAN_TOKEN_LIMIT = 131072;
export const PLAN_SEARCH_LIMIT = PLAN_TOKEN_LIMIT + 32;
export const TEAM_PLAN_UNIT_IDS: readonly number[] = content.unitIds;
export const TEAM_PLAN_SOURCES = content.sources;
export const TEAM_PLAN_CHECKED = content.checked;
export interface PlanPlayer {
  id: PlayerId;
  name: string;
  civ: string;
  position: keyof typeof POSITION_NAMES;
  positionNote: string;
}
export interface PlanForce {
  unitId: number;
  buildingId: number;
}
export interface PlayerPhase {
  playerId: PlayerId;
  main: PlanForce | null;
  secondary: PlanForce | null;
  completedBuildings: number[];
  completedUnlockTechIds: number[];
  completedForms: number[];
  supply: keyof typeof SUPPLY_NAMES;
  supplyNote: string;
}
export interface PlanTask {
  kind: TaskKind;
  owners: PlayerId[];
  intentionalGap: boolean;
  gapReason: string;
  note: string;
}
export interface PlanPhase {
  age: PlanAge;
  players: PlayerPhase[];
  tasks: PlanTask[];
  supportTrigger: string;
  rally: string;
  retreat: string;
  notApplicable: string;
}
export interface TeamPlan {
  version: 1;
  patch: number;
  title: string;
  map: { name: string; openness: 'unspecified' | 'open' | 'closed' | 'mixed-land'; conditions: string };
  players: PlanPlayer[];
  phases: PlanPhase[];
  activeAge: PlanAge;
  example: null | 'open-land-4v4-v1';
}
export const emptyPlayerPhase = (playerId: PlayerId): PlayerPhase => ({
  playerId,
  main: null,
  secondary: null,
  completedBuildings: [],
  completedUnlockTechIds: [],
  completedForms: [],
  supply: 'unchecked',
  supplyNote: '',
});
export function defaultTeamPlan(): TeamPlan {
  const players: PlanPlayer[] = ['p1', 'p2'].map((id) => ({
    id: id as PlayerId,
    name: id.toUpperCase(),
    civ: 'Franks',
    position: 'unspecified',
    positionNote: '',
  }));
  return {
    version: 1,
    patch: DATA_PATCH_BUILD,
    title: '',
    map: { name: '', openness: 'unspecified', conditions: '' },
    players,
    phases: PLAN_AGES.map((age) => ({
      age,
      players: players.map((p) => emptyPlayerPhase(p.id)),
      tasks: [],
      supportTrigger: '',
      rally: '',
      retreat: '',
      notApplicable: '',
    })),
    activeAge: 2,
    example: null,
  };
}
export const exampleTeamPlan = (): TeamPlan => structuredClone(content.example) as TeamPlan;
export function addPlanPlayer(plan: TeamPlan): TeamPlan {
  // A damaged imported claim must never acquire a new person merely by reusing its ID.
  if (plan.phases.some((phase) => phase.tasks.some((task) => task.owners.some((owner) => !plan.players.some((p) => p.id === owner))))) return plan;
  const id = (['p1', 'p2', 'p3', 'p4'] as const).find((id) => !plan.players.some((p) => p.id === id));
  if (!id) return plan;
  return {
    ...plan,
    players: [...plan.players, { id, name: id.toUpperCase(), civ: 'Franks', position: 'unspecified', positionNote: '' }],
    phases: plan.phases.map((phase) => ({ ...phase, players: [...phase.players, emptyPlayerPhase(id)] })),
  };
}
export function removePlanPlayer(plan: TeamPlan, id: PlayerId): TeamPlan {
  if (plan.players.length <= 2) return plan;
  return {
    ...plan,
    players: plan.players.filter((p) => p.id !== id),
    phases: plan.phases.map((phase) => ({
      ...phase,
      players: phase.players.filter((p) => p.playerId !== id),
      tasks: phase.tasks.map((task) => ({ ...task, owners: task.owners.filter((owner) => owner !== id) })),
    })),
  };
}
export function planTaskStatus(task: PlanTask): 'assigned' | 'intentional-gap' | 'unassigned' | 'conflict' {
  if (task.owners.length) return task.intentionalGap ? 'conflict' : 'assigned';
  return task.intentionalGap ? 'intentional-gap' : 'unassigned';
}
export const TASK_STATUS_NAMES = { assigned: '已认领', 'intentional-gap': '有意留空', unassigned: '尚未分配', conflict: '认领与有意留空冲突' } as const;

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: readonly string[]) =>
  Object.keys(v).length === allowed.length && Object.keys(v).every((key) => allowed.includes(key));
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const ids = (v: unknown, max: number): v is number[] => Array.isArray(v) && v.length <= max && v.every(integer) && new Set(v).size === v.length;
const playerId = (v: unknown): v is PlayerId => typeof v === 'string' && /^p[1-4]$/.test(v);
const member = (v: unknown, values: readonly unknown[]) => values.includes(v);
function forceShape(v: unknown) {
  return v === null || (object(v) && keys(v, ['unitId', 'buildingId']) && integer(v.unitId) && integer(v.buildingId));
}
/** Shape errors are fatal; known-shaped references remain editable and are checked after loading data. */
export function teamPlanShape(v: unknown): v is TeamPlan {
  if (
    !object(v) ||
    !keys(v, ['version', 'patch', 'title', 'map', 'players', 'phases', 'activeAge', 'example']) ||
    v.version !== 1 ||
    v.patch !== DATA_PATCH_BUILD ||
    !str(v.title, PLAN_LIMITS.title) ||
    !member(v.activeAge, PLAN_AGES) ||
    !member(v.example, [null, 'open-land-4v4-v1'])
  )
    return false;
  const m = v.map;
  if (
    !object(m) ||
    !keys(m, ['name', 'openness', 'conditions']) ||
    !str(m.name, PLAN_LIMITS.map) ||
    !str(m.conditions, PLAN_LIMITS.agreement) ||
    !member(m.openness, ['unspecified', 'open', 'closed', 'mixed-land'])
  )
    return false;
  if (
    !Array.isArray(v.players) ||
    v.players.length < 2 ||
    v.players.length > 4 ||
    !v.players.every(
      (p) =>
        object(p) &&
        keys(p, ['id', 'name', 'civ', 'position', 'positionNote']) &&
        playerId(p.id) &&
        str(p.name, PLAN_LIMITS.name) &&
        str(p.civ, 80) &&
        member(p.position, Object.keys(POSITION_NAMES)) &&
        str(p.positionNote, PLAN_LIMITS.position),
    ) ||
    new Set(v.players.map((p) => p.id)).size !== v.players.length
  )
    return false;
  if (!Array.isArray(v.phases) || v.phases.length !== 3) return false;
  const roster = v.players as PlanPlayer[];
  return v.phases.every((phase, index) => {
    if (
      !object(phase) ||
      !keys(phase, ['age', 'players', 'tasks', 'supportTrigger', 'rally', 'retreat', 'notApplicable']) ||
      phase.age !== PLAN_AGES[index] ||
      !['supportTrigger', 'rally', 'retreat', 'notApplicable'].every((key) => str(phase[key], PLAN_LIMITS.agreement))
    )
      return false;
    if (
      !Array.isArray(phase.players) ||
      phase.players.length !== roster.length ||
      !phase.players.every(
        (row) =>
          object(row) &&
          keys(row, ['playerId', 'main', 'secondary', 'completedBuildings', 'completedUnlockTechIds', 'completedForms', 'supply', 'supplyNote']) &&
          playerId(row.playerId) &&
          forceShape(row.main) &&
          forceShape(row.secondary) &&
          ids(row.completedBuildings, PLAN_LIMITS.buildings) &&
          ids(row.completedForms, PLAN_LIMITS.forms) &&
          ids(row.completedUnlockTechIds, PLAN_LIMITS.techs) &&
          member(row.supply, Object.keys(SUPPLY_NAMES)) &&
          str(row.supplyNote, PLAN_LIMITS.note),
      )
    )
      return false;
    if (
      new Set(phase.players.map((row) => row.playerId)).size !== phase.players.length ||
      !phase.players.every((row) => roster.some((p) => p.id === row.playerId))
    )
      return false;
    if (
      !Array.isArray(phase.tasks) ||
      phase.tasks.length > 4 ||
      !phase.tasks.every(
        (t) =>
          object(t) &&
          keys(t, ['kind', 'owners', 'intentionalGap', 'gapReason', 'note']) &&
          member(t.kind, TASK_KINDS) &&
          Array.isArray(t.owners) &&
          t.owners.length <= 4 &&
          t.owners.every(playerId) &&
          new Set(t.owners).size === t.owners.length &&
          typeof t.intentionalGap === 'boolean' &&
          str(t.gapReason, PLAN_LIMITS.note) &&
          str(t.note, PLAN_LIMITS.note),
      )
    )
      return false;
    return new Set(phase.tasks.map((t) => t.kind)).size === phase.tasks.length;
  });
}
export function encodeTeamPlan(plan: TeamPlan): string {
  if (!teamPlanShape(plan)) throw new Error('计划结构或字段长度超限，请检查输入。');
  const bytes = new TextEncoder().encode(JSON.stringify(plan));
  if (bytes.length > PLAN_JSON_BYTES) throw new Error('计划正文超过字节上限，未生成截断链接。');
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const token = btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  if (token.length > PLAN_TOKEN_LIMIT) throw new Error('计划链接超过上限，未生成截断链接。');
  return new URLSearchParams({ version: '1', plan: token }).toString();
}
export function decodeTeamPlan(search: string): { plan: TeamPlan | null; errors: string[] } {
  if (!search || search === '?') return { plan: defaultTeamPlan(), errors: [] };
  const fail = () => ({ plan: null, errors: ['链接无法完整恢复：版本、编码、结构或长度无效；请保留原链接或显式重置。'] });
  if (search.length > PLAN_SEARCH_LIMIT) return fail();
  try {
    decodeURIComponent(search.replaceAll('+', ' '));
    const params = new URLSearchParams(search);
    if (
      [...params.keys()].some((k) => !['version', 'plan'].includes(k)) ||
      params.getAll('version').length !== 1 ||
      params.getAll('plan').length !== 1 ||
      params.get('version') !== '1'
    )
      return fail();
    const token = params.get('plan')!;
    if (!/^[A-Za-z0-9_-]+$/.test(token) || token.length > PLAN_TOKEN_LIMIT || token.length % 4 === 1) return fail();
    const binary = atob(token.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (token.length % 4)) % 4));
    if (binary.length > PLAN_JSON_BYTES) return fail();
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const plan: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!teamPlanShape(plan)) return fail();
    // Reject noncanonical base64 trailing bits while allowing JSON whitespace/key order.
    let canonical = '';
    for (const byte of bytes) canonical += String.fromCharCode(byte);
    if (btoa(canonical).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') !== token) return fail();
    return { plan, errors: [] };
  } catch {
    return fail();
  }
}
/** projectBase is document.baseURI, including the generated static page's <base>. */
export function teamPlanShareUrl(plan: TeamPlan, projectBase: string): string {
  const base = new URL(projectBase);
  base.search = '';
  base.hash = '';
  base.pathname = base.pathname.replace(/\/team-plan\/?$/, '/');
  const url = new URL('team-plan/', base);
  url.search = '';
  url.hash = '/team-plan?' + encodeTeamPlan(plan);
  return url.href;
}

export type ForceStatus =
  'unselected' | 'invalid' | 'unsupported' | 'civ-unavailable' | 'age-unavailable' | 'superseded-shape' | 'missing-prerequisites' | 'conditions-met';
export const FORCE_STATUS_NAMES: Record<ForceStatus, string> = {
  unselected: '未指定兵种',
  invalid: '引用无效',
  unsupported: '暂未支持',
  'civ-unavailable': '该文明不可用',
  'age-unavailable': '时代未到',
  'superseded-shape': '已被升级取代',
  'missing-prerequisites': '尚缺前置',
  'conditions-met': '所列前置已满足',
};
export interface ForceCheck {
  status: ForceStatus;
  reasons: string[];
  potentialBuildingIds: number[];
  missingFormIds: number[];
  missingUnlockTechIds: number[];
  missingBuildingIds: number[];
}
const shapeIndex = shapes.unitUpgradeTechs as Record<string, number[]>;
export function requiredPlanUnlocks(unitId: number): number[] {
  return content.unlockRequirements.filter((r) => r.units.includes(unitId)).flatMap((r) => r.techs);
}
export function planPotentialBuildings(ctx: ProductionContext, civ: string, age: PlanAge, unitId: number): number[] {
  const unit = ctx.core.unitById[unitId];
  if (!unit) return [];
  return productionBuildings(ctx, { civ, age, techs: productionTechs(ctx, { civ, age }).map((t) => t.id), rows: [], walk: 3, farm: 1 }, unit);
}
function ancestor(ctx: ProductionContext, low: number, high: number): boolean {
  const seen = new Set<number>();
  let unit = ctx.core.unitById[high];
  while (unit?.from_ && !seen.has(unit.id)) {
    seen.add(unit.id);
    if (unit.from_ === low) return true;
    unit = ctx.core.unitById[unit.from_];
  }
  return false;
}
export function checkPlanForce(ctx: ProductionContext, player: PlanPlayer, phase: PlayerPhase, age: PlanAge, force: PlanForce | null): ForceCheck {
  const result: ForceCheck = {
    status: 'unselected',
    reasons: [],
    potentialBuildingIds: [],
    missingFormIds: [],
    missingUnlockTechIds: [],
    missingBuildingIds: [],
  };
  const stop = (status: ForceStatus, reason: string) => ({ ...result, status, reasons: [reason] });
  if (!force) return result;
  const unit = ctx.core.unitById[force.unitId];
  if (!unit || !ctx.core.buildingById[force.buildingId] || !civs.some((c) => c.en === player.civ))
    return stop('invalid', '文明、单位或生产建筑不存在，请重新选择。');
  if (!TEAM_PLAN_UNIT_IDS.includes(unit.id) || (!content.baseFormIds.includes(unit.id) && !shapeIndex[unit.id]?.length))
    return stop('unsupported', '本版仅核对39个常规陆战形态；特色、队友授予或特殊生产路线暂未支持，不替换为近似单位。');
  if (!unit.civs.includes(player.civ) || civStatus(ctx.trees, player.civ)['u' + unit.id] !== 1)
    return stop('civ-unavailable', '该文明常规科技树没有这一精确形态。');
  result.potentialBuildingIds = planPotentialBuildings(ctx, player.civ, age, unit.id);
  if (!result.potentialBuildingIds.length) return stop('age-unavailable', '该文明当前时代尚无已支持的生产路线。');
  if (!result.potentialBuildingIds.includes(force.buildingId)) return stop('invalid', '所选生产建筑不属于当前文明、时代的合法路线，请调整地点。');
  const higher = phase.completedForms.find(
    (id) => TEAM_PLAN_UNIT_IDS.includes(id) && ancestor(ctx, unit.id, id) && planPotentialBuildings(ctx, player.civ, age, id).length > 0,
  );
  if (higher) return stop('superseded-shape', `已确认${ctx.core.unitById[higher]!.zh}升级完成，当前选择的${unit.zh}已被取代；请调整精确形态。`);
  if (!content.baseFormIds.includes(unit.id) && !phase.completedForms.includes(unit.id)) result.missingFormIds.push(unit.id);
  result.missingUnlockTechIds = requiredPlanUnlocks(unit.id).filter((id) => !phase.completedUnlockTechIds.includes(id));
  if (!phase.completedBuildings.includes(force.buildingId)) result.missingBuildingIds.push(force.buildingId);
  result.reasons = [
    ...result.missingFormIds.map((id) => `尚未确认${ctx.core.unitById[id]!.zh}所需升级实际完成。`),
    ...result.missingUnlockTechIds.map((id) => `尚未确认${ctx.core.techById[id]?.zh ?? id}解锁研究实际完成。`),
    ...result.missingBuildingIds.map((id) => `尚未确认${ctx.core.buildingById[id]!.zh}已建成并可用。`),
  ];
  result.status = result.reasons.length ? 'missing-prerequisites' : 'conditions-met';
  return result;
}
/** Semantic problems preserve the complete object; the editor never silently drops references. */
export function teamPlanErrors(plan: TeamPlan, ctx: ProductionContext): string[] {
  const errors: string[] = [];
  for (const player of plan.players) if (!civs.some((c) => c.en === player.civ)) errors.push(`${player.id}：未知文明 ${player.civ}，请重新选择。`);
  for (const phase of plan.phases) {
    for (const row of phase.players) {
      const player = plan.players.find((p) => p.id === row.playerId)!;
      const prefix = `${phase.age === 2 ? '封建' : phase.age === 3 ? '城堡' : '帝王'} ${player.name || player.id}`;
      for (const force of [row.main, row.secondary]) {
        if (force && (!ctx.core.unitById[force.unitId] || !ctx.core.buildingById[force.buildingId]))
          errors.push(`${prefix}：存在未知兵种或生产地点，请重新选择。`);
      }
      for (const id of row.completedForms) {
        const unit = ctx.core.unitById[id];
        if (!unit) errors.push(`${prefix}：完成形态 ID ${id} 不存在。`);
        else if (!TEAM_PLAN_UNIT_IDS.includes(id)) errors.push(`${prefix}：${unit.zh}的升级确认本版暂未支持。`);
        else if (content.baseFormIds.includes(id)) errors.push(`${prefix}：${unit.zh}为基础形态，无需形态升级确认，请移除该确认。`);
        else if (!unit.civs.includes(player.civ) || !planPotentialBuildings(ctx, player.civ, phase.age, id).length)
          errors.push(`${prefix}：${unit.zh}升级确认与文明或时代不符。`);
      }
      for (const id of row.completedUnlockTechIds) {
        const tech = ctx.core.techById[id];
        if (!tech) errors.push(`${prefix}：解锁科技 ID ${id} 不存在。`);
        else if (!productionTechs(ctx, { civ: player.civ, age: phase.age }).some((t) => t.id === id))
          errors.push(`${prefix}：${tech.zh}研究确认与文明、时代或本工具范围不符。`);
      }
      for (const id of row.completedBuildings) {
        const b = ctx.core.buildingById[id];
        if (!b) errors.push(`${prefix}：已建建筑 ID ${id} 不存在。`);
        else if (
          !b.civs.includes(player.civ) ||
          buildingAge(b, player.civ, ctx.trees) > phase.age ||
          !(ctx.trees.t[player.civ] ?? []).some((block) => block[0] === id)
        )
          errors.push(`${prefix}：${b.zh}建造确认与文明或时代不符。`);
      }
    }
    for (const task of phase.tasks) {
      const phaseName = phase.age === 2 ? '封建' : phase.age === 3 ? '城堡' : '帝王';
      if (task.owners.some((id) => !plan.players.some((p) => p.id === id)))
        errors.push(`${phaseName}阶段${TASK_NAMES[task.kind]}任务存在已移除的负责人，可取消该认领后重新分配。`);
      if (planTaskStatus(task) === 'conflict') errors.push(`${phaseName}阶段${TASK_NAMES[task.kind]}同时认领和有意留空，请选择一种约定。`);
    }
  }
  return [...new Set(errors)];
}
