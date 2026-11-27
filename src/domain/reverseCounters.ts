import { damageRows } from './damageCore';
import { fmtSide } from './duelState';
import { unitAvailable } from './unitAvailability';
import { unitOptionLabel } from './unitOptionLabel';
import { cleanBuildingName } from './unitOrder';
import type { Trees, Unit } from './types';

export interface ReverseCounterFilter {
  civ: string;
  age: number | null;
}

export interface ReverseCounterUnit {
  unit: Unit;
  members: Unit[];
  attack: number;
  armor: number;
  damage: number;
}

export interface ReverseCounterGroup {
  category: string;
  armor: number;
  rows: ReverseCounterUnit[];
}

export type ReverseCounterState = 'ready' | 'partial' | 'unreadable' | 'availability-unknown';

export interface ReverseCounterResult {
  state: ReverseCounterState;
  groups: ReverseCounterGroup[];
  problems: string[];
}

export interface ReverseCounterCatalogMeta {
  /** 目录级按同 formKey + 不同训练建筑折叠后的规范代表集合。 */
  canonicalUnits: Unit[];
  /** 属于多建筑等价类的全部单位 ID（含代表与非代表成员）。 */
  multiBuildingUnitIds: ReadonlySet<number>;
  /** 多建筑等价类映射：成员 ID -> 规范代表 ID。 */
  canonicalIdByUnitId: ReadonlyMap<number, number>;
}

interface AvailabilityCore {
  unitById: Record<number, Unit>;
}

type BuildingMap = Record<number, { zh: string } | undefined>;
type BuildingLookup = { core: { buildingById: BuildingMap } } | { buildingById: BuildingMap } | BuildingMap;

const NON_COMBAT_FORM_KEYS = new Set(['id', 'b', 'bz', 'ben', 'from_', 'civs', 'tt', 'age']);

const UNKNOWN_CLASS = '类别名称无法识别；这部分数据没有参与匹配。';
const INVALID_DATA = '目录中的类别或数值异常，结果可能不完整。';
const UNKNOWN_AVAILABILITY = '科技树资料异常或尚不可用，暂时无法确认筛选结果。';

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isCategory = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.trim() === value &&
  !/^类别\d+$/u.test(value) &&
  !value.split('').some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
const isOrdinaryAttack = (value: unknown) => value === '近战' || value === '穿刺';

export function hasValidCombatPairs(unit: Unit): boolean {
  for (const field of ['atks', 'armc', 'arms'] as const) {
    const pairs = (unit as unknown as Record<string, unknown>)[field];
    if (!Array.isArray(pairs)) return false;
    const seen = new Set<string>();
    for (const pair of pairs as unknown[]) {
      if (!Array.isArray(pair) || pair.length !== 2) return false;
      const [category, amount] = pair;
      if (typeof category !== 'string' || !category.trim() || category.trim() !== category || typeof amount !== 'number' || !Number.isFinite(amount))
        return false;
      if (seen.has(category)) return false;
      seen.add(category);
    }
  }
  return true;
}

function stableValue(value: unknown): string | null {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : null;
  if (Array.isArray(value)) {
    const values = value.map(stableValue);
    return values.some((item) => item === null) ? null : `[${values.join(',')}]`;
  }
  if (!isRecord(value)) return null;
  const values = Object.keys(value)
    .sort()
    .map((key) => {
      const item = stableValue(value[key]);
      return item === null ? null : `${JSON.stringify(key)}:${item}`;
    });
  return values.some((item) => item === null) ? null : `{${values.join(',')}}`;
}

