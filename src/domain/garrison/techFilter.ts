/** Issue 1404/1526: Phase 4 of garrison tech filtering (Part 3A branch control, Part 3B pure stat, and Part 3C free control evaluation). */
import type { Building, Tech } from '../types';
import { civStatus } from '../simulator';
import { VILLAGER_UNIT_ID } from '../gameIds';
import { TRAINING_UNLOCK_GATES } from '../trainingUnlocks';
import type { GeneralGarrisonConfig } from '../garrisonUrl';
import { acceptsTask, GENERAL_GARRISON_DATA, unique, type GeneralGarrisonContext, type GeneralGarrisonData, type GeneralGarrisonRule } from './types';
import { snapshot } from './snapshot';
import { BUILDING_SHOOTING_STATS, MAX_EXACT_STATES, MAX_PEER_PROBES_PER_TECH, POWER_STATS } from './techFilterMath';
import { prepareTechFilterReachability } from './techFilterReachability';
import { buildControlAndStateSpace, type EvalState } from './techFilterControl';
import { createTechFilterProbes } from './techFilterProbes';

/** Covers the whole eligible roster so removing a row never invalidates its selected technologies. */
export function getGarrisonTechs(ctx: GeneralGarrisonContext, b: Building, config: GeneralGarrisonConfig, data = GENERAL_GARRISON_DATA): Tech[] {
  return computeGarrisonTechs(ctx, b, config, data, civStatus(ctx.trees, config.civ));
}

