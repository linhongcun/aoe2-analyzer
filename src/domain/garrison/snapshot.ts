/** Issue 224/1526: garrison static index, building production scope, rule snapshot, and candidate eligibility. */
import { freeGarrisonTechs, implicitShapeTechs } from '../garrisonTechs';
import type { Building, Tech } from '../types';
import { civStatus } from '../simulator';
import { productionTechAge } from '../production';
import { trainingUnitAge } from '../availabilityAge';
import { AGE_TECH_IDS, FEMALE_VILLAGER_ID, VILLAGER_UNIT_ID } from '../gameIds';
import { requiredTrainingUnlockTech, TRAINING_UNLOCK_TECH_ID_SET } from '../trainingUnlocks';
import type { GeneralGarrisonConfig } from '../garrisonUrl';
import {
  acceptsTask,
  categoryNames,
  garrisonUnitMask,
  GENERAL_GARRISON_DATA,
  technologyData,
  unique,
  type BuildingProductionScope,
  type GarrisonCandidate,
  type GeneralGarrisonContext,
  type GeneralGarrisonData,
  type GeneralGarrisonRule,
  type GeneralGarrisonUnit,
  type Snapshot,
  type StaticGarrisonIndex,
} from './types';

export function unitAge(ctx: GeneralGarrisonContext, id: number, civ: string, data: GeneralGarrisonData) {
  const u = ctx.core.unitById[id];
  if (id === FEMALE_VILLAGER_ID) return 1;
  return trainingUnitAge(civ, id, u?.age ?? ctx.core.buildingById[id]?.age ?? data.units[id]?.catalog?.age ?? 1, data.herdableIds.includes(id) ? 1 : 0);
}

function existingUnitAge(ctx: GeneralGarrisonContext, id: number, civ: string, data: GeneralGarrisonData) {
  // Civ.resources[263] names an existing starting unit, independently of its production unlock.
  // Keep the normal training age separate (see issue224-engine.md).
  return data.civs[civ]?.startingScoutId === id ? 1 : unitAge(ctx, id, civ, data);
}

export function unitAvailable(
  ctx: GeneralGarrisonContext,
  id: number,
  config: GeneralGarrisonConfig,
  data: GeneralGarrisonData,
  status: Record<string, number> = civStatus(ctx.trees, config.civ),
): boolean {
  const u = ctx.core.unitById[id] ?? (id === FEMALE_VILLAGER_ID ? ctx.core.unitById[VILLAGER_UNIT_ID] : undefined) ?? ctx.core.buildingById[id];
  if (u && !u.civs.includes(config.civ)) return false;
  if (!u && !data.herdableIds.includes(id) && !(data.specialOccupantIds ?? []).includes(id) && !(data.relicIds ?? []).includes(id)) return false;
  if (!u && data.units[id]?.catalog?.civs.length && !data.units[id]!.catalog!.civs.includes(config.civ)) return false;
  if (existingUnitAge(ctx, id, config.civ, data) > config.age) return false;
  return status['u' + (id === FEMALE_VILLAGER_ID ? VILLAGER_UNIT_ID : id)] !== 0;
}

export function availableTechs(
  ctx: GeneralGarrisonContext,
  config: GeneralGarrisonConfig,
  data: GeneralGarrisonData,
  status: Record<string, number> = civStatus(ctx.trees, config.civ),
): Tech[] {
  const disabled = new Set(data.civs[config.civ]?.disabled ?? []);
  return ctx.core.techs.filter(
    (t) =>
      t.civs.includes(config.civ) && status['t' + t.id] === 1 && !disabled.has(t.id) && productionTechAge(t, config.civ) <= config.age && !!data.techs[t.id],
  );
}

