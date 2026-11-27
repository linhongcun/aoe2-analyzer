/** Issue 1404/1526: shared constants and pure numeric, graph, and combinatorics helpers for the garrison tech filter. */
import type { Tech } from '../types';
import type { GarrisonStat, GeneralGarrisonData, GeneralGarrisonEffect, GeneralGarrisonRule, GeneralGarrisonUnit, Snapshot } from './types';

export const BUILDING_SHOOTING_STATS = new Set<GarrisonStat>(['attack', 'reload', 'total', 'max', 'projectile', 'secondaryProjectile']);
const MAX_EXACT_CONTROL_SUBSETS = 1024;
export const MAX_EXACT_STATES = 1024;
const MAX_EXACT_SHAPE_BITS = 10;
const MAX_EXACT_SENSITIVE_SHAPES = 5;
const MAX_EXACT_PEER_SUBSETS = 6;
export const MAX_PEER_PROBES_PER_TECH = 256;
export const MAX_SYNERGY_PROBES = 1024;
export const POWER_STATS = new Set<GarrisonStat>(['attack', 'reload', 'firepower', 'total', 'max', 'projectile', 'secondaryProjectile']);

export const isShootingBuilding = (B: GeneralGarrisonUnit | undefined): boolean =>
  !!B && B.attack > 0 && B.reload > 0 && (B.projectile >= 0 || B.secondaryProjectile >= 0);

export const numbersDiffer = (a: number, b: number): boolean => !Object.is(a, b) && a !== b;

export const hasMinHits = (requires: number[], count: number, set: Set<number>): boolean => {
  let hits = 0;
  for (const req of requires) if (set.has(req) && ++hits >= count) return true;
  return false;
};

export const buildingShootingDiff = (
  bA: GeneralGarrisonUnit,
  unitsA: Record<string, GeneralGarrisonUnit>,
  bB: GeneralGarrisonUnit,
  unitsB: Record<string, GeneralGarrisonUnit>,
): boolean => {
  const validA = Number.isSafeInteger(bA.total) && bA.total >= 0 && Number.isSafeInteger(bA.max) && bA.max >= 0;
  const validB = Number.isSafeInteger(bB.total) && bB.total >= 0 && Number.isSafeInteger(bB.max) && bB.max >= 0;
  if (validA !== validB) return true;
  if (!validA) return false;
  const hasPrimaryA = bA.projectile >= 0;
  const hasPrimaryB = bB.projectile >= 0;
  const hasSecondaryA = bA.secondaryProjectile >= 0;
  const hasSecondaryB = bB.secondaryProjectile >= 0;
  if (hasPrimaryA !== hasPrimaryB || hasSecondaryA !== hasSecondaryB || bA.total !== bB.total || bA.max !== bB.max) return true;
  const secAtkA = hasSecondaryA ? unitsA[bA.secondaryProjectile]?.attack : undefined;
  const secAtkB = hasSecondaryB ? unitsB[bB.secondaryProjectile]?.attack : undefined;
  const secMismatchA = hasSecondaryA && secAtkA !== bA.attack;
  const secMismatchB = hasSecondaryB && secAtkB !== bB.attack;
  if (secMismatchA !== secMismatchB) return true;
  const pA = (secAtkA ?? bA.attack) / bA.reload;
  const pB = (secAtkB ?? bB.attack) / bB.reload;
  const okA = pA > 0 && Number.isFinite(pA);
  const okB = pB > 0 && Number.isFinite(pB);
  if (okA !== okB) return true;
  return numbersDiffer(pA, pB);
};

