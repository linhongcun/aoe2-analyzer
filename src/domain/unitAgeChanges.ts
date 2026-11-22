/**
 * 单位详情「升时代自动变化」领域计算（Issue 1339）。
 * 纯函数、零 React 依赖、零单位 ID 白名单：完全按固定数据中的通用/限定文明自动规则推导。
 */
import { ECO } from '../data/eco';
import { trainingUnitAge } from './availabilityAge';
import { DAT, toEffects, type DatFx, type DatGeneric } from './datEffects';
import { GENERAL_GARRISON_DATA } from './garrisonGeneral';
import { formatHp } from './hpFormat';
import { applyEffects, baseStats } from './simulator';
import type { StatSet, Unit } from './types';

type ScalarAutoStatKey = 'hp' | 'atk' | 'ma' | 'pa' | 'los' | 'spd' | 'gar' | 'bt';
type AutoStatKey = ScalarAutoStatKey | `bonus:${string}`;

type TriggerAge = 2 | 3 | 4;

interface AgeDeltaSource {
  age: TriggerAge;
  delta: number;
}

export interface UnitAgeChangeRow {
  key: AutoStatKey;
  label: string;
  before: number;
  after: number;
  delta: number;
  /** 仅「出现时已生效」行存在，按规则时代升序记录各时代贡献增量 */
  sources?: AgeDeltaSource[];
}

interface UnitAgeUpgradeStage {
  age: number;
  fromAge: number;
  rows: UnitAgeChangeRow[];
}

interface UnitAgeChangesReady {
  state: 'ready';
  earliestAge: number;
  layout: 'compact' | 'cards';
  activeRows: UnitAgeChangeRow[];
  upgradeStages: UnitAgeUpgradeStage[];
}

type UnitAgeChangesResult = UnitAgeChangesReady | { state: 'pending' } | null;

export interface UnitAgeChangesDeps {
  generic?: readonly DatGeneric[];
  ecoUnits?: Readonly<Record<string, { trainTime: number; timeAt?: Readonly<Record<string, number>> }>>;
  garrisonCivs?: Readonly<Record<string, { startingScoutId?: number }>>;
}

const VALID_TRIGGER_AGES = new Set([2, 3, 4]);
const VALID_APPEAR_AGES = new Set([1, 2, 3, 4]);
const VALID_OPS = new Set(['add', 'mul', 'set']);
const VALID_BONUS_OPS = new Set(['add', 'mul']);
const EPSILON = 1e-9;

const SCALAR_LABELS: Readonly<Record<ScalarAutoStatKey, string>> = {
  hp: '生命值',
  atk: '攻击',
  ma: '近战护甲',
  pa: '穿刺护甲',
  los: '视野',
  spd: '移动速度',
  gar: '载量',
  bt: '训练时间',
};

const STAT_RANK: Readonly<Record<ScalarAutoStatKey, number>> = {
  hp: 0,
  atk: 1,
  ma: 2,
  pa: 3,
  los: 5,
  spd: 6,
  gar: 7,
  bt: 8,
};

function isScalarAutoStatKey(key: string): key is ScalarAutoStatKey {
  return Object.hasOwn(SCALAR_LABELS, key);
}

function statRank(key: AutoStatKey): number {
  return key.startsWith('bonus:') ? 4 : STAT_RANK[key as ScalarAutoStatKey];
}