function buildStaticIndex(data: GeneralGarrisonData): StaticGarrisonIndex {
  const upgradeData = technologyData(data);
  const relicIds = data.relicIds ?? [];
  const eligibleIds = unique([...data.rosterIds, ...data.herdableIds, ...(data.specialOccupantIds ?? []).filter((id) => id !== 286), ...relicIds]);
  const eligiblePool = new Set<number>(eligibleIds);
  const shapeUpgrades = new Set(Object.values(upgradeData.unitUpgradeTechs ?? {}).flat());
  // Keep only conditional rules that have effects/trainingLocations or transitively feed a rule that does.
  const allRules: GeneralGarrisonRule[] = [...data.conditional];
  for (const c of Object.values(data.civs)) allRules.push(...c.automatic);
  const usefulIds = new Set<number>();
  const queue: number[] = [];
  const byId = new Map<number, GeneralGarrisonRule[]>();
  for (const r of allRules) {
    if (r.effects.length > 0 || (r.trainingLocations?.length ?? 0) > 0 || TRAINING_UNLOCK_TECH_ID_SET.has(r.id) || !!data.techs[r.id]) {
      if (!usefulIds.has(r.id)) {
        usefulIds.add(r.id);
        queue.push(r.id);
      }
    }
    let list = byId.get(r.id);
    if (!list) {
      list = [];
      byId.set(r.id, list);
    }
    list.push(r);
  }
  for (let i = 0; i < queue.length; i++) {
    const rid = queue[i]!;
    for (const r of byId.get(rid) ?? []) {
      for (const req of r.requires) {
        if (!usefulIds.has(req) && byId.has(req)) {
          usefulIds.add(req);
          queue.push(req);
        }
      }
    }
  }
  const usefulConditional = data.conditional.filter((r) => usefulIds.has(r.id));
  return { eligibleIds, eligiblePool, shapeUpgrades, usefulConditional, scopeByBuilding: new Map() };
}

let defaultStaticIndex: StaticGarrisonIndex | null = null;
export const getStaticIndex = (data: GeneralGarrisonData): StaticGarrisonIndex =>
  data === GENERAL_GARRISON_DATA ? (defaultStaticIndex ??= buildStaticIndex(data)) : buildStaticIndex(data);

/**
 * Buildings with their own catalog `produces` list (e.g. Archery Range 87, Fortified Church 1806)
 * only accept catalog entries from their own aliases, plus predecessor IDs that actually host those
 * catalog units' `trainLocations` (e.g. 104 for 1806, without leaking Barracks 12 into Archery Range 87).
 * Replacement buildings with empty `produces` (e.g. Harbor 1189) inherit from `predecessors`.
 */
export function buildingProductionScope(b: Building, data: GeneralGarrisonData, index?: StaticGarrisonIndex): BuildingProductionScope {
  const cached = index?.scopeByBuilding.get(b.id);
  if (cached) return cached;
  const info = data.buildings[b.id];
  const aliases = info?.aliases ?? [b.id];
  const predecessors = info?.predecessors ?? aliases;
  let scope: BuildingProductionScope;
  if (!info || info.produces.length === 0) {
    scope = { aliases, predecessors, catalogSources: predecessors, trainSources: predecessors };
  } else {
    const ownTrainLocs = new Set<number>();
    for (const uid of info.produces) {
      for (const loc of data.units[uid]?.trainLocations ?? []) ownTrainLocs.add(loc.unitId);
    }
    const trainSources = unique([...aliases, ...predecessors.filter((id) => ownTrainLocs.has(id))]);
    scope = { aliases, predecessors, catalogSources: aliases, trainSources };
  }
  if (index) index.scopeByBuilding.set(b.id, scope);
  return scope;
}

