import { civByEn } from '../data';
import { ARMY_RESEARCH, type ArmyResearchData, type ResearchCommand, type ResearchNode } from '../data/armyResearch';
import { AGE_BY_TECH } from './gameIds';
import { AGE_ZH } from './ratings';
import { ARMY_RES, addArmyCost, hasDecimalCost, roundArmyCost } from './researchCostMath';
import type { Cost } from './types';

export { ARMY_RES, addArmyCost, hasDecimalCost, roundArmyCost };
export const researchKey = (id: number) => `t:${id}`;

export interface ArmyResearchIndex {
  modsNodes: readonly (readonly [number, ResearchNode])[];
  enablesByUnit: ReadonlyMap<number, readonly number[]>;
  upgradesByUnit: ReadonlyMap<number, readonly number[]>;
  regionalDisabled: ReadonlySet<number>;
}

function buildArmyResearchIndex(data: ArmyResearchData): ArmyResearchIndex {
  const modsNodes: [number, ResearchNode][] = [];
  const enablesByUnit = new Map<number, number[]>();
  const upgradesByUnit = new Map<number, number[]>();
  const reenabledAny = new Set<number>();
  for (const c of Object.values(data.civs)) for (const id of c.enabled ?? []) reenabledAny.add(id);
  const regionalDisabled = new Set<number>();
  for (const [key, n] of Object.entries(data.nodes)) {
    const tid = Number(key);
    if (n.mods.length) {
      modsNodes.push([tid, n]);
      if (isGlobalStartDisableNode(n)) {
        for (const c of n.mods) if (c.Type === 102 && Number.isFinite(c.D) && reenabledAny.has(Math.round(c.D))) regionalDisabled.add(Math.round(c.D));
      }
    }
    for (const uid of n.enables) {
      const list = enablesByUnit.get(uid);
      if (list) {
        if (!list.includes(tid)) list.push(tid);
      } else enablesByUnit.set(uid, [tid]);
    }
    for (const [, target] of n.upgrades) {
      if (target === undefined) continue;
      const list = upgradesByUnit.get(target);
      if (list) {
        if (!list.includes(tid)) list.push(tid);
      } else upgradesByUnit.set(target, [tid]);
    }
  }
  return { modsNodes, enablesByUnit, upgradesByUnit, regionalDisabled };
}

let pinnedIndex: ArmyResearchIndex | null = null;
/** Uses a memoized index only for the recursively frozen built-in ARMY_RESEARCH; custom fixtures always compute fresh. */
export function armyResearchIndex(data: ArmyResearchData): ArmyResearchIndex {
  if (data === ARMY_RESEARCH) {
    pinnedIndex ??= buildArmyResearchIndex(data);
    return pinnedIndex;
  }
  return buildArmyResearchIndex(data);
}

/** Hidden non-free start-age / scenario placeholders (e.g. Post-Imperial 790/791, Paphos 1138) never auto-trigger in RM. */
export function isUnreachableHiddenNode(node: ResearchNode): boolean {
  return node.location <= 0 && (node.time > 0 || node.cost.some(([r, v, enabled]) => enabled && v! > 0 && r !== undefined && r >= 0 && r <= 3));
}

/** Structurally unreachable .dat tech: not triggered by building construction or effect commands, and requires more prerequisites than exist. */
export function isUnreachableCountNode(data: ArmyResearchData, id: number, node: ResearchNode): boolean {
  return node.count > node.requires.length && !data.buildingTechs.includes(id) && !data.fxTriggeredTechs?.includes(id);
}

export function isGlobalResearchCostMod(c: ResearchCommand): boolean {
  return (c.Type === 1 || c.Type === 6) && c.A === 85;
}

/** Derives the age rank (1–4) of an automatic age-gated res:85 node; returns null if ordering cannot be proven. */
export function globalResearchModAge(node: ResearchNode): number | null {
  if (node.location > 0) return null;
  if (!node.requires.length && node.count === 0) return 1;
  if (node.requires.length > 0 && node.count === node.requires.length && node.requires.every((r) => AGE_BY_TECH[r] !== undefined)) {
    return Math.max(...node.requires.map((r) => AGE_BY_TECH[r]!));
  }
  return null;
}

