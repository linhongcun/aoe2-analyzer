/** Issue 224: building capacity, entry compatibility and a documented projectile model. Coverage: ./garrisonCoverage.ts. */
import raw from '../../data/game/garrison_general.json';
import { freeGarrisonTechs, GARRISON_TECH_DATA, implicitShapeTechs } from './garrisonTechs';
import { DATA_PATCH_BUILD } from '../data/meta';
import { GARRISON_HOST_IDS as hostIds } from '../data/garrisonHosts';
import type { Core } from '../data';
import type { Building, Tech, Trees } from './types';
import { civStatus } from './simulator';
import { productionTechAge } from './production';
import { buildingAge as getGarrisonBuildingAge, trainingUnitAge } from './availabilityAge';
import { AGE_TECH_IDS, FEMALE_VILLAGER_ID, TC_BY_AGE, VILLAGER_UNIT_ID } from './gameIds';
import { writeGeneralGarrison, type GarrisonEntry, type GeneralGarrisonConfig, type GeneralGarrisonRow } from './garrisonUrl';
import { toggleSelected } from './prereq';

export { writeGeneralGarrison, type GarrisonEntry, type GeneralGarrisonConfig, type GeneralGarrisonRow };
export interface GeneralGarrisonContext {
  core: Core;
  trees: Trees;
}
export interface GarrisonCandidate {
  id: number;
  zh: string;
  en: string;
  age: number;
  pic: number | string;
  category: string;
  canEnter: boolean;
  canCreate: boolean;
  canDeposit: boolean;
  reason: string;
}
export interface GarrisonRowResult extends GeneralGarrisonRow {
  zh: string;
  canEnter: boolean;
  canCreate: boolean;
  canDeposit: boolean;
  countValue: number;
  powerEach: number | null;
  powerTotal: number | null;
  reason: string;
}
type GarrisonPowerSource = 'fixed' | 'pierce-plus-fixed' | 'pierce' | 'multi-projectile' | 'relic' | 'zero-factor' | 'storage' | 'unknown';
type GarrisonContribution = { power: number | null; powerSource: GarrisonPowerSource; reason: string };
type GarrisonStat =
  | 'attack'
  | 'reload'
  | 'capacity'
  | 'firepower'
  | 'total'
  | 'max'
  | 'projectile'
  | 'secondaryProjectile'
  | 'garrisonType'
  | 'sizeClass'
  | 'trait'
  | 'combatAbility';