// Detect IEEE-754 non-finite, underflow-to-zero, or overflow-to-Infinity/NaN risk across set/add/mul sequences.
export const canExtremeFlip = (vals: (number | undefined)[], effects: readonly GeneralGarrisonEffect[]): boolean => {
  let minPos = Infinity;
  let maxPos = 0;
  let addAbsSum = 0;
  let shrinkProd = 1;
  let growProd = 1;
  let hasShrink = false;
  let hasGrow = false;
  for (const raw of vals) {
    if (raw === undefined) continue;
    if (!Number.isFinite(raw)) return true;
    const v = Math.abs(raw);
    if (v > 0) {
      if (v < minPos) minPos = v;
      if (v > maxPos) maxPos = v;
    }
  }
  for (const e of effects) {
    if (!Number.isFinite(e.value)) return true;
    const v = Math.abs(e.value);
    if (e.op === 'set') {
      if (v > 0) {
        if (v < minPos) minPos = v;
        if (v > maxPos) maxPos = v;
      }
    } else if (e.op === 'add') {
      if (v > 0) {
        addAbsSum += v;
        if (v < minPos) minPos = v;
      }
    } else if (e.op === 'mul') {
      if (v > 0 && v < 1) {
        hasShrink = true;
        shrinkProd *= v;
      } else if (v > 1) {
        hasGrow = true;
        growProd *= v;
      }
    }
  }
  if ((minPos < Infinity && minPos <= 1e-300) || maxPos >= 1e300) return true;
  if (hasShrink && minPos < Infinity && minPos * shrinkProd <= 1e-300) return true;
  const upper = (maxPos + addAbsSum) * growProd;
  if ((hasGrow || addAbsSum > 0) && maxPos + addAbsSum > 0 && (!Number.isFinite(upper) || upper >= 1e300)) return true;
  return false;
};