function compareStatKeys(a: AutoStatKey, b: AutoStatKey): number {
  const rankDiff = statRank(a) - statRank(b);
  if (rankDiff !== 0) return rankDiff;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function statLabel(key: AutoStatKey): string {
  if (key.startsWith('bonus:')) return `对${key.slice('bonus:'.length)}加成`;
  return SCALAR_LABELS[key as ScalarAutoStatKey];
}

function fxKey(fx: DatFx): AutoStatKey | null {
  if (fx.s === 'bonus') {
    return typeof fx.vs === 'string' && fx.vs.length > 0 ? `bonus:${fx.vs}` : null;
  }
  return isScalarAutoStatKey(fx.s) ? fx.s : null;
}

function validRawFx(fx: DatFx): boolean {
  if (!Number.isFinite(fx.v)) return false;
  const key = fxKey(fx);
  if (!key) return false;
  const op = fx.op ?? 'add';
  if (fx.s === 'bonus') return VALID_BONUS_OPS.has(op);
  if (!VALID_OPS.has(op)) return false;
  if (fx.s === 'bt' && (op === 'mul' || op === 'set') && fx.v <= 0) return false;
  return true;
}

function cloneStatSet(s: StatSet): StatSet {
  return { ...s, bonus: { ...s.bonus }, armc: { ...s.armc } };
}

function readStat(s: StatSet, key: AutoStatKey): number {
  if (key.startsWith('bonus:')) {
    const vs = key.slice('bonus:'.length);
    return s.bonus[vs] ?? 0;
  }
  return s[key as ScalarAutoStatKey];
}

function formatNum(value: number): string {
  const rounded = Number(value.toFixed(3));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** 统一数值展示格式（hp 复用两位舍入，bt 带「 秒」单位）。 */
export function formatAutoStatValue(value: number, key: AutoStatKey): string {
  const body = key === 'hp' ? formatHp(value) : formatNum(value);
  return key === 'bt' ? `${body} 秒` : body;
}

/** 统一增量展示格式（含 +/- 号与单位后缀，供升时代增量列、出现时已生效来源与紧凑横条共用）。 */
export function formatAutoStatDelta(delta: number, key: AutoStatKey): string {
  const sign = delta > 0 ? '+' : '-';
  const abs = Math.abs(delta);
  const body = key === 'hp' ? formatHp(abs) : formatNum(abs);
  return key === 'bt' ? `${sign}${body} 秒` : `${sign}${body}`;
}

/**
 * 判定 generic 规则在当前文明语境下是否适用：
 * - 无 civs 限制：通用适用；
 * - 有非空 civ：严格要求 civ ∈ entry.civs（fail-closed）；
 * - 无文明语境（undefined 或 ''）：仅当该单位全部可用文明均在 entry.civs 内时适用，避免把局部文明规则泛化。
 */
export function entryMatchesCiv(entry: DatGeneric, unit: Pick<Unit, 'civs'>, civ?: string): boolean {
  if (!entry.civs || entry.civs.length === 0) return true;
  if (civ) return entry.civs.includes(civ);
  return unit.civs.length > 0 && unit.civs.every((c) => entry.civs!.includes(c));
}

/**
 * 单位在当前文明语境下的最早出现时代（零白名单）：
 * - 开局单位（garrison_general.json startingScoutId）算黑暗时代（1）；
 * - 其余复用 availabilityAge.ts 的 trainingUnitAge（含长矛兵与亚美尼亚等提前解锁）。
 */
export function earliestUnitAge(
  unit: Pick<Unit, 'id' | 'age'>,
  civ?: string,
  garrisonCivs: Readonly<Record<string, { startingScoutId?: number }>> = GENERAL_GARRISON_DATA.civs,
): number {
  if (civ) {
    if (Object.hasOwn(garrisonCivs, civ) && garrisonCivs[civ]?.startingScoutId === unit.id) return 1;
    return trainingUnitAge(civ, unit.id, unit.age);
  }
  if (Object.values(garrisonCivs).some((entry) => entry.startingScoutId === unit.id)) return 1;
  return trainingUnitAge('', unit.id, unit.age);
}

/**
 * 计算单位详情「升时代自动变化」投影。
 * 显式传入非空 civ 但该文明既无法训练且非开局拥有该单位时返回 null；
 * 无命中规则返回 null；命中但数据异常或出现未映射属性键时 fail-closed 返回 { state: 'pending' }。
 */
export function unitAgeChanges(unit: Unit, civ?: string, deps: UnitAgeChangesDeps = {}): UnitAgeChangesResult {
  const source = deps.generic ?? DAT.generic;
  const ecoUnits = deps.ecoUnits ?? ECO.units;
  const garrisonCivs = deps.garrisonCivs ?? GENERAL_GARRISON_DATA.civs;

  if (civ && !unit.civs.includes(civ) && !(Object.hasOwn(garrisonCivs, civ) && garrisonCivs[civ]?.startingScoutId === unit.id)) {
    return null;
  }

  const matchedEntries = source.filter(
    (entry) =>
      entry.req.length === 0 && entry.any === false && entryMatchesCiv(entry, unit, civ) && entry.rules.some((rule) => !rule.b && rule.t.includes(unit.id)),
  );
  if (matchedEntries.length === 0) return null;

  const byAge = new Map<number, DatFx[]>();
  const allTouchedKeys = new Set<AutoStatKey>();
  let totalRawFx = 0;

  for (const entry of matchedEntries) {
    if (!VALID_TRIGGER_AGES.has(entry.age)) return { state: 'pending' };
    const unitRules = entry.rules.filter((rule) => !rule.b && rule.t.includes(unit.id));
    for (const rule of unitRules) {
      for (const fx of rule.fx) {
        totalRawFx++;
        if (!validRawFx(fx)) return { state: 'pending' };
        const key = fxKey(fx);
        if (!key) return { state: 'pending' };
        allTouchedKeys.add(key);
        const bucket = byAge.get(entry.age);
        if (bucket) bucket.push(fx);
        else byAge.set(entry.age, [fx]);
      }
    }
  }
  if (totalRawFx === 0) return null;

  const earliestAge = earliestUnitAge(unit, civ, garrisonCivs);
  if (!VALID_APPEAR_AGES.has(earliestAge)) return { state: 'pending' };

  const cur = baseStats(unit);

  // 载量起点取 unit.garrisonCapacity（与 UnitTransportCapacity 同源；baseStats 中 gar 恒为 0）
  if (allTouchedKeys.has('gar')) {
    const cap = unit.garrisonCapacity;
    if (typeof cap !== 'number' || !Number.isSafeInteger(cap) || cap < 0) return { state: 'pending' };
    cur.gar = cap;
  }

  // 训练时间起点与 production.ts 同源：eco.units[id].timeAt[u.b] ?? eco.units[id].trainTime ?? u.tt
  if (allTouchedKeys.has('bt')) {
    const idKey = String(unit.id);
    const bKey = String(unit.b);
    const ecoUnit = Object.hasOwn(ecoUnits, idKey) ? ecoUnits[idKey] : undefined;
    const timeAt = ecoUnit?.timeAt;
    const baseBt = timeAt && Object.hasOwn(timeAt, bKey) ? timeAt[bKey] : (ecoUnit?.trainTime ?? unit.tt);
    if (typeof baseBt !== 'number' || !Number.isFinite(baseBt) || baseBt <= 0) return { state: 'pending' };
    cur.bt = baseBt;
  }

  // 校验所有受影响属性的基础值均有限（未受影响的显式 0 或其他损坏字段不误伤）
  for (const key of allTouchedKeys) {
    if (key.startsWith('bonus:')) {
      const vs = key.slice('bonus:'.length);
      if (unit.atks.some(([cls, val]) => cls === vs && !Number.isFinite(val))) return { state: 'pending' };
    }
    if (!Number.isFinite(readStat(cur, key))) return { state: 'pending' };
  }

  const catalogBase = cloneStatSet(cur);
  const activeContribs = new Map<AutoStatKey, AgeDeltaSource[]>();
  let activeEndState: StatSet | null = null;
  const upgradeStages: UnitAgeUpgradeStage[] = [];

  for (const age of [2, 3, 4] as const) {
    const rawList = byAge.get(age);
    if (!rawList || rawList.length === 0) continue;

    const before = cloneStatSet(cur);
    const effects = toEffects(rawList);
    if (effects.length !== rawList.length) return { state: 'pending' };
    applyEffects(cur, effects);

    const touchedInAge = new Set<AutoStatKey>();
    for (const fx of rawList) {
      const key = fxKey(fx);
      if (key) touchedInAge.add(key);
    }

    const stageRows: UnitAgeChangeRow[] = [];
    for (const key of touchedInAge) {
      const beforeVal = readStat(before, key);
      const afterVal = readStat(cur, key);
      if (!Number.isFinite(beforeVal) || !Number.isFinite(afterVal)) return { state: 'pending' };
      if (key === 'bt' && afterVal <= 0) return { state: 'pending' };
      const delta = afterVal - beforeVal;
      if (Math.abs(delta) <= EPSILON) continue;

      if (age <= earliestAge) {
        const list = activeContribs.get(key);
        if (list) list.push({ age, delta });
        else activeContribs.set(key, [{ age, delta }]);
      } else {
        stageRows.push({ key, label: statLabel(key), before: beforeVal, after: afterVal, delta });
      }
    }

    if (age <= earliestAge) {
      activeEndState = cloneStatSet(cur);
    } else if (stageRows.length > 0) {
      stageRows.sort((a, b) => compareStatKeys(a.key, b.key));
      upgradeStages.push({ age, fromAge: age - 1, rows: stageRows });
    }
  }

  const activeRows: UnitAgeChangeRow[] = [];
  if (activeContribs.size > 0 && activeEndState) {
    for (const [key, sources] of activeContribs) {
      const beforeVal = readStat(catalogBase, key);
      const afterVal = readStat(activeEndState, key);
      if (!Number.isFinite(beforeVal) || !Number.isFinite(afterVal)) return { state: 'pending' };
      if (key === 'bt' && afterVal <= 0) return { state: 'pending' };
      const delta = afterVal - beforeVal;
      if (Math.abs(delta) <= EPSILON) continue;
      activeRows.push({ key, label: statLabel(key), before: beforeVal, after: afterVal, delta, sources });
    }
    activeRows.sort((a, b) => compareStatKeys(a.key, b.key));
  }

  const totalRows = activeRows.length + upgradeStages.reduce((sum, stage) => sum + stage.rows.length, 0);
  if (totalRows === 0) return null;

  return {
    state: 'ready',
    earliestAge,
    layout: totalRows === 1 ? 'compact' : 'cards',
    activeRows,
    upgradeStages,
  };
}