export interface GeneralGarrisonUnit {
  id: number;
  class: number;
  type: number;
  en: string;
  zh: string;
  attack: number;
  meleeAttack: number;
  reload: number;
  capacity: number;
  firepower: number;
  total: number;
  max: number;
  projectile: number;
  secondaryProjectile: number;
  secondaryAttack: number;
  garrisonType: number;
  sizeClass: number;
  trait: number;
  combatAbility: number;
  chargeType: number;
  chargeEvent: number;
  chargeProjectile: number;
  maxCharge: number;
  rechargeRate: number;
  specialAbility: number;
  food: number;
  catalog?: { age: number; pic: number | string | null; civs: string[] };
  garrisonTasks: { classId: number; unitId: number }[];
  specialTasks?: { action: number; classId: number; unitId: number; value: number }[];
  trainLocations: { unitId: number; time: number }[];
}
export interface GeneralGarrisonEffect {
  unit: number;
  stat: GarrisonStat;
  op: 'set' | 'add' | 'mul';
  value: number;
}
export interface GeneralGarrisonRule {
  id: number;
  requires: number[];
  count: number;
  effects: GeneralGarrisonEffect[];
  trainingLocations?: { unit: number; slot: number; location: number }[];
}
export interface GeneralGarrisonData {
  meta: { patch: string; sha256: string; engineVerifiedInPinnedBuild: boolean };
  units: Record<string, GeneralGarrisonUnit>;
  rosterIds: number[];
  herdableIds: number[];
  specialOccupantIds?: number[];
  relicIds?: number[];
  buildings: Record<string, { eraForms: number[]; aliases: number[]; predecessors: number[]; produces: number[] }>;
  techs: Record<string, GeneralGarrisonRule>;
  ageRules: Record<string, GeneralGarrisonRule>;
  /** Custom input override only; generated data uses GARRISON_TECH_DATA. */
  unitUpgradeTechs?: Record<string, number[]>;
  conditional: GeneralGarrisonRule[];
  civs: Record<
    string,
    {
      automatic: GeneralGarrisonRule[];
      free: number[];
      disabled: number[];
      baseOverrides: Record<string, Partial<GeneralGarrisonUnit>>;
      startingScoutId?: number;
    }
  >;
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export const GENERAL_GARRISON_DATA = deepFreeze(raw as unknown as GeneralGarrisonData);
const technologyData = (data: GeneralGarrisonData) => (data === GENERAL_GARRISON_DATA ? GARRISON_TECH_DATA : data);
export const GENERAL_GARRISON_LIMIT = 32;
// buildings.json: "Villagers and Relics provide additional projectiles".
const FORTIFIED_CHURCH_IDS = new Set([1806]);
export interface GeneralGarrisonResult {
  errors: string[];
  warnings: string[];
  mode: 'arrows' | 'cannon' | 'shelter' | 'economic';
  capacity: number;
  usedSlots: number;
  remainingSlots: number;
  baseProjectiles: number;
  extraProjectiles: number | null;
  totalProjectiles: number | null;
  maxProjectiles: number;
  buildingPower: number | null;
  garrisonPower: number | null;
  rows: GarrisonRowResult[];
  selected: number[];
  nextByUnit: Record<number, { additionalUnits: number; totalProjectiles: number } | null>;
  singleUnitId: number | null;
  thresholds: { count: number; totalProjectiles: number }[];
  singleUnitSaturationAt: number | null;
  nextAt: number | null;
  maxAtCapacity: number | null;
}
interface GarrisonExplanation {
  rows: (GarrisonRowResult & { powerSource: GarrisonPowerSource })[];
  buildingThreshold: { attack: number; reload: number; source: 'secondary' | 'primary' | 'building' } | null;
  firingSteps: {
    quotient: number;
    wholeSlots: number;
    uncappedProjectiles: number;
    primaryMinimum: boolean;
    nextThreshold: { slots: number; power: number } | null;
  } | null;
}

const unique = (ids: number[]) => [...new Set(ids)].sort((a, b) => a - b);
const categoryNames: Record<number, string> = { 1: '村民', 2: '步行单位', 4: '骑乘单位', 8: '宗教单位', 16: '牲畜', 32: '攻城武器', 64: '船只' };

/** Modern explicit size class overrides the legacy object class. CreatableType is unrelated. */
export function garrisonUnitMask(unit: Pick<GeneralGarrisonUnit, 'sizeClass' | 'class'>): number | null {
  if (unit.sizeClass !== 0) return Number.isSafeInteger(unit.sizeClass) && unit.sizeClass >= 1 && unit.sizeClass <= 7 ? 2 ** (unit.sizeClass - 1) : null;
  // King (legacy object class 59) also enters Khmer Houses, whose only flag is civilian (1).
  // Official Hotfix 63581 confirms building garrison; the source chain is recorded in issue224-engine.md.
  if (unit.class === 4 || unit.class === 59) return 1;
  if ([0, 6, 44].includes(unit.class)) return 2;
  if ([12, 23, 36, 47].includes(unit.class)) return 4;
  if ([18, 43].includes(unit.class)) return 8;
  if (unit.class === 58) return 16;
  if ([2, 20, 21, 22].includes(unit.class)) return 64;
  if ([13, 51, 54, 55].includes(unit.class)) return 32;
  return null;
}

export { getGarrisonBuildingAge };
function unitAge(ctx: GeneralGarrisonContext, id: number, civ: string, data: GeneralGarrisonData) {
  const u = ctx.core.unitById[id];
  if (id === FEMALE_VILLAGER_ID) return 1;
  return trainingUnitAge(civ, id, u?.age ?? ctx.core.buildingById[id]?.age ?? data.units[id]?.catalog?.age ?? 1, data.herdableIds.includes(id) ? 1 : 0);
}
function existingUnitAge(ctx: GeneralGarrisonContext, id: number, civ: string, data: GeneralGarrisonData) {
  // Civ.resources[263] names an existing starting unit, independently of its production unlock.
  // Keep the normal training age separate (see issue224-engine.md).
  return data.civs[civ]?.startingScoutId === id ? 1 : unitAge(ctx, id, civ, data);
}
function unitAvailable(
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

function availableTechs(
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

interface Snapshot {
  units: Record<string, GeneralGarrisonUnit>;
  building: GeneralGarrisonUnit | undefined;
  known: Set<number>;
  knownBeforeStage0: Set<number>;
  knownAfterStage0: Set<number>;
  stage0RuleCount: number;
  selected: number[];
  productionLocations: Record<number, number[]>;
  appliedRules: GeneralGarrisonRule[];
}

function snapshot(
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

export function getGarrisonBuildings(ctx: GeneralGarrisonContext): Building[] {
  const ids = new Set<number>(hostIds);
  return ctx.core.buildings.filter((b) => ids.has(b.id));
}

function acceptsTask(unit: GeneralGarrisonUnit, building: GeneralGarrisonUnit, aliases: number[]): boolean {
  return unit.garrisonTasks.some(
    (t) => (t.unitId >= 0 && aliases.includes(t.unitId)) || (t.unitId < 0 && (t.classId === building.class || (t.classId === 3 && building.class === 52))),
  );
}

interface BuildingProductionScope {
  aliases: number[];
  predecessors: number[];
  catalogSources: number[];
  trainSources: number[];
}

interface StaticGarrisonIndex {
  eligibleIds: number[];
  eligiblePool: Set<number>;
  shapeUpgrades: Set<number>;
  usefulConditional: GeneralGarrisonRule[];
  scopeByBuilding: Map<number, BuildingProductionScope>;
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
    if (r.effects.length > 0 || (r.trainingLocations?.length ?? 0) > 0 || EXPLICIT_CREATE_UNLOCK_IDS.has(r.id)) {
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
const getStaticIndex = (data: GeneralGarrisonData): StaticGarrisonIndex =>
  data === GENERAL_GARRISON_DATA ? (defaultStaticIndex ??= buildStaticIndex(data)) : buildStaticIndex(data);

/**
 * Buildings with their own catalog `produces` list (e.g. Archery Range 87, Fortified Church 1806)
 * only accept catalog entries from their own aliases, plus predecessor IDs that actually host those
 * catalog units' `trainLocations` (e.g. 104 for 1806, without leaking Barracks 12 into Archery Range 87).
 * Replacement buildings with empty `produces` (e.g. Harbor 1189) inherit from `predecessors`.
 */
function buildingProductionScope(b: Building, data: GeneralGarrisonData, index?: StaticGarrisonIndex): BuildingProductionScope {
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

function candidate(
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
  if ([5, 36, 420, 691].includes(id) && !state.known.has(47)) canCreate = false;
  if ([759, 761].includes(id) && b.id === 12 && !state.known.has(16)) canCreate = false;
  if ([886, 887].includes(id) && b.id === 101 && !state.known.has(483)) canCreate = false;
  if (id === 1699 && !state.known.has(755)) canCreate = false;
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

const BUILDING_SHOOTING_STATS = new Set<GarrisonStat>(['attack', 'reload', 'total', 'max', 'projectile', 'secondaryProjectile']);
const EXPLICIT_CREATE_UNLOCKS: readonly { techId: number; unitIds: readonly number[]; buildingId?: number }[] = [
  { techId: 47, unitIds: [5, 36, 420, 691] },
  { techId: 16, unitIds: [759, 761], buildingId: 12 },
  { techId: 483, unitIds: [886, 887], buildingId: 101 },
  { techId: 755, unitIds: [1699] },
];
const EXPLICIT_CREATE_UNLOCK_IDS = new Set<number>(EXPLICIT_CREATE_UNLOCKS.map((g) => g.techId));
const MAX_EXACT_CONTROL_SUBSETS = 1024;
const MAX_EXACT_STATES = 1024;
const MAX_EXACT_SHAPE_BITS = 10;
const MAX_EXACT_SENSITIVE_SHAPES = 5;
const MAX_EXACT_PEER_SUBSETS = 6;
const MAX_PEER_PROBES_PER_TECH = 256;
const MAX_SYNERGY_PROBES = 1024;
const POWER_STATS = new Set<GarrisonStat>(['attack', 'reload', 'firepower', 'total', 'max', 'projectile', 'secondaryProjectile']);

const isShootingBuilding = (B: GeneralGarrisonUnit | undefined): boolean =>
  !!B && B.attack > 0 && B.reload > 0 && (B.projectile >= 0 || B.secondaryProjectile >= 0);

const buildingShootingSignature = (B: GeneralGarrisonUnit, units: Record<string, GeneralGarrisonUnit>): string => {
  const hasPrimary = B.projectile >= 0;
  const hasSecondary = B.secondaryProjectile >= 0;
  const secAtk = hasSecondary ? units[B.secondaryProjectile]?.attack : undefined;
  const atk = secAtk ?? B.attack;
  const bPower = atk / B.reload;
  const secMismatch = hasSecondary && secAtk !== B.attack ? 1 : 0;
  return `${hasPrimary ? 1 : 0}:${hasSecondary ? 1 : 0}:${B.total}:${B.max}:${secMismatch}:${Number.isFinite(bPower) ? bPower.toFixed(12) : 'nan'}`;
};

/** Covers the whole eligible roster so removing a row never invalidates its selected technologies. */
export function getGarrisonTechs(ctx: GeneralGarrisonContext, b: Building, config: GeneralGarrisonConfig, data = GENERAL_GARRISON_DATA): Tech[] {
  return computeGarrisonTechs(ctx, b, config, data, civStatus(ctx.trees, config.civ));
}

function computeGarrisonTechs(
  ctx: GeneralGarrisonContext,
  b: Building,
  config: GeneralGarrisonConfig,
  data: GeneralGarrisonData,
  status: Record<string, number>,
): Tech[] {
  const buildingInfo = data.buildings[b.id];
  const civData = data.civs[config.civ];
  if (!buildingInfo || !civData || !b.civs.includes(config.civ)) return [];

  const upgradeData = technologyData(data);
  const staticIndex = getStaticIndex(data);
  const { eligibleIds, eligiblePool, shapeUpgrades } = staticIndex;
  const pool = availableTechs(ctx, config, data, status).filter((t) => !shapeUpgrades.has(t.id));
  if (!pool.length) return [];

  const poolIds = new Set(pool.map((t) => t.id));
  const civFreeSet = new Set(civData.free);
  const disabled = new Set(civData.disabled);
  const baseConfig: GeneralGarrisonConfig = { civ: config.civ, age: config.age, techs: [], rows: [] };
  const baseState = snapshot(ctx, b, baseConfig, data, status, staticIndex);
  const baseB = baseState.building;
  if (!baseB) return [];

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
  const hasMinHits = (requires: number[], count: number, set: Set<number>): boolean => {
    let hits = 0;
    for (const req of requires) if (set.has(req) && ++hits >= count) return true;
    return false;
  };
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
  for (const id of eligibleIds) {
    if (!isAvailEligible(id)) continue;
    const sec = baseState.units[id]?.secondaryProjectile ?? -1;
    if (sec >= 0) prelimSecProjs.add(sec);
    const initSec = initUnitField(id, 'secondaryProjectile') ?? -1;
    if (initSec >= 0) prelimSecProjs.add(initSec);
  }
  const collectPrelimSecProj = (rule: GeneralGarrisonRule) => {
    for (const e of rule.effects) {
      if (e.stat !== 'secondaryProjectile') continue;
      if (e.unit !== b.id && !isAvailEligible(e.unit)) continue;
      if (e.op === 'set' && e.value >= 0) prelimSecProjs.add(e.value);
      else if (e.op !== 'set') prelimDynamicSecProj = true;
    }
  };
  for (const r of activeAgeRules) collectPrelimSecProj(r);
  for (const t of pool) collectPrelimSecProj(data.techs[t.id]!);
  for (const r of allEnabledDynRules) collectPrelimSecProj(r);
  for (const r of availFreeShapeRules) collectPrelimSecProj(r);
  for (const r of availImpliedType60Rules) collectPrelimSecProj(r);

  const ruleDirectlyRelevant = (r: GeneralGarrisonRule): boolean =>
    r.effects.some(
      (e) =>
        e.unit === b.id ||
        isAvailEligible(e.unit) ||
        baseState.units[e.unit]?.type === 60 ||
        (e.stat === 'attack' && (prelimDynamicSecProj || prelimSecProjs.has(e.unit))),
    ) ||
    (r.trainingLocations ?? []).some(relocTouchesBuilding) ||
    EXPLICIT_CREATE_UNLOCKS.some(
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
  const allBuildingEffects: GeneralGarrisonEffect[] = [];
  const negFpCapableUnits = new Set<number>();
  const reloadTouchedUnits = new Set<number>();
  const reloadInvalidFlipUnits = new Set<number>();
  const fpSignFlipUnits = new Set<number>();
  const multiProjCandidates = new Set<number>();
  for (const id of eligibleIds) {
    const u = baseState.units[id];
    if (!u || !isAvailEligible(id)) continue;
    if (u.firepower < 0 || (initUnitField(id, 'firepower') ?? 0) < 0) negFpCapableUnits.add(id);
    if (u.total > 1 || (initUnitField(id, 'total') ?? 0) > 1) multiProjCandidates.add(id);
  }
  const inspectRuleStats = (rule: GeneralGarrisonRule) => {
    for (const e of rule.effects) {
      if (e.unit === b.id) allBuildingEffects.push(e);
      if (!isAvailEligible(e.unit)) continue;
      if (e.stat === 'reload' && !((e.op === 'add' && e.value === 0) || (e.op === 'mul' && e.value === 1))) {
        reloadTouchedUnits.add(e.unit);
        const baseReload = baseState.units[e.unit]?.reload ?? 0;
        if (baseReload <= 0 || (e.op === 'set' && e.value <= 0) || (e.op === 'mul' && e.value <= 0) || (e.op === 'add' && e.value < 0)) {
          reloadInvalidFlipUnits.add(e.unit);
        }
      }
      if (e.stat === 'firepower') {
        const baseFp = baseState.units[e.unit]?.firepower ?? 0;
        if (
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
  for (const t of pool) inspectRuleStats(data.techs[t.id]!);
  for (const r of activeDynRules) inspectRuleStats(r);
  for (const r of activeShadowedDynRules) inspectRuleStats(r);
  for (const r of availFreeShapeRules) inspectRuleStats(r);
  for (const r of availImpliedType60Rules) inspectRuleStats(r);
  let shadowedBuildingFlip = false;
  for (const r of activeShadowedDynRules) {
    for (const e of r.effects) {
      if ((e.op === 'add' && e.value === 0) || (e.op === 'mul' && e.value === 1)) continue;
      if (e.unit === b.id && (e.stat === 'attack' || e.stat === 'reload' || e.stat === 'projectile' || e.stat === 'secondaryProjectile')) {
        shadowedBuildingFlip = true;
      }
      if (!isAvailEligible(e.unit)) continue;
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

  const baseShooting = isShootingBuilding(baseB);
  const shootingCanFlip =
    shadowedBuildingFlip ||
    (!baseShooting
      ? allBuildingEffects.some((e) => e.stat === 'attack' || e.stat === 'reload' || e.stat === 'projectile' || e.stat === 'secondaryProjectile')
      : allBuildingEffects.some(
          (e) =>
            ((e.stat === 'attack' || e.stat === 'reload') &&
              ((e.op === 'set' && e.value <= 0) || (e.op === 'add' && e.value < 0) || (e.op === 'mul' && e.value <= 0))) ||
            ((e.stat === 'projectile' || e.stat === 'secondaryProjectile') &&
              ((e.op === 'set' && e.value < 0) || (e.op === 'add' && e.value < 0) || (e.op === 'mul' && e.value < 0))),
        ));

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
      if ((e.op === 'add' && e.value === 0) || (e.op === 'mul' && e.value === 1)) return false;
      return e.unit === b.id || isAvailEligible(e.unit) || ((baseShooting || shootingCanFlip) && (hasDynamicSecProjOp || relevantSecProjs.has(e.unit)));
    });
    if (touchesRelevantType60) shapeHooks.add(tid);
  }

  for (const t of pool) {
    const rule = data.techs[t.id]!;
    let isControl = false;
    for (const e of rule.effects) {
      if ((e.op === 'add' && e.value === 0) || (e.op === 'mul' && e.value === 1)) continue;
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
      } else if (isAvailEligible(e.unit)) {
        if (
          e.stat === 'sizeClass' ||
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
      EXPLICIT_CREATE_UNLOCKS.some(
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

  // Techs in civ.free (without unmet shape prereq) automatically enter selected whenever their pool prereqs are present,
  // so they are determined by their prerequisites rather than independent branch choices.
  const autoFreeControl = new Set<number>([...controlSet].filter((id) => !baseFree.has(id) && civFreeSet.has(id) && !hasUnmetShapePrereq(id)));
  const rawBranchTechs = [...controlSet].filter((id) => !baseFree.has(id) && !autoFreeControl.has(id)).sort((a, z) => a - z);
  const branchSet = new Set(rawBranchTechs);
  const branchPrereqs = new Map<number, number[]>();
  const inDegree = new Map<number, number>();
  const dependents = new Map<number, number[]>();
  for (const bid of rawBranchTechs) {
    const reqs = prereqChainInPool(bid).filter((p) => branchSet.has(p));
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
  // Topological sort (prerequisites before dependents, ascending ID tie-break) so prereq ID > dependent ID still enumerates cleanly.
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

  // Enumerate all prerequisite-closed subsets of branchTechs (bounded by MAX_EXACT_CONTROL_SUBSETS).
  const legalSubsets: number[][] = [];
  let subsetOverflow = false;
  {
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
  }

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

  interface EvalState {
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
  const isEffectiveOccupantIn = (es: EvalState, uid: number): boolean => isOccupantIn(es, uid) || (uid === VILLAGER_UNIT_ID && hasRelicDepositIn(es));

  const pruneToValidRows = (techs: number[], startIds: number[]): EvalState => {
    let cur = startIds;
    while (true) {
      const es = makeEvalState(techs, cur);
      if (!cur.length) return es;
      const next = cur.filter((uid) => isOccupantIn(es, uid));
      if (next.length === cur.length) return es;
      cur = next;
    }
  };

  // Deduplicate shapeCandidates into groups by ordered hook signature; detect non-commuting type-60 groups whose row order affects snapshot().
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
  const type60OpsByStat = new Map<string, { groups: Set<number>; ops: Set<GeneralGarrisonEffect['op']> }>();
  for (let gi = 0; gi < shapeGroupHooks.length; gi++) {
    for (const tid of shapeGroupHooks[gi]!) {
      if (baseFree.has(tid)) continue;
      for (const e of data.techs[tid]?.effects ?? []) {
        if ((e.op === 'add' && e.value === 0) || (e.op === 'mul' && e.value === 1)) continue;
        if (baseState.units[e.unit]?.type !== 60) continue;
        const key = `${e.unit}:${e.stat}`;
        let rec = type60OpsByStat.get(key);
        if (!rec) {
          rec = { groups: new Set(), ops: new Set() };
          type60OpsByStat.set(key, rec);
        }
        rec.groups.add(gi);
        rec.ops.add(e.op);
      }
    }
  }
  const sensitiveGroupSet = new Set<number>();
  for (const { groups, ops } of type60OpsByStat.values()) {
    if (groups.size < 2) continue;
    if (ops.size === 1 && (ops.has('add') || ops.has('mul'))) continue;
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
  const stateSpaceOverflow = subsetOverflow || legalSubsets.length * shapeStateCount > MAX_EXACT_STATES;
  const allShapeUids = shapeCandidates.map((sc) => sc.uid);

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

  const validStatesForTechs = (techs: number[]): EvalState[] => {
    const emptyState = makeEvalState(techs, [], techs.length === 0 ? baseState : undefined);
    if (!allShapeUids.length) return [emptyState];
    const byKey = new Map<string, EvalState>([['', emptyState]]);
    if (sensitiveGroupIndices.length === 0) {
      const maxState = pruneToValidRows(techs, allShapeUids);
      if (!byKey.has(maxState.rowKey)) byKey.set(maxState.rowKey, maxState);
      if (shapeGroupUnits.length > 1) {
        const totalMasks = 1 << shapeGroupUnits.length;
        for (let mask = 1; mask < totalMasks - 1; mask++) {
          const subsetIds: number[] = [];
          for (let i = 0; i < shapeGroupUnits.length; i++) {
            if (((mask >> i) & 1) !== 0) subsetIds.push(...shapeGroupUnits[i]!);
          }
          const pruned = pruneToValidRows(techs, subsetIds);
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
          const pruned = pruneToValidRows(techs, subsetIds);
          if (!byKey.has(pruned.rowKey)) byKey.set(pruned.rowKey, pruned);
        }
      }
    }
    return [...byKey.values()];
  };

  // Materialize all exact reachable (T, R) states (skipped if overflowed, where conservative fallback applies).
  const statesByTechKey = new Map<string, EvalState[]>();
  const allReachableStates: EvalState[] = [];
  if (!stateSpaceOverflow) {
    for (const techs of legalSubsets) {
      const list = validStatesForTechs(techs);
      statesByTechKey.set(techs.join(','), list);
      for (const es of list) allReachableStates.push(es);
    }
  }
  for (const es of allReachableStates) {
    const secB = es.snapshot.building?.secondaryProjectile ?? -1;
    if (secB >= 0) relevantSecProjs.add(secB);
    for (const uid of eligibleIds) {
      const u = es.snapshot.units[uid];
      if (!u || !isAvailEligible(uid)) continue;
      if (u.total > 1) {
        multiProjCandidates.add(uid);
        if (u.secondaryProjectile >= 0) relevantSecProjs.add(u.secondaryProjectile);
      }
    }
  }

  // Non-control tech metadata for exact peer-subset synergy and Part 3B verification.
  const nonControlTechs = pool.filter((t) => !controlSet.has(t.id));
  const nonControlPrereqs = new Map<number, { reqBranch: number[]; reqNonCtrl: number[] }>();
  const nonControlTouchTechsByKey = new Map<string, number[]>();
  for (const t of nonControlTechs) {
    const chain = prereqChainInPool(t.id);
    const reqBranch = chain.filter((p) => branchSet.has(p));
    const reqNonCtrl = chain.filter((p) => !branchSet.has(p) && !baseFree.has(p) && !autoFreeControl.has(p));
    nonControlPrereqs.set(t.id, { reqBranch, reqNonCtrl });
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

  // Prerequisite-closed non-empty subsets of interacting non-control peers; null signals budget overflow (caller retains conservatively).
  const uniquePeerClosures = (peers: number[]): number[][] | null => {
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
        for (const pre of nonControlPrereqs.get(pid)!.reqNonCtrl) closedSet.add(pre);
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

  const compatiblePeersForKeys = (esA: EvalState, esB: EvalState, keys: Iterable<string>): number[] => {
    const peers = new Set<number>();
    for (const key of keys) {
      for (const pid of nonControlTouchTechsByKey.get(key) ?? []) {
        if (esA.snapshot.selected.includes(pid) || esB.snapshot.selected.includes(pid)) continue;
        const { reqBranch } = nonControlPrereqs.get(pid)!;
        if (!reqBranch.every((p) => esA.techs.includes(p) && esB.techs.includes(p))) continue;
        peers.add(pid);
      }
    }
    return [...peers].sort((a, z) => a - z);
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
      for (const gate of EXPLICIT_CREATE_UNLOCKS) {
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
    if (buildingShootingSignature(bA, sA.units) !== buildingShootingSignature(bB, sB.units)) return true;

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
            if (isAvailEligible(e.unit) && (e.stat === 'attack' || e.stat === 'reload' || e.stat === 'firepower')) {
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
        const peers = compatiblePeersForKeys(esA, esB, keys);
        const closures = uniquePeerClosures(peers);
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
          if (nsA && buildingShootingSignature(nbA!, snapA.units) !== buildingShootingSignature(nbB!, snapB.units)) return true;
        }
      }
    }

    const checkedUnits = new Set<number>();
    const checkUnitPowerDiff = (uid: number): boolean => {
      if (checkedUnits.has(uid) || !isAvailEligible(uid)) return false;
      checkedUnits.add(uid);
      if (!isEffectiveOccupantIn(esA, uid) && !isEffectiveOccupantIn(esB, uid)) return false;
      const uA = sA.units[uid];
      const uB = sB.units[uid];
      if (!uA || !uB) return uA !== uB;
      const pA = describeUnitGarrisonPower(uA, sA.units).power;
      const pB = describeUnitGarrisonPower(uB, sB.units).power;
      if ((pA === null) !== (pB === null)) return true;
      if (pA !== null && pB !== null && Math.abs(pA - pB) > 1e-12) return true;
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
      const peers = compatiblePeersForKeys(esA, esB, keys);
      const closures = uniquePeerClosures(peers);
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
        if (npA !== null && npB !== null && Math.abs(npA - npB) > 1e-12) return true;
      }
      return false;
    };

    for (const uid of eligibleIds) {
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

  const kept = new Set<number>();

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

  // Part 3A: Evaluate each branch control tech across exact (T, T ∪ {t}) transitions.
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
        const esA = mapA.get(rk) ?? makeEvalState(T, mapB.get(rk)!.rowIds);
        const esB = mapB.get(rk) ?? makeEvalState(TWith, mapA.get(rk)!.rowIds);
        if (statesObservableDiff(esA, esB, true)) {
          relevant = true;
          break;
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
          if ((e.op === 'add' && e.value === 0) || (e.op === 'mul' && e.value === 1)) return false;
          if (e.unit === b.id && BUILDING_SHOOTING_STATS.has(e.stat)) return true;
          if (e.stat === 'attack' && (relevantSecProjs.has(e.unit) || hasDynamicSecProjOp)) return true;
          if (!isAvailEligible(e.unit)) return false;
          if (e.stat !== 'attack' && e.stat !== 'reload' && e.stat !== 'firepower') return false;
          const u = baseState.units[e.unit];
          if (!u) return false;
          if (u.firepower === 0 && !fpSignFlipUnits.has(e.unit)) return false;
          return canBuildingProduceUnit(e.unit) || (e.unit === VILLAGER_UNIT_ID && FORTIFIED_CHURCH_IDS.has(b.id)) || acceptsTask(u, baseB, scope.aliases);
        });
        if (relevant) kept.add(t.id);
      }
    }
  } else {
    // Collapse reachable states that are 100% equivalent for non-control power/shooting probes (e.g., identical capacity-only subsets).
    const nonCtrlReqBranchIds = new Set<number>();
    for (const { reqBranch } of nonControlPrereqs.values()) {
      for (const p of reqBranch) nonCtrlReqBranchIds.add(p);
    }
    const powerSelectedIds = new Set<number>(nonCtrlReqBranchIds);
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
        const B = st.building;
        const capPos = B && B.capacity > 0 ? 1 : 0;
        const gType = B ? B.garrisonType : -1;
        let unlockMask = 0;
        for (let i = 0; i < EXPLICIT_CREATE_UNLOCKS.length; i++) {
          if (st.known.has(EXPLICIT_CREATE_UNLOCKS[i]!.techId)) unlockMask |= 1 << i;
        }
        const reqSig = es.techs.filter((id) => nonCtrlReqBranchIds.has(id)).join(',');
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

    const effectCouldTouchState = (e: GeneralGarrisonEffect, es: EvalState): boolean => {
      if ((e.op === 'add' && e.value === 0) || (e.op === 'mul' && e.value === 1)) return false;
      const st = es.snapshot;
      const B = st.building;
      if (!isShootingBuilding(B)) return false;
      if (e.unit === b.id) return BUILDING_SHOOTING_STATS.has(e.stat);
      if (e.stat === 'attack' && B!.secondaryProjectile === e.unit) return !!st.units[e.unit];
      if (e.stat === 'attack') {
        for (const uid of multiProjCandidates) {
          const u = st.units[uid];
          if (u && u.firepower > 0 && u.total > 1 && u.reload > 0 && u.secondaryProjectile === e.unit && isEffectiveOccupantIn(es, uid)) return true;
        }
      }
      if (!isAvailEligible(e.unit) || !isEffectiveOccupantIn(es, e.unit)) return false;
      const u = st.units[e.unit];
      if (!u || u.firepower === 0) return false;
      if (u.firepower > 0 && !(u.reload > 0)) return false;
      if (e.stat === 'reload' && u.firepower < 0 && !(u.reload > 0)) return false;
      return e.stat === 'attack' || e.stat === 'reload' || e.stat === 'firepower';
    };

    const interactingPeersIn = (t: Tech, es: EvalState): number[] => {
      const peers = new Set<number>();
      const addKey = (key: string) => {
        for (const pid of nonControlTouchTechsByKey.get(key) ?? []) {
          if (pid === t.id || es.snapshot.selected.includes(pid)) continue;
          if (!nonControlPrereqs.get(pid)!.reqBranch.every((p) => es.techs.includes(p))) continue;
          peers.add(pid);
        }
      };
      const st = es.snapshot;
      const B = st.building;
      for (const e of data.techs[t.id]!.effects) {
        if (!effectCouldTouchState(e, es)) continue;
        addKey(`${e.unit}:${e.stat}`);
        if (e.unit === b.id && B) {
          if (e.stat === 'attack' || e.stat === 'reload') {
            addKey(`${b.id}:attack`);
            addKey(`${b.id}:reload`);
            if (B.secondaryProjectile >= 0) addKey(`${B.secondaryProjectile}:attack`);
          }
        } else {
          if (e.stat === 'attack' && B && B.secondaryProjectile === e.unit) {
            addKey(`${b.id}:attack`);
            addKey(`${b.id}:reload`);
          }
          if (e.stat === 'attack') {
            for (const uid of multiProjCandidates) {
              const u = st.units[uid];
              if (u && u.firepower > 0 && u.total > 1 && u.reload > 0 && u.secondaryProjectile === e.unit && isEffectiveOccupantIn(es, uid)) {
                addKey(`${uid}:attack`);
                addKey(`${uid}:reload`);
                addKey(`${uid}:firepower`);
              }
            }
          }
          if (isAvailEligible(e.unit)) {
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
      return [...peers].sort((a, z) => a - z);
    };

    for (const t of nonControlTechs) {
      const effects = data.techs[t.id]!.effects;
      if (!effects.length) continue;
      const { reqBranch, reqNonCtrl } = nonControlPrereqs.get(t.id)!;
      const isFreeBase = baseFree.has(t.id);
      const freeCtx = isFreeBase ? makeWithoutFree(t.id) : null;
      let relevant = false;
      const peerCandidateStates: EvalState[] = [];

      for (const es of part3BStates) {
        if (reqBranch.length > 0 && !reqBranch.every((p) => es.techs.includes(p))) continue;
        if (!effects.some((e) => effectCouldTouchState(e, es))) continue;
        if (freeCtx && es.snapshot.selected.includes(t.id)) {
          const snapWithout = snapshot(ctx, b, es.config, freeCtx.withoutData, status, freeCtx.withoutIndex);
          const esWithout = makeEvalState(es.techs, es.rowIds, snapWithout, freeCtx.withoutData, freeCtx.withoutIndex);
          if (statesObservableDiff(esWithout, es, false)) {
            relevant = true;
            break;
          }
        } else {
          const baseTechs = reqNonCtrl.length > 0 ? unique([...es.techs, ...reqNonCtrl]) : es.techs;
          const esBase = reqNonCtrl.length > 0 ? makeEvalState(baseTechs, es.rowIds) : es;
          const esWith = makeEvalState(unique([...baseTechs, t.id]), es.rowIds);
          if (statesObservableDiff(esBase, esWith, false)) {
            relevant = true;
            break;
          }
        }
        peerCandidateStates.push(es);
      }

      if (!relevant && peerCandidateStates.length > 0) {
        let peerProbes = 0;
        for (const es of peerCandidateStates) {
          if (freeCtx && es.snapshot.selected.includes(t.id)) {
            const peers = interactingPeersIn(t, es);
            const closures = uniquePeerClosures(peers);
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
            const peers = interactingPeersIn(t, es).filter((pid) => !baseTechs.includes(pid) && !nonControlPrereqs.get(pid)!.reqNonCtrl.includes(t.id));
            const closures = uniquePeerClosures(peers);
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
  const closePrereqs = () => {
    for (const id of [...kept]) {
      for (const p of prereqChainInPool(id)) kept.add(p);
    }
  };
  closePrereqs();

  // Part 3C: Evaluate free control techs (baseFree, autoFreeControl, or shape-gated free control techs).
  let part3CChanged = true;
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
        if (!baseFree.has(fid) && !es.techs.every((tid) => kept.has(tid))) continue;
        const snapWithout = snapshot(ctx, b, es.config, withoutData, status, withoutIndex);
        const esWithout = makeEvalState(es.techs, es.rowIds, snapWithout, withoutData, withoutIndex);
        if (statesObservableDiff(esWithout, es, true)) {
          relevant = true;
          break;
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

export function getFreeGarrisonTechs(ctx: GeneralGarrisonContext, b: Building, config: GeneralGarrisonConfig, data = GENERAL_GARRISON_DATA): number[] {
  return freeGarrisonTechs(ctx, b, config, technologyData(data));
}

export function toggleGeneralGarrisonTech(
  ctx: GeneralGarrisonContext,
  b: Building,
  config: GeneralGarrisonConfig,
  id: number,
  data = GENERAL_GARRISON_DATA,
): number[] {
  const status = civStatus(ctx.trees, config.civ);
  const index = getStaticIndex(data);
  const available = new Set(computeGarrisonTechs(ctx, b, config, data, status).map((t) => t.id));
  const free = new Set(freeGarrisonTechs(ctx, b, config, technologyData(data), status, index.shapeUpgrades));
  const selected = new Set([...config.techs, ...free]);
  return unique([...toggleSelected(id, selected, ctx.core.techById, { available, free, ignoreUnavailable: true, stopAtSelected: true })]);
}

/** Unit contribution is not target damage. It uses the current pinned pierce/reload/firepower fields. */
export function unitGarrisonPower(unit: GeneralGarrisonUnit, units: Record<string, GeneralGarrisonUnit>): { power: number | null; reason: string } {
  const { power, reason } = describeUnitGarrisonPower(unit, units);
  return { power, reason };
}

function describeUnitGarrisonPower(unit: GeneralGarrisonUnit, units: Record<string, GeneralGarrisonUnit>): GarrisonContribution {
  if (!Number.isFinite(unit.firepower) || !Number.isFinite(unit.attack)) return { power: null, powerSource: 'unknown', reason: '驻军贡献字段无效。' };
  if (unit.firepower === 0) return { power: 0, powerSource: 'zero-factor', reason: '该单位的驻军火力系数为 0，不增加弹丸。' };
  const invalidReload = { power: null, powerSource: 'unknown', reason: '该单位的攻击间隔无效，无法计算驻军贡献。' } as const;
  if (unit.firepower < 0) {
    if (unit.attack === 0) return { power: -unit.firepower, powerSource: 'fixed', reason: '按数据中的固定驻军火力计入。' };
    if (!(unit.reload > 0)) return invalidReload;
    return { power: unit.attack / unit.reload - unit.firepower, powerSource: 'pierce-plus-fixed', reason: '穿刺秒伤加上数据中的固定驻军火力。' };
  }
  if (!(unit.reload > 0)) return invalidReload;
  const extra = Math.max(0, unit.total - 1);
  if (extra > 0) {
    if (unit.secondaryProjectile === -1) return { power: null, powerSource: 'unknown', reason: '当前多弹丸形式尚未建模；容量与入驻方式仍可查看。' };
    const projectile = units[unit.secondaryProjectile];
    if (!projectile || !Number.isFinite(projectile.attack))
      return { power: null, powerSource: 'unknown', reason: '副弹丸数据缺失，容量有效，但暂不计算该单位的弹丸贡献。' };
    return {
      power: (unit.firepower * (unit.attack + 0.8 * extra * projectile.attack)) / unit.reload,
      powerSource: 'multi-projectile',
      reason: '主弹丸与副弹丸按文档模型折算，再应用固定版本火力系数。',
    };
  }
  return { power: (unit.attack * unit.firepower) / unit.reload, powerSource: 'pierce', reason: '按穿刺攻击、攻击间隔和驻军火力系数折算。' };
}

function relicGarrisonPower(buildingId: number, building: GeneralGarrisonUnit, units: Record<string, GeneralGarrisonUnit>): GarrisonContribution {
  if (!FORTIFIED_CHURCH_IDS.has(buildingId)) return { power: 0, powerSource: 'storage', reason: '圣物存放只计容量，不增加弹丸。' };
  const villager = units[VILLAGER_UNIT_ID];
  const power = villager ? unitGarrisonPower(villager, units).power : null;
  const maxProjectiles = building.projectile >= 0 ? Math.max(1, building.max) : Math.max(0, building.max - 1);
  return {
    power,
    powerSource: power === null ? 'unknown' : 'relic',
    reason: power === null ? '村民驻军贡献数据缺失或无效，暂不计算圣物弹丸贡献。' : `强化教堂中每个圣物 +1 支箭，与村民合计上限 ${maxProjectiles}。`,
  };
}

export function calculateGeneralGarrison(
  ctx: GeneralGarrisonContext,
  b: Building,
  config: GeneralGarrisonConfig,
  data = GENERAL_GARRISON_DATA,
): GeneralGarrisonResult {
  return calculateGarrison(ctx, b, config, data);
}

export function explainGeneralGarrison(ctx: GeneralGarrisonContext, b: Building, config: GeneralGarrisonConfig, data = GENERAL_GARRISON_DATA) {
  const explanation: GarrisonExplanation = { rows: [], buildingThreshold: null, firingSteps: null };
  return { ...calculateGarrison(ctx, b, config, data, explanation), ...explanation };
}

function calculateGarrison(
  ctx: GeneralGarrisonContext,
  b: Building,
  config: GeneralGarrisonConfig,
  data: GeneralGarrisonData,
  explanation?: GarrisonExplanation,
): GeneralGarrisonResult {
  const out: GeneralGarrisonResult = {
    errors: [],
    warnings: [],
    mode: 'shelter',
    capacity: 0,
    usedSlots: 0,
    remainingSlots: 0,
    baseProjectiles: 0,
    extraProjectiles: 0,
    totalProjectiles: 0,
    maxProjectiles: 0,
    buildingPower: null,
    garrisonPower: 0,
    rows: [],
    selected: [],
    nextByUnit: {},
    singleUnitId: null,
    thresholds: [],
    singleUnitSaturationAt: null,
    nextAt: null,
    maxAtCapacity: null,
  };
  if (!data.civs[config.civ] || !b.civs.includes(config.civ)) out.errors.push('所选文明不可使用此建筑。');
  if (!data.buildings[b.id]) out.errors.push('该对象不是已核实的可驻军建筑。');
  if (!Number.isSafeInteger(config.age) || config.age < getGarrisonBuildingAge(b, config.civ, ctx.trees) || config.age > 4)
    out.errors.push('时代无效或早于此建筑。');
  if (config.rows.length > GENERAL_GARRISON_LIMIT) out.errors.push(`方案最多包含 ${GENERAL_GARRISON_LIMIT} 种驻军记录。`);
  const status = civStatus(ctx.trees, config.civ);
  const index = getStaticIndex(data);
  let availableSet: Set<number> | null = null;
  const getAvailable = () => (availableSet ??= new Set(computeGarrisonTechs(ctx, b, config, data, status).map((t) => t.id)));
  if (config.techs.length > 0) {
    const available = getAvailable();
    for (const id of config.techs)
      if (!Number.isSafeInteger(id) || !available.has(id)) out.errors.push(`${ctx.core.techById[id]?.zh ?? `科技 ${id}`}不可用或不影响驻军预览。`);
  }
  if (out.errors.length) return out;
  const state = snapshot(ctx, b, config, data, status, index),
    B = state.building;
  out.selected = state.selected;
  for (const id of state.selected) {
    const tech = ctx.core.techById[id];
    if (tech?.pre && !state.known.has(tech.pre) && getAvailable().has(tech.pre)) out.errors.push(`${tech.zh}缺少前置科技。`);
  }
  if (!B || !Number.isSafeInteger(B.capacity) || B.capacity < 0 || B.capacity > 255) out.errors.push('固定版本建筑容量数据无效。');
  if (!B || out.errors.length) return out;
  out.capacity = B.capacity;
  const scope = buildingProductionScope(b, data, index);
  const seen = new Set<string>();
  let power: number | null = 0;
  for (const row of config.rows) {
    const key = row.unitId + ':' + row.entry;
    if (seen.has(key)) out.errors.push('同一单位与入驻方式不能重复，请合并人数。');
    seen.add(key);
    if (!Number.isSafeInteger(row.unitId) || !['enter', 'created', 'deposit'].includes(row.entry)) out.errors.push('驻军单位或入驻方式无效。');
    const unit = state.units[row.unitId],
      item = candidate(ctx, b, config, row.unitId, state, data, scope, status);
    if (!unit || !item || !(row.entry === 'enter' ? item.canEnter : row.entry === 'deposit' ? item.canDeposit : item.canCreate))
      out.errors.push(`${unit?.zh ?? `单位 ${row.unitId}`}不能以所选方式驻军。`);
    const validCount = /^\d+$/.test(row.count) && Number.isSafeInteger(Number(row.count)) && Number(row.count) <= B.capacity;
    if (!validCount) out.errors.push(`驻军数量须为 0–${B.capacity} 的整数。`);
    const countValue = validCount ? Number(row.count) : 0;
    out.usedSlots += countValue;
    const contribution: GarrisonContribution =
      row.entry === 'deposit'
        ? relicGarrisonPower(b.id, B, state.units)
        : unit
          ? describeUnitGarrisonPower(unit, state.units)
          : { power: null, powerSource: 'unknown', reason: '单位数据缺失。' };
    const total = contribution.power === null ? null : contribution.power * countValue;
    if (countValue > 0) power = power === null || total === null ? null : power + total;
    if (total === null && countValue > 0) out.warnings.push(contribution.reason);
    if (unit && countValue > 0 && unit.firepower > 0 && unit.total > 1)
      out.warnings.push(`多弹丸驻军按公开公式估算，未完成 DE ${DATA_PATCH_BUILD} 客户端对账。`);
    if (unit && countValue > 0 && [6, 7].includes(unit.chargeType)) out.warnings.push('充能单位按普通未充能齐射估算，不计临时最大弹丸数与战斗充能状态。');
    if (row.unitId === 434 && countValue > 0) out.warnings.push('国王驻军仅适用于包含国王的对局模式。');
    const rowResult: GarrisonRowResult = {
      ...row,
      zh: unit?.zh ?? `单位 ${row.unitId}`,
      canEnter: item?.canEnter ?? false,
      canCreate: item?.canCreate ?? false,
      canDeposit: item?.canDeposit ?? false,
      countValue,
      powerEach: contribution.power,
      powerTotal: total,
      reason: contribution.reason,
    };
    out.rows.push(rowResult);
    explanation?.rows.push({ ...rowResult, powerSource: contribution.powerSource });
  }
  out.remainingSlots = Math.max(0, B.capacity - out.usedSlots);
  if (out.usedSlots > B.capacity) out.errors.push(`驻军总数 ${out.usedSlots} 超过容量 ${B.capacity}。`);
  if (out.errors.length) return out;
  out.garrisonPower = power;
  out.warnings = [...new Set(out.warnings)];
  const hasPrimary = B.projectile >= 0,
    hasSecondary = B.secondaryProjectile >= 0;
  const shooting = B.attack > 0 && B.reload > 0 && (hasPrimary || hasSecondary);
  if (!shooting) {
    out.mode = data.herdableIds.some((id) => out.rows.some((r) => r.unitId === id)) || out.rows.some((r) => r.entry === 'deposit') ? 'economic' : 'shelter';
    return out;
  }
  if (![B.total, B.max].every((n) => Number.isSafeInteger(n) && n >= 0)) {
    out.warnings.push('弹丸上限数据未核实；容量与兼容性仍有效。');
    out.extraProjectiles = null;
    out.totalProjectiles = null;
    return out;
  }
  out.mode = b.id === 236 ? 'cannon' : 'arrows';
  const secondaryAttack = hasSecondary ? state.units[B.secondaryProjectile]?.attack : undefined;
  const attack = secondaryAttack ?? B.attack;
  const buildingPower = attack / B.reload;
  out.buildingPower = buildingPower;
  if (hasSecondary && state.units[B.secondaryProjectile]?.attack !== B.attack)
    out.warnings.push('建筑副弹丸攻击与建筑面板不同；本模型按副弹丸火力计算阈值，未完成固定版本客户端对账。');
  if (!(out.buildingPower > 0) || !Number.isFinite(out.buildingPower)) {
    out.warnings.push('建筑副弹丸火力未核实；容量与兼容性仍有效。');
    out.extraProjectiles = null;
    out.totalProjectiles = null;
    return out;
  }
  if (explanation)
    explanation.buildingThreshold = { attack, reload: B.reload, source: secondaryAttack !== undefined ? 'secondary' : hasSecondary ? 'building' : 'primary' };
  const wholeSlotsFor = (quotient: number) => Math.floor(quotient + 1e-9);
  const projectilesFor = (slots: number) => (hasPrimary ? Math.max(1, slots) : Math.max(0, slots - 1));
  const cappedProjectiles = (wholeSlots: number) => projectilesFor(Math.min(B.max, B.total + wholeSlots));
  const countShots = (power: number) => cappedProjectiles(wholeSlotsFor(power / buildingPower));
  out.baseProjectiles = countShots(0);
  out.maxProjectiles = hasPrimary ? Math.max(1, B.max) : Math.max(0, B.max - 1);
  if (power === null) {
    out.extraProjectiles = null;
    out.totalProjectiles = null;
    return out;
  }
  const quotient = power / buildingPower;
  const wholeSlots = wholeSlotsFor(quotient);
  out.totalProjectiles = cappedProjectiles(wholeSlots);
  out.extraProjectiles = out.totalProjectiles - out.baseProjectiles;
  if (explanation) {
    // A primary weapon can start at one shot even when its initial slot count is zero.
    // Without a primary weapon, one slot is reserved and does not fire.
    const nextSlots = out.totalProjectiles + (hasPrimary ? 1 : 2) - B.total;
    explanation.firingSteps = {
      quotient,
      wholeSlots,
      uncappedProjectiles: projectilesFor(B.total + wholeSlots),
      primaryMinimum: hasPrimary && B.total === 0,
      nextThreshold: out.totalProjectiles < out.maxProjectiles ? { slots: nextSlots, power: nextSlots * buildingPower } : null,
    };
  }
  if (unique(out.rows.map((r) => r.unitId)).length === 1 && out.rows[0]?.powerEach !== null) {
    const row = out.rows[0]!;
    out.singleUnitId = row.unitId;
    for (let count = 0; count <= B.capacity; count++) {
      const shots = countShots(count * row.powerEach!);
      out.thresholds.push({ count, totalProjectiles: shots });
      if (out.singleUnitSaturationAt === null && shots >= out.maxProjectiles) out.singleUnitSaturationAt = count;
      if (count > out.usedSlots && out.nextAt === null && shots > out.totalProjectiles) out.nextAt = count;
    }
    out.maxAtCapacity = out.thresholds[B.capacity]!.totalProjectiles;
  }
  for (const row of out.rows) {
    out.nextByUnit[row.unitId] = null;
    if (row.powerEach === null || row.powerEach <= 0) continue;
    for (let n = 1; n <= out.remainingSlots; n++) {
      const shots = countShots(power + n * row.powerEach);
      if (shots > out.totalProjectiles) {
        out.nextByUnit[row.unitId] = { additionalUnits: n, totalProjectiles: shots };
        break;
      }
    }
  }
  return out;
}

/** Strict versioned URL; legacy issue 218 links migrate without dropping malformed tokens. */
export function readGeneralGarrison(params: URLSearchParams, b: Building): { config: GeneralGarrisonConfig; errors: string[] } {
  const errors: string[] = [];
  for (const key of ['civ', 'age', 'gtechs', 'garrison', 'gv', 'army']) if (params.getAll(key).length > 1) errors.push(`${key} 参数重复，请重置方案。`);
  const v2 = params.has('gv') || params.has('army');
  if (v2 && params.has('garrison')) errors.push('新旧驻军参数不能混用，请重置方案。');
  if (v2 && params.get('gv') !== '2') errors.push('驻军方案版本无效。');
  const age = params.get('age');
  if (age !== null && (!/^\d+$/.test(age) || !Number.isSafeInteger(Number(age)))) errors.push('时代参数无效。');
  const techs: number[] = [];
  for (const token of (params.get('gtechs') ?? '').split(',').filter((s, index, all) => s !== '' || all.length > 1 || index > 0)) {
    if (!/^\d+$/.test(token) || !Number.isSafeInteger(Number(token)) || Number(token) <= 0 || techs.includes(Number(token)))
      errors.push('科技参数无效或重复。');
    else techs.push(Number(token));
  }
  const rows: GeneralGarrisonRow[] = [];
  if (v2) {
    const army = params.get('army');
    if (army === null) errors.push('驻军列表参数缺失。');
    else if (army !== '')
      for (const token of army.split(',')) {
        const match = /^(\d+):([^:,]*):(e|c|d)$/.exec(token);
        if (!match || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) <= 0) {
          errors.push('驻军列表包含无效记录。');
          continue;
        }
        const row: GeneralGarrisonRow = {
          unitId: Number(match[1]),
          count: match[2]!,
          entry: match[3] === 'e' ? 'enter' : match[3] === 'd' ? 'deposit' : 'created',
        };
        if (rows.some((r) => r.unitId === row.unitId && r.entry === row.entry)) errors.push('驻军列表包含重复记录。');
        rows.push(row);
      }
  } else if (params.has('garrison')) {
    const count = params.get('garrison')!;
    if (!/^\d+$/.test(count) || !Number.isSafeInteger(Number(count))) errors.push('旧版驻军数量参数无效。');
    rows.push({ unitId: VILLAGER_UNIT_ID, count, entry: 'enter' });
  } else if ([TC_BY_AGE[0]!, 79, 234, 235].includes(b.id)) rows.push({ unitId: VILLAGER_UNIT_ID, count: '0', entry: 'enter' });
  if (rows.length > GENERAL_GARRISON_LIMIT) errors.push(`驻军列表最多 ${GENERAL_GARRISON_LIMIT} 项。`);
  return { config: { civ: params.get('civ') ?? b.civs[0]!, age: age === null ? Math.max(3, b.age) : Number(age), techs: unique(techs), rows }, errors };
}
