/** Issue 1404/1526: Phase 1 of garrison tech filtering (rule reachability, relocation scope, and sign/shooting flip bounds). */
import { implicitShapeTechs } from '../garrisonTechs';
import type { Building, Tech } from '../types';
import { productionTechAge } from '../production';
import { AGE_TECH_IDS, FEMALE_VILLAGER_ID, VILLAGER_UNIT_ID } from '../gameIds';
import { TRAINING_UNLOCK_GATES } from '../trainingUnlocks';
import type { GeneralGarrisonConfig } from '../garrisonUrl';
import {
  FORTIFIED_CHURCH_IDS,
  technologyData,
  unique,
  type BuildingProductionScope,
  type GarrisonStat,
  type GeneralGarrisonContext,
  type GeneralGarrisonData,
  type GeneralGarrisonEffect,
  type GeneralGarrisonRule,
  type GeneralGarrisonUnit,
  type Snapshot,
  type StaticGarrisonIndex,
} from './types';
import { availableTechs, buildingProductionScope, getStaticIndex, snapshot, unitAge, unitAvailable } from './snapshot';
import { canExtremeFlip, hasMinHits, inspectStatFlipBounds, isShootingBuilding } from './techFilterMath';

export interface TechFilterReachability {
  ctx: GeneralGarrisonContext;
  b: Building;
  config: GeneralGarrisonConfig;
  data: GeneralGarrisonData;
  status: Record<string, number>;
  civData: GeneralGarrisonData['civs'][string];
  upgradeData: ReturnType<typeof technologyData>;
  staticIndex: StaticGarrisonIndex;
  eligibleIds: number[];
  shapeUpgrades: Set<number>;
  pool: Tech[];
  poolIds: Set<number>;
  civFreeSet: Set<number>;
  baseState: Snapshot;
  baseB: GeneralGarrisonUnit;
  scope: BuildingProductionScope;
  relicIds: number[];
  baseFree: Set<number>;
  baseImplicitShapes: Set<number>;
  isAvailEligible: (uid: number) => boolean;
  isRelicPowerHost: boolean;
  isPowerUnit: (uid: number) => boolean;
  powerUnitIds: number[];
  availShapeTechs: Set<number>;
  shapeTriggerPoolTechs: Map<number, number[]>;
  availFreeShapeRules: GeneralGarrisonRule[];
  availFreeShapeIds: Set<number>;
  availImpliedType60Rules: GeneralGarrisonRule[];
  initUnitField: <K extends keyof GeneralGarrisonUnit>(uid: number, field: K) => GeneralGarrisonUnit[K] | undefined;
  initBuildingSecProj: number;
  activeAgeRules: GeneralGarrisonRule[];
  allEnabledDynRules: GeneralGarrisonRule[];
  dynKnownPoolIds: Set<number>;
  activeDynRules: GeneralGarrisonRule[];
  activeShadowedDynRules: GeneralGarrisonRule[];
  canBuildingProduceUnit: (uid: number) => boolean;
  relocTouchesBuilding: (loc: { unit: number; slot: number; location: number }) => boolean;
  allBuildingEffects: GeneralGarrisonEffect[];
  negFpCapableUnits: Set<number>;
  reloadTouchedUnits: Set<number>;
  reloadInvalidFlipUnits: Set<number>;
  fpSignFlipUnits: Set<number>;
  multiProjCandidates: Set<number>;
  isNoopEffect: (e: GeneralGarrisonEffect) => boolean;
  baseShooting: boolean;
  shootingCanFlip: boolean;
}

