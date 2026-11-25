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
export const GENERAL_GARRISON_DATA = raw as unknown as GeneralGarrisonData;
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
  selected: number[];
  productionLocations: Record<number, number[]>;
  appliedRules: GeneralGarrisonRule[];
  stage0AppliedCount: number;
  stage0GarrisonType: number;
  stage0SizeClass: Map<number, number>;
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
  const stage0SizeClass = new Map<number, number>();
  let recordStage0SizeClass = false;
  const apply = (rule: GeneralGarrisonRule) => {
    for (const e of rule.effects) {
      const u = writableUnit(e.unit);
      if (u) {
        if (recordStage0SizeClass && e.stat === 'sizeClass' && !stage0SizeClass.has(e.unit)) stage0SizeClass.set(e.unit, u.sizeClass);
        u[e.stat] = e.op === 'set' ? e.value : e.op === 'mul' ? u[e.stat] * e.value : u[e.stat] + e.value;
      }
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
  advance();
  const stage0AppliedCount = appliedRules.length;
  const stage0GarrisonType = units[b.id]?.garrisonType ?? 0;
  recordStage0SizeClass = true;
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
  return { units, building: units[b.id], known, selected, productionLocations, appliedRules, stage0AppliedCount, stage0GarrisonType, stage0SizeClass };
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
  condShapeReqs: number[];
  type60ShapeTechs: number[];
  scopeByBuilding: Map<number, BuildingProductionScope>;
}

function buildStaticIndex(data: GeneralGarrisonData): StaticGarrisonIndex {
  const upgradeData = technologyData(data);
  const relicIds = data.relicIds ?? [];
  const eligibleIds = unique([...data.rosterIds, ...data.herdableIds, ...(data.specialOccupantIds ?? []).filter((id) => id !== 286), ...relicIds]);
  const eligiblePool = new Set<number>(eligibleIds);
  const shapeUpgrades = new Set(Object.values(upgradeData.unitUpgradeTechs ?? {}).flat());
  const condReqSet = new Set<number>();
  for (const r of data.conditional) {
    for (const req of r.requires) if (shapeUpgrades.has(req)) condReqSet.add(req);
  }
  const type60ShapeTechs: number[] = [];
  for (const tid of shapeUpgrades) {
    if (data.techs[tid]?.effects.some((e) => data.units[e.unit]?.type === 60)) type60ShapeTechs.push(tid);
  }
  return { eligibleIds, eligiblePool, shapeUpgrades, condShapeReqs: [...condReqSet], type60ShapeTechs, scopeByBuilding: new Map() };
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

const BUILDING_ALWAYS_STATS = new Set<GarrisonStat>(['capacity', 'garrisonType']);
const BUILDING_SHOOTING_STATS = new Set<GarrisonStat>(['attack', 'reload', 'total', 'max', 'projectile', 'secondaryProjectile']);
const EXPLICIT_CREATE_UNLOCKS: readonly { techId: number; unitIds: readonly number[]; buildingId?: number }[] = [
  { techId: 47, unitIds: [5, 36, 420, 691] },
  { techId: 16, unitIds: [759, 761], buildingId: 12 },
  { techId: 483, unitIds: [886, 887], buildingId: 101 },
  { techId: 755, unitIds: [1699] },
];
const MAX_STAT_STATES = 256;

const applyEffectOp = (cur: number, op: GeneralGarrisonEffect['op'], val: number): number => (op === 'set' ? val : op === 'mul' ? cur * val : cur + val);

const applyStatList = (cur: number, list: readonly GeneralGarrisonEffect[]): number => {
  let v = cur;
  for (const e of list) v = applyEffectOp(v, e.op, e.value);
  return v;
};

const isShootingBuilding = (B: GeneralGarrisonUnit | undefined): boolean =>
  !!B && B.attack > 0 && B.reload > 0 && (B.projectile >= 0 || B.secondaryProjectile >= 0);

interface OccupantCaps {
  hasPosFp: boolean;
  hasNegFp: boolean;
  hasNonZeroFp: boolean;
  hasNonZeroAttack: boolean;
  hasMultiProj: boolean;
}

function effectAffectsOccupant(effect: GeneralGarrisonEffect, caps: OccupantCaps): boolean {
  if (effect.stat === 'firepower') {
    if (effect.op === 'mul') return caps.hasNonZeroFp && effect.value !== 1;
    if (effect.op === 'add') return effect.value !== 0;
    return effect.value !== 0 || caps.hasNonZeroFp;
  }
  if (!caps.hasNonZeroFp) return false;
  if (effect.stat === 'attack') return true;
  if (effect.stat === 'reload') return caps.hasPosFp || (caps.hasNegFp && caps.hasNonZeroAttack);
  if (effect.stat === 'total') return caps.hasPosFp;
  if (effect.stat === 'secondaryProjectile') return caps.hasPosFp && caps.hasMultiProj;
  return false;
}

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
  let fullConfig: GeneralGarrisonConfig = { civ: config.civ, age: config.age, techs: pool.map((t) => t.id), rows: [] };
  const baseState = snapshot(ctx, b, baseConfig, data, status, staticIndex);
  let fullState = snapshot(ctx, b, fullConfig, data, status, staticIndex);
  const baseB = baseState.building;
  if (!baseB || !fullState.building) return [];

  const scope = buildingProductionScope(b, data, staticIndex);
  const { aliases, predecessors, catalogSources, trainSources } = scope;
  const relicIds = data.relicIds ?? [];
  const baseFree = new Set(baseState.selected);
  const baseStage0Ids = new Set(baseState.appliedRules.slice(0, baseState.stage0AppliedCount).map((r) => r.id));
  const baseStage2Ids = new Set(baseState.appliedRules.slice(baseState.stage0AppliedCount).map((r) => r.id));

  const prereqSetInPool = (tid: number): Set<number> => {
    const out = new Set<number>();
    let pre = ctx.core.techById[tid]?.pre;
    while (pre && poolIds.has(pre) && !out.has(pre)) {
      out.add(pre);
      pre = ctx.core.techById[pre]?.pre;
    }
    return out;
  };

  interface Reachability {
    effectsByUnit: Map<number, GeneralGarrisonEffect[]>;
    relocUnits: Set<number>;
    bEffects: GeneralGarrisonEffect[];
    stage1Ids: number[];
    stage2Rules: GeneralGarrisonRule[];
    canHaveCapacity: boolean;
    gTypeValues: number[];
    gTypeMask: number;
    gTypeOverflow: boolean;
    isOccupant: (id: number) => boolean;
    stage0ClassesOf: (uid: number, fullS: Snapshot) => number[];
  }

  const propagateSingleStat = (
    initialValues: number[],
    stage1Ids: number[],
    stage2Rules: GeneralGarrisonRule[],
    targetUnit: number,
    stat: GarrisonStat,
  ): { values: number[]; overflow: boolean } => {
    let values = new Set<number>(initialValues);
    let overflow = false;
    const s1Items = stage1Ids
      .map((id) => ({ id, fx: (data.techs[id]?.effects ?? []).filter((e) => e.unit === targetUnit && e.stat === stat) }))
      .filter((item) => item.fx.length > 0);
    if (s1Items.length > 0) {
      const s1Index = new Map(s1Items.map((item, idx) => [item.id, idx]));
      const reqMasks = s1Items.map((item) => {
        let mask = 0;
        for (const p of prereqSetInPool(item.id)) {
          const idx = s1Index.get(p);
          if (idx !== undefined) mask |= 1 << idx;
        }
        return mask;
      });
      const hasInternalPrereq = reqMasks.some((m) => m !== 0);
      if (hasInternalPrereq && s1Items.length <= 14) {
        let states = new Map<string, [number, number, number]>();
        for (const v of values) states.set(`${v}:0:0`, [v, 0, 0]);
        for (let i = 0; i < s1Items.length; i++) {
          const item = s1Items[i]!;
          const bit = 1 << i;
          const forced = baseFree.has(item.id);
          const next = new Map<string, [number, number, number]>();
          const push = (v: number, chosen: number, req: number) => {
            const key = `${v}:${chosen}:${req}`;
            if (!next.has(key)) next.set(key, [v, chosen, req]);
          };
          for (const [v, chosen, req] of states.values()) {
            if (!forced) push(v, chosen, req);
            push(applyStatList(v, item.fx), chosen | bit, req | reqMasks[i]!);
            if (next.size > MAX_STAT_STATES * 2) {
              overflow = true;
              break;
            }
          }
          if (overflow) break;
          states = next;
        }
        if (!overflow) {
          values = new Set<number>();
          for (const [v, chosen, req] of states.values()) {
            if ((req & ~chosen) === 0) values.add(v);
          }
        }
      } else {
        for (const item of s1Items) {
          if (baseFree.has(item.id)) {
            const next = new Set<number>();
            for (const v of values) next.add(applyStatList(v, item.fx));
            values = next;
          } else {
            const added: number[] = [];
            for (const v of values) added.push(applyStatList(v, item.fx));
            for (const v of added) {
              values.add(v);
              if (values.size > MAX_STAT_STATES) {
                overflow = true;
                break;
              }
            }
            if (overflow) break;
          }
        }
      }
    }
    if (!overflow) {
      const s2Items = stage2Rules
        .map((r) => ({ forced: baseStage2Ids.has(r.id), fx: r.effects.filter((e) => e.unit === targetUnit && e.stat === stat) }))
        .filter((item) => item.fx.length > 0);
      if (s2Items.length > 0) {
        if (s2Items.every((item) => item.forced)) {
          for (const item of s2Items) {
            const next = new Set<number>();
            for (const v of values) next.add(applyStatList(v, item.fx));
            values = next;
          }
        } else if (s2Items.length > 20) {
          overflow = true;
        } else {
          let forcedMask = 0;
          for (let i = 0; i < s2Items.length; i++) if (s2Items[i]!.forced) forcedMask |= 1 << i;
          const seen = new Set<string>();
          const queue: [number, number][] = [];
          for (const v of values) {
            const key = `${v}:0`;
            if (!seen.has(key)) {
              seen.add(key);
              queue.push([v, 0]);
            }
          }
          for (let q = 0; q < queue.length && !overflow; q++) {
            const [v, bits] = queue[q]!;
            for (let i = 0; i < s2Items.length; i++) {
              if (((bits >> i) & 1) !== 0) continue;
              const nv = applyStatList(v, s2Items[i]!.fx);
              const nbits = bits | (1 << i);
              const key = `${nv}:${nbits}`;
              if (!seen.has(key)) {
                seen.add(key);
                queue.push([nv, nbits]);
                if (seen.size > MAX_STAT_STATES * 2) {
                  overflow = true;
                  break;
                }
              }
            }
          }
          if (!overflow) {
            values = new Set<number>();
            for (const [v, bits] of queue) {
              if ((bits & forcedMask) === forcedMask) values.add(v);
            }
          }
        }
      }
    }
    return { values: [...values], overflow };
  };

  const analyzeReachability = (cfgFull: GeneralGarrisonConfig, stateFull: Snapshot): Reachability => {
    const fullB = stateFull.building!;
    const effectsByUnit = new Map<number, GeneralGarrisonEffect[]>();
    const relocUnits = new Set<number>();
    const indexRule = (rule: GeneralGarrisonRule) => {
      for (const e of rule.effects) {
        let list = effectsByUnit.get(e.unit);
        if (!list) {
          list = [];
          effectsByUnit.set(e.unit, list);
        }
        list.push(e);
      }
      for (const loc of rule.trainingLocations ?? []) {
        if (trainSources.includes(loc.location)) relocUnits.add(loc.unit);
      }
    };
    for (const t of pool) indexRule(data.techs[t.id]!);
    for (const r of stateFull.appliedRules) indexRule(r);

    const bEffects = effectsByUnit.get(b.id) ?? [];
    const stage1Ids = unique([...poolIds, ...baseState.selected, ...stateFull.selected]);
    const stage2Rules = stateFull.appliedRules.slice(stateFull.stage0AppliedCount);
    const shapeStage0Rules = stateFull.appliedRules.slice(0, stateFull.stage0AppliedCount).filter((r) => !baseStage0Ids.has(r.id));

    const stage0ValuesOf = (baseVal: number, fullVal: number, targetUnit: number, stat: GarrisonStat): number[] => {
      const vals = new Set<number>([baseVal, fullVal]);
      const fxRules = shapeStage0Rules.map((r) => r.effects.filter((e) => e.unit === targetUnit && e.stat === stat)).filter((fx) => fx.length > 0);
      for (const fx of fxRules) {
        const next: number[] = [];
        for (const v of vals) next.push(applyStatList(v, fx));
        for (const v of next) vals.add(v);
      }
      return [...vals];
    };

    const stage0ClassesOf = (uid: number, fullS: Snapshot): number[] => {
      const bClass = baseState.stage0SizeClass.get(uid) ?? baseState.units[uid]?.sizeClass;
      const fClass = fullS.stage0SizeClass.get(uid) ?? fullS.units[uid]?.sizeClass;
      if (bClass === undefined && fClass === undefined) return [];
      return stage0ValuesOf(bClass ?? fClass!, fClass ?? bClass!, uid, 'sizeClass');
    };

    const canHaveCapacity =
      baseB.capacity > 0 || fullB.capacity > 0 || bEffects.some((e) => e.stat === 'capacity' && (e.op === 'set' || e.op === 'add') && e.value > 0);

    const hasGTypeEffects = bEffects.some((e) => e.stat === 'garrisonType');
    const gTypeProp = hasGTypeEffects
      ? propagateSingleStat(
          stage0ValuesOf(baseState.stage0GarrisonType, stateFull.stage0GarrisonType, b.id, 'garrisonType'),
          stage1Ids,
          stage2Rules,
          b.id,
          'garrisonType',
        )
      : { values: [baseB.garrisonType, fullB.garrisonType], overflow: false };
    const gTypeValues = unique([...gTypeProp.values, baseB.garrisonType, fullB.garrisonType]);
    let gTypeMask = gTypeProp.overflow ? 0x7f : 0;
    if (!gTypeProp.overflow) {
      for (const v of gTypeValues) gTypeMask |= v & 0x7f;
    }

    const createGateMet = (uid: number): boolean => {
      for (const gate of EXPLICIT_CREATE_UNLOCKS) {
        if (gate.buildingId !== undefined && gate.buildingId !== b.id) continue;
        if (gate.unitIds.includes(uid) && !stateFull.known.has(gate.techId)) return false;
      }
      return true;
    };

    const occupantCache = new Map<number, boolean>();
    const isOccupant = (id: number): boolean => {
      const cached = occupantCache.get(id);
      if (cached !== undefined) return cached;
      if (!eligiblePool.has(id) || id === 286) {
        occupantCache.set(id, false);
        return false;
      }
      const baseC = candidate(ctx, b, baseConfig, id, baseState, data, scope, status);
      if (baseC && (baseC.canEnter || baseC.canCreate || baseC.canDeposit)) {
        occupantCache.set(id, true);
        return true;
      }
      const fullC = candidate(ctx, b, cfgFull, id, stateFull, data, scope, status);
      if (fullC && (fullC.canEnter || fullC.canCreate || fullC.canDeposit)) {
        occupantCache.set(id, true);
        return true;
      }
      let ok = false;
      if (canHaveCapacity && unitAvailable(ctx, id, baseConfig, data, status)) {
        const bu = baseState.units[id];
        const fu = stateFull.units[id];
        const unitBase = bu ?? fu;
        const taskOk = (!!bu && acceptsTask(bu, baseB, aliases)) || (!!fu && acceptsTask(fu, fullB, aliases));
        if (taskOk && unitBase && (gTypeProp.overflow || gTypeMask !== 0)) {
          const hasSizeEffects = (effectsByUnit.get(id) ?? []).some((e) => e.stat === 'sizeClass');
          if (!hasSizeEffects) {
            const m = garrisonUnitMask(unitBase);
            if (m !== null && (gTypeProp.overflow || (gTypeMask & m) !== 0)) ok = true;
          } else {
            const scProp = propagateSingleStat(stage0ClassesOf(id, stateFull), stage1Ids, stage2Rules, id, 'sizeClass');
            if (scProp.overflow) {
              ok = true;
            } else {
              for (const sc of scProp.values) {
                const m = garrisonUnitMask({ ...unitBase, sizeClass: sc });
                if (m !== null && (gTypeProp.overflow || (gTypeMask & m) !== 0)) {
                  ok = true;
                  break;
                }
              }
            }
          }
        }
        const productionId = id === FEMALE_VILLAGER_ID ? VILLAGER_UNIT_ID : id;
        const isRelic = relicIds.includes(id);
        if (!ok && !isRelic && unitAge(ctx, id, config.civ, data) <= config.age && createGateMet(id)) {
          const catalogProduction = catalogSources.some((sourceId) => data.buildings[sourceId]?.produces.includes(productionId));
          const producer = baseState.units[productionId] ?? stateFull.units[productionId];
          const hasNativeTrainLoc = !!producer?.trainLocations.some((t) => trainSources.includes(t.unitId));
          if (relocUnits.has(productionId) || (catalogProduction && hasNativeTrainLoc)) ok = true;
        }
        if (!ok && isRelic) {
          const carrier = baseState.units[286] ?? stateFull.units[286];
          if (carrier?.specialTasks?.some((t) => t.action === 136 && (predecessors.includes(t.unitId) || (t.unitId < 0 && t.classId === baseB.class))))
            ok = true;
        }
      }
      occupantCache.set(id, ok);
      return ok;
    };

    return {
      effectsByUnit,
      relocUnits,
      bEffects,
      stage1Ids,
      stage2Rules,
      canHaveCapacity,
      gTypeValues,
      gTypeMask,
      gTypeOverflow: gTypeProp.overflow,
      isOccupant,
      stage0ClassesOf,
    };
  };

  let reach = analyzeReachability(fullConfig, fullState);

  // Include implicit shape technologies that any reachable occupant row could inject into snapshot(),
  // without depending on config.rows so adding/removing rows never changes the tech list.
  const shapeHooks = new Set<number>();
  for (const r of civData.automatic) {
    if (disabled.has(r.id)) continue;
    for (const req of r.requires) if (shapeUpgrades.has(req) && !baseState.known.has(req)) shapeHooks.add(req);
  }
  for (const req of staticIndex.condShapeReqs) {
    if (!baseState.known.has(req)) shapeHooks.add(req);
  }
  for (const fid of civData.free) {
    let pre = ctx.core.techById[fid]?.pre;
    while (pre && shapeUpgrades.has(pre)) {
      if (!baseState.known.has(pre)) shapeHooks.add(pre);
      pre = ctx.core.techById[pre]?.pre;
    }
  }
  for (const tid of staticIndex.type60ShapeTechs) {
    if (!baseState.known.has(tid)) shapeHooks.add(tid);
  }
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
    const shapeCandidates: number[] = [];
    for (const [key, seeds] of Object.entries(upgradeData.unitUpgradeTechs)) {
      if (!seeds.length) continue;
      const uid = Number(key);
      if (!eligiblePool.has(uid) || uid === 286 || !unitAvailable(ctx, uid, baseConfig, data, status)) continue;
      if (!unitShapeClosure(seeds).some((tid) => shapeHooks.has(tid))) continue;
      shapeCandidates.push(uid);
    }
    const allConditionalRules = [...civData.automatic, ...data.conditional].filter((r) => !disabled.has(r.id));
    const hasUnappliedEntryMutator = (uid: number, appliedIds: Set<number>): boolean => {
      const prodId = uid === FEMALE_VILLAGER_ID ? VILLAGER_UNIT_ID : uid;
      return allConditionalRules.some(
        (r) =>
          !appliedIds.has(r.id) &&
          (r.effects.some((e) => (e.unit === b.id && (e.stat === 'capacity' || e.stat === 'garrisonType')) || (e.unit === uid && e.stat === 'sizeClass')) ||
            (r.trainingLocations ?? []).some((loc) => loc.unit === prodId && trainSources.includes(loc.location))),
      );
    };
    const acceptedShapeIds = new Set<number>();
    let changed = true;
    while (changed) {
      changed = false;
      const appliedIds = new Set(fullState.appliedRules.map((r) => r.id));
      for (const uid of shapeCandidates) {
        if (acceptedShapeIds.has(uid)) continue;
        let eligible = reach.isOccupant(uid);
        if (!eligible && hasUnappliedEntryMutator(uid, appliedIds)) {
          const probeRows: GeneralGarrisonRow[] = [...acceptedShapeIds, uid].map((id) => ({ unitId: id, count: '0', entry: 'enter' }));
          const probeConfig: GeneralGarrisonConfig = { ...fullConfig, rows: probeRows };
          const probeState = snapshot(ctx, b, probeConfig, data, status, staticIndex);
          if (probeState.building) eligible = analyzeReachability(probeConfig, probeState).isOccupant(uid);
        }
        if (eligible) {
          acceptedShapeIds.add(uid);
          changed = true;
        }
      }
      if (changed) {
        fullConfig = { ...fullConfig, rows: [...acceptedShapeIds].map((id) => ({ unitId: id, count: '0', entry: 'enter' })) };
        fullState = snapshot(ctx, b, fullConfig, data, status, staticIndex);
        if (!fullState.building) return [];
        reach = analyzeReachability(fullConfig, fullState);
      }
    }
  }

  const fullB = fullState.building;
  if (!fullB) return [];
  const { effectsByUnit, relocUnits, bEffects, stage1Ids, stage2Rules, canHaveCapacity, gTypeValues, gTypeOverflow, isOccupant, stage0ClassesOf } = reach;

  const shooting =
    isShootingBuilding(baseB) ||
    isShootingBuilding(fullB) ||
    ((baseB.attack > 0 || fullB.attack > 0 || bEffects.some((e) => e.stat === 'attack' && (e.op === 'set' || e.op === 'add') && e.value > 0)) &&
      (baseB.reload > 0 || fullB.reload > 0 || bEffects.some((e) => e.stat === 'reload' && (e.op === 'set' || e.op === 'add') && e.value > 0)) &&
      (baseB.projectile >= 0 ||
        fullB.projectile >= 0 ||
        baseB.secondaryProjectile >= 0 ||
        fullB.secondaryProjectile >= 0 ||
        bEffects.some(
          (e) => (e.stat === 'projectile' || e.stat === 'secondaryProjectile') && ((e.op === 'set' && e.value >= 0) || (e.op === 'add' && e.value > 0)),
        )));

  const capsCache = new Map<number, OccupantCaps>();
  const unitCaps = (uid: number): OccupantCaps => {
    const cached = capsCache.get(uid);
    if (cached) return cached;
    const bu = baseState.units[uid];
    const fu = fullState.units[uid];
    const ue = effectsByUnit.get(uid) ?? [];
    let hasPosFp = (bu?.firepower ?? 0) > 0 || (fu?.firepower ?? 0) > 0;
    let hasNegFp = (bu?.firepower ?? 0) < 0 || (fu?.firepower ?? 0) < 0;
    let hasNonZeroAttack = (bu?.attack ?? 0) !== 0 || (fu?.attack ?? 0) !== 0;
    let hasPosTotal = (bu?.total ?? 0) > 0 || (fu?.total ?? 0) > 0;
    let hasMultiProj = (bu?.total ?? 0) > 1 || (fu?.total ?? 0) > 1;
    let hasNegMulFp = false;
    let hasMulTotalGt1 = false;
    for (const e of ue) {
      if (e.stat === 'firepower') {
        if ((e.op === 'set' || e.op === 'add') && e.value > 0) hasPosFp = true;
        else if ((e.op === 'set' || e.op === 'add') && e.value < 0) hasNegFp = true;
        else if (e.op === 'mul' && e.value < 0) hasNegMulFp = true;
      } else if (e.stat === 'attack') {
        if ((e.op === 'set' || e.op === 'add') && e.value !== 0) hasNonZeroAttack = true;
      } else if (e.stat === 'total') {
        if ((e.op === 'set' || e.op === 'add') && e.value > 0) hasPosTotal = true;
        if ((e.op === 'set' && e.value > 1) || (e.op === 'add' && e.value > 0)) hasMultiProj = true;
        else if (e.op === 'mul' && e.value > 1) hasMulTotalGt1 = true;
      }
    }
    if (hasMulTotalGt1 && hasPosTotal) hasMultiProj = true;
    if (hasNegMulFp) {
      if (hasPosFp) hasNegFp = true;
      if (hasNegFp) hasPosFp = true;
    }
    const caps: OccupantCaps = { hasPosFp, hasNegFp, hasNonZeroFp: hasPosFp || hasNegFp, hasNonZeroAttack, hasMultiProj };
    capsCache.set(uid, caps);
    return caps;
  };

  const hasRelicDeposit = FORTIFIED_CHURCH_IDS.has(b.id) && relicIds.some((rid) => isOccupant(rid));

  const isEffectivePowerUnit = (uid: number): boolean => isOccupant(uid) || (uid === VILLAGER_UNIT_ID && hasRelicDeposit);

  const buildingSecondaries = new Set<number>();
  const occupantSecondaries = new Set<number>();
  if (shooting) {
    if (baseB.secondaryProjectile >= 0) buildingSecondaries.add(baseB.secondaryProjectile);
    if (fullB.secondaryProjectile >= 0) buildingSecondaries.add(fullB.secondaryProjectile);
    for (const e of bEffects) if (e.stat === 'secondaryProjectile' && e.op === 'set' && e.value >= 0) buildingSecondaries.add(e.value);
    for (const id of eligibleIds) {
      const bu = baseState.units[id];
      const fu = fullState.units[id];
      if (!((bu && bu.total > 1) || (fu && fu.total > 1) || effectsByUnit.has(id))) continue;
      const caps = unitCaps(id);
      if (!caps.hasPosFp || !caps.hasMultiProj || !isEffectivePowerUnit(id)) continue;
      if (bu && bu.secondaryProjectile >= 0) occupantSecondaries.add(bu.secondaryProjectile);
      if (fu && fu.secondaryProjectile >= 0) occupantSecondaries.add(fu.secondaryProjectile);
      for (const e of effectsByUnit.get(id) ?? []) {
        if (e.stat === 'secondaryProjectile' && e.op === 'set' && e.value >= 0) occupantSecondaries.add(e.value);
      }
    }
  }

  const activeGTypes = gTypeValues.filter((m) => (m & 0x7f) !== 0);
  const techDependsOn = (k: number, target: number): boolean => {
    let pre = ctx.core.techById[k]?.pre;
    const seen = new Set<number>();
    while (pre && poolIds.has(pre) && !seen.has(pre)) {
      if (pre === target) return true;
      seen.add(pre);
      pre = ctx.core.techById[pre]?.pre;
    }
    return false;
  };

  const sizeClassChangesEntryForTech = (uid: number, tid: number, triggered: GeneralGarrisonRule[]): boolean => {
    if (!canHaveCapacity || (!gTypeOverflow && !activeGTypes.length) || !eligiblePool.has(uid) || !unitAvailable(ctx, uid, baseConfig, data, status))
      return false;
    const bu = baseState.units[uid];
    const fu = fullState.units[uid];
    const unitBase = bu ?? fu;
    if (!unitBase) return false;
    if (!((bu && acceptsTask(bu, baseB, aliases)) || (fu && acceptsTask(fu, fullB, aliases)))) return false;

    const tidPrereqs = prereqSetInPool(tid);
    const s1Items = stage1Ids
      .map((id) => ({ id, fx: (data.techs[id]?.effects ?? []).filter((e) => e.unit === uid && e.stat === 'sizeClass') }))
      .filter((item) => item.fx.length > 0);
    let pairs = new Map<string, [number, number]>();
    for (const c of stage0ClassesOf(uid, fullState)) pairs.set(`${c}:${c}`, [c, c]);

    for (const item of s1Items) {
      const k = item.id;
      const next = new Map<string, [number, number]>();
      const push = (a: number, bVal: number) => {
        const key = `${a}:${bVal}`;
        if (!next.has(key)) next.set(key, [a, bVal]);
      };
      const isTid = k === tid;
      const forcedBoth = baseFree.has(k) || tidPrereqs.has(k);
      const depOnTid = !isTid && techDependsOn(k, tid);
      for (const [a, bVal] of pairs.values()) {
        if (isTid) {
          push(a, applyStatList(bVal, item.fx));
        } else if (forcedBoth) {
          push(applyStatList(a, item.fx), applyStatList(bVal, item.fx));
        } else if (depOnTid) {
          if (civFreeSet.has(k)) {
            const allPrereqsMet = [...prereqSetInPool(k)].every((p) => p === tid || tidPrereqs.has(p) || baseFree.has(p));
            if (!allPrereqsMet) push(a, bVal);
            push(a, applyStatList(bVal, item.fx));
          } else {
            push(a, bVal);
          }
        } else {
          push(a, bVal);
          push(applyStatList(a, item.fx), applyStatList(bVal, item.fx));
        }
        if (next.size > MAX_STAT_STATES * 2) return true;
      }
      pairs = next;
    }

    const s2Items = stage2Rules
      .map((r) => ({ rule: r, forced: baseStage2Ids.has(r.id), fx: r.effects.filter((e) => e.unit === uid && e.stat === 'sizeClass') }))
      .filter((item) => item.fx.length > 0);
    let finalPairs: [number, number][] = [...pairs.values()];
    if (s2Items.length > 0) {
      const triggeredSet = new Set(triggered.map((r) => r.id));
      if (s2Items.every((item) => item.forced)) {
        for (const item of s2Items) {
          finalPairs = finalPairs.map(([a, bVal]) => [applyStatList(a, item.fx), applyStatList(bVal, item.fx)]);
        }
      } else if (s2Items.length > 16) {
        return true;
      } else {
        let forcedMask = 0;
        for (let i = 0; i < s2Items.length; i++) if (s2Items[i]!.forced) forcedMask |= 1 << i;
        const seen = new Set<string>();
        const queue: [number, number, number, number][] = [];
        for (const [a, bVal] of finalPairs) {
          const key = `${a}:${bVal}:0:0`;
          if (!seen.has(key)) {
            seen.add(key);
            queue.push([a, bVal, 0, 0]);
          }
        }
        const enqueue = (a: number, bVal: number, ba: number, bb: number): boolean => {
          const key = `${a}:${bVal}:${ba}:${bb}`;
          if (!seen.has(key)) {
            seen.add(key);
            queue.push([a, bVal, ba, bb]);
            if (seen.size > MAX_STAT_STATES * 2) return false;
          }
          return true;
        };
        for (let q = 0; q < queue.length; q++) {
          const [a, bVal, ba, bb] = queue[q]!;
          for (let i = 0; i < s2Items.length; i++) {
            const item = s2Items[i]!;
            const bit = 1 << i;
            const inA = ((ba >> i) & 1) !== 0;
            const inB = ((bb >> i) & 1) !== 0;
            const isTriggered = triggeredSet.has(item.rule.id);
            const blockedWithoutTid = isTriggered && item.rule.requires.includes(tid) && item.rule.requires.length - 1 < item.rule.count;
            if (!inA && !inB && !blockedWithoutTid) {
              if (!enqueue(applyStatList(a, item.fx), applyStatList(bVal, item.fx), ba | bit, bb | bit)) return true;
            }
            if (isTriggered && !inA && !inB) {
              if (!enqueue(a, applyStatList(bVal, item.fx), ba, bb | bit)) return true;
            }
            if (item.forced && !inA && inB) {
              if (!enqueue(applyStatList(a, item.fx), bVal, ba | bit, bb)) return true;
            }
            if (item.forced && inA && !inB) {
              if (!enqueue(a, applyStatList(bVal, item.fx), ba, bb | bit)) return true;
            }
          }
        }
        finalPairs = [];
        for (const [a, bVal, ba, bb] of queue) {
          if ((ba & forcedMask) === forcedMask && (bb & forcedMask) === forcedMask) finalPairs.push([a, bVal]);
        }
      }
    }

    for (const [a, bVal] of finalPairs) {
      if (a === bVal) continue;
      const maskA = garrisonUnitMask({ ...unitBase, sizeClass: a });
      const maskB = garrisonUnitMask({ ...unitBase, sizeClass: bVal });
      if (gTypeOverflow) {
        if (maskA !== maskB) return true;
        continue;
      }
      for (const gType of activeGTypes) {
        const allowedA = maskA !== null && (gType & maskA) !== 0;
        const allowedB = maskB !== null && (gType & maskB) !== 0;
        if (allowedA !== allowedB) return true;
      }
    }
    return false;
  };

  const effectRelevant = (e: GeneralGarrisonEffect): boolean => {
    if (e.unit === b.id) return BUILDING_ALWAYS_STATS.has(e.stat) || (shooting && BUILDING_SHOOTING_STATS.has(e.stat));
    if (e.stat === 'attack' && buildingSecondaries.has(e.unit)) return true;
    if (!shooting) return false;
    if (e.stat === 'attack' && occupantSecondaries.has(e.unit)) return true;
    if (!eligiblePool.has(e.unit)) return false;
    if (!effectAffectsOccupant(e, unitCaps(e.unit))) return false;
    return isEffectivePowerUnit(e.unit);
  };

  const unlocksProductionHere = (tid: number, locations: NonNullable<GeneralGarrisonRule['trainingLocations']>): boolean => {
    if (!canHaveCapacity) return false;
    for (const loc of locations) {
      if (
        trainSources.includes(loc.location) &&
        eligiblePool.has(loc.unit) &&
        loc.unit !== 286 &&
        !relicIds.includes(loc.unit) &&
        !!data.units[loc.unit] &&
        unitAvailable(ctx, loc.unit, baseConfig, data, status) &&
        unitAge(ctx, loc.unit, config.civ, data) <= config.age
      )
        return true;
    }
    for (const gate of EXPLICIT_CREATE_UNLOCKS) {
      if (gate.techId !== tid || (gate.buildingId !== undefined && gate.buildingId !== b.id)) continue;
      for (const uid of gate.unitIds) {
        if (candidate(ctx, b, fullConfig, uid, fullState, data, scope, status)?.canCreate) return true;
        if (!unitAvailable(ctx, uid, baseConfig, data, status) || unitAge(ctx, uid, config.civ, data) > config.age) continue;
        const prodId = uid === FEMALE_VILLAGER_ID ? VILLAGER_UNIT_ID : uid;
        const catalogProduction = catalogSources.some((sourceId) => data.buildings[sourceId]?.produces.includes(prodId));
        const producer = baseState.units[prodId] ?? fullState.units[prodId];
        const hasNativeTrainLoc = !!producer?.trainLocations.some((t) => trainSources.includes(t.unitId));
        if (relocUnits.has(prodId) || (catalogProduction && hasNativeTrainLoc)) return true;
      }
    }
    return false;
  };

  // Transitive fixpoint over rules that actually fire in fullState, seeded at each tech and
  // checked against baseState.known so OR-rules across selectable techs stay visible while
  // rules already satisfied without the tech (e.g. age markers) do not leak.
  const reachableRules = fullState.appliedRules.filter((r) => r.count > 0);
  const triggeredRules = (tid: number): GeneralGarrisonRule[] => {
    const tainted = new Set<number>([tid]);
    const out: GeneralGarrisonRule[] = [];
    const added = new Set<number>();
    let changed = true;
    while (changed) {
      changed = false;
      for (const r of reachableRules) {
        if (added.has(r.id)) continue;
        let touchesTainted = false;
        let untaintedBaseHits = 0;
        for (const req of r.requires) {
          if (tainted.has(req)) touchesTainted = true;
          else if (baseState.known.has(req)) untaintedBaseHits++;
        }
        if (touchesTainted && untaintedBaseHits < r.count) {
          added.add(r.id);
          tainted.add(r.id);
          out.push(r);
          changed = true;
        }
      }
    }
    return out;
  };

  const kept = new Set<number>();
  for (const t of pool) {
    const rule = data.techs[t.id]!;
    const triggered = triggeredRules(t.id);
    const effects = triggered.length ? [...rule.effects, ...triggered.flatMap((r) => r.effects)] : rule.effects;
    const locations = triggered.length
      ? [...(rule.trainingLocations ?? []), ...triggered.flatMap((r) => r.trainingLocations ?? [])]
      : (rule.trainingLocations ?? []);
    let relevant = false;
    let sizeUnits: Set<number> | null = null;
    for (const e of effects) {
      if (e.stat === 'sizeClass') {
        (sizeUnits ??= new Set()).add(e.unit);
        continue;
      }
      if (effectRelevant(e)) {
        relevant = true;
        break;
      }
    }
    if (!relevant && sizeUnits) {
      for (const uid of sizeUnits) {
        if (sizeClassChangesEntryForTech(uid, t.id, triggered)) {
          relevant = true;
          break;
        }
      }
    }
    if (relevant || unlocksProductionHere(t.id, locations)) kept.add(t.id);
  }
  for (const id of [...kept]) {
    let pre = ctx.core.techById[id]?.pre;
    while (pre && poolIds.has(pre) && !kept.has(pre)) {
      kept.add(pre);
      pre = ctx.core.techById[pre]?.pre;
    }
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
