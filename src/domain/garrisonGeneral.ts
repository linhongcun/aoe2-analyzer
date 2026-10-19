/** Issue 224: building capacity, entry compatibility and a documented projectile model. */
import raw from '../data/garrison_general.json';
import hostIds from '../data/garrison_hosts.json';
import type { Core } from '../data';
import type { Building, Tech, Trees } from './types';
import { civStatus } from './simulator';
import { productionTechAge } from './production';

export type GarrisonEntry = 'enter' | 'created' | 'deposit';
export interface GeneralGarrisonRow {
  unitId: number;
  count: string;
  entry: GarrisonEntry;
}
export interface GeneralGarrisonConfig {
  civ: string;
  age: number;
  techs: number[];
  rows: GeneralGarrisonRow[];
}
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
  catalog?: { age: number; pic: number | string | null; civs: string[]; en: string; zh: string };
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
  unitUpgradeTechs?: Record<string, number[]>;
  conditional: GeneralGarrisonRule[];
  civs: Record<string, { automatic: GeneralGarrisonRule[]; free: number[]; disabled: number[]; baseOverrides: Record<string, Partial<GeneralGarrisonUnit>> }>;
}
export const GENERAL_GARRISON_DATA = raw as unknown as GeneralGarrisonData;
export const GENERAL_GARRISON_LIMIT = 32;
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

const unique = (ids: number[]) => [...new Set(ids)].sort((a, b) => a - b);
const earlyUnits: Record<string, Record<number, number>> = {
  Armenians: { 75: 1, 77: 2, 473: 3, 358: 2, 359: 3 },
  Cumans: { 1258: 2, 422: 3 },
  Burgundians: { 283: 3 },
  Bohemians: { 5: 3 },
};
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

export function getGarrisonBuildingAge(b: Building, civ: string) {
  return civ === 'Cumans' && b.id === 49 ? 2 : b.age;
}
function unitAge(ctx: GeneralGarrisonContext, id: number, civ: string, data: GeneralGarrisonData) {
  const u = ctx.core.unitById[id];
  if (id === 293) return 1;
  return (
    earlyUnits[civ]?.[id] ??
    Math.max(u?.age ?? ctx.core.buildingById[id]?.age ?? data.units[id]?.catalog?.age ?? 1, id === 93 ? 2 : 1, data.herdableIds.includes(id) ? 1 : 0)
  );
}
function unitAvailable(ctx: GeneralGarrisonContext, id: number, config: GeneralGarrisonConfig, data: GeneralGarrisonData): boolean {
  const u = ctx.core.unitById[id] ?? (id === 293 ? ctx.core.unitById[83] : undefined) ?? ctx.core.buildingById[id];
  if (u && !u.civs.includes(config.civ)) return false;
  if (!u && !data.herdableIds.includes(id) && !(data.specialOccupantIds ?? []).includes(id) && !(data.relicIds ?? []).includes(id)) return false;
  if (!u && data.units[id]?.catalog?.civs.length && !data.units[id]!.catalog!.civs.includes(config.civ)) return false;
  if (unitAge(ctx, id, config.civ, data) > config.age) return false;
  return civStatus(ctx.trees, config.civ)['u' + (id === 293 ? 83 : id)] !== 0;
}

function availableTechs(ctx: GeneralGarrisonContext, config: GeneralGarrisonConfig, data: GeneralGarrisonData): Tech[] {
  const status = civStatus(ctx.trees, config.civ);
  const disabled = new Set(data.civs[config.civ]?.disabled ?? []);
  return ctx.core.techs.filter(
    (t) =>
      t.civs.includes(config.civ) && status['t' + t.id] === 1 && !disabled.has(t.id) && productionTechAge(t, config.civ) <= config.age && !!data.techs[t.id],
  );
}

function implicitShapeTechs(ctx: GeneralGarrisonContext, b: Building, config: GeneralGarrisonConfig, data: GeneralGarrisonData): number[] {
  const all = new Set(Object.values(data.unitUpgradeTechs ?? {}).flat());
  const found = new Set<number>();
  const add = (id: number) => {
    if (found.has(id)) return;
    found.add(id);
    const pre = ctx.core.techById[id]?.pre;
    if (pre && all.has(pre)) add(pre);
  };
  for (const id of [b.id, ...config.rows.map((r) => r.unitId)]) for (const tid of data.unitUpgradeTechs?.[id] ?? []) add(tid);
  return [...found];
}