export function prepareTechFilterReachability(
  ctx: GeneralGarrisonContext,
  b: Building,
  config: GeneralGarrisonConfig,
  data: GeneralGarrisonData,
  status: Record<string, number>,
): TechFilterReachability | null {
  const buildingInfo = data.buildings[b.id];
  const civData = data.civs[config.civ];
  if (!buildingInfo || !civData || !b.civs.includes(config.civ)) return null;

  const upgradeData = technologyData(data);
  const staticIndex = getStaticIndex(data);
  const { eligibleIds, eligiblePool, shapeUpgrades } = staticIndex;
  const pool = availableTechs(ctx, config, data, status).filter((t) => !shapeUpgrades.has(t.id));
  if (!pool.length) return null;

  const poolIds = new Set(pool.map((t) => t.id));
  const civFreeSet = new Set(civData.free);
  const disabled = new Set(civData.disabled);
  const baseConfig: GeneralGarrisonConfig = { civ: config.civ, age: config.age, techs: [], rows: [] };
  const baseState = snapshot(ctx, b, baseConfig, data, status, staticIndex);
  const baseB = baseState.building;
  if (!baseB) return null;

  const scope = buildingProductionScope(b, data, staticIndex);
  const { catalogSources, trainSources } = scope;
  const relicIds = data.relicIds ?? [];
  const baseFree = new Set(baseState.selected);
  const baseImplicitShapes = new Set(implicitShapeTechs(ctx, b, baseConfig, upgradeData, shapeUpgrades));

  const availUnitCache = new Map<number, boolean>();
  const isAvailEligible = (uid: number): boolean => {
    const cached = availUnitCache.get(uid);
    if (cached !== undefined) return cached;
    const ok = eligiblePool.has(uid) && uid !== 286 && unitAvailable(ctx, uid, baseConfig, data, status);
    availUnitCache.set(uid, ok);
    return ok;
  };
  // Fortified Church relic deposits compute power from state.units[VILLAGER_UNIT_ID] directly even if villagers are absent from rosterIds.
  const isRelicPowerHost =
    FORTIFIED_CHURCH_IDS.has(b.id) && !!data.units[VILLAGER_UNIT_ID] && relicIds.some((rid) => unitAvailable(ctx, rid, baseConfig, data, status));
  const isPowerUnit = (uid: number): boolean => isAvailEligible(uid) || (uid === VILLAGER_UNIT_ID && isRelicPowerHost);
  const powerUnitIds = isRelicPowerHost && !eligiblePool.has(VILLAGER_UNIT_ID) ? unique([...eligibleIds, VILLAGER_UNIT_ID]) : eligibleIds;

  // Forward-reachable dynamic rules whose readiness can change (never satisfied before their stage ran in baseState,
  // including rules that fired on Pass >= 2 in baseState and may reorder onto an earlier pass when extra techs/shapes are known).
  const availShapeTechs = new Set<number>();
  if (upgradeData.unitUpgradeTechs) {
    for (const [key, seeds] of Object.entries(upgradeData.unitUpgradeTechs)) {
      if (!seeds.length || !isAvailEligible(Number(key))) continue;
      for (const sid of seeds) {
        let cur: number | null | undefined = sid;
        while (cur && shapeUpgrades.has(cur) && !availShapeTechs.has(cur)) {
          availShapeTechs.add(cur);
          cur = ctx.core.techById[cur]?.pre;
        }
      }
    }
  }
  // Free shape upgrades are excluded from `pool` yet apply their full rule effects when implied by a row/building
  // or when a manual pool tech's leading shape-prereq chain puts them in freeGarrisonTechs()'s known set.
  const leadingShapePrereqs = (tid: number): number[] => {
    const out: number[] = [];
    const seen = new Set<number>();
    let pre = ctx.core.techById[tid]?.pre;
    while (pre && shapeUpgrades.has(pre) && !seen.has(pre)) {
      seen.add(pre);
      out.push(pre);
      pre = ctx.core.techById[pre]?.pre;
    }
    return out;
  };
  const poolTriggeredShapes = new Set<number>();
  const shapeTriggerPoolTechs = new Map<number, number[]>();
  for (const t of pool) {
    for (const sid of leadingShapePrereqs(t.id)) {
      poolTriggeredShapes.add(sid);
      let list = shapeTriggerPoolTechs.get(sid);
      if (!list) {
        list = [];
        shapeTriggerPoolTechs.set(sid, list);
      }
      list.push(t.id);
    }
  }
  const availFreeShapeRules: GeneralGarrisonRule[] = [];
  const availFreeShapeIds = new Set<number>();
  for (const fid of civData.free) {
    if (!shapeUpgrades.has(fid) || disabled.has(fid) || !data.techs[fid]) continue;
    if (!baseImplicitShapes.has(fid) && !availShapeTechs.has(fid) && !poolTriggeredShapes.has(fid)) continue;
    const t = ctx.core.techById[fid];
    if (!t || !t.civs.includes(config.civ) || status['t' + t.id] !== 1 || productionTechAge(t, config.civ) > config.age) continue;
    availFreeShapeIds.add(fid);
    availFreeShapeRules.push(data.techs[fid]!);
  }
  // Implied non-free shape upgrades still apply effects targeting units with resolved type === 60 (snapshot() L344-348).
  const availImpliedType60Rules: GeneralGarrisonRule[] = [];
  for (const tid of new Set([...baseImplicitShapes, ...availShapeTechs])) {
    const rule = data.techs[tid];
    if (!rule) continue;
    const effects = rule.effects.filter((e) => baseState.units[e.unit]?.type === 60);
    if (effects.length > 0) availImpliedType60Rules.push({ ...rule, trainingLocations: [], effects });
  }
  const actualBuildingId = buildingInfo.eraForms[config.age - 1] ?? b.id;
  const rawBuildingKey = data.units[actualBuildingId] ? actualBuildingId : b.id;
  const initUnitField = <K extends keyof GeneralGarrisonUnit>(uid: number, field: K): GeneralGarrisonUnit[K] | undefined =>
    civData.baseOverrides[uid]?.[field] ?? data.units[uid]?.[field];
  const activeAgeRules: GeneralGarrisonRule[] = [];
  for (const [indexAge, id] of AGE_TECH_IDS.entries()) {
    if (config.age >= indexAge + 2 && data.ageRules[id]) activeAgeRules.push(data.ageRules[id]!);
  }
  const allEnabledDynRules: GeneralGarrisonRule[] = [
    ...civData.automatic.filter((r) => !disabled.has(r.id)),
    ...staticIndex.usefulConditional.filter((r) => !disabled.has(r.id)),
  ];
  const candidateDynRules: GeneralGarrisonRule[] = [
    ...civData.automatic.filter((r) => !disabled.has(r.id) && r.count > 0 && !hasMinHits(r.requires, r.count, baseState.knownBeforeStage0)),
    ...staticIndex.usefulConditional.filter((r) => !disabled.has(r.id) && r.count > 0 && !hasMinHits(r.requires, r.count, baseState.knownAfterStage0)),
  ];
  const knownUpper = new Set<number>([...baseState.known, ...poolIds, ...availShapeTechs, ...availFreeShapeIds]);
  const reachableDynRules: GeneralGarrisonRule[] = [];
  const reachableDynSet = new Set<GeneralGarrisonRule>();
  {
    let changed = true;
    while (changed) {
      changed = false;
      for (const r of candidateDynRules) {
        if (reachableDynSet.has(r)) continue;
        if (hasMinHits(r.requires, r.count, knownUpper)) {
          reachableDynSet.add(r);
          knownUpper.add(r.id);
          reachableDynRules.push(r);
          changed = true;
        }
      }
    }
  }
  const reachableDynIds = new Set(reachableDynRules.map((r) => r.id));
  const shadowedBaseDynRules: GeneralGarrisonRule[] = [
    ...civData.automatic.filter((r) => !disabled.has(r.id) && reachableDynIds.has(r.id) && !reachableDynSet.has(r)),
    ...staticIndex.usefulConditional.filter((r) => !disabled.has(r.id) && reachableDynIds.has(r.id) && !reachableDynSet.has(r)),
  ];

  const everRelocatedIntoB = new Set<number>();
  const collectRelocInto = (rule: GeneralGarrisonRule) => {
    for (const loc of rule.trainingLocations ?? []) {
      if (trainSources.includes(loc.location)) everRelocatedIntoB.add(loc.unit);
    }
  };
  for (const t of pool) collectRelocInto(data.techs[t.id]!);
  for (const r of reachableDynRules) collectRelocInto(r);
  for (const r of shadowedBaseDynRules) collectRelocInto(r);
  for (const r of availFreeShapeRules) collectRelocInto(r);

  const canBuildingProduceUnit = (uid: number): boolean => {
    if (!isAvailEligible(uid) || relicIds.includes(uid) || unitAge(ctx, uid, config.civ, data) > config.age) return false;
    const prodId = uid === FEMALE_VILLAGER_ID ? VILLAGER_UNIT_ID : uid;
    if (everRelocatedIntoB.has(prodId) || baseState.productionLocations[prodId]?.some((loc) => trainSources.includes(loc))) return true;
    const catalogProduction = catalogSources.some((sourceId) => data.buildings[sourceId]?.produces.includes(prodId));
    return (
      catalogProduction &&
      (!!baseState.units[prodId]?.trainLocations.some((t) => trainSources.includes(t.unitId)) ||
        !!initUnitField(prodId, 'trainLocations')?.some((t) => trainSources.includes(t.unitId)))
    );
  };

  // Both relocations INTO b and evictions OUT OF b can change canCreate.
  const relocTouchesBuilding = (loc: { unit: number; slot: number; location: number }): boolean => {
    const unitOk =
      (isAvailEligible(loc.unit) && !relicIds.includes(loc.unit) && unitAge(ctx, loc.unit, config.civ, data) <= config.age) ||
      (loc.unit === VILLAGER_UNIT_ID && isAvailEligible(FEMALE_VILLAGER_ID));
    if (!unitOk) return false;
    if (trainSources.includes(loc.location)) return true;
    if (everRelocatedIntoB.has(loc.unit)) return true;
    if (baseState.productionLocations[loc.unit]?.some((l) => trainSources.includes(l))) return true;
    return (
      !!baseState.units[loc.unit]?.trainLocations.some((t) => trainSources.includes(t.unitId)) ||
      !!initUnitField(loc.unit, 'trainLocations')?.some((t) => trainSources.includes(t.unitId))
    );
  };

  const prelimSecProjs = new Set<number>();
  let prelimDynamicSecProj = false;
  if (baseB.secondaryProjectile >= 0) prelimSecProjs.add(baseB.secondaryProjectile);
  const initBuildingSecProj = initUnitField(rawBuildingKey, 'secondaryProjectile') ?? -1;
  if (initBuildingSecProj >= 0) prelimSecProjs.add(initBuildingSecProj);
  for (const id of powerUnitIds) {
    if (!isPowerUnit(id)) continue;
    const sec = baseState.units[id]?.secondaryProjectile ?? -1;
    if (sec >= 0) prelimSecProjs.add(sec);
    const initSec = initUnitField(id, 'secondaryProjectile') ?? -1;
    if (initSec >= 0) prelimSecProjs.add(initSec);
  }
  const collectPrelimSecProj = (rule: GeneralGarrisonRule) => {
    for (const e of rule.effects) {
      if (e.stat !== 'secondaryProjectile') continue;
      if (e.unit !== b.id && !isPowerUnit(e.unit)) continue;
      if (e.op === 'set' && e.value >= 0) prelimSecProjs.add(e.value);
      else if (e.op !== 'set') prelimDynamicSecProj = true;
    }
  };
  for (const r of activeAgeRules) collectPrelimSecProj(r);
  for (const t of pool) collectPrelimSecProj(data.techs[t.id]!);
  for (const r of allEnabledDynRules) collectPrelimSecProj(r);
  for (const r of availFreeShapeRules) collectPrelimSecProj(r);
  for (const r of availImpliedType60Rules) collectPrelimSecProj(r);

  const poolPrereqIds = new Set<number>();
  for (const t of pool) {
    if (t.pre && poolIds.has(t.pre)) poolPrereqIds.add(t.pre);
  }
  const dynKnownPoolIds = new Set<number>();
  for (const r of allEnabledDynRules) {
    if (poolIds.has(r.id)) dynKnownPoolIds.add(r.id);
  }

  const ruleDirectlyRelevant = (r: GeneralGarrisonRule): boolean =>
    poolPrereqIds.has(r.id) ||
    r.effects.some(
      (e) =>
        e.unit === b.id ||
        isPowerUnit(e.unit) ||
        baseState.units[e.unit]?.type === 60 ||
        (e.stat === 'attack' && (prelimDynamicSecProj || prelimSecProjs.has(e.unit))),
    ) ||
    (r.trainingLocations ?? []).some(relocTouchesBuilding) ||
    TRAINING_UNLOCK_GATES.some(
      (gate) => gate.techId === r.id && (gate.buildingId === undefined || gate.buildingId === b.id) && gate.unitIds.some(canBuildingProduceUnit),
    );
  const activeDynIds = new Set<number>();
  {
    const byId = new Map<number, GeneralGarrisonRule[]>();
    const queue: number[] = [];
    for (const r of reachableDynRules) {
      let list = byId.get(r.id);
      if (!list) {
        list = [];
        byId.set(r.id, list);
      }
      list.push(r);
      if (ruleDirectlyRelevant(r) && !activeDynIds.has(r.id)) {
        activeDynIds.add(r.id);
        queue.push(r.id);
      }
    }
    for (const r of shadowedBaseDynRules) {
      if (ruleDirectlyRelevant(r) && !activeDynIds.has(r.id)) {
        activeDynIds.add(r.id);
        queue.push(r.id);
      }
    }
    for (let i = 0; i < queue.length; i++) {
      const rid = queue[i]!;
      for (const r of byId.get(rid) ?? []) {
        for (const req of r.requires) {
          if (!activeDynIds.has(req) && byId.has(req)) {
            activeDynIds.add(req);
            queue.push(req);
          }
        }
      }
    }
  }
  const activeDynRules = reachableDynRules.filter((r) => activeDynIds.has(r.id));
  const activeShadowedDynRules = shadowedBaseDynRules.filter((r) => activeDynIds.has(r.id));

  // Detect whether shooting-ness of building b, unit firepower sign, unit reload validity, or negative-fp attack-zeroing can flip.
  // Inspect each snapshot() execution stage independently (same rule object in multiple stages applies once per stage),
  // deduplicating only across the single advance() pool (baseState.appliedRules union activeDynRules union activeShadowedDynRules).
  const { allBuildingEffects, negFpCapableUnits, reloadTouchedUnits, reloadInvalidFlipUnits, fpSignFlipUnits, multiProjCandidates, shadowedBuildingFlip } =
    inspectStatFlipBounds({
      buildingId: b.id,
      baseState,
      powerUnitIds,
      isPowerUnit,
      initUnitField,
      activeAgeRules,
      stageAdvanceRules: [...new Set([...baseState.appliedRules, ...activeDynRules, ...activeShadowedDynRules])],
      poolRules: pool.map((t) => data.techs[t.id]!),
      availFreeShapeRules,
      availImpliedType60Rules,
      activeShadowedDynRules,
    });

  // Detect (unit, stat) pairs whose initial & base values match and every reachable rule only writes that same constant (or add 0 / mul 1).
  const statValuesVary = new Set<string>();
  const statBaseCache = new Map<string, number | undefined>();
  const getConstantStatBase = (unit: number, stat: GarrisonStat): number | undefined => {
    const key = `${unit}:${stat}`;
    if (statBaseCache.has(key)) return statBaseCache.get(key);
    const baseVal = baseState.units[unit]?.[stat];
    const initVal = initUnitField(unit === b.id ? rawBuildingKey : unit, stat);
    const val = typeof baseVal === 'number' && baseVal === initVal ? baseVal : undefined;
    statBaseCache.set(key, val);
    return val;
  };
  for (const ruleList of [activeAgeRules, pool.map((t) => data.techs[t.id]!), allEnabledDynRules, availFreeShapeRules, availImpliedType60Rules]) {
    for (const r of ruleList) {
      for (const e of r.effects) {
        if ((e.op === 'add' && e.value === 0) || (e.op === 'mul' && e.value === 1)) continue;
        const key = `${e.unit}:${e.stat}`;
        if (statValuesVary.has(key)) continue;
        const constBase = getConstantStatBase(e.unit, e.stat);
        if (constBase === undefined || e.op !== 'set' || e.value !== constBase) statValuesVary.add(key);
      }
    }
  }
  const isNoopEffect = (e: GeneralGarrisonEffect): boolean => {
    if ((e.op === 'add' && e.value === 0) || (e.op === 'mul' && e.value === 1)) return true;
    if (e.op !== 'set') return false;
    const key = `${e.unit}:${e.stat}`;
    return !statValuesVary.has(key) && getConstantStatBase(e.unit, e.stat) === e.value;
  };

  const initBAttack = initUnitField(rawBuildingKey, 'attack') ?? baseB.attack;
  const initBReload = initUnitField(rawBuildingKey, 'reload') ?? baseB.reload;
  const initBProj = initUnitField(rawBuildingKey, 'projectile') ?? baseB.projectile;
  const initBShooting = initBAttack > 0 && initBReload > 0 && (initBProj >= 0 || initBuildingSecProj >= 0);
  const baseShooting = isShootingBuilding(baseB);
  const shootingCanFlip =
    shadowedBuildingFlip ||
    initBShooting !== baseShooting ||
    (!baseShooting
      ? allBuildingEffects.some((e) => e.stat === 'attack' || e.stat === 'reload' || e.stat === 'projectile' || e.stat === 'secondaryProjectile')
      : allBuildingEffects.some(
          (e) =>
            ((e.stat === 'attack' || e.stat === 'reload') &&
              ((e.op === 'set' && e.value <= 0) || (e.op === 'add' && e.value < 0) || (e.op === 'mul' && e.value <= 0))) ||
            ((e.stat === 'projectile' || e.stat === 'secondaryProjectile') &&
              ((e.op === 'set' && e.value < 0) || (e.op === 'add' && e.value < 0) || (e.op === 'mul' && e.value < 0))),
        ) ||
        canExtremeFlip(
          [baseB.attack, initBAttack],
          allBuildingEffects.filter((e) => e.stat === 'attack'),
        ) ||
        canExtremeFlip(
          [baseB.reload, initBReload],
          allBuildingEffects.filter((e) => e.stat === 'reload'),
        ) ||
        canExtremeFlip(
          [baseB.projectile, initBProj],
          allBuildingEffects.filter((e) => e.stat === 'projectile'),
        ) ||
        canExtremeFlip(
          [baseB.secondaryProjectile, initBuildingSecProj],
          allBuildingEffects.filter((e) => e.stat === 'secondaryProjectile'),
        ));

  return {
    ctx,
    b,
    config,
    data,
    status,
    civData,
    upgradeData,
    staticIndex,
    eligibleIds,
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
    isRelicPowerHost,
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
    activeShadowedDynRules,
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
  };
}
