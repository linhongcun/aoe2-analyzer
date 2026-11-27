/** Issue 1404/1526: Phase 2 of garrison tech filtering (control-tech partitioning, legal subset DAG, and shape state-space materialization). */
import { VILLAGER_UNIT_ID } from '../gameIds';
import { TRAINING_UNLOCK_GATES } from '../trainingUnlocks';
import type { GeneralGarrisonConfig, GeneralGarrisonRow } from '../garrisonUrl';
import {
  FORTIFIED_CHURCH_IDS,
  type GarrisonCandidate,
  type GeneralGarrisonData,
  type GeneralGarrisonRule,
  type Snapshot,
  type StaticGarrisonIndex,
} from './types';
import { candidate, snapshot } from './snapshot';
import { enumerateBranchSubsets, partitionShapeGroups } from './techFilterMath';
import type { TechFilterReachability } from './techFilterReachability';

export interface EvalState {
  techs: number[];
  rowIds: number[];
  rowKey: string;
  config: GeneralGarrisonConfig;
  snapshot: Snapshot;
  data: GeneralGarrisonData;
  index: StaticGarrisonIndex;
  candCache: Map<number, GarrisonCandidate | null>;
  relicDeposit: boolean | null;
}

export interface TechFilterStateSpace {
  controlSet: Set<number>;
  autoFreeControl: Set<number>;
  branchTechs: number[];
  branchSet: Set<number>;
  branchPrereqs: Map<number, number[]>;
  prereqChainInPool: (tid: number) => number[];
  legalSubsets: number[][];
  shapeStateCount: number;
  stateSpaceOverflow: boolean;
  allShapeUids: number[];
  statesByTechKey: Map<string, EvalState[]>;
  unprunedTechKeys: Set<string>;
  allReachableStates: EvalState[];
  relevantSecProjs: Set<number>;
  hasDynamicSecProjOp: boolean;
  makeEvalState: (techs: number[], rowIds: number[], snap?: Snapshot, stateData?: GeneralGarrisonData, stateIndex?: StaticGarrisonIndex) => EvalState;
  candOf: (es: EvalState, uid: number) => GarrisonCandidate | null;
  isOccupantIn: (es: EvalState, uid: number) => boolean;
  isPowerContributorIn: (es: EvalState, uid: number) => boolean;
  validStatesForTechs: (techs: number[], stateData?: GeneralGarrisonData, stateIndex?: StaticGarrisonIndex, outUnpruned?: { value: boolean }) => EvalState[];
}