export function computeGarrisonTechs(
  ctx: GeneralGarrisonContext,
  b: Building,
  config: GeneralGarrisonConfig,
  data: GeneralGarrisonData,
  status: Record<string, number>,
): Tech[] {
  const reach = prepareTechFilterReachability(ctx, b, config, data, status);
  if (!reach) return [];
  const space = buildControlAndStateSpace(reach);
  const probes = createTechFilterProbes(reach, space);

  const {
    eligibleIds,
    pool,
    poolIds,
    civFreeSet,
    baseState,
    baseB,
    scope,
    baseFree,
    isRelicPowerHost,
    isPowerUnit,
    availFreeShapeRules,
    activeShadowedDynRules,
    canBuildingProduceUnit,
    fpSignFlipUnits,
    isNoopEffect,
    baseShooting,
    shootingCanFlip,
  } = reach;
  const {
    controlSet,
    autoFreeControl,
    branchTechs,
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
    isOccupantIn,
    validStatesForTechs,
  } = space;
  const {
    nonControlTechs,
    nonCtrlPrereqIds,
    missingNonCtrlPrereqsIn,
    isSelectedPrereqValid,
    uniquePeerClosures,
    statesObservableDiff,
    effectCouldTouchState,
    interactingPeersIn,
    pruneToValidState,
    unlocksRelevantNonControl,
    makeWithoutFree,
  } = probes;

  const kept = new Set<number>();

  // Part 3A: Evaluate each branch control tech across exact (T, T union {t}) transitions.
  for (const tid of branchTechs) {
    if (stateSpaceOverflow) {
      kept.add(tid);
      continue;
    }
    const reqs = branchPrereqs.get(tid)!;
    let relevant = false;
    for (const T of legalSubsets) {
      if (T.includes(tid)) continue;
      if (!reqs.every((p) => T.includes(p))) continue;
      const TWith = [...T, tid].sort((a, z) => a - z);
      const listA = statesByTechKey.get(T.join(','))!;
      const listB = statesByTechKey.get(TWith.join(','));
      if (!listB) continue;
      const mapA = new Map(listA.map((es) => [es.rowKey, es]));
      const mapB = new Map(listB.map((es) => [es.rowKey, es]));
      const rowKeys = new Set([...mapA.keys(), ...mapB.keys()]);
      for (const rk of rowKeys) {
        const hasA = mapA.has(rk);
        const hasB = mapB.has(rk);
        const esA = hasA ? mapA.get(rk)! : makeEvalState(T, mapB.get(rk)!.rowIds);
        const esB = hasB ? mapB.get(rk)! : makeEvalState(TWith, mapA.get(rk)!.rowIds);
        if (!isSelectedPrereqValid(esB.snapshot)) continue;
        if (!hasB && pruneToValidState(TWith, esA.rowIds).techs.length !== TWith.length) continue;
        if (hasA && isSelectedPrereqValid(esA.snapshot)) {
          if (statesObservableDiff(esA, esB, true) || (hasB && unlocksRelevantNonControl(esA, esB))) {
            relevant = true;
            break;
          }
        } else if (hasB) {
          const esBase = pruneToValidState(T, esB.rowIds);
          if (esBase.rowIds.length < esB.rowIds.length || statesObservableDiff(esBase, esB, true) || unlocksRelevantNonControl(esBase, esB)) {
            relevant = true;
            break;
          }
        }
      }
      if (relevant) break;
    }
    if (relevant) kept.add(tid);
  }

  // Part 3B: Evaluate pure non-control techs via real snapshot() comparisons (conservative fallback on state-space or peer overflow).
  if (stateSpaceOverflow) {
    if (baseShooting || shootingCanFlip) {
      for (const t of nonControlTechs) {
        const relevant = data.techs[t.id]!.effects.some((e) => {
          if (isNoopEffect(e)) return false;
          if (e.unit === b.id && BUILDING_SHOOTING_STATS.has(e.stat)) return true;
          if (e.stat === 'attack' && (relevantSecProjs.has(e.unit) || hasDynamicSecProjOp)) return true;
          if (!isPowerUnit(e.unit)) return false;
          if (e.stat !== 'attack' && e.stat !== 'reload' && e.stat !== 'firepower') return false;
          const u = baseState.units[e.unit];
          if (!u) return false;
          if (u.firepower === 0 && !fpSignFlipUnits.has(e.unit)) return false;
          return canBuildingProduceUnit(e.unit) || (e.unit === VILLAGER_UNIT_ID && isRelicPowerHost) || acceptsTask(u, baseB, scope.aliases);
        });
        if (relevant) kept.add(t.id);
      }
    }
  } else {
    // Collapse reachable states that are 100% equivalent for non-control power/shooting probes (e.g., identical capacity-only subsets).
    const sortedNonCtrlPrereqIds = [...nonCtrlPrereqIds].sort((a, z) => a - z);
    const powerSelectedIds = new Set<number>(sortedNonCtrlPrereqIds);
    for (const id of [...controlSet, ...baseFree]) {
      if (data.techs[id]?.effects.some((e) => !((e.op === 'add' && e.value === 0) || (e.op === 'mul' && e.value === 1)) && POWER_STATS.has(e.stat))) {
        powerSelectedIds.add(id);
      }
    }
    for (const r of availFreeShapeRules) {
      if (r.effects.some((e) => !((e.op === 'add' && e.value === 0) || (e.op === 'mul' && e.value === 1)) && POWER_STATS.has(e.stat))) {
        powerSelectedIds.add(r.id);
      }
    }
    const part3BStates: EvalState[] = [];
    {
      const seenPart3B = new Set<string>();
      const ruleInstanceIds = new Map<GeneralGarrisonRule, number>();
      const ruleInstanceId = (r: GeneralGarrisonRule): number => {
        let id = ruleInstanceIds.get(r);
        if (id === undefined) {
          id = ruleInstanceIds.size;
          ruleInstanceIds.set(r, id);
        }
        return id;
      };
      for (const es of allReachableStates) {
        const st = es.snapshot;
        if (!isSelectedPrereqValid(st)) continue;
        const B = st.building;
        const capPos = B && B.capacity > 0 ? 1 : 0;
        const gType = B ? B.garrisonType : -1;
        let unlockMask = 0;
        for (let i = 0; i < TRAINING_UNLOCK_GATES.length; i++) {
          if (st.known.has(TRAINING_UNLOCK_GATES[i]!.techId)) unlockMask |= 1 << i;
        }
        const reqSig = sortedNonCtrlPrereqIds.filter((id) => st.known.has(id)).join(',');
        const selPower = st.selected.filter((id) => powerSelectedIds.has(id)).join(',');
        const rulesSig = `${st.stage0RuleCount}:${st.appliedRules.map(ruleInstanceId).join(',')}`;
        const unitDiffs: string[] = [];
        for (const uid of eligibleIds) {
          const u = st.units[uid];
          const bu = baseState.units[uid];
          if (u === bu) continue;
          const scDiff = u?.sizeClass !== bu?.sizeClass;
          const tlDiff = u?.trainLocations !== bu?.trainLocations;
          if (scDiff || tlDiff) {
            unitDiffs.push(`${uid}:${u?.sizeClass ?? ''}:${tlDiff ? (u?.trainLocations.map((x) => x.unitId).join('.') ?? '') : ''}`);
          }
        }
        const prodSig = Object.keys(st.productionLocations)
          .map(Number)
          .sort((a, z) => a - z)
          .map((k) => `${k}:${st.productionLocations[k]!.join('.')}`)
          .join(';');
        const key = `${es.rowKey}|${capPos}|${gType}|${unlockMask}|${reqSig}|${selPower}|${rulesSig}|${unitDiffs.join(',')}|${prodSig}`;
        if (!seenPart3B.has(key)) {
          seenPart3B.add(key);
          part3BStates.push(es);
        }
      }
    }

    for (const t of nonControlTechs) {
      const effects = data.techs[t.id]!.effects;
      if (!effects.length) continue;
      const isFreeBase = baseFree.has(t.id);
      const freeCtx = isFreeBase ? makeWithoutFree(t.id) : null;
      let relevant = false;
      const peerCandidateStates: { es: EvalState; reqNonCtrl: number[]; esWithout?: EvalState }[] = [];

      for (const es of part3BStates) {
        const reqNonCtrl = missingNonCtrlPrereqsIn(t.id, es);
        if (reqNonCtrl === null) continue;
        if (freeCtx && es.snapshot.selected.includes(t.id)) {
          const snapWithout = snapshot(ctx, b, es.config, freeCtx.withoutData, status, freeCtx.withoutIndex);
          const esWithout = makeEvalState(es.techs, es.rowIds, snapWithout, freeCtx.withoutData, freeCtx.withoutIndex);
          if (!effects.some((e) => effectCouldTouchState(e, es) || effectCouldTouchState(e, esWithout))) continue;
          if (statesObservableDiff(esWithout, es, false)) {
            relevant = true;
            break;
          }
          peerCandidateStates.push({ es, reqNonCtrl, esWithout });
          continue;
        }
        if (!effects.some((e) => effectCouldTouchState(e, es))) continue;
        const baseTechs = reqNonCtrl.length > 0 ? unique([...es.techs, ...reqNonCtrl]) : es.techs;
        const esBase = reqNonCtrl.length > 0 ? makeEvalState(baseTechs, es.rowIds) : es;
        const esWith = makeEvalState(unique([...baseTechs, t.id]), es.rowIds);
        if (statesObservableDiff(esBase, esWith, false)) {
          relevant = true;
          break;
        }
        peerCandidateStates.push({ es, reqNonCtrl });
      }

      if (!relevant && peerCandidateStates.length > 0) {
        let peerProbes = 0;
        for (const { es, reqNonCtrl, esWithout } of peerCandidateStates) {
          if (freeCtx && esWithout && es.snapshot.selected.includes(t.id)) {
            const { peers, reqMap } = interactingPeersIn(t, es, esWithout);
            const closures = uniquePeerClosures(peers, (pid) => reqMap.get(pid)!);
            if (closures === null) {
              relevant = true;
              break;
            }
            for (const closed of closures) {
              if (++peerProbes > MAX_PEER_PROBES_PER_TECH) {
                relevant = true;
                break;
              }
              const techsWithPeers = unique([...es.techs, ...closed]);
              const esPWith = makeEvalState(techsWithPeers, es.rowIds);
              const esPWithout = makeEvalState(techsWithPeers, es.rowIds, undefined, freeCtx.withoutData, freeCtx.withoutIndex);
              if (statesObservableDiff(esPWithout, esPWith, false)) {
                relevant = true;
                break;
              }
            }
          } else {
            const baseTechs = reqNonCtrl.length > 0 ? unique([...es.techs, ...reqNonCtrl]) : es.techs;
            const { peers: rawPeers, reqMap } = interactingPeersIn(t, es);
            const peers = rawPeers.filter((pid) => !baseTechs.includes(pid) && !reqMap.get(pid)!.includes(t.id));
            const closures = uniquePeerClosures(peers, (pid) => reqMap.get(pid)!);
            if (closures === null) {
              relevant = true;
              break;
            }
            for (const closed of closures) {
              if (++peerProbes > MAX_PEER_PROBES_PER_TECH) {
                relevant = true;
                break;
              }
              const pBaseTechs = unique([...baseTechs, ...closed]);
              if (pBaseTechs.includes(t.id)) continue;
              const esPBase = makeEvalState(pBaseTechs, es.rowIds);
              const esPWith = makeEvalState(unique([...pBaseTechs, t.id]), es.rowIds);
              if (statesObservableDiff(esPBase, esPWith, false)) {
                relevant = true;
                break;
              }
            }
          }
          if (relevant) break;
        }
      }
      if (relevant) kept.add(t.id);
    }
  }

  // Close prerequisites for manual kept techs before checking conditionally-free control techs.
  const shadowedDynIds = new Set(activeShadowedDynRules.map((r) => r.id));
  const closePrereqs = () => {
    for (const id of [...kept]) {
      let pre = ctx.core.techById[id]?.pre;
      const seen = new Set<number>();
      while (pre && poolIds.has(pre) && !seen.has(pre)) {
        seen.add(pre);
        if (baseState.known.has(pre) && !baseFree.has(pre) && !shadowedDynIds.has(pre)) break;
        kept.add(pre);
        pre = ctx.core.techById[pre]?.pre;
      }
    }
  };
  closePrereqs();

  // Part 3C: Evaluate free control techs (baseFree, autoFreeControl, or shape-gated free control techs).
  let part3CChanged = true;
  let part3CMirrorProbes = 0;
  while (part3CChanged) {
    part3CChanged = false;
    const freeControlCandidates = [...controlSet].filter(
      (id) =>
        !kept.has(id) &&
        (baseFree.has(id) || (civFreeSet.has(id) && prereqChainInPool(id).every((p) => kept.has(p) || baseFree.has(p) || autoFreeControl.has(p)))),
    );
    for (const fid of freeControlCandidates) {
      if (stateSpaceOverflow) {
        kept.add(fid);
        part3CChanged = true;
        continue;
      }
      const { withoutData, withoutIndex } = makeWithoutFree(fid);
      let relevant = false;
      for (const es of allReachableStates) {
        if (!es.snapshot.selected.includes(fid)) continue;
        if (!isSelectedPrereqValid(es.snapshot)) continue;
        if (!baseFree.has(fid) && !es.techs.every((tid) => kept.has(tid))) continue;
        const snapWithout = snapshot(ctx, b, es.config, withoutData, status, withoutIndex);
        const esWithout = makeEvalState(es.techs, es.rowIds, snapWithout, withoutData, withoutIndex);
        const withoutRowsValid = esWithout.rowIds.every((uid) => isOccupantIn(esWithout, uid));
        if (withoutRowsValid && isSelectedPrereqValid(esWithout.snapshot)) {
          if (statesObservableDiff(esWithout, es, true) || unlocksRelevantNonControl(esWithout, es)) {
            relevant = true;
            break;
          }
        } else {
          const esBase = pruneToValidState(es.techs, es.rowIds, withoutData, withoutIndex);
          if (esBase.rowIds.length < es.rowIds.length || statesObservableDiff(esBase, es, true) || unlocksRelevantNonControl(esBase, es)) {
            relevant = true;
            break;
          }
        }
      }
      if (!relevant && allShapeUids.length > 0) {
        for (const T of legalSubsets) {
          if (!baseFree.has(fid) && !T.every((tid) => kept.has(tid))) continue;
          const techKey = T.join(',');
          if (unprunedTechKeys.has(techKey)) continue;
          const listWith = statesByTechKey.get(techKey) ?? [];
          if ((part3CMirrorProbes += shapeStateCount) > MAX_EXACT_STATES) {
            relevant = true;
            break;
          }
          const knownRowKeys = new Set(listWith.map((es) => es.rowKey));
          for (const esW of validStatesForTechs(T, withoutData, withoutIndex)) {
            if (!esW.rowIds.length || knownRowKeys.has(esW.rowKey) || !isSelectedPrereqValid(esW.snapshot)) continue;
            const esWith = makeEvalState(T, esW.rowIds);
            if (!esWith.snapshot.selected.includes(fid) || !isSelectedPrereqValid(esWith.snapshot)) continue;
            if (pruneToValidState(T, esW.rowIds).techs.length !== T.length) continue;
            if (statesObservableDiff(esW, esWith, true)) {
              relevant = true;
              break;
            }
          }
          if (relevant) break;
        }
      }
      if (relevant) {
        kept.add(fid);
        part3CChanged = true;
      }
    }
    if (part3CChanged) closePrereqs();
  }

  return pool.filter((t) => kept.has(t.id));
}