/** Issue 1478：按全部战斗属性、造价与中英文名生成多建筑等价键，剥离非战斗生产元数据且不递归展开 from_。 */
export function reverseCounterFormKey(unit: Unit, unitById?: Record<number, Unit>): string | null {
  if (!Number.isSafeInteger(unit.id) || !Number.isSafeInteger(unit.b)) return null;
  if (unit.from_ !== null) {
    if (!Number.isSafeInteger(unit.from_)) return null;
    if (unitById && !unitById[unit.from_]) return null;
  }
  const base = Object.fromEntries(
    Object.entries(unit)
      .filter(([key]) => !NON_COMBAT_FORM_KEYS.has(key))
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  return stableValue(base);
}

function canMergeMultiBuilding<T extends { b: number }>(items: readonly T[]): boolean {
  if (items.length < 2) return false;
  const buildingCounts = new Map<number, number>();
  for (const item of items) buildingCounts.set(item.b, (buildingCounts.get(item.b) ?? 0) + 1);
  if ([...buildingCounts.values()].some((count) => count > 1)) return false;
  return buildingCounts.size >= 2;
}

/** Issue 1478：基于完整目录折叠多建筑等价类，供名称去歧义与建筑胶囊共用的元数据。 */
export function buildReverseCounterCatalogMeta(units: readonly Unit[], unitById?: Record<number, Unit>): ReverseCounterCatalogMeta {
  const sorted = units
    .filter((unit) => !!unit && typeof unit === 'object')
    .slice()
    .sort((a, b) => (Number.isSafeInteger(a.id) ? a.id : Number.MAX_SAFE_INTEGER) - (Number.isSafeInteger(b.id) ? b.id : Number.MAX_SAFE_INTEGER));
  const keyed = new Map<string, Unit[]>();
  const unkeyed: Unit[] = [];
  for (const unit of sorted) {
    const key = reverseCounterFormKey(unit, unitById);
    if (key === null) {
      unkeyed.push(unit);
      continue;
    }
    const bucket = keyed.get(key) ?? [];
    bucket.push(unit);
    keyed.set(key, bucket);
  }
  const canonicalUnits: Unit[] = [...unkeyed];
  const multiBuildingUnitIds = new Set<number>();
  const canonicalIdByUnitId = new Map<number, number>();
  for (const bucket of keyed.values()) {
    if (!canMergeMultiBuilding(bucket)) {
      canonicalUnits.push(...bucket);
      continue;
    }
    const members = bucket.slice().sort((a, b) => a.id - b.id);
    const representative = members[0]!;
    canonicalUnits.push(representative);
    for (const member of members) {
      multiBuildingUnitIds.add(member.id);
      canonicalIdByUnitId.set(member.id, representative.id);
    }
  }
  canonicalUnits.sort((a, b) => a.id - b.id);
  return { canonicalUnits, multiBuildingUnitIds, canonicalIdByUnitId };
}

function resolveBuildingMap(lookup: BuildingLookup | undefined): BuildingMap | undefined {
  if (!lookup) return undefined;
  if ('core' in lookup) return lookup.core.buildingById;
  if ('buildingById' in lookup) return lookup.buildingById;
  return lookup;
}

/**
 * Issue 1478：在反向查询中为展示单位计算去歧义主标题。
 * 以目录级多建筑折叠代表集为 siblings 基底，并按等价类替换为当前可见代表，
 * 避免合并多建筑单位或筛选收窄单建筑成员被误标建筑后缀，同时稳定区分独立同名单位。
 */
export function reverseCounterUnitLabel(
  lookup: BuildingLookup | undefined,
  unit: Unit,
  meta: ReverseCounterCatalogMeta,
  groupRows?: readonly Pick<ReverseCounterUnit, 'unit'>[],
): string {
  const byCanonicalId = new Map<number, Unit>();
  for (const canonical of meta.canonicalUnits) byCanonicalId.set(canonical.id, canonical);
  if (groupRows) {
    for (const row of groupRows) {
      const canonicalId = meta.canonicalIdByUnitId.get(row.unit.id) ?? row.unit.id;
      byCanonicalId.set(canonicalId, row.unit);
    }
  }
  const ownCanonicalId = meta.canonicalIdByUnitId.get(unit.id) ?? unit.id;
  byCanonicalId.set(ownCanonicalId, unit);
  return unitOptionLabel(resolveBuildingMap(lookup), unit, [...byCanonicalId.values()]);
}

/** Issue 1478：仅为多建筑合并行或由多建筑等价类筛选收窄为单建筑的行生成训练建筑文案。 */
export function reverseCounterBuildingsText(
  lookup: BuildingLookup | undefined,
  row: Pick<ReverseCounterUnit, 'unit' | 'members'>,
  meta: Pick<ReverseCounterCatalogMeta, 'multiBuildingUnitIds'>,
): string | null {
  const members = row.members.length ? row.members : [row.unit];
  const showBuildings = members.length > 1 || members.some((member) => meta.multiBuildingUnitIds.has(member.id));
  if (!showBuildings) return null;
  const byId = resolveBuildingMap(lookup);
  const names: string[] = [];
  const sorted = members.slice().sort((a, b) => a.id - b.id);
  for (const member of sorted) {
    const name = byId?.[member.b]?.zh || (member.bz ? cleanBuildingName(member.bz) : '');
    if (name && !names.includes(name)) names.push(name);
  }
  return names.length ? names.join(' / ') : null;
}

/** Issue 1478：按选定敌方文明与时代从合并行成员中解析首个可用形态；不可核验或全部不可用时回落代表形态。 */
export function resolveReverseCounterPkMember(
  row: Pick<ReverseCounterUnit, 'unit' | 'members'>,
  core: AvailabilityCore,
  trees: Trees | null,
  enemyCiv: string,
  age: number | null,
): Unit {
  const effectiveAge = age ?? 4;
  if (!trees || !enemyCiv || ![1, 2, 3, 4].includes(effectiveAge) || !validTreeCiv(trees, enemyCiv)) {
    return row.unit;
  }
  const ordered = [row.unit, ...row.members.filter((member) => member.id !== row.unit.id)];
  for (const member of ordered) {
    try {
      if (unitAvailable({ core, trees }, enemyCiv, member.id, effectiveAge)) return member;
    } catch {
      // 忽略异常成员，继续尝试其余成员并最终回落代表形态
    }
  }
  return row.unit;
}

function validTreeCiv(trees: Trees, civ: string): boolean {
  const raw = trees as unknown;
  if (!isRecord(raw) || !isRecord(raw.t) || !Array.isArray(raw.t[civ])) return false;
  const blocks = raw.t[civ] as unknown[];
  return (
    blocks.length > 0 &&
    blocks.some((block) => Array.isArray(block) && Array.isArray(block[3]) && block[3].length > 0) &&
    blocks.every(
      (block: unknown) =>
        Array.isArray(block) &&
        Array.isArray(block[3]) &&
        block[3].every(
          (cell: unknown) =>
            Array.isArray(cell) &&
            cell.length >= 6 &&
            Number.isSafeInteger(cell[0]) &&
            cell[0] >= 0 &&
            cell[0] <= 7 &&
            (cell[2] === 'u' || cell[2] === 't' || cell[2] === 'b') &&
            Number.isSafeInteger(cell[3]) &&
            (cell[4] === 0 || cell[4] === 1) &&
            (cell[5] === null || Number.isSafeInteger(cell[5])),
        ),
    )
  );
}

function availableCivs(trees: Trees, civNames: readonly string[], filter: ReverseCounterFilter, problems: Set<string>): string[] {
  const requested = filter.civ ? [filter.civ] : [...civNames];
  if (filter.civ && !civNames.includes(filter.civ)) {
    problems.add(UNKNOWN_AVAILABILITY);
    return [];
  }
  const valid = requested.filter((civ) => {
    if (validTreeCiv(trees, civ)) return true;
    problems.add(UNKNOWN_AVAILABILITY);
    return false;
  });
  return valid;
}

function withState(state: ReverseCounterState, groups: ReverseCounterGroup[], problems: Set<string>): ReverseCounterResult {
  return { state, groups, problems: [...problems] };
}

/** Derives category-only reverse counters from the current catalogue; never totals per-hit damage. */
export function reverseCounters(
  target: Unit,
  units: readonly Unit[],
  core: AvailabilityCore,
  civNames: readonly string[],
  trees: Trees | null,
  filter: ReverseCounterFilter,
): ReverseCounterResult {
  const problems = new Set<string>();
  const hasFilter = !!filter.civ || filter.age !== null;
  if (filter.age !== null && ![1, 2, 3, 4].includes(filter.age)) {
    problems.add(INVALID_DATA);
    return withState('unreadable', [], problems);
  }
  if (hasFilter && !trees) return withState('availability-unknown', [], new Set([UNKNOWN_AVAILABILITY]));
  if (!isRecord(target) || !Array.isArray(units) || !Array.isArray(target.armc)) {
    problems.add(INVALID_DATA);
    return withState('unreadable', [], problems);
  }
  if (!hasValidCombatPairs(target as Unit)) problems.add(INVALID_DATA);

  const armorCounts = new Map<string, number>();
  const armorValues = new Map<string, number>();
  let malformedArmor = false;
  for (const entry of target.armc as unknown[]) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      problems.add(INVALID_DATA);
      malformedArmor = true;
      continue;
    }
    const [category, armor] = entry;
    if (isOrdinaryAttack(category)) continue;
    if (!isCategory(category)) {
      problems.add(UNKNOWN_CLASS);
      continue;
    }
    armorCounts.set(category, (armorCounts.get(category) ?? 0) + 1);
    if (typeof armor !== 'number' || !Number.isFinite(armor)) {
      problems.add(INVALID_DATA);
      malformedArmor = true;
      continue;
    }
    armorValues.set(category, armor);
  }
  for (const [category, count] of armorCounts) {
    if (count > 1) {
      armorValues.delete(category);
      problems.add(INVALID_DATA);
      malformedArmor = true;
    }
  }
  if (!armorValues.size && malformedArmor) return withState('unreadable', [], problems);

  const eligibleCivs = hasFilter && trees ? availableCivs(trees, civNames, filter, problems) : [];
  if (hasFilter && (!eligibleCivs.length || !trees)) return withState('availability-unknown', [], problems);

  const byCategory = new Map<string, ReverseCounterUnit[]>();
  let parsedCandidateCount = 0;
  const candidates = units
    .filter((unit) => !!unit && typeof unit === 'object')
    .slice()
    .sort((a, b) => (Number.isSafeInteger(a.id) ? a.id : Number.MAX_SAFE_INTEGER) - (Number.isSafeInteger(b.id) ? b.id : Number.MAX_SAFE_INTEGER));
  for (const candidate of candidates) {
    if (
      !candidate ||
      !Number.isSafeInteger(candidate.id) ||
      !Number.isSafeInteger(candidate.b) ||
      typeof candidate.zh !== 'string' ||
      typeof candidate.en !== 'string'
    ) {
      problems.add(INVALID_DATA);
      continue;
    }
    if (
      !Array.isArray(candidate.atks) ||
      !Array.isArray(candidate.civs) ||
      !candidate.civs.every((civ: unknown) => typeof civ === 'string') ||
      !Number.isFinite(candidate.age)
    ) {
      problems.add(INVALID_DATA);
      continue;
    }
    if (!hasValidCombatPairs(candidate)) problems.add(INVALID_DATA);
    parsedCandidateCount++;
    const attackCounts = new Map<string, number>();
    const attacks = new Map<string, number>();
    for (const entry of candidate.atks as unknown[]) {
      if (!Array.isArray(entry) || entry.length !== 2) {
        problems.add(INVALID_DATA);
        continue;
      }
      const [category, attack] = entry;
      if (isOrdinaryAttack(category)) continue;
      if (!isCategory(category)) {
        problems.add(UNKNOWN_CLASS);
        continue;
      }
      attackCounts.set(category, (attackCounts.get(category) ?? 0) + 1);
      if (!armorValues.has(category)) continue;
      if (typeof attack !== 'number' || !Number.isFinite(attack)) {
        problems.add(INVALID_DATA);
        continue;
      }
      if (attack === 0) continue;
      attacks.set(category, attack);
    }
    for (const [category, count] of attackCounts) {
      if (count > 1) {
        attacks.delete(category);
        problems.add(INVALID_DATA);
      }
    }
    if (!attacks.size) continue;
    if (hasFilter) {
      const actualUnit = core.unitById[candidate.id];
      if (!actualUnit || !Array.isArray(actualUnit.civs)) {
        problems.add(INVALID_DATA);
        continue;
      }
      const ages = filter.age === null ? [4] : [filter.age];
      let available = false;
      try {
        available = eligibleCivs.some((civ) => ages.some((age) => unitAvailable({ core, trees: trees! }, civ, candidate.id, age)));
      } catch {
        problems.add(UNKNOWN_AVAILABILITY);
      }
      if (!available) continue;
    }

    const rows = damageRows(Object.fromEntries(attacks), Object.fromEntries(armorValues), {
      negativeAttack: true,
      missingArmor: 'skip',
    }).rows.filter((row) => row.damage > 0);
    if (!rows.length) continue;
    if (reverseCounterFormKey(candidate, core.unitById) === null) problems.add(INVALID_DATA);
    for (const row of rows) {
      const group = byCategory.get(row.category) ?? [];
      group.push({ unit: candidate, members: [candidate], attack: row.attack, armor: row.armor, damage: row.damage });
      byCategory.set(row.category, group);
    }
  }

  if (candidates.length && !parsedCandidateCount) return withState('unreadable', [], problems.size ? problems : new Set([INVALID_DATA]));

  const groups: ReverseCounterGroup[] = [];
  for (const [category, armor] of armorValues) {
    const rawRows = byCategory.get(category) ?? [];
    const keyed = new Map<string, ReverseCounterUnit[]>();
    const unkeyed: ReverseCounterUnit[] = [];
    for (const row of rawRows) {
      const key = reverseCounterFormKey(row.unit, core.unitById);
      if (key === null) {
        unkeyed.push(row);
        continue;
      }
      const rows = keyed.get(key) ?? [];
      rows.push(row);
      keyed.set(key, rows);
    }
    const merged: ReverseCounterUnit[] = [...unkeyed];
    for (const rows of keyed.values()) {
      if (!canMergeMultiBuilding(rows.map((row) => row.unit))) {
        merged.push(...rows);
        continue;
      }
      const members = rows.map((row) => row.unit).sort((a, b) => a.id - b.id);
      const representative = members[0]!;
      merged.push({ ...rows.find((row) => row.unit.id === representative.id)!, unit: representative, members });
    }
    merged.sort((a, b) => a.unit.id - b.unit.id);
    groups.push({ category, armor, rows: merged });
  }

  return withState(problems.size ? 'partial' : 'ready', groups, problems);
}