/** Inspect reachable rules to detect unit reload/firepower/multi-projectile flip boundaries and building shooting effects. */
export function inspectStatFlipBounds(params: {
  buildingId: number;
  baseState: Snapshot;
  powerUnitIds: number[];
  isPowerUnit: (uid: number) => boolean;
  initUnitField: <K extends keyof GeneralGarrisonUnit>(uid: number, field: K) => GeneralGarrisonUnit[K] | undefined;
  activeAgeRules: GeneralGarrisonRule[];
  stageAdvanceRules: GeneralGarrisonRule[];
  poolRules: GeneralGarrisonRule[];
  availFreeShapeRules: GeneralGarrisonRule[];
  availImpliedType60Rules: GeneralGarrisonRule[];
  activeShadowedDynRules: GeneralGarrisonRule[];
}) {
  const {
    buildingId,
    baseState,
    powerUnitIds,
    isPowerUnit,
    initUnitField,
    activeAgeRules,
    stageAdvanceRules,
    poolRules,
    availFreeShapeRules,
    availImpliedType60Rules,
    activeShadowedDynRules,
  } = params;
  const allBuildingEffects: GeneralGarrisonEffect[] = [];
  const unitReloadEffects = new Map<number, GeneralGarrisonEffect[]>();
  const unitFpEffects = new Map<number, GeneralGarrisonEffect[]>();
  const negFpCapableUnits = new Set<number>();
  const reloadTouchedUnits = new Set<number>();
  const reloadInvalidFlipUnits = new Set<number>();
  const fpSignFlipUnits = new Set<number>();
  const multiProjCandidates = new Set<number>();
  for (const id of powerUnitIds) {
    const u = baseState.units[id];
    if (!u || !isPowerUnit(id)) continue;
    if (u.firepower < 0 || (initUnitField(id, 'firepower') ?? 0) < 0) negFpCapableUnits.add(id);
    if (u.total > 1 || (initUnitField(id, 'total') ?? 0) > 1) multiProjCandidates.add(id);
  }
  const inspectRuleStats = (rule: GeneralGarrisonRule) => {
    for (const e of rule.effects) {
      if (e.unit === buildingId) allBuildingEffects.push(e);
      if (!isPowerUnit(e.unit)) continue;
      if (e.stat === 'reload' && !((e.op === 'add' && e.value === 0) || (e.op === 'mul' && e.value === 1))) {
        reloadTouchedUnits.add(e.unit);
        let relList = unitReloadEffects.get(e.unit);
        if (!relList) {
          relList = [];
          unitReloadEffects.set(e.unit, relList);
        }
        relList.push(e);
        const baseReload = baseState.units[e.unit]?.reload ?? 0;
        const initReload = initUnitField(e.unit, 'reload') ?? baseReload;
        if (baseReload <= 0 || initReload <= 0 || (e.op === 'set' && e.value <= 0) || (e.op === 'mul' && e.value <= 0) || (e.op === 'add' && e.value < 0)) {
          reloadInvalidFlipUnits.add(e.unit);
        }
      }
      if (e.stat === 'firepower') {
        let fpList = unitFpEffects.get(e.unit);
        if (!fpList) {
          fpList = [];
          unitFpEffects.set(e.unit, fpList);
        }
        fpList.push(e);
        const baseFp = baseState.units[e.unit]?.firepower ?? 0;
        const initFp = initUnitField(e.unit, 'firepower') ?? baseFp;
        if (
          Math.sign(baseFp) !== Math.sign(initFp) ||
          (baseFp === 0 && !((e.op === 'add' && e.value === 0) || e.op === 'mul' || (e.op === 'set' && e.value === 0))) ||
          (baseFp > 0 && ((e.op === 'set' && e.value <= 0) || (e.op === 'add' && e.value < 0) || (e.op === 'mul' && e.value <= 0))) ||
          (baseFp < 0 && ((e.op === 'set' && e.value >= 0) || (e.op === 'add' && e.value > 0) || (e.op === 'mul' && e.value <= 0)))
        ) {
          fpSignFlipUnits.add(e.unit);
        }
        if (((e.op === 'set' || e.op === 'add') && e.value < 0) || (e.op === 'mul' && e.value < 0)) {
          negFpCapableUnits.add(e.unit);
        }
      }
      if (e.stat === 'total' && ((e.op === 'set' && e.value > 1) || (e.op === 'add' && e.value > 0) || (e.op === 'mul' && (e.value > 1 || e.value < 0)))) {
        multiProjCandidates.add(e.unit);
      }
    }
  };
  for (const r of activeAgeRules) inspectRuleStats(r);
  for (const r of stageAdvanceRules) inspectRuleStats(r);
  for (const r of poolRules) inspectRuleStats(r);
  for (const r of availFreeShapeRules) inspectRuleStats(r);
  for (const r of availImpliedType60Rules) inspectRuleStats(r);
  for (const [uid, relList] of unitReloadEffects) {
    if (!reloadInvalidFlipUnits.has(uid) && canExtremeFlip([baseState.units[uid]?.reload, initUnitField(uid, 'reload')], relList)) {
      reloadInvalidFlipUnits.add(uid);
    }
  }
  for (const [uid, fpList] of unitFpEffects) {
    if (!fpSignFlipUnits.has(uid) && canExtremeFlip([baseState.units[uid]?.firepower, initUnitField(uid, 'firepower')], fpList)) {
      fpSignFlipUnits.add(uid);
    }
  }
  let shadowedBuildingFlip = false;
  for (const r of activeShadowedDynRules) {
    for (const e of r.effects) {
      if ((e.op === 'add' && e.value === 0) || (e.op === 'mul' && e.value === 1)) continue;
      if (e.unit === buildingId && (e.stat === 'attack' || e.stat === 'reload' || e.stat === 'projectile' || e.stat === 'secondaryProjectile')) {
        shadowedBuildingFlip = true;
      }
      if (!isPowerUnit(e.unit)) continue;
      if (e.stat === 'reload') {
        reloadTouchedUnits.add(e.unit);
        reloadInvalidFlipUnits.add(e.unit);
      } else if (e.stat === 'firepower') {
        fpSignFlipUnits.add(e.unit);
        negFpCapableUnits.add(e.unit);
      } else if (e.stat === 'total') {
        multiProjCandidates.add(e.unit);
      }
    }
  }
  return {
    allBuildingEffects,
    negFpCapableUnits,
    reloadTouchedUnits,
    reloadInvalidFlipUnits,
    fpSignFlipUnits,
    multiProjCandidates,
    shadowedBuildingFlip,
  };
}