export function snapshot(
  ctx: GeneralGarrisonContext,
  b: Building,
  config: GeneralGarrisonConfig,
  data: GeneralGarrisonData,
  status: Record<string, number> = civStatus(ctx.trees, config.civ),
  index: StaticGarrisonIndex = getStaticIndex(data),
): Snapshot {
  const civ = data.civs[config.civ];
  const units: Record<string, GeneralGarrisonUnit> = { ...data.units };
  const cloned = new Set<string>();
  const clonedTrain = new Set<string>();
  if (civ) {
    for (const [key, ov] of Object.entries(civ.baseOverrides)) {
      const base = units[key];
      if (base) {
        units[key] = { ...base, ...ov };
        cloned.add(key);
      }
    }
  }
  const actual = data.buildings[b.id]?.eraForms[config.age - 1] ?? b.id;
  if (units[actual]) {
    units[b.id] = { ...units[actual]!, id: b.id };
    cloned.add(String(b.id));
  }
  const writableUnit = (unitId: number): GeneralGarrisonUnit | undefined => {
    const key = String(unitId);
    const cur = units[key];
    if (!cur) return undefined;
    if (!cloned.has(key)) {
      units[key] = { ...cur };
      cloned.add(key);
    }
    return units[key]!;
  };
  const writableTrain = (unitId: number): GeneralGarrisonUnit | undefined => {
    const unit = writableUnit(unitId);
    if (!unit) return undefined;
    const key = String(unitId);
    if (!clonedTrain.has(key)) {
      unit.trainLocations = unit.trainLocations.map((x) => ({ ...x }));
      clonedTrain.add(key);
    }
    return unit;
  };
  const techData = technologyData(data);
  const selected = unique([...config.techs, ...freeGarrisonTechs(ctx, b, config, techData, status, index.shapeUpgrades)]);
  const productionLocations: Record<number, number[]> = {};
  const known = new Set([104]);
  const disabled = new Set(civ?.disabled ?? []);
  const implied = implicitShapeTechs(ctx, b, config, techData, index.shapeUpgrades);
  for (const tid of implied) known.add(tid);
  // Exact tower shape means the line upgrade has already been researched.
  if (b.id === 234 || b.id === 235) known.add(140);
  if (b.id === 235) known.add(63);
  const apply = (rule: GeneralGarrisonRule) => {
    for (const e of rule.effects) {
      const u = writableUnit(e.unit);
      if (u) u[e.stat] = e.op === 'set' ? e.value : e.op === 'mul' ? u[e.stat] * e.value : u[e.stat] + e.value;
    }
    for (const e of rule.trainingLocations ?? []) {
      const unit = writableTrain(e.unit);
      if (!unit) continue;
      const previous = unit.trainLocations[e.slot];
      if (previous) previous.unitId = e.location;
      else unit.trainLocations[e.slot] = { unitId: e.location, time: unit.trainLocations[0]?.time ?? 0 };
      (productionLocations[e.unit] ??= []).push(e.location);
    }
  };
  for (const [indexAge, id] of AGE_TECH_IDS.entries())
    if (config.age >= indexAge + 2) {
      if (data.ageRules[id]) apply(data.ageRules[id]!);
      known.add(id);
    }
  const applied = new Set<number>();
  const appliedRules: GeneralGarrisonRule[] = [];
  const automatic = [...(civ?.automatic ?? [])];
  const ready = (rule: GeneralGarrisonRule) => {
    if (rule.count <= 0) return true;
    let hits = 0;
    for (const id of rule.requires) if (known.has(id) && ++hits >= rule.count) return true;
    return false;
  };
  const advance = () => {
    let changed = true;
    while (changed) {
      changed = false;
      for (const rule of automatic)
        if (!applied.has(rule.id) && !disabled.has(rule.id) && ready(rule)) {
          apply(rule);
          applied.add(rule.id);
          appliedRules.push(rule);
          known.add(rule.id);
          changed = true;
        }
    }
  };
  const knownBeforeStage0 = new Set(known);
  advance();
  const knownAfterStage0 = new Set(known);
  const stage0RuleCount = appliedRules.length;
  for (const id of implied)
    if (!selected.includes(id) && data.techs[id]) {
      const rule = data.techs[id]!;
      apply({ ...rule, trainingLocations: [], effects: rule.effects.filter((e) => units[e.unit]?.type === 60) });
    }
  for (const id of selected) {
    known.add(id);
    if (data.techs[id]) apply(data.techs[id]!);
  }
  automatic.push(...data.conditional);
  advance();
  return {
    units,
    building: units[b.id],
    known,
    knownBeforeStage0,
    knownAfterStage0,
    stage0RuleCount,
    selected,
    productionLocations,
    appliedRules,
  };
}

