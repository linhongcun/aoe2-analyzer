import type { ArmyResearchData, ResearchNode } from '../data/armyResearch';
import { AGE_BY_TECH } from './gameIds';
import type { Cost } from './types';

export const ARMY_RES = ['Food', 'Wood', 'Gold', 'Stone'] as const;
export const roundArmyCost = (v: number) => Math.round(v * 100) / 100 || 0;

export function hasDecimalCost(cost: Cost | null | undefined): boolean {
  return !!cost && ARMY_RES.some((r) => cost[r] !== undefined && !Number.isInteger(cost[r]));
}

export function addArmyCost(to: Cost, from: Cost) {
  for (const r of ARMY_RES) to[r] = roundArmyCost((to[r] ?? 0) + (from[r] ?? 0));
}

/** Hidden non-free start-age / scenario placeholders (e.g. Post-Imperial 790/791, Paphos 1138) never auto-trigger in RM. */
export function isUnreachableHiddenNode(node: ResearchNode): boolean {
  return node.location <= 0 && (node.time > 0 || node.cost.some(([r, v, enabled]) => enabled && v! > 0 && r !== undefined && r >= 0 && r <= 3));
}

export function isGlobalStartDisableNode(node: ResearchNode): boolean {
  return node.civ < 0 && node.location <= 0 && !node.requires.length && node.count === 0 && !isUnreachableHiddenNode(node);
}

export function globalRegionalDisabled(data: ArmyResearchData): Set<number> {
  const reenabledAny = new Set<number>();
  for (const c of Object.values(data.civs)) for (const id of c.enabled ?? []) reenabledAny.add(id);
  const ids = new Set<number>();
  for (const node of Object.values(data.nodes)) {
    if (!isGlobalStartDisableNode(node)) continue;
    for (const c of node.mods) if (c.Type === 102 && Number.isFinite(c.D) && reenabledAny.has(Math.round(c.D))) ids.add(Math.round(c.D));
  }
  return ids;
}

export function civConditionalDisablers(data: ArmyResearchData, context: ArmyResearchData['civs'][string] | undefined): Map<number, number[]> {
  const disablers = new Map<number, number[]>();
  if (!context) return disablers;
  for (const [key, n] of Object.entries(data.nodes)) {
    const tid = Number(key);
    if (n.location > 0 || (n.civ >= 0 && n.civ !== context.id) || context.disabled.includes(tid)) continue;
    const globalStart = isGlobalStartDisableNode(n);
    for (const c of n.mods) {
      if (c.Type !== 102 || !Number.isFinite(c.D)) continue;
      const target = Math.round(c.D);
      if (globalStart && context.enabled?.includes(target)) continue;
      disablers.set(target, [...(disablers.get(target) ?? []), tid]);
    }
  }
  return disablers;
}

export function evalConditionNode(
  data: ArmyResearchData,
  context: ArmyResearchData['civs'][string],
  age: number,
  targetId: number,
  active: ReadonlySet<number>,
  before: ReadonlySet<number>,
  tid: number,
  seen = new Set<number>(),
): boolean | null {
  if (AGE_BY_TECH[tid]) return AGE_BY_TECH[tid]! <= age;
  const n = data.nodes[tid];
  if (!n || seen.has(tid)) return null;
  if (context.disabled.includes(tid) || (n.civ >= 0 && n.civ !== context.id)) return false;
  if (before.has(tid) || data.buildingTechs.includes(tid)) return true;
  if (n.location > 0) return active.has(tid) && tid !== targetId ? null : false;
  if (isUnreachableHiddenNode(n)) return false;
  if (n.time > 0 || n.cost.some(([, v, enabled]) => enabled && v! > 0)) return null;
  if (!n.requires.length && n.count > 0) return null;
  const results = n.requires.map((p) => evalConditionNode(data, context, age, targetId, active, before, p, new Set(seen).add(tid)));
  const yes = results.filter((r) => r === true).length;
  return yes >= n.count ? true : yes + results.filter((r) => r === null).length < n.count ? false : null;
}