/** Topological sort + prerequisite-closed subset enumeration over branch control techs (bounded by MAX_EXACT_CONTROL_SUBSETS). */
export function enumerateBranchSubsets(
  rawBranchTechs: number[],
  techById: Record<number, Tech | undefined>,
  poolIds: Set<number>,
  mayBeAutoKnown: (id: number) => boolean,
) {
  const branchSet = new Set(rawBranchTechs);
  const branchPrereqs = new Map<number, number[]>();
  const inDegree = new Map<number, number>();
  const dependents = new Map<number, number[]>();
  for (const bid of rawBranchTechs) {
    const reqs: number[] = [];
    const seen = new Set<number>();
    let pre = techById[bid]?.pre;
    while (pre && poolIds.has(pre) && !seen.has(pre)) {
      seen.add(pre);
      if (mayBeAutoKnown(pre)) break;
      if (branchSet.has(pre)) reqs.push(pre);
      pre = techById[pre]?.pre;
    }
    branchPrereqs.set(bid, reqs);
    inDegree.set(bid, reqs.length);
    for (const p of reqs) {
      let list = dependents.get(p);
      if (!list) {
        list = [];
        dependents.set(p, list);
      }
      list.push(bid);
    }
  }
  const branchTechs: number[] = [];
  const readyQueue = rawBranchTechs.filter((id) => (inDegree.get(id) ?? 0) === 0);
  while (readyQueue.length > 0) {
    readyQueue.sort((a, z) => a - z);
    const id = readyQueue.shift()!;
    branchTechs.push(id);
    for (const dep of dependents.get(id) ?? []) {
      const deg = (inDegree.get(dep) ?? 1) - 1;
      inDegree.set(dep, deg);
      if (deg === 0) readyQueue.push(dep);
    }
  }
  for (const id of rawBranchTechs) {
    if (!branchTechs.includes(id)) branchTechs.push(id);
  }

  const legalSubsets: number[][] = [];
  let subsetOverflow = false;
  const chosen: number[] = [];
  const chosenSet = new Set<number>();
  const dfs = (idx: number) => {
    if (subsetOverflow) return;
    if (idx === branchTechs.length) {
      legalSubsets.push([...chosen].sort((a, z) => a - z));
      if (legalSubsets.length > MAX_EXACT_CONTROL_SUBSETS) subsetOverflow = true;
      return;
    }
    const tid = branchTechs[idx]!;
    dfs(idx + 1);
    if (subsetOverflow) return;
    if (branchPrereqs.get(tid)!.every((p) => chosenSet.has(p))) {
      chosen.push(tid);
      chosenSet.add(tid);
      dfs(idx + 1);
      chosen.pop();
      chosenSet.delete(tid);
    }
  };
  dfs(0);
  if (subsetOverflow) legalSubsets.length = MAX_EXACT_CONTROL_SUBSETS;

  return { branchTechs, branchSet, branchPrereqs, legalSubsets, subsetOverflow };
}

/** Deduplicate shape candidates by ordered hook signature and partition order-sensitive vs commutative type-60 groups. */
export function partitionShapeGroups(params: {
  shapeCandidates: { uid: number; hookTechs: number[]; hookSig: string }[];
  baseFree: Set<number>;
  baseState: Snapshot;
  data: GeneralGarrisonData;
  isNoopEffect: (e: GeneralGarrisonEffect) => boolean;
  legalSubsetCount: number;
  subsetOverflow: boolean;
}) {
  const { shapeCandidates, baseFree, baseState, data, isNoopEffect, legalSubsetCount, subsetOverflow } = params;
  const shapeGroupUnits: number[][] = [];
  const shapeGroupHooks: number[][] = [];
  if (shapeCandidates.length > 0) {
    const byHook = new Map<string, { uids: number[]; hooks: number[] }>();
    for (const sc of shapeCandidates) {
      let entry = byHook.get(sc.hookSig);
      if (!entry) {
        entry = { uids: [], hooks: sc.hookTechs };
        byHook.set(sc.hookSig, entry);
      }
      entry.uids.push(sc.uid);
    }
    for (const entry of byHook.values()) {
      shapeGroupUnits.push(entry.uids);
      shapeGroupHooks.push(entry.hooks);
    }
  }
  const type60GroupsByStat = new Map<string, Set<number>>();
  for (let gi = 0; gi < shapeGroupHooks.length; gi++) {
    for (const tid of shapeGroupHooks[gi]!) {
      if (baseFree.has(tid)) continue;
      for (const e of data.techs[tid]?.effects ?? []) {
        if (isNoopEffect(e)) continue;
        if (baseState.units[e.unit]?.type !== 60) continue;
        const key = `${e.unit}:${e.stat}`;
        let groups = type60GroupsByStat.get(key);
        if (!groups) {
          groups = new Set();
          type60GroupsByStat.set(key, groups);
        }
        groups.add(gi);
      }
    }
  }
  const sensitiveGroupSet = new Set<number>();
  for (const groups of type60GroupsByStat.values()) {
    if (groups.size < 2) continue;
    for (const gi of groups) sensitiveGroupSet.add(gi);
  }
  const sensitiveGroupIndices: number[] = [];
  const commGroupIndices: number[] = [];
  for (let gi = 0; gi < shapeGroupUnits.length; gi++) {
    if (sensitiveGroupSet.has(gi)) sensitiveGroupIndices.push(gi);
    else commGroupIndices.push(gi);
  }
  const orderedSubsetCount = (s: number): number => {
    if (s === 0) return 1;
    if (s > MAX_EXACT_SENSITIVE_SHAPES) return Infinity;
    let total = 1;
    let perm = 1;
    for (let j = 1; j <= s; j++) {
      perm *= s - j + 1;
      total += perm;
    }
    return total;
  };
  const commMaskCount = commGroupIndices.length <= MAX_EXACT_SHAPE_BITS ? 1 << commGroupIndices.length : Infinity;
  const shapeStateCount = commMaskCount * orderedSubsetCount(sensitiveGroupIndices.length);
  const stateSpaceOverflow = subsetOverflow || legalSubsetCount * shapeStateCount > MAX_EXACT_STATES;

  const sensitivePerms: number[][] = [[]];
  if (!stateSpaceOverflow && sensitiveGroupIndices.length > 0) {
    const used = new Array<boolean>(sensitiveGroupIndices.length).fill(false);
    const cur: number[] = [];
    const genPerms = () => {
      if (cur.length > 0) sensitivePerms.push([...cur]);
      for (let i = 0; i < sensitiveGroupIndices.length; i++) {
        if (used[i]) continue;
        used[i] = true;
        cur.push(sensitiveGroupIndices[i]!);
        genPerms();
        cur.pop();
        used[i] = false;
      }
    };
    genPerms();
  }
  return { shapeGroupUnits, sensitiveGroupIndices, commGroupIndices, shapeStateCount, stateSpaceOverflow, sensitivePerms };
}

