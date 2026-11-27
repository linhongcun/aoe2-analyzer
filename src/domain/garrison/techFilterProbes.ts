/** Issue 1404/1526: Phase 3 of garrison tech filtering (observable diffing, peer synergy probes, and prerequisite pruning). */
import type { Tech } from '../types';
import { FEMALE_VILLAGER_ID, VILLAGER_UNIT_ID } from '../gameIds';
import { TRAINING_UNLOCK_GATES } from '../trainingUnlocks';
import {
  describeUnitGarrisonPower,
  unique,
  type GeneralGarrisonData,
  type GeneralGarrisonEffect,
  type GeneralGarrisonRule,
  type Snapshot,
  type StaticGarrisonIndex,
} from './types';
import { getStaticIndex, snapshot } from './snapshot';
import {
  BUILDING_SHOOTING_STATS,
  buildNonControlIndex,
  buildingShootingDiff,
  isShootingBuilding,
  MAX_PEER_PROBES_PER_TECH,
  MAX_SYNERGY_PROBES,
  numbersDiffer,
  uniquePeerClosures,
} from './techFilterMath';
import type { TechFilterReachability } from './techFilterReachability';
import type { EvalState, TechFilterStateSpace } from './techFilterControl';

interface TechFilterProbes {
  nonControlTechs: Tech[];
  nonCtrlPrereqIds: Set<number>;
  missingNonCtrlPrereqsIn: (tid: number, es: EvalState) => number[] | null;
  isSelectedPrereqValid: (snap: Snapshot) => boolean;
  uniquePeerClosures: (peers: number[], reqNonCtrlOf: (pid: number) => number[]) => number[][] | null;
  statesObservableDiff: (esA: EvalState, esB: EvalState, includeNonControlSynergy?: boolean) => boolean;
  effectCouldTouchState: (e: GeneralGarrisonEffect, es: EvalState) => boolean;
  interactingPeersIn: (t: Tech, es: EvalState, esAlt?: EvalState) => { peers: number[]; reqMap: Map<number, number[]> };
  pruneToValidState: (startTechs: number[], startRowIds: number[], stateData?: GeneralGarrisonData, stateIndex?: StaticGarrisonIndex) => EvalState;
  unlocksRelevantNonControl: (esBase: EvalState, esB: EvalState) => boolean;
  makeWithoutFree: (fid: number) => { withoutData: GeneralGarrisonData; withoutIndex: StaticGarrisonIndex };
}