interface Snapshot {
  units: Record<string, GeneralGarrisonUnit>;
  building: GeneralGarrisonUnit | undefined;
  known: Set<number>;
  selected: number[];
}

function snapshot(ctx: GeneralGarrisonContext, b: Building, config: GeneralGarrisonConfig, data: GeneralGarrisonData): Snapshot {
  const civ = data.civs[config.civ];
  const units = Object.fromEntries(
    Object.entries(data.units).map(([key, u]) => [
      key,
      { ...u, ...(civ?.baseOverrides[key] ?? {}), trainLocations: (civ?.baseOverrides[key]?.trainLocations ?? u.trainLocations).map((x) => ({ ...x })) },
    ]),
  );
  const actual = data.buildings[b.id]?.eraForms[config.age - 1] ?? b.id;
  if (units[actual]) units[b.id] = { ...units[actual]!, id: b.id };
  const selected = unique([...config.techs, ...getFreeGarrisonTechs(ctx, b, config, data)]);
  const known = new Set([104]);
  const disabled = new Set(civ?.disabled ?? []);
  const implied = implicitShapeTechs(ctx, b, config, data);
  for (const tid of implied) known.add(tid);
  // Exact tower shape means the line upgrade has already been researched.
  if (b.id === 234 || b.id === 235) known.add(140);
  if (b.id === 235) known.add(63);
  const apply = (rule: GeneralGarrisonRule) => {
    for (const e of rule.effects) {
      const u = units[e.unit];
      if (u) u[e.stat] = e.op === 'set' ? e.value : e.op === 'mul' ? u[e.stat] * e.value : u[e.stat] + e.value;
    }
    for (const e of rule.trainingLocations ?? []) {
      const unit = units[e.unit];
      if (!unit) continue;
      const previous = unit.trainLocations[e.slot];
      if (previous) previous.unitId = e.location;
      else unit.trainLocations[e.slot] = { unitId: e.location, time: unit.trainLocations[0]?.time ?? 0 };
    }
  };
  for (const [index, id] of [101, 102, 103].entries())
    if (config.age >= index + 2) {
      if (data.ageRules[id]) apply(data.ageRules[id]!);
      known.add(id);
    }
  const applied = new Set<number>();
  const automatic = [...(civ?.automatic ?? [])];
  const ready = (rule: GeneralGarrisonRule) => rule.requires.filter((id) => known.has(id)).length >= rule.count;
  const advance = () => {
    let changed = true;
    while (changed) {
      changed = false;
      for (const rule of automatic)
        if (!applied.has(rule.id) && !disabled.has(rule.id) && ready(rule)) {
          apply(rule);
          applied.add(rule.id);
          known.add(rule.id);
          changed = true;
        }
    }
  };
  advance();
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
  return { units, building: units[b.id], known, selected };
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

function candidate(
  ctx: GeneralGarrisonContext,
  b: Building,
  config: GeneralGarrisonConfig,
  id: number,
  state: Snapshot,
  data: GeneralGarrisonData,
): GarrisonCandidate | null {
  if (id === 286) return null; // Carrier representation is used to validate relic deposits, never as a second occupant.
  const u = state.units[id],
    B = state.building;
  if (!u || !B || !unitAvailable(ctx, id, config, data)) return null;
  const mask = garrisonUnitMask(u);
  const aliases = data.buildings[b.id]?.aliases ?? [b.id];
  const canEnter = B.capacity > 0 && mask !== null && (B.garrisonType & mask) !== 0 && acceptsTask(u, B, aliases);
  const predecessors = data.buildings[b.id]?.predecessors ?? aliases;
  let canCreate = B.capacity > 0 && u.trainLocations.some((t) => predecessors.includes(t.unitId));
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
  const core = ctx.core.unitById[id] ?? (id === 293 ? ctx.core.unitById[83] : undefined) ?? ctx.core.buildingById[id];
  return {
    id,
    zh: id === 293 ? '女村民' : u.zh,
    en: u.en,
    age: unitAge(ctx, id, config.civ, data),
    pic: core?.pic ?? u.catalog?.pic ?? 0,
    category: relic ? '圣物' : mask === null ? '其他单位' : (categoryNames[mask] ?? '其他单位'),
    canEnter,
    canCreate,
    canDeposit,
    reason: canDeposit
      ? '通过持有圣物的僧侣存放；此预览只计容量，不估算圣物资源收益。'
      : canEnter
        ? '可从外部进入驻军。'
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
  const state = snapshot(ctx, b, config, data);
  return unique([...data.rosterIds, ...data.herdableIds, ...(data.specialOccupantIds ?? []).filter((id) => id !== 286), ...(data.relicIds ?? [])])
    .map((id) => candidate(ctx, b, config, id, state, data))
    .filter((u): u is GarrisonCandidate => u !== null && (u.canEnter || u.canCreate || u.canDeposit));
}

/** Covers the whole eligible roster so removing a row never invalidates its selected technologies. */
export function getGarrisonTechs(ctx: GeneralGarrisonContext, b: Building, config: GeneralGarrisonConfig, data = GENERAL_GARRISON_DATA): Tech[] {
  const targets = new Set([b.id, ...data.rosterIds, ...data.herdableIds]);
  for (const id of [...targets]) {
    const unit = data.units[id];
    if (unit?.secondaryProjectile && unit.secondaryProjectile >= 0) targets.add(unit.secondaryProjectile);
  }
  const shapeUpgrades = new Set(Object.values(data.unitUpgradeTechs ?? {}).flat());
  return availableTechs(ctx, config, data).filter(
    (t) =>
      !shapeUpgrades.has(t.id) &&
      (data.techs[t.id]!.effects.some((e) => targets.has(e.unit)) || (data.techs[t.id]!.trainingLocations?.length ?? 0) > 0 || [16, 483, 755].includes(t.id)),
  );
}

export function getFreeGarrisonTechs(ctx: GeneralGarrisonContext, b: Building, config: GeneralGarrisonConfig, data = GENERAL_GARRISON_DATA): number[] {
  const available = new Set(availableTechs(ctx, config, data).map((t) => t.id));
  const known = new Set(config.techs);
  for (const tid of implicitShapeTechs(ctx, b, config, data)) known.add(tid);
  const shapeUpgrades = new Set(Object.values(data.unitUpgradeTechs ?? {}).flat());
  for (const tid of [...known]) {
    let pre = ctx.core.techById[tid]?.pre;
    while (pre && shapeUpgrades.has(pre) && !known.has(pre)) {
      known.add(pre);
      pre = ctx.core.techById[pre]?.pre;
    }
  }
  const accepted: number[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of data.civs[config.civ]?.free ?? []) {
      const pre = ctx.core.techById[id]?.pre;
      if (accepted.includes(id) || !available.has(id) || (shapeUpgrades.has(id) && !known.has(id)) || (pre && available.has(pre) && !known.has(pre))) continue;
      accepted.push(id);
      known.add(id);
      changed = true;
    }
  }
  return unique(accepted);
}

export function toggleGeneralGarrisonTech(
  ctx: GeneralGarrisonContext,
  b: Building,
  config: GeneralGarrisonConfig,
  id: number,
  data = GENERAL_GARRISON_DATA,
): number[] {
  const available = new Set(getGarrisonTechs(ctx, b, config, data).map((t) => t.id));
  const free = new Set(getFreeGarrisonTechs(ctx, b, config, data));
  const selected = new Set([...config.techs, ...free]);
  if (!available.has(id) || free.has(id)) return unique([...selected]);
  if (selected.has(id)) {
    selected.delete(id);
    let changed = true;
    while (changed) {
      changed = false;
      for (const tid of selected) {
        const pre = ctx.core.techById[tid]?.pre;
        if (pre && available.has(pre) && !selected.has(pre)) {
          selected.delete(tid);
          changed = true;
        }
      }
    }
  } else {
    const add = (tid: number) => {
      if (selected.has(tid)) return;
      selected.add(tid);
      const pre = ctx.core.techById[tid]?.pre;
      if (pre && available.has(pre)) add(pre);
    };
    add(id);
  }
  return unique([...selected]);
}

/** Unit contribution is not target damage. It uses the current pinned pierce/reload/firepower fields. */
export function unitGarrisonPower(unit: GeneralGarrisonUnit, units: Record<string, GeneralGarrisonUnit>): { power: number | null; reason: string } {
  if (!Number.isFinite(unit.firepower) || !Number.isFinite(unit.attack)) return { power: null, reason: '驻军贡献字段无效。' };
  if (unit.firepower === 0) return { power: 0, reason: '该单位的驻军火力系数为 0，不增加弹丸。' };
  if (unit.firepower < 0) {
    if (unit.attack === 0) return { power: -unit.firepower, reason: '按数据中的固定驻军火力计入。' };
    if (!(unit.reload > 0)) return { power: null, reason: '该单位的攻击间隔无效，无法计算驻军贡献。' };
    return { power: unit.attack / unit.reload - unit.firepower, reason: '穿刺秒伤加上数据中的固定驻军火力。' };
  }
  if (!(unit.reload > 0)) return { power: null, reason: '该单位的攻击间隔无效，无法计算驻军贡献。' };
  const extra = Math.max(0, unit.total - 1);
  if (extra > 0) {
    if (unit.secondaryProjectile === -1) return { power: null, reason: '当前多弹丸形式尚未建模；容量与入驻方式仍可查看。' };
    const projectile = units[unit.secondaryProjectile];
    if (!projectile || !Number.isFinite(projectile.attack)) return { power: null, reason: '副弹丸数据缺失，容量有效，但暂不计算该单位的弹丸贡献。' };
    return {
      power: (unit.firepower * (unit.attack + 0.8 * extra * projectile.attack)) / unit.reload,
      reason: '主弹丸与副弹丸按文档模型折算，再应用固定版本火力系数。',
    };
  }
  return { power: (unit.attack * unit.firepower) / unit.reload, reason: '按穿刺攻击、攻击间隔和驻军火力系数折算。' };
}

export function calculateGeneralGarrison(
  ctx: GeneralGarrisonContext,
  b: Building,
  config: GeneralGarrisonConfig,
  data = GENERAL_GARRISON_DATA,
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
  if (!Number.isSafeInteger(config.age) || config.age < getGarrisonBuildingAge(b, config.civ) || config.age > 4) out.errors.push('时代无效或早于此建筑。');
  if (config.rows.length > GENERAL_GARRISON_LIMIT) out.errors.push(`方案最多包含 ${GENERAL_GARRISON_LIMIT} 种驻军记录。`);
  const available = new Set(getGarrisonTechs(ctx, b, config, data).map((t) => t.id));
  for (const id of config.techs)
    if (!Number.isSafeInteger(id) || !available.has(id)) out.errors.push(`${ctx.core.techById[id]?.zh ?? `科技 ${id}`}不可用或不影响驻军预览。`);
  if (out.errors.length) return out;
  const state = snapshot(ctx, b, config, data),
    B = state.building;
  out.selected = state.selected;
  for (const id of state.selected) {
    const tech = ctx.core.techById[id];
    if (tech?.pre && available.has(tech.pre) && !state.known.has(tech.pre)) out.errors.push(`${tech.zh}缺少前置科技。`);
  }
  if (!B || !Number.isSafeInteger(B.capacity) || B.capacity < 0 || B.capacity > 255) out.errors.push('固定版本建筑容量数据无效。');
  if (!B || out.errors.length) return out;
  out.capacity = B.capacity;
  const seen = new Set<string>();
  let power: number | null = 0;
  for (const row of config.rows) {
    const key = row.unitId + ':' + row.entry;
    if (seen.has(key)) out.errors.push('同一单位与入驻方式不能重复，请合并人数。');
    seen.add(key);
    if (!Number.isSafeInteger(row.unitId) || !['enter', 'created', 'deposit'].includes(row.entry)) out.errors.push('驻军单位或入驻方式无效。');
    const unit = state.units[row.unitId],
      item = candidate(ctx, b, config, row.unitId, state, data);
    if (!unit || !item || !(row.entry === 'enter' ? item.canEnter : row.entry === 'deposit' ? item.canDeposit : item.canCreate))
      out.errors.push(`${unit?.zh ?? `单位 ${row.unitId}`}不能以所选方式驻军。`);
    const validCount = /^\d+$/.test(row.count) && Number.isSafeInteger(Number(row.count)) && Number(row.count) <= B.capacity;
    if (!validCount) out.errors.push(`驻军数量须为 0–${B.capacity} 的整数。`);
    const countValue = validCount ? Number(row.count) : 0;
    out.usedSlots += countValue;
    const contribution =
      row.entry === 'deposit'
        ? { power: 0, reason: '圣物存放只计容量，不增加弹丸；不估算资源收益。' }
        : unit
          ? unitGarrisonPower(unit, state.units)
          : { power: null, reason: '单位数据缺失。' };
    const total = contribution.power === null ? null : contribution.power * countValue;
    if (countValue > 0) power = power === null || total === null ? null : power + total;
    if (total === null && countValue > 0) out.warnings.push(contribution.reason);
    if (unit && countValue > 0 && unit.firepower > 0 && unit.total > 1) out.warnings.push('多弹丸驻军按公开公式估算，未完成 DE 185872 客户端对账。');
    if (unit && countValue > 0 && [6, 7].includes(unit.chargeType)) out.warnings.push('充能单位按普通未充能齐射估算，不计临时最大弹丸数与战斗充能状态。');
    if (row.unitId === 434 && countValue > 0) out.warnings.push('国王驻军仅适用于包含国王的对局模式。');
    out.rows.push({
      ...row,
      zh: unit?.zh ?? `单位 ${row.unitId}`,
      canEnter: item?.canEnter ?? false,
      canCreate: item?.canCreate ?? false,
      canDeposit: item?.canDeposit ?? false,
      countValue,
      powerEach: contribution.power,
      powerTotal: total,
      reason: contribution.reason,
    });
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
  out.buildingPower = (hasSecondary ? (state.units[B.secondaryProjectile]?.attack ?? B.attack) : B.attack) / B.reload;
  if (hasSecondary && state.units[B.secondaryProjectile]?.attack !== B.attack)
    out.warnings.push('建筑副弹丸攻击与建筑面板不同；本模型按副弹丸火力计算阈值，未完成固定版本客户端对账。');
  if (!(out.buildingPower > 0) || !Number.isFinite(out.buildingPower)) {
    out.warnings.push('建筑副弹丸火力未核实；容量与兼容性仍有效。');
    out.extraProjectiles = null;
    out.totalProjectiles = null;
    return out;
  }
  const countShots = (p: number) => {
    const slots = Math.min(B.max, B.total + Math.floor(p / out.buildingPower! + 1e-9));
    return hasPrimary ? Math.max(1, slots) : Math.max(0, slots - 1);
  };
  out.baseProjectiles = countShots(0);
  out.maxProjectiles = hasPrimary ? Math.max(1, B.max) : Math.max(0, B.max - 1);
  if (power === null) {
    out.extraProjectiles = null;
    out.totalProjectiles = null;
    return out;
  }
  out.totalProjectiles = countShots(power);
  out.extraProjectiles = out.totalProjectiles - out.baseProjectiles;
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
    rows.push({ unitId: 83, count, entry: 'enter' });
  } else if ([109, 79, 234, 235].includes(b.id)) rows.push({ unitId: 83, count: '0', entry: 'enter' });
  if (rows.length > GENERAL_GARRISON_LIMIT) errors.push(`驻军列表最多 ${GENERAL_GARRISON_LIMIT} 项。`);
  return { config: { civ: params.get('civ') ?? b.civs[0]!, age: age === null ? Math.max(3, b.age) : Number(age), techs: unique(techs), rows }, errors };
}

export function writeGeneralGarrison(config: GeneralGarrisonConfig): URLSearchParams {
  return new URLSearchParams({
    tab: 'garrison',
    gv: '2',
    civ: config.civ,
    age: String(config.age),
    gtechs: unique(config.techs).join(','),
    army: config.rows.map((r) => `${r.unitId}:${r.count}:${r.entry === 'enter' ? 'e' : r.entry === 'deposit' ? 'd' : 'c'}`).join(','),
  });
}
