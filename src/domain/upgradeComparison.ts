/** issue 205：对同一对手比较科技方案；所有属性和战斗结果复用现有模拟器。 */
import { duel, fighterFrom, type Fighter } from './duel';
import { TEAM_BONUSES } from './effects';
import { civStatus, presetUpTo, simTechs, simulate, type SimContext } from './simulator';
import type { Cost, StatSet, Tech, Unit } from './types';

export interface UpgradeSide {
  uid: number;
  civ: string;
  age: number;
  techs: 'f' | 'c' | number[];
  team: number[];
}

export interface UpgradePlan {
  ok: true;
  /** 展开预设及必要前置，按 ID 排序、去重，可直接保存到分享链接。 */
  spec: UpgradeSide & { techs: number[] };
  u: Unit;
  sel: Set<number>;
  S: StatSet;
  F: Fighter;
  techs: Tech[];
  /** 全部必要前置，包含分享链接中已显式列出的前置。 */
  prerequisites: Tech[];
}

export interface InvalidUpgrade {
  ok: false;
  reason: string;
}

const sortedUnique = (ids: readonly number[]) => [...new Set(ids)].sort((a, b) => a - b);
const sameIds = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((id, i) => id === b[i]);
const sameContext = (a: UpgradePlan['spec'], b: UpgradePlan['spec']) => a.uid === b.uid && a.civ === b.civ && a.age === b.age && sameIds(a.team, b.team);

/** 严格解析比较方案；不沿用普通 PK 对非法配置的回落或丢弃行为。 */
export function upgradePlan(ctx: SimContext, byId: Record<number, Unit>, spec: UpgradeSide): UpgradePlan | InvalidUpgrade {
  const u = byId[spec.uid];
  if (!Number.isInteger(spec.uid) || !u) return { ok: false, reason: '单位不存在，请重新选择单位。' };
  if (!Object.hasOwn(ctx.trees.t, spec.civ)) return { ok: false, reason: '文明不存在，请重新选择文明。' };
  const status = civStatus(ctx.trees, spec.civ);
  if (!u.civs.includes(spec.civ) || !status['u' + u.id]) return { ok: false, reason: '所选文明不能生产该单位。' };
  if (!Number.isInteger(spec.age) || spec.age < 1 || spec.age > 4 || spec.age < u.age) return { ok: false, reason: '所选时代无效，或尚未解锁该单位。' };

  const team = sortedUnique(spec.team);
  for (const id of team) {
    const bonus = TEAM_BONUSES[id];
    if (!Number.isInteger(id) || !bonus || !bonus[2](u)) return { ok: false, reason: '团队加成不存在或不适用于该单位。' };
  }

  const avail = simTechs(ctx, u, spec.civ);
  const numeric = new Set(avail.filter(({ ef }) => ef?.length).map(({ t }) => t.id));
  const requested = spec.techs === 'f' || spec.techs === 'c' ? [...presetUpTo(avail, spec.age)] : sortedUnique(spec.techs);
  const techById = Object.fromEntries(ctx.techs.map((t) => [t.id, t])) as Record<number, Tech>;
  for (const id of requested) {
    if (!Number.isInteger(id) || !techById[id]) return { ok: false, reason: `科技 ID ${id} 无效。` };
  }

  const closure = new Set<number>();
  const prerequisites = new Set<number>();
  const visiting = new Set<number>();
  const visit = (id: number): string | null => {
    if (visiting.has(id)) return '科技前置存在循环，无法比较。';
    if (closure.has(id)) return null;
    const t = techById[id];
    if (!t) return `缺少必要前置科技 ${id}，无法比较。`;
    if (!status['t' + id]) return `${t.zh} 在所选文明中不可用。`;
    if (t.age > spec.age) return `${t.zh} 在所选时代尚未解锁。`;
    visiting.add(id);
    if (t.pre !== null) {
      prerequisites.add(t.pre);
      const reason = visit(t.pre);
      if (reason) return reason;
    }
    visiting.delete(id);
    closure.add(id);
    return null;
  };

  for (const id of requested) {
    if (!numeric.has(id)) continue;
    const reason = visit(id);
    if (reason) return { ok: false, reason };
  }
  // 无直接效果的 ID 只允许作为数值科技的必要前置，以便完整分享配置可重载。
  for (const id of requested) {
    if (!closure.has(id)) return { ok: false, reason: `${techById[id]!.zh} 无可模拟效果或不适用于该单位。` };
  }

  const ids = sortedUnique([...closure]);
  const sel = new Set(ids);
  const S = simulate(ctx, u, spec.civ, spec.age, sel, new Set(team));
  return {
    ok: true,
    spec: { ...spec, techs: ids, team },
    u,
    sel,
    S,
    F: fighterFrom(u, S),
    techs: ids.map((id) => techById[id]!),
    prerequisites: ids.filter((id) => prerequisites.has(id)).map((id) => techById[id]!),
  };
}

export interface UpgradeComparison {
  ok: true;
  before: UpgradePlan;
  current: UpgradePlan;
  opponent: UpgradePlan;
  beforeResult: ReturnType<typeof duel>;
  currentResult: ReturnType<typeof duel>;
  added: Tech[];
  removed: Tech[];
  addedPrerequisites: Tech[];
  cost: Cost;
  time: number;
}

/** 科研投入仅统计新增闭包的基础费用，取消项不退款。模式与数据版本由路由层校验。 */
export function upgradeComparison(
  ctx: SimContext,
  byId: Record<number, Unit>,
  before: UpgradeSide,
  current: UpgradeSide,
  fixed: UpgradeSide,
  opponent: UpgradeSide,
): UpgradeComparison | InvalidUpgrade {
  const a0 = upgradePlan(ctx, byId, before);
  if (!a0.ok) return { ok: false, reason: `升级前方案无效：${a0.reason}` };
  const a1 = upgradePlan(ctx, byId, current);
  if (!a1.ok) return { ok: false, reason: `当前方案无效：${a1.reason}` };
  const b0 = upgradePlan(ctx, byId, fixed);
  if (!b0.ok) return { ok: false, reason: `保存的 B 方案无效：${b0.reason}` };
  const b1 = upgradePlan(ctx, byId, opponent);
  if (!b1.ok) return { ok: false, reason: `当前 B 方案无效：${b1.reason}` };
  if (!sameContext(a0.spec, a1.spec)) return { ok: false, reason: 'A 的单位、文明、时代或团队加成已变化，请重新保存升级前方案。' };
  if (!sameContext(b0.spec, b1.spec) || !sameIds(b0.spec.techs, b1.spec.techs)) return { ok: false, reason: 'B 的配置已变化，请重新保存升级前方案。' };

  const added = a1.techs.filter((t) => !a0.sel.has(t.id));
  const removed = a0.techs.filter((t) => !a1.sel.has(t.id));
  const addedPrerequisites = a1.prerequisites.filter((t) => !a0.sel.has(t.id));
  const cost: Cost = {};
  let time = 0;
  for (const t of added) {
    for (const [resource, value] of Object.entries(t.cost)) cost[resource] = (cost[resource] ?? 0) + value;
    time += t.rt;
  }
  return {
    ok: true,
    before: a0,
    current: a1,
    opponent: b1,
    beforeResult: duel(a0.F, b1.F),
    currentResult: duel(a1.F, b1.F),
    added,
    removed,
    addedPrerequisites,
    cost,
    time,
  };
}