/** Prerequisite-closed non-empty subsets of interacting non-control peers; null signals budget overflow. */
export const uniquePeerClosures = (peers: number[], reqNonCtrlOf: (pid: number) => number[]): number[][] | null => {
  if (!peers.length) return [];
  if (peers.length > MAX_EXACT_PEER_SUBSETS) return null;
  const seen = new Set<string>();
  const out: number[][] = [];
  const total = 1 << peers.length;
  for (let mask = 1; mask < total; mask++) {
    const closedSet = new Set<number>();
    for (let i = 0; i < peers.length; i++) {
      if (((mask >> i) & 1) === 0) continue;
      const pid = peers[i]!;
      closedSet.add(pid);
      for (const pre of reqNonCtrlOf(pid)) closedSet.add(pre);
    }
    const closed = [...closedSet].sort((a, z) => a - z);
    const key = closed.join(',');
    if (!seen.has(key)) {
      seen.add(key);
      out.push(closed);
    }
  }
  return out;
};

/** Pre-index non-control techs by prerequisite and touched (unit, stat) key for peer synergy lookups. */
export function buildNonControlIndex(pool: Tech[], controlSet: Set<number>, data: GeneralGarrisonData, prereqChainInPool: (tid: number) => number[]) {
  const nonControlTechs = pool.filter((t) => !controlSet.has(t.id));
  const nonCtrlPrereqIds = new Set<number>();
  const nonCtrlByPrereq = new Map<number, Tech[]>();
  const nonControlTouchTechsByKey = new Map<string, number[]>();
  for (const t of nonControlTechs) {
    for (const p of prereqChainInPool(t.id)) {
      nonCtrlPrereqIds.add(p);
      let preList = nonCtrlByPrereq.get(p);
      if (!preList) {
        preList = [];
        nonCtrlByPrereq.set(p, preList);
      }
      preList.push(t);
    }
    const seenKeys = new Set<string>();
    for (const e of data.techs[t.id]!.effects) {
      if ((e.op === 'add' && e.value === 0) || (e.op === 'mul' && e.value === 1)) continue;
      const key = `${e.unit}:${e.stat}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        let list = nonControlTouchTechsByKey.get(key);
        if (!list) {
          list = [];
          nonControlTouchTechsByKey.set(key, list);
        }
        list.push(t.id);
      }
    }
  }
  return { nonControlTechs, nonCtrlPrereqIds, nonCtrlByPrereq, nonControlTouchTechsByKey };
}