export function candidate(
  ctx: GeneralGarrisonContext,
  b: Building,
  config: GeneralGarrisonConfig,
  id: number,
  state: Snapshot,
  data: GeneralGarrisonData,
  scope = buildingProductionScope(b, data),
  status: Record<string, number> = civStatus(ctx.trees, config.civ),
): GarrisonCandidate | null {
  if (id === 286) return null; // Carrier representation is used to validate relic deposits, never as a second occupant.
  const u = state.units[id],
    B = state.building;
  if (!u || !B || !unitAvailable(ctx, id, config, data, status)) return null;
  const mask = garrisonUnitMask(u);
  const { aliases, predecessors, catalogSources, trainSources } = scope;
  const canEnter = B.capacity > 0 && mask !== null && (B.garrisonType & mask) !== 0 && acceptsTask(u, B, aliases);
  // Scenario/editor defaults can have a train location without being part of the normal production roster (e.g. sheep at TC).
  // Female villagers share the normal villager production slot rather than a separate raw train-location record.
  const productionId = id === FEMALE_VILLAGER_ID ? VILLAGER_UNIT_ID : id;
  const producer = state.units[productionId];
  const catalogProduction = catalogSources.some((sourceId) => data.buildings[sourceId]?.produces.includes(productionId));
  const relocatedProduction = state.productionLocations[productionId]?.some((location) => trainSources.includes(location)) ?? false;
  let canCreate =
    B.capacity > 0 &&
    unitAge(ctx, id, config.civ, data) <= config.age &&
    (catalogProduction || relocatedProduction) &&
    !!producer?.trainLocations.some((t) => trainSources.includes(t.unitId));
  const relic = (data.relicIds ?? []).includes(id);
  const carrier = state.units[286];
  const canDeposit =
    B.capacity > 0 &&
    relic &&
    !!carrier?.specialTasks?.some((t) => t.action === 136 && (predecessors.includes(t.unitId) || (t.unitId < 0 && t.classId === B.class)));
  if (relic) canCreate = false;
  // A present unit is a completed shape. Its prerequisite unlock must still be selected for a production-only route.
  const requiredUnlock = requiredTrainingUnlockTech(id, b.id);
  if (requiredUnlock !== undefined && !state.known.has(requiredUnlock)) canCreate = false;
  const core = ctx.core.unitById[id] ?? (id === FEMALE_VILLAGER_ID ? ctx.core.unitById[VILLAGER_UNIT_ID] : undefined) ?? ctx.core.buildingById[id];
  return {
    id,
    zh: id === FEMALE_VILLAGER_ID ? '女村民' : u.zh,
    en: u.en,
    age: existingUnitAge(ctx, id, config.civ, data),
    pic: core?.pic ?? u.catalog?.pic ?? 0,
    category: relic ? '圣物' : mask === null ? '其他单位' : (categoryNames[mask] ?? '其他单位'),
    canEnter,
    canCreate,
    canDeposit,
    reason: canDeposit
      ? '通过持有圣物的僧侣存放；此预览不估算圣物资源收益。'
      : canEnter
        ? config.age < unitAge(ctx, id, config.civ, data)
          ? '初始单位可从外部进入；当前时代尚不能生产该单位。'
          : '可从外部进入驻军。'
        : canCreate
          ? '仅支持在此建筑生产后留驻；离开后不能重新进入。'
          : '当前建筑、时代或科技不允许该入驻方式。',
  };
}

export function getGarrisonCandidates(
  ctx: GeneralGarrisonContext,
  b: Building,
  config: GeneralGarrisonConfig,
  data = GENERAL_GARRISON_DATA,
): GarrisonCandidate[] {
  const status = civStatus(ctx.trees, config.civ);
  const index = getStaticIndex(data);
  const state = snapshot(ctx, b, config, data, status, index);
  const scope = buildingProductionScope(b, data, index);
  return index.eligibleIds
    .map((id) => candidate(ctx, b, config, id, state, data, scope, status))
    .filter((u): u is GarrisonCandidate => u !== null && (u.canEnter || u.canCreate || u.canDeposit));
}