export function createTechFilterProbes(reach: TechFilterReachability, space: TechFilterStateSpace): TechFilterProbes {
  const {
    ctx,
    b,
    config,
    data,
    status,
    civData,
    upgradeData,
    staticIndex,
    eligibleIds,
    pool,
    poolIds,
    baseFree,
    isAvailEligible,
    isPowerUnit,
    powerUnitIds,
    multiProjCandidates,
    isNoopEffect,
  } = reach;
  const { controlSet, autoFreeControl, branchSet, prereqChainInPool, makeEvalState, candOf, isOccupantIn, isPowerContributorIn } = space;

  const { nonControlTechs, nonCtrlPrereqIds, nonCtrlByPrereq, nonControlTouchTechsByKey } = buildNonControlIndex(pool, controlSet, data, prereqChainInPool);

  // Missing manual non-control prerequisites for selecting `tid` in `es`; stops once an ancestor is already in `es.snapshot.known`.
  // Returns null if an unmet branch prerequisite is not yet known in `es`.
  const missingNonCtrlPrereqsIn = (tid: number, es: EvalState): number[] | null => {
    const need: number[] = [];
    const seen = new Set<number>();
    let pre = ctx.core.techById[tid]?.pre;
    while (pre && poolIds.has(pre) && !seen.has(pre)) {
      seen.add(pre);
      if (es.snapshot.known.has(pre)) break;
      if (branchSet.has(pre)) return null;
      if (!baseFree.has(pre) && !autoFreeControl.has(pre)) need.push(pre);
      pre = ctx.core.techById[pre]?.pre;
    }
    return need;
  };
  const isSelectedPrereqValid = (snap: Snapshot): boolean => {
    for (const id of snap.selected) {
      const pre = ctx.core.techById[id]?.pre;
      if (pre && poolIds.has(pre) && !snap.known.has(pre)) return false;
    }
    return true;
  };

  const compatiblePeersForKeys = (esA: EvalState, esB: EvalState, keys: Iterable<string>): { peers: number[]; reqMap: Map<number, number[]> } => {
    const reqMap = new Map<number, number[]>();
    for (const key of keys) {
      for (const pid of nonControlTouchTechsByKey.get(key) ?? []) {
        if (reqMap.has(pid) || esA.snapshot.selected.includes(pid) || esB.snapshot.selected.includes(pid)) continue;
        const reqA = missingNonCtrlPrereqsIn(pid, esA);
        const reqB = missingNonCtrlPrereqsIn(pid, esB);
        if (reqA === null || reqB === null) continue;
        reqMap.set(pid, unique([...reqA, ...reqB]));
      }
    }
    return { peers: [...reqMap.keys()].sort((a, z) => a - z), reqMap };
  };

  // Exact observable difference between two real snapshots (stateA vs stateB).
  // When includeNonControlSynergy is true (Part 3A / Part 3C), verifies actual contribution diffs across compatible non-control peer subsets.
  let synergyProbesUsed = 0;
  const statesObservableDiff = (esA: EvalState, esB: EvalState, includeNonControlSynergy = true): boolean => {
    const sA = esA.snapshot;
    const sB = esB.snapshot;
    const bA = sA.building;
    const bB = sB.building;
    if (!bA || !bB) return bA !== bB;
    if (bA.capacity !== bB.capacity) return true;

    let needCandScan = bA.garrisonType !== bB.garrisonType;
    if (!needCandScan) {
      for (const gate of TRAINING_UNLOCK_GATES) {
        if (gate.buildingId !== undefined && gate.buildingId !== b.id) continue;
        if (sA.known.has(gate.techId) !== sB.known.has(gate.techId)) {
          needCandScan = true;
          break;
        }
      }
    }
    if (!needCandScan) {
      const locKeys = new Set([...Object.keys(sA.productionLocations), ...Object.keys(sB.productionLocations)]);
      for (const k of locKeys) {
        const aLocs = sA.productionLocations[Number(k)];
        const bLocs = sB.productionLocations[Number(k)];
        if ((aLocs?.length ?? 0) !== (bLocs?.length ?? 0) || (aLocs && bLocs && aLocs.some((v, i) => v !== bLocs[i]))) {
          needCandScan = true;
          break;
        }
      }
    }
    if (needCandScan) {
      for (const uid of eligibleIds) {
        if (!isAvailEligible(uid)) continue;
        const cA = candOf(esA, uid);
        const cB = candOf(esB, uid);
        if (!!cA !== !!cB) return true;
        if (cA && cB && (cA.canEnter !== cB.canEnter || cA.canCreate !== cB.canCreate || cA.canDeposit !== cB.canDeposit)) return true;
      }
    } else {
      for (const uid of eligibleIds) {
        const uA = sA.units[uid];
        const uB = sB.units[uid];
        if (uA === uB || !isAvailEligible(uid)) continue;
        if (uA?.sizeClass !== uB?.sizeClass || uA?.trainLocations !== uB?.trainLocations) {
          const checkIds = uid === VILLAGER_UNIT_ID && isAvailEligible(FEMALE_VILLAGER_ID) ? [uid, FEMALE_VILLAGER_ID] : [uid];
          for (const cid of checkIds) {
            const cA = candOf(esA, cid);
            const cB = candOf(esB, cid);
            if (!!cA !== !!cB) return true;
            if (cA && cB && (cA.canEnter !== cB.canEnter || cA.canCreate !== cB.canCreate || cA.canDeposit !== cB.canDeposit)) return true;
          }
        }
      }
    }

    const shootA = isShootingBuilding(bA);
    const shootB = isShootingBuilding(bB);
    if (shootA !== shootB) return true;
    if (!shootA) return false;
    if (buildingShootingDiff(bA, sA.units, bB, sB.units)) return true;

    let extraTouchedBuilding = false;
    const extraTouchedUnits = includeNonControlSynergy ? new Set<number>() : null;
    if (includeNonControlSynergy) {
      const markDiffRule = (rule: GeneralGarrisonRule | undefined) => {
        if (!rule) return;
        for (const e of rule.effects) {
          if ((e.op === 'add' && e.value === 0) || (e.op === 'mul' && e.value === 1)) continue;
          if (e.unit === b.id && BUILDING_SHOOTING_STATS.has(e.stat)) {
            extraTouchedBuilding = true;
          } else {
            if (e.stat === 'attack') {
              if (e.unit === bA.secondaryProjectile || e.unit === bB.secondaryProjectile) extraTouchedBuilding = true;
              for (const uid of multiProjCandidates) {
                if (sA.units[uid]?.secondaryProjectile === e.unit || sB.units[uid]?.secondaryProjectile === e.unit) {
                  extraTouchedUnits!.add(uid);
                }
              }
            }
            if (isPowerUnit(e.unit) && (e.stat === 'attack' || e.stat === 'reload' || e.stat === 'firepower')) {
              extraTouchedUnits!.add(e.unit);
            }
          }
        }
      };
      const selA = new Set(sA.selected);
      const selB = new Set(sB.selected);
      for (const id of sA.selected) if (!selB.has(id)) markDiffRule(esA.data.techs[id]);
      for (const id of sB.selected) if (!selA.has(id)) markDiffRule(esB.data.techs[id]);
      const rulesSameOrder =
        sA.stage0RuleCount === sB.stage0RuleCount &&
        sA.appliedRules.length === sB.appliedRules.length &&
        sA.appliedRules.every((r, i) => r === sB.appliedRules[i]);
      if (!rulesSameOrder) {
        for (const r of sA.appliedRules) markDiffRule(r);
        for (const r of sB.appliedRules) markDiffRule(r);
      }

      if (
        extraTouchedBuilding ||
        bA.attack !== bB.attack ||
        bA.reload !== bB.reload ||
        bA.total !== bB.total ||
        bA.max !== bB.max ||
        bA.secondaryProjectile !== bB.secondaryProjectile ||
        (bA.secondaryProjectile >= 0 && bB.secondaryProjectile >= 0 && sA.units[bA.secondaryProjectile]?.attack !== sB.units[bB.secondaryProjectile]?.attack)
      ) {
        const keys = [`${b.id}:attack`, `${b.id}:reload`, `${b.id}:total`, `${b.id}:max`];
        if (bA.secondaryProjectile >= 0) keys.push(`${bA.secondaryProjectile}:attack`);
        if (bB.secondaryProjectile >= 0 && bB.secondaryProjectile !== bA.secondaryProjectile) keys.push(`${bB.secondaryProjectile}:attack`);
        const { peers, reqMap } = compatiblePeersForKeys(esA, esB, keys);
        const closures = uniquePeerClosures(peers, (pid) => reqMap.get(pid)!);
        if (closures === null) return true;
        for (const closed of closures) {
          if (++synergyProbesUsed > MAX_SYNERGY_PROBES) return true;
          const snapA = snapshot(ctx, b, { ...esA.config, techs: unique([...esA.techs, ...closed]) }, esA.data, status, esA.index);
          const snapB = snapshot(ctx, b, { ...esB.config, techs: unique([...esB.techs, ...closed]) }, esB.data, status, esB.index);
          const nbA = snapA.building;
          const nbB = snapB.building;
          const nsA = isShootingBuilding(nbA);
          const nsB = isShootingBuilding(nbB);
          if (nsA !== nsB) return true;
          if (nsA && buildingShootingDiff(nbA!, snapA.units, nbB!, snapB.units)) return true;
        }
      }
    }

    const checkedUnits = new Set<number>();
    const checkUnitPowerDiff = (uid: number): boolean => {
      if (checkedUnits.has(uid) || !isPowerUnit(uid)) return false;
      checkedUnits.add(uid);
      if (!isPowerContributorIn(esA, uid) && !isPowerContributorIn(esB, uid)) return false;
      const uA = sA.units[uid];
      const uB = sB.units[uid];
      if (!uA || !uB) return uA !== uB;
      const pA = describeUnitGarrisonPower(uA, sA.units).power;
      const pB = describeUnitGarrisonPower(uB, sB.units).power;
      if ((pA === null) !== (pB === null)) return true;
      if (pA !== null && pB !== null && numbersDiffer(pA, pB)) return true;
      if (!includeNonControlSynergy) return false;
      if (uA.firepower === 0 && uB.firepower === 0) return false;
      if (uA.firepower > 0 && !(uA.reload > 0) && uB.firepower > 0 && !(uB.reload > 0)) return false;
      const secAtkA = uA.total > 1 && uA.secondaryProjectile >= 0 ? sA.units[uA.secondaryProjectile]?.attack : undefined;
      const secAtkB = uB.total > 1 && uB.secondaryProjectile >= 0 ? sB.units[uB.secondaryProjectile]?.attack : undefined;
      const hasRelevantDiff =
        extraTouchedUnits?.has(uid) ||
        uA.firepower !== uB.firepower ||
        uA.reload !== uB.reload ||
        uA.total !== uB.total ||
        uA.secondaryProjectile !== uB.secondaryProjectile ||
        uA.attack !== uB.attack ||
        secAtkA !== secAtkB;
      if (!hasRelevantDiff) return false;
      const keys = [`${uid}:attack`, `${uid}:firepower`, `${uid}:reload`];
      if (uA.total > 1 && uA.secondaryProjectile >= 0) keys.push(`${uA.secondaryProjectile}:attack`);
      if (uB.total > 1 && uB.secondaryProjectile >= 0 && (uA.total <= 1 || uB.secondaryProjectile !== uA.secondaryProjectile)) {
        keys.push(`${uB.secondaryProjectile}:attack`);
      }
      const { peers, reqMap } = compatiblePeersForKeys(esA, esB, keys);
      const closures = uniquePeerClosures(peers, (pid) => reqMap.get(pid)!);
      if (closures === null) return true;
      for (const closed of closures) {
        if (++synergyProbesUsed > MAX_SYNERGY_PROBES) return true;
        const snapA = snapshot(ctx, b, { ...esA.config, techs: unique([...esA.techs, ...closed]) }, esA.data, status, esA.index);
        const snapB = snapshot(ctx, b, { ...esB.config, techs: unique([...esB.techs, ...closed]) }, esB.data, status, esB.index);
        const nuA = snapA.units[uid];
        const nuB = snapB.units[uid];
        if (!nuA || !nuB) {
          if (nuA !== nuB) return true;
          continue;
        }
        const npA = describeUnitGarrisonPower(nuA, snapA.units).power;
        const npB = describeUnitGarrisonPower(nuB, snapB.units).power;
        if ((npA === null) !== (npB === null)) return true;
        if (npA !== null && npB !== null && numbersDiffer(npA, npB)) return true;
      }
      return false;
    };

    for (const uid of powerUnitIds) {
      if (sA.units[uid] !== sB.units[uid] && checkUnitPowerDiff(uid)) return true;
    }
    for (const uid of multiProjCandidates) {
      const secA = sA.units[uid]?.secondaryProjectile ?? -1;
      const secB = sB.units[uid]?.secondaryProjectile ?? -1;
      if (((secA >= 0 && sA.units[secA] !== sB.units[secA]) || (secB >= 0 && sA.units[secB] !== sB.units[secB])) && checkUnitPowerDiff(uid)) {
        return true;
      }
    }
    if (extraTouchedUnits) {
      for (const uid of extraTouchedUnits) {
        if (checkUnitPowerDiff(uid)) return true;
      }
    }
    return false;
  };

  const effectCouldTouchState = (e: GeneralGarrisonEffect, es: EvalState): boolean => {
    if (isNoopEffect(e)) return false;
    const st = es.snapshot;
    const B = st.building;
    if (!isShootingBuilding(B)) return false;
    if (e.unit === b.id) return BUILDING_SHOOTING_STATS.has(e.stat);
    if (e.stat === 'attack' && B!.secondaryProjectile === e.unit) return !!st.units[e.unit];
    if (e.stat === 'attack') {
      for (const uid of multiProjCandidates) {
        const u = st.units[uid];
        if (u && u.firepower > 0 && u.total > 1 && u.reload > 0 && u.secondaryProjectile === e.unit && isPowerContributorIn(es, uid)) return true;
      }
    }
    if (!isPowerUnit(e.unit) || !isPowerContributorIn(es, e.unit)) return false;
    const u = st.units[e.unit];
    if (!u || u.firepower === 0) return false;
    if (u.firepower > 0 && !(u.reload > 0)) return false;
    if (e.stat === 'reload' && u.firepower < 0 && !(u.reload > 0)) return false;
    return e.stat === 'attack' || e.stat === 'reload' || e.stat === 'firepower';
  };

  const interactingPeersIn = (t: Tech, es: EvalState, esAlt?: EvalState): { peers: number[]; reqMap: Map<number, number[]> } => {
    const reqMap = new Map<number, number[]>();
    const addKey = (key: string) => {
      for (const pid of nonControlTouchTechsByKey.get(key) ?? []) {
        if (pid === t.id || reqMap.has(pid) || es.snapshot.selected.includes(pid)) continue;
        const req = missingNonCtrlPrereqsIn(pid, es);
        if (req === null) continue;
        reqMap.set(pid, req);
      }
    };
    const collectFor = (probeEs: EvalState) => {
      const st = probeEs.snapshot;
      const B = st.building;
      for (const e of data.techs[t.id]!.effects) {
        if (!effectCouldTouchState(e, probeEs)) continue;
        addKey(`${e.unit}:${e.stat}`);
        if (e.unit === b.id && B) {
          if (e.stat === 'attack' || e.stat === 'reload') {
            addKey(`${b.id}:attack`);
            addKey(`${b.id}:reload`);
            if (B.secondaryProjectile >= 0) addKey(`${B.secondaryProjectile}:attack`);
          }
          if (!(Number.isSafeInteger(B.total) && B.total >= 0 && Number.isSafeInteger(B.max) && B.max >= 0)) {
            addKey(`${b.id}:total`);
            addKey(`${b.id}:max`);
          }
        } else {
          if (e.stat === 'attack' && B && B.secondaryProjectile === e.unit) {
            addKey(`${b.id}:attack`);
            addKey(`${b.id}:reload`);
            if (!(Number.isSafeInteger(B.total) && B.total >= 0 && Number.isSafeInteger(B.max) && B.max >= 0)) {
              addKey(`${b.id}:total`);
              addKey(`${b.id}:max`);
            }
          }
          if (e.stat === 'attack') {
            for (const uid of multiProjCandidates) {
              const u = st.units[uid];
              if (u && u.firepower > 0 && u.total > 1 && u.reload > 0 && u.secondaryProjectile === e.unit && isPowerContributorIn(probeEs, uid)) {
                addKey(`${uid}:attack`);
                addKey(`${uid}:reload`);
                addKey(`${uid}:firepower`);
              }
            }
          }
          if (isPowerUnit(e.unit)) {
            const u = st.units[e.unit];
            if (u && (e.stat === 'attack' || e.stat === 'reload' || e.stat === 'firepower')) {
              addKey(`${e.unit}:attack`);
              addKey(`${e.unit}:reload`);
              addKey(`${e.unit}:firepower`);
              if (u.total > 1 && u.secondaryProjectile >= 0) addKey(`${u.secondaryProjectile}:attack`);
            }
          }
        }
      }
    };
    collectFor(es);
    if (esAlt) collectFor(esAlt);
    return { peers: [...reqMap.keys()].sort((a, z) => a - z), reqMap };
  };

  // Prune techs whose pool prerequisite is missing in snapshot.known first, then rebuild before pruning invalid rows,
  // restoring startRowIds whenever curTechs shrinks (lexicographically decreasing on (curTechs.length, curRows.length)).
  const pruneToValidState = (
    startTechs: number[],
    startRowIds: number[],
    stateData: GeneralGarrisonData = data,
    stateIndex: StaticGarrisonIndex = staticIndex,
  ): EvalState => {
    let curTechs = startTechs;
    let curRows = startRowIds;
    while (true) {
      const es = makeEvalState(curTechs, curRows, undefined, stateData, stateIndex);
      const nextTechs = isSelectedPrereqValid(es.snapshot)
        ? curTechs
        : curTechs.filter((id) => {
            const pre = ctx.core.techById[id]?.pre;
            return !(pre && poolIds.has(pre) && !es.snapshot.known.has(pre));
          });
      if (nextTechs.length !== curTechs.length) {
        curTechs = nextTechs;
        curRows = startRowIds;
        continue;
      }
      const nextRows = curRows.length ? curRows.filter((uid) => isOccupantIn(es, uid)) : curRows;
      if (nextRows.length === curRows.length) return es;
      curRows = nextRows;
    }
  };

  // Detect whether esB newly satisfies a prerequisite chain for an observably relevant non-control tech relative to esBase.
  const unlocksRelevantNonControl = (esBase: EvalState, esB: EvalState): boolean => {
    const unlockedPreIds: number[] = [];
    for (const pre of nonCtrlPrereqIds) {
      if (esB.snapshot.known.has(pre) && !esBase.snapshot.known.has(pre)) unlockedPreIds.push(pre);
    }
    if (!unlockedPreIds.length) return false;
    const seenTech = new Set<number>();
    const peerCandidates: { t: Tech; reqB: number[] }[] = [];
    for (const preId of unlockedPreIds) {
      for (const t of nonCtrlByPrereq.get(preId) ?? []) {
        if (seenTech.has(t.id) || baseFree.has(t.id)) continue;
        seenTech.add(t.id);
        const reqB = missingNonCtrlPrereqsIn(t.id, esB);
        if (reqB === null) continue;
        let unlockedInChain = false;
        let curPre = ctx.core.techById[t.id]?.pre;
        const seenPre = new Set<number>();
        while (curPre && poolIds.has(curPre) && !seenPre.has(curPre)) {
          seenPre.add(curPre);
          if (esBase.snapshot.known.has(curPre)) break;
          if (esB.snapshot.known.has(curPre)) {
            unlockedInChain = true;
            break;
          }
          curPre = ctx.core.techById[curPre]?.pre;
        }
        if (!unlockedInChain) continue;
        const effects = data.techs[t.id]!.effects;
        if (!effects.length || !effects.some((e) => effectCouldTouchState(e, esB))) continue;
        const baseTechs = reqB.length > 0 ? unique([...esB.techs, ...reqB]) : esB.techs;
        const esBaseB = reqB.length > 0 ? makeEvalState(baseTechs, esB.rowIds, undefined, esB.data, esB.index) : esB;
        const esWithB = makeEvalState(unique([...baseTechs, t.id]), esB.rowIds, undefined, esB.data, esB.index);
        if (statesObservableDiff(esBaseB, esWithB, false)) return true;
        peerCandidates.push({ t, reqB });
      }
    }
    for (const { t, reqB } of peerCandidates) {
      const baseTechs = reqB.length > 0 ? unique([...esB.techs, ...reqB]) : esB.techs;
      const { peers: rawPeers, reqMap } = interactingPeersIn(t, esB);
      const peers = rawPeers.filter((pid) => !baseTechs.includes(pid) && !reqMap.get(pid)!.includes(t.id));
      const closures = uniquePeerClosures(peers, (pid) => reqMap.get(pid)!);
      if (closures === null) return true;
      let peerProbes = 0;
      for (const closed of closures) {
        if (++peerProbes > MAX_PEER_PROBES_PER_TECH) return true;
        const pBaseTechs = unique([...baseTechs, ...closed]);
        if (pBaseTechs.includes(t.id)) continue;
        const esPBase = makeEvalState(pBaseTechs, esB.rowIds, undefined, esB.data, esB.index);
        const esPWith = makeEvalState(unique([...pBaseTechs, t.id]), esB.rowIds, undefined, esB.data, esB.index);
        if (statesObservableDiff(esPBase, esPWith, false)) return true;
      }
    }
    return false;
  };

  // Helper to build data with a single free tech removed from civData.free (for testing whether an auto-applied free tech matters).
  const makeWithoutFree = (fid: number): { withoutData: GeneralGarrisonData; withoutIndex: StaticGarrisonIndex } => {
    const withoutData: GeneralGarrisonData = {
      ...data,
      unitUpgradeTechs: upgradeData.unitUpgradeTechs,
      civs: {
        ...data.civs,
        [config.civ]: {
          ...civData,
          free: civData.free.filter((id) => id !== fid),
        },
      },
    };
    return { withoutData, withoutIndex: getStaticIndex(withoutData) };
  };

  return {
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
  };
}