export function globalResearchModSource(civZh: string, tid: number, node: ResearchNode): string {
  if (node.name) return `${node.name} t:${tid}`;
  const age = globalResearchModAge(node);
  const ageZh = age !== null ? AGE_ZH[age] : undefined;
  return ageZh ? `${civZh}文明加成（${ageZh}）t:${tid}` : `文明条件 t:${tid}`;
}

export interface ArmyPriceModifier {
  source: string;
  condition: string;
  command: ResearchCommand;
  applied: boolean;
  nodeId?: number;
  superseded?: boolean;
}

export interface GlobalResearchModCandidate {
  source: string;
  condition: string;
  command: ResearchCommand;
  nodeId?: number;
  ageRank: number | null;
}

/** Resolves and applies global research cost SET overrides (res:85, Type=1, B=0) by strict ascending age rank; fails closed otherwise. */
export function applyGlobalResearchMods(
  entries: GlobalResearchModCandidate[],
  cost: Cost,
  operations: Map<string, { source: string; op: number; value: number }[]>,
  sources: string[],
  modifiers: ArmyPriceModifier[],
): string | null {
  const toMod = (e: GlobalResearchModCandidate, applied: boolean, superseded?: boolean): ArmyPriceModifier => ({
    source: e.source,
    condition: e.condition,
    command: e.command,
    applied,
    ...(e.nodeId !== undefined ? { nodeId: e.nodeId } : {}),
    ...(superseded ? { superseded: true } : {}),
  });
  const valid =
    entries.length > 0 &&
    entries.every((e) => e.command.Type === 1 && e.command.B === 0 && Number.isFinite(e.command.D) && e.command.D >= 0 && e.ageRank !== null) &&
    new Set(entries.map((e) => e.ageRank!)).size === entries.length;
  if (!valid) {
    modifiers.push(...entries.map((e) => toMod(e, false)));
    return '本文明全局研究费用倍率尚未核实';
  }
  const sorted = [...entries].sort((a, b) => a.ageRank! - b.ageRank!);
  const effective = sorted[sorted.length - 1]!;
  const superseded = sorted.slice(0, -1);
  for (const r of ARMY_RES) {
    if (cost[r] === undefined) continue;
    const history = operations.get(r) ?? [];
    if (history.some((prev) => !(prev.op === 2 || (prev.op === 0 && prev.value === 0)))) {
      modifiers.push(...[effective, ...superseded].map((e) => toMod(e, false)));
      return '多项研究修正的生效顺序尚未核实';
    }
    operations.set(r, [...history, { source: effective.source, op: 2, value: effective.command.D }]);
  }
  for (const r of ARMY_RES) if (cost[r] !== undefined) cost[r] = Math.max(0, cost[r]! * effective.command.D);
  sources.push(effective.source);
  modifiers.push(toMod(effective, true), ...superseded.map((s) => toMod(s, false, true)));
  return null;
}

export function isGlobalStartDisableNode(node: ResearchNode): boolean {
  return node.civ < 0 && node.location <= 0 && !node.requires.length && node.count === 0 && !isUnreachableHiddenNode(node);
}

export function globalRegionalDisabled(data: ArmyResearchData): ReadonlySet<number> {
  return armyResearchIndex(data).regionalDisabled;
}