export function buildControlAndStateSpace(reach: TechFilterReachability): TechFilterStateSpace {
  const {
    ctx,
    b,
    config,
    data,
    status,
    civData,
    upgradeData,
    staticIndex,
    shapeUpgrades,
    pool,
    poolIds,
    civFreeSet,
    baseState,
    baseB,
    scope,
    relicIds,
    baseFree,
    baseImplicitShapes,
    isAvailEligible,
    isPowerUnit,
    powerUnitIds,
    availShapeTechs,
    shapeTriggerPoolTechs,
    availFreeShapeRules,
    availFreeShapeIds,
    availImpliedType60Rules,
    initUnitField,
    initBuildingSecProj,
    activeAgeRules,
    allEnabledDynRules,
    dynKnownPoolIds,
    activeDynRules,
    canBuildingProduceUnit,
    relocTouchesBuilding,
    allBuildingEffects,
    negFpCapableUnits,
    reloadTouchedUnits,
    reloadInvalidFlipUnits,
    fpSignFlipUnits,
    multiProjCandidates,
    isNoopEffect,
    baseShooting,
    shootingCanFlip,
  } = reach;

  // Partition pool into control techs (affecting entry, capacity, shooting-ness, firepower sign, reload validity, total,
  // secondaryProjectile, relocation/eviction, explicit unlocks, conditional/free rules) vs pure-stat techs.
  const controlSet = new Set<number>();
  const shapeHooks = new Set<number>();
  const prereqChainInPool = (tid: number): number[] => {
    const out: number[] = [];
    const seen = new Set<number>();
    let pre = ctx.core.techById[tid]?.pre;
    while (pre && poolIds.has(pre) && !seen.has(pre)) {
      seen.add(pre);
      out.push(pre);
      pre = ctx.core.techById[pre]?.pre;
    }
    return out;
  };
  const hasUnmetShapePrereq = (tid: number): boolean => {
    let pre = ctx.core.techById[tid]?.pre;
    const seen = new Set<number>();
    while (pre && !seen.has(pre)) {
      seen.add(pre);
      if (shapeUpgrades.has(pre) && !baseImplicitShapes.has(pre)) return true;
      pre = ctx.core.techById[pre]?.pre;
    }
    return false;
  };

  for (const r of activeDynRules) {
    for (const req of r.requires) {
      if (poolIds.has(req)) controlSet.add(req);
      if (shapeUpgrades.has(req) && !baseState.knownBeforeStage0.has(req)) shapeHooks.add(req);
    }
  }
  for (const fid of civData.free) {
    if (shapeUpgrades.has(fid)) {
      if (!availFreeShapeIds.has(fid)) continue;
      if (!baseImplicitShapes.has(fid)) {
        shapeHooks.add(fid);
        for (const tid of shapeTriggerPoolTechs.get(fid) ?? []) controlSet.add(tid);
      }
      for (const p of prereqChainInPool(fid)) controlSet.add(p);
      continue;
    }
    if (!poolIds.has(fid) || baseFree.has(fid)) continue;
    controlSet.add(fid);
    for (const p of prereqChainInPool(fid)) controlSet.add(p);
    let pre = ctx.core.techById[fid]?.pre;
    const seenPre = new Set<number>();
    while (pre && shapeUpgrades.has(pre) && !seenPre.has(pre)) {
      seenPre.add(pre);
      if (!baseImplicitShapes.has(pre)) {
        shapeHooks.add(pre);
        for (const tid of shapeTriggerPoolTechs.get(pre) ?? []) controlSet.add(tid);
      }
      pre = ctx.core.techById[pre]?.pre;
    }
  }

  const relevantSecProjs = new Set<number>();
  let hasDynamicSecProjOp = false;
  if (baseShooting || shootingCanFlip) {
    if (baseB.secondaryProjectile >= 0) relevantSecProjs.add(baseB.secondaryProjectile);
    if (initBuildingSecProj >= 0) relevantSecProjs.add(initBuildingSecProj);
    for (const e of allBuildingEffects) {
      if (e.stat !== 'secondaryProjectile') continue;
      if (e.op === 'set' && e.value >= 0) relevantSecProjs.add(e.value);
      else if (e.op !== 'set') hasDynamicSecProjOp = true;
    }
    for (const uid of multiProjCandidates) {
      const sec = baseState.units[uid]?.secondaryProjectile ?? -1;
      if (sec >= 0) relevantSecProjs.add(sec);
      const initSec = initUnitField(uid, 'secondaryProjectile') ?? -1;
      if (initSec >= 0) relevantSecProjs.add(initSec);
    }
    const collectRelevantSecProj = (rule: GeneralGarrisonRule) => {
      for (const e of rule.effects) {
        if (e.stat !== 'secondaryProjectile') continue;
        if (e.unit !== b.id && !multiProjCandidates.has(e.unit)) continue;
        if (e.op === 'set' && e.value >= 0) relevantSecProjs.add(e.value);
        else if (e.op !== 'set') hasDynamicSecProjOp = true;
      }
    };
    for (const r of activeAgeRules) collectRelevantSecProj(r);
    for (const t of pool) collectRelevantSecProj(data.techs[t.id]!);
    for (const r of allEnabledDynRules) collectRelevantSecProj(r);
    for (const r of availFreeShapeRules) collectRelevantSecProj(r);
    for (const r of availImpliedType60Rules) collectRelevantSecProj(r);
  }
  for (const tid of availShapeTechs) {
    if (baseImplicitShapes.has(tid)) continue;
    const rule = data.techs[tid];
    if (!rule) continue;
    const touchesRelevantType60 = rule.effects.some((e) => {
      if (baseState.units[e.unit]?.type !== 60) return false;
      if (isNoopEffect(e)) return false;
      return e.unit === b.id || isPowerUnit(e.unit) || ((baseShooting || shootingCanFlip) && (hasDynamicSecProjOp || relevantSecProjs.has(e.unit)));
    });
    if (touchesRelevantType60) shapeHooks.add(tid);
  }

  for (const t of pool) {
    const rule = data.techs[t.id]!;
    let isControl = false;
    for (const e of rule.effects) {
      if (isNoopEffect(e)) continue;
      if (e.unit === b.id) {
        if (
          e.stat === 'capacity' ||
          e.stat === 'garrisonType' ||
          e.stat === 'secondaryProjectile' ||
          (shootingCanFlip && (e.stat === 'attack' || e.stat === 'reload' || e.stat === 'projectile'))
        ) {
          isControl = true;
          break;
        }
      } else if (isPowerUnit(e.unit)) {
        if (
          (e.stat === 'sizeClass' && isAvailEligible(e.unit)) ||
          e.stat === 'secondaryProjectile' ||
          (e.stat === 'firepower' && fpSignFlipUnits.has(e.unit)) ||
          (e.stat === 'reload' && reloadInvalidFlipUnits.has(e.unit)) ||
          e.stat === 'total' ||
          (e.stat === 'attack' && negFpCapableUnits.has(e.unit) && reloadTouchedUnits.has(e.unit))
        ) {
          isControl = true;
          break;
        }
      }
    }
    if (!isControl && (rule.trainingLocations ?? []).some(relocTouchesBuilding)) isControl = true;
    if (
      !isControl &&
      TRAINING_UNLOCK_GATES.some(
        (gate) => gate.techId === t.id && (gate.buildingId === undefined || gate.buildingId === b.id) && gate.unitIds.some(canBuildingProduceUnit),
      )
    ) {
      isControl = true;
    }
    if (isControl) controlSet.add(t.id);
  }
  for (const cid of [...controlSet]) {
    for (const p of prereqChainInPool(cid)) controlSet.add(p);
  }

  // Techs in civ.free (without unmet shape prereq or dynamic-rule prereq) automatically enter selected whenever their pool prereqs are present,
  // so they are determined by their prerequisites rather than independent branch choices.
  const hasDynPrereq = (tid: number): boolean => prereqChainInPool(tid).some((p) => dynKnownPoolIds.has(p) || (baseState.known.has(p) && !baseFree.has(p)));
  const autoFreeControl = new Set<number>(
    [...controlSet].filter((id) => !baseFree.has(id) && civFreeSet.has(id) && !hasUnmetShapePrereq(id) && !hasDynPrereq(id)),
  );
  const rawBranchTechs = [...controlSet].filter((id) => !baseFree.has(id) && !autoFreeControl.has(id)).sort((a, z) => a - z);
  const mayBeAutoKnown = (id: number): boolean => baseState.known.has(id) || dynKnownPoolIds.has(id);
  const { branchTechs, branchSet, branchPrereqs, legalSubsets, subsetOverflow } = enumerateBranchSubsets(
    rawBranchTechs,
    ctx.core.techById,
    poolIds,
    mayBeAutoKnown,
  );

  // Collect candidate shape units whose implicit shape closure touches shapeHooks (preserving implicitShapeTechs order).
  interface ShapeCandidate {
    uid: number;
    hookTechs: number[];
    hookSig: string;
  }
  const shapeCandidates: ShapeCandidate[] = [];
  if (shapeHooks.size > 0 && upgradeData.unitUpgradeTechs) {
    const unitShapeClosure = (seeds: number[]): number[] => {
      const found = new Set<number>();
      for (const sid of seeds) {
        let cur: number | null | undefined = sid;
        while (cur && shapeUpgrades.has(cur) && !found.has(cur)) {
          found.add(cur);
          cur = ctx.core.techById[cur]?.pre;
        }
      }
      return [...found];
    };
    for (const [key, seeds] of Object.entries(upgradeData.unitUpgradeTechs)) {
      if (!seeds.length) continue;
      const uid = Number(key);
      if (!isAvailEligible(uid)) continue;
      const hitHooks = unitShapeClosure(seeds).filter((tid) => shapeHooks.has(tid));
      if (!hitHooks.length) continue;
      shapeCandidates.push({ uid, hookTechs: hitHooks, hookSig: hitHooks.join(',') });
    }
  }

  const makeEvalState = (
    techs: number[],
    rowIds: number[],
    snap?: Snapshot,
    stateData: GeneralGarrisonData = data,
    stateIndex: StaticGarrisonIndex = staticIndex,
  ): EvalState => {
    const rows: GeneralGarrisonRow[] = rowIds.map((uid) => ({ unitId: uid, count: '0', entry: 'enter' }));
    const cfgEval: GeneralGarrisonConfig = { civ: config.civ, age: config.age, techs, rows };
    const st = snap ?? snapshot(ctx, b, cfgEval, stateData, status, stateIndex);
    return {
      techs,
      rowIds,
      rowKey: rowIds.join(','),
      config: cfgEval,
      snapshot: st,
      data: stateData,
      index: stateIndex,
      candCache: new Map(),
      relicDeposit: null,
    };
  };

  const candOf = (es: EvalState, uid: number): GarrisonCandidate | null => {
    if (es.candCache.has(uid)) return es.candCache.get(uid)!;
    const c = candidate(ctx, b, es.config, uid, es.snapshot, es.data, scope, status);
    es.candCache.set(uid, c);
    return c;
  };
  const isOccupantIn = (es: EvalState, uid: number): boolean => {
    const c = candOf(es, uid);
    return !!c && (c.canEnter || c.canCreate || c.canDeposit);
  };
  const hasRelicDepositIn = (es: EvalState): boolean => {
    if (es.relicDeposit !== null) return es.relicDeposit;
    es.relicDeposit = FORTIFIED_CHURCH_IDS.has(b.id) && relicIds.some((rid) => !!candOf(es, rid)?.canDeposit);
    return es.relicDeposit;
  };
  const isPowerContributorIn = (es: EvalState, uid: number): boolean => {
    const c = isAvailEligible(uid) ? candOf(es, uid) : null;
    return (!!c && (c.canEnter || c.canCreate)) || (uid === VILLAGER_UNIT_ID && hasRelicDepositIn(es));
  };

  const pruneToValidRows = (
    techs: number[],
    startIds: number[],
    stateData: GeneralGarrisonData = data,
    stateIndex: StaticGarrisonIndex = staticIndex,
  ): EvalState => {
    let cur = startIds;
    while (true) {
      const es = makeEvalState(techs, cur, undefined, stateData, stateIndex);
      if (!cur.length) return es;
      const next = cur.filter((uid) => isOccupantIn(es, uid));
      if (next.length === cur.length) return es;
      cur = next;
    }
  };

  const { shapeGroupUnits, sensitiveGroupIndices, commGroupIndices, shapeStateCount, stateSpaceOverflow, sensitivePerms } = partitionShapeGroups({
    shapeCandidates,
    baseFree,
    baseState,
    data,
    isNoopEffect,
    legalSubsetCount: legalSubsets.length,
    subsetOverflow,
  });
  const allShapeUids = shapeCandidates.map((sc) => sc.uid);

  const validStatesForTechs = (
    techs: number[],
    stateData: GeneralGarrisonData = data,
    stateIndex: StaticGarrisonIndex = staticIndex,
    outUnpruned?: { value: boolean },
  ): EvalState[] => {
    const emptyState = makeEvalState(techs, [], techs.length === 0 && stateData === data ? baseState : undefined, stateData, stateIndex);
    if (!allShapeUids.length) {
      if (outUnpruned) outUnpruned.value = true;
      return [emptyState];
    }
    const byKey = new Map<string, EvalState>([['', emptyState]]);
    let allUnpruned = true;
    if (sensitiveGroupIndices.length === 0) {
      const maxState = pruneToValidRows(techs, allShapeUids, stateData, stateIndex);
      if (maxState.rowIds.length < allShapeUids.length) allUnpruned = false;
      if (!byKey.has(maxState.rowKey)) byKey.set(maxState.rowKey, maxState);
      if (shapeGroupUnits.length > 1) {
        const totalMasks = 1 << shapeGroupUnits.length;
        for (let mask = 1; mask < totalMasks - 1; mask++) {
          const subsetIds: number[] = [];
          for (let i = 0; i < shapeGroupUnits.length; i++) {
            if (((mask >> i) & 1) !== 0) subsetIds.push(...shapeGroupUnits[i]!);
          }
          const pruned = pruneToValidRows(techs, subsetIds, stateData, stateIndex);
          if (pruned.rowIds.length < subsetIds.length) allUnpruned = false;
          if (!byKey.has(pruned.rowKey)) byKey.set(pruned.rowKey, pruned);
        }
      }
    } else {
      const totalCommMasks = 1 << commGroupIndices.length;
      for (let mask = 0; mask < totalCommMasks; mask++) {
        const commIds: number[] = [];
        for (let i = 0; i < commGroupIndices.length; i++) {
          if (((mask >> i) & 1) !== 0) commIds.push(...shapeGroupUnits[commGroupIndices[i]!]!);
        }
        for (const perm of sensitivePerms) {
          if (mask === 0 && perm.length === 0) continue;
          const subsetIds = [...commIds];
          for (const gi of perm) subsetIds.push(...shapeGroupUnits[gi]!);
          const pruned = pruneToValidRows(techs, subsetIds, stateData, stateIndex);
          if (pruned.rowIds.length < subsetIds.length) allUnpruned = false;
          if (!byKey.has(pruned.rowKey)) byKey.set(pruned.rowKey, pruned);
        }
      }
    }
    if (outUnpruned) outUnpruned.value = allUnpruned;
    return [...byKey.values()];
  };

  // Materialize all exact reachable (T, R) states (skipped if overflowed, where conservative fallback applies).
  const statesByTechKey = new Map<string, EvalState[]>();
  const unprunedTechKeys = new Set<string>();
  const allReachableStates: EvalState[] = [];
  if (!stateSpaceOverflow) {
    for (const techs of legalSubsets) {
      const unpruned = { value: false };
      const list = validStatesForTechs(techs, data, staticIndex, unpruned);
      const techKey = techs.join(',');
      statesByTechKey.set(techKey, list);
      if (unpruned.value) unprunedTechKeys.add(techKey);
      for (const es of list) allReachableStates.push(es);
    }
  }
  for (const es of allReachableStates) {
    const secB = es.snapshot.building?.secondaryProjectile ?? -1;
    if (secB >= 0) relevantSecProjs.add(secB);
    for (const uid of powerUnitIds) {
      const u = es.snapshot.units[uid];
      if (!u || !isPowerUnit(uid)) continue;
      if (u.total > 1) {
        multiProjCandidates.add(uid);
        if (u.secondaryProjectile >= 0) relevantSecProjs.add(u.secondaryProjectile);
      }
    }
  }

  return {
    controlSet,
    autoFreeControl,
    branchTechs,
    branchSet,
    branchPrereqs,
    prereqChainInPool,
    legalSubsets,
    shapeStateCount,
    stateSpaceOverflow,
    allShapeUids,
    statesByTechKey,
    unprunedTechKeys,
    allReachableStates,
    relevantSecProjs,
    hasDynamicSecProjOp,
    makeEvalState,
    candOf,
    isOccupantIn,
    isPowerContributorIn,
    validStatesForTechs,
  };
}
