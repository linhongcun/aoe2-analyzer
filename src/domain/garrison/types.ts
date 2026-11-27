/** Issue 224/1526: shared garrison data, types, host lookup, and pure unit/relic firepower formulas. */
import raw from '../../../data/game/garrison_general.json';
import { GARRISON_TECH_DATA } from '../garrisonTechs';
import { GARRISON_HOST_IDS as hostIds } from '../../data/garrisonHosts';
import type { Core } from '../../data';
import type { Building, Trees } from '../types';
import { VILLAGER_UNIT_ID } from '../gameIds';
import type { GeneralGarrisonRow } from '../garrisonUrl';

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
export type GarrisonContribution = { power: number | null; powerSource: GarrisonPowerSource; reason: string };
export type GarrisonStat =
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
export interface GarrisonExplanation {
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
export interface Snapshot {
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
export interface BuildingProductionScope {
  aliases: number[];
  predecessors: number[];
  catalogSources: number[];
  trainSources: number[];
}
export interface StaticGarrisonIndex {
  eligibleIds: number[];
  eligiblePool: Set<number>;
  shapeUpgrades: Set<number>;
  usefulConditional: GeneralGarrisonRule[];
  scopeByBuilding: Map<number, BuildingProductionScope>;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export const GENERAL_GARRISON_DATA = deepFreeze(raw as unknown as GeneralGarrisonData);
export const technologyData = (data: GeneralGarrisonData) => (data === GENERAL_GARRISON_DATA ? GARRISON_TECH_DATA : data);
export const GENERAL_GARRISON_LIMIT = 32;
// buildings.json: "Villagers and Relics provide additional projectiles".
export const FORTIFIED_CHURCH_IDS = new Set([1806]);
export const unique = (ids: number[]) => [...new Set(ids)].sort((a, b) => a - b);
export const categoryNames: Record<number, string> = { 1: '村民', 2: '步行单位', 4: '骑乘单位', 8: '宗教单位', 16: '牲畜', 32: '攻城武器', 64: '船只' };

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

export function getGarrisonBuildings(ctx: GeneralGarrisonContext): Building[] {
  const ids = new Set<number>(hostIds);
  return ctx.core.buildings.filter((b) => ids.has(b.id));
}

export function acceptsTask(unit: GeneralGarrisonUnit, building: GeneralGarrisonUnit, aliases: number[]): boolean {
  return unit.garrisonTasks.some(
    (t) => (t.unitId >= 0 && aliases.includes(t.unitId)) || (t.unitId < 0 && (t.classId === building.class || (t.classId === 3 && building.class === 52))),
  );
}

/** Unit contribution is not target damage. It uses the current pinned pierce/reload/firepower fields. */
export function unitGarrisonPower(unit: GeneralGarrisonUnit, units: Record<string, GeneralGarrisonUnit>): { power: number | null; reason: string } {
  const { power, reason } = describeUnitGarrisonPower(unit, units);
  return { power, reason };
}

export function describeUnitGarrisonPower(unit: GeneralGarrisonUnit, units: Record<string, GeneralGarrisonUnit>): GarrisonContribution {
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

export function relicGarrisonPower(buildingId: number, building: GeneralGarrisonUnit, units: Record<string, GeneralGarrisonUnit>): GarrisonContribution {
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