export function civConditionalDisablers(data: ArmyResearchData, context: ArmyResearchData['civs'][string] | undefined): Map<number, number[]> {
  const disablers = new Map<number, number[]>();
  if (!context) return disablers;
  for (const [tid, n] of armyResearchIndex(data).modsNodes) {
    // Global start-disable nodes are either regional disables handled via globalRegionalDisabled (t:79/121/717)
    // or non-RM mode toggles such as Regicide-only t:117 (Disable Spies); never apply them as RM conditional disables.
    if (n.location > 0 || isGlobalStartDisableNode(n) || (n.civ >= 0 && n.civ !== context.id) || context.disabled.includes(tid)) continue;
    for (const c of n.mods) {
      if (c.Type !== 102 || !Number.isFinite(c.D)) continue;
      const target = Math.round(c.D);
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
  if (isUnreachableCountNode(data, tid, n)) return false;
  if (before.has(tid) || data.buildingTechs.includes(tid)) return true;
  if (n.location > 0) return active.has(tid) && tid !== targetId ? null : false;
  if (isUnreachableHiddenNode(n)) return false;
  if (n.time > 0 || n.cost.some(([, v, enabled]) => enabled && v! > 0) || n.count > n.requires.length) return null;
  const results = n.requires.map((p) => evalConditionNode(data, context, age, targetId, active, before, p, new Set(seen).add(tid)));
  const yes = results.filter((r) => r === true).length;
  return yes >= n.count ? true : yes + results.filter((r) => r === null).length < n.count ? false : null;
}

export interface ArmyResearchPrice {
  cost: Cost | null;
  free: boolean;
  zero: boolean;
  reason: string;
  sources: string[];
  baseCost: Cost | null;
  modifiers: ArmyPriceModifier[];
}

/** Research price uses raw research commands; unit-cost discounts never enter this function. */
export function researchPrice(
  data: ArmyResearchData,
  civ: string,
  age: number,
  id: number,
  active: ReadonlySet<number>,
  before: ReadonlySet<number> = active,
): ArmyResearchPrice {
  const node = data.nodes[id];
  const context = data.civs[civ];
  let baseCost: Cost | null = null;
  const modifiers: ArmyResearchPrice['modifiers'] = [];
  const bad = (reason: string): ArmyResearchPrice => ({
    cost: null,
    free: false,
    zero: false,
    reason,
    sources: [...new Set(modifiers.map((m) => m.source))],
    baseCost,
    modifiers,
  });
  if (!node || !context) return bad('研究身份或文明未核实');
  if (isUnreachableCountNode(data, id, node)) return bad(`研究 t:${id} 在标准对局中不可触发`);
  const cost: Cost = {};
  const res: Record<number, string> = { 0: 'Food', 1: 'Wood', 2: 'Stone', 3: 'Gold' };
  for (const [r, amount, enabled] of node.cost) {
    if (!enabled) continue;
    if (r === undefined || amount === undefined || !res[r] || !Number.isFinite(amount) || amount < 0) return bad('研究费用资源未核实');
    cost[res[r]!] = (cost[res[r]!] ?? 0) + amount;
  }
  baseCost = { ...cost };
  const isAge = !!AGE_BY_TECH[id];
  const civZh = civByEn(civ)?.zh ?? civ;
  const groups: { source: string; res85Source: string; condition: string; mods: ResearchCommand[]; nodeId?: number; ageRank: number | null }[] = [
    { source: '本文明科技树与团队加成', res85Source: '本文明科技树与团队加成', condition: `文明 ${civ} 的常驻效果`, mods: context.mods, ageRank: 0 },
  ];
  const reenabled = !!context.enabled?.includes(id);
  for (const [tid, n] of armyResearchIndex(data).modsNodes) {
    if (n.civ >= 0 && n.civ !== context.id) continue;
    if (isUnreachableCountNode(data, tid, n)) continue;
    const skipGlobalDisable = reenabled && isGlobalStartDisableNode(n);
    const relevant = n.mods.filter(
      (c) =>
        ((c.Type === 101 || c.Type === 103) && c.A === id) || (c.Type === 102 && c.D === id && !skipGlobalDisable) || (!isAge && isGlobalResearchCostMod(c)),
    );
    if (!relevant.length) continue;
    const applies =
      n.location > 0 ? (before.has(tid) ? true : active.has(tid) && tid !== id ? null : false) : evalConditionNode(data, context, age, id, active, before, tid);
    const group = {
      source: `${n.name ?? '文明条件'} t:${tid}`,
      res85Source: globalResearchModSource(civZh, tid, n),
      condition: before.has(tid) ? '已完成或本动作的确定必要前置' : `自动条件：前置 ${n.requires.map(researchKey).join('、') || '无'}，需满足 ${n.count} 项`,
      mods: relevant,
      nodeId: tid,
      ageRank: globalResearchModAge(n),
    };
    if (applies === null) {
      modifiers.push(
        ...relevant.map((command) => ({
          source: isGlobalResearchCostMod(command) ? group.res85Source : group.source,
          condition: '触发或相对研究顺序尚未核实',
          command,
          applied: false,
          nodeId: tid,
        })),
      );
      return bad('影响本项研究费用的文明条件尚未核实');
    }
    if (applies) groups.push(group);
  }
  let time = node.time;
  const sources: string[] = [];
  const operations = new Map<string, { source: string; op: number; value: number }[]>();
  const res85Candidates: GlobalResearchModCandidate[] = [];
  for (const group of groups)
    for (const c of group.mods) {
      if (!(((c.Type === 101 || c.Type === 103) && c.A === id) || (c.Type === 102 && c.D === id) || (!isAge && isGlobalResearchCostMod(c)))) continue;
      if (!isAge && isGlobalResearchCostMod(c)) {
        res85Candidates.push({ source: group.res85Source, condition: group.condition, command: c, nodeId: group.nodeId, ageRank: group.ageRank });
        continue;
      }
      const modifier: ArmyPriceModifier = {
        source: group.source,
        condition: group.condition,
        command: c,
        applied: false,
        ...(group.nodeId !== undefined ? { nodeId: group.nodeId } : {}),
      };
      modifiers.push(modifier);
      if (c.Type === 102 && c.D === id) return bad('本项研究被条件效果禁用');
      if (c.A !== id) continue;
      if (c.Type !== 101 && c.Type !== 103) return bad('研究修正类型尚未核实');
      if (![0, 1, 2, -1].includes(c.C) || !Number.isFinite(c.D)) return bad('研究修正操作尚未核实');
      for (const key of c.Type === 103 ? ['time'] : c.B === -1 ? [...ARMY_RES] : [res[c.B] ?? 'unknown']) {
        const history = operations.get(key) ?? [];
        const op = c.C === -1 ? 1 : c.C;
        if (
          history.some(
            (prev) =>
              prev.source !== group.source &&
              !(
                (op === prev.op && (op !== 0 || c.D === prev.value)) ||
                (op === 2 && prev.op === 0 && prev.value === 0) ||
                (op === 0 && c.D === 0 && prev.op === 2)
              ),
          )
        )
          return bad('多项研究修正的生效顺序尚未核实');
        operations.set(key, [...history, { source: group.source, op, value: c.D }]);
      }
      const apply = (v: number) => Math.max(0, c.C === 0 ? c.D : c.C === 2 ? v * c.D : v + c.D);
      if (c.Type === 103) time = apply(time);
      else if (c.B === -1) for (const r of ARMY_RES) cost[r] = apply(cost[r] ?? 0);
      else if (!res[c.B]) return bad('研究修正资源尚未核实');
      else cost[res[c.B]!] = apply(cost[res[c.B]!] ?? 0);
      sources.push(group.source);
      modifier.applied = true;
    }
  if (res85Candidates.length) {
    const err = applyGlobalResearchMods(res85Candidates, cost, operations, sources, modifiers);
    if (err) return bad(err);
  }
  // Non-integer discounted research costs keep at most two decimals (in-game rounding unverified).
  for (const r of ARMY_RES) if (cost[r] !== undefined) cost[r] = roundArmyCost(cost[r]!);
  const zero = ARMY_RES.every((r) => !cost[r]);
  return { cost, zero, free: zero && time === 0, reason: '', sources: [...new Set(sources)], baseCost, modifiers };
}