/** Returns a PK route only when both explicit sides are valid in the same directory/tree age. */
export function reverseCounterDuelHref(
  target: Unit,
  counter: Unit,
  core: AvailabilityCore,
  trees: Trees | null,
  targetCiv: string,
  counterCiv: string,
  age: number | null,
): string | null {
  if (!trees || !targetCiv || !counterCiv || age === null || ![1, 2, 3, 4].includes(age)) return null;
  if (!hasValidCombatPairs(target) || !hasValidCombatPairs(counter)) return null;
  if (!Array.isArray(target.civs) || !target.civs.includes(targetCiv) || !Array.isArray(counter.civs) || !counter.civs.includes(counterCiv)) return null;
  if (!validTreeCiv(trees, targetCiv) || !validTreeCiv(trees, counterCiv)) return null;
  try {
    if (!unitAvailable({ core, trees }, targetCiv, target.id, age) || !unitAvailable({ core, trees }, counterCiv, counter.id, age)) return null;
  } catch {
    return null;
  }
  const a = fmtSide({ uid: target.id, civ: targetCiv, age, ageSet: true, techs: [], team: [] });
  const b = fmtSide({ uid: counter.id, civ: counterCiv, age, ageSet: true, techs: [], team: [] });
  return `/duel?${new URLSearchParams({ a, b, m: '1' }).toString()}`;
}
