/**
 * 单位默认排序、筛选建模与选择器匹配（Issue 1280）。
 * 全部排序严格基于客观游戏数据字段（单位类型、生产建筑、展示时代与文明可用性），不引入主观热度。
 */
import { civByEn } from '../data';
import { UNIT_ALIASES } from '../data/aliases';
import { displayUnitAge } from './availabilityAge';
import type { FamilyEntry } from './family';
import { norm, pyMatch } from './search';
import type { Unit } from './types';
import { unitQueryMatches } from './unitFilters';
import { unitRoles, type UnitRole } from './unitRoles';

/** 核心经济/军事建筑顺序：城镇中心 → 兵营 → 靶场 → 马厩 → 攻城武器厂 → 船坞 → 修道院 → 市场 → 城堡 */
export const CORE_BUILDING_ORDER: readonly number[] = [109, 12, 87, 101, 49, 45, 104, 84, 82];

const BUILDING_RANK: Readonly<Record<number, number>> = {
  109: 0, // 城镇中心
  12: 1, // 兵营
  87: 2, // 靶场
  101: 3, // 马厩
  49: 4, // 攻城武器厂
  45: 5, // 船坞
  104: 6, // 修道院
  1806: 6, // 强化教堂（亚美尼亚/格鲁吉亚修道院对应建筑）
  84: 7, // 市场
  82: 8, // 城堡
  1251: 9, // 营垒
  1665: 10, // 城楼
};

const TYPE_GROUP_RANK: Readonly<Record<string, number>> = {
  Unit: 0,
  UnitUpgrade: 0,
  RegionalUnit: 1,
  UniqueUnit: 2,
};

const TYPE_SUB_RANK: Readonly<Record<string, number>> = {
  Unit: 0,
  UnitUpgrade: 1,
  RegionalUnit: 2,
  UniqueUnit: 3,
};

const buildingRank = (b: number) => BUILDING_RANK[b] ?? 99;
const typeGroupRank = (t: string) => TYPE_GROUP_RANK[t] ?? 3;
const typeSubRank = (t: string) => TYPE_SUB_RANK[t] ?? 4;

/** 仅认可已在 civs 目录登记的有效文明英文名；空串或损坏参数按无文明上下文处理。 */
export function resolveValidCiv(civ?: string): string | undefined {
  return civ && civByEn(civ) ? civ : undefined;
}

/** 清洗数据中用于科技树换行的建筑名（如「攻城\n武器厂」→「攻城武器厂」）。 */
export function cleanBuildingName(bz: string): string {
  return bz.replace(/\s+/g, '');
}

/** 判断家族条目在指定文明下是否可用；无有效文明上下文时恒为 true。 */
export function isUnitEntryAvailable(entry: FamilyEntry, civ?: string): boolean {
  const validCiv = resolveValidCiv(civ);
  if (!validCiv) return true;
  return entry.u.civs.includes(validCiv) || (entry.elite ? entry.elite.civs.includes(validCiv) : false);
}

/**
 * 统一默认排序（UnitPicker 与 #/units 共用，稳定纯函数）：
 * - 无有效 civ：通用单位（按核心建筑与展示时代）→ 区域单位 → 独特单位；
 * - 有有效 civ：本文明可用置顶（本文明独特单位最前，其余可用通用/区域按建筑与时代序）→ 本文明不可用沉底（沿用无 civ 序）。
 */
export function sortUnitFamilies<T extends FamilyEntry>(list: readonly T[], options?: { civ?: string }): T[] {
  const validCiv = resolveValidCiv(options?.civ);
  return list
    .map((entry, idx) => ({ entry, idx }))
    .sort((a, b) => {
      const ua = a.entry.u;
      const ub = b.entry.u;
      if (validCiv) {
        const avA = isUnitEntryAvailable(a.entry, validCiv) ? 0 : 1;
        const avB = isUnitEntryAvailable(b.entry, validCiv) ? 0 : 1;
        if (avA !== avB) return avA - avB;
        if (avA === 0) {
          const uqA = ua.type === 'UniqueUnit' ? 0 : 1;
          const uqB = ub.type === 'UniqueUnit' ? 0 : 1;
          if (uqA !== uqB) return uqA - uqB;
        } else {
          const gA = typeGroupRank(ua.type);
          const gB = typeGroupRank(ub.type);
          if (gA !== gB) return gA - gB;
        }
      } else {
        const gA = typeGroupRank(ua.type);
        const gB = typeGroupRank(ub.type);
        if (gA !== gB) return gA - gB;
      }
      const bA = buildingRank(ua.b);
      const bB = buildingRank(ub.b);
      if (bA !== bB) return bA - bB;
      const ageA = displayUnitAge(ua.id, ua.age, validCiv ?? '');
      const ageB = displayUnitAge(ub.id, ub.age, validCiv ?? '');
      if (ageA !== ageB) return ageA - ageB;
      const sA = typeSubRank(ua.type);
      const sB = typeSubRank(ub.type);
      if (sA !== sB) return sA - sB;
      return a.idx - b.idx;
    })
    .map((item) => item.entry);
}

/** 复用目录搜索规则（中/英/别名/全拼/拼音首字母），覆盖普通与精锐形态。 */
export function unitEntryMatchesQuery(entry: FamilyEntry, rawQuery: string): boolean {
  return unitQueryMatches(entry.u, rawQuery) || (!!entry.elite && unitQueryMatches(entry.elite, rawQuery));
}

type UnitMatchKind = 'none' | 'text' | 'alias' | 'py';

/** 识别命中来源：仅当条目命中且普通/精锐形态均未命中中英文本或别名时返回 'py'。 */
export function unitEntryMatchKind(entry: FamilyEntry, rawQuery: string): UnitMatchKind {
  const q = norm(rawQuery);
  if (!q) return 'none';
  const forms = entry.elite ? [entry.u, entry.elite] : [entry.u];
  if (forms.some((u) => norm(u.zh).includes(q) || norm(u.en).includes(q))) return 'text';
  if (forms.some((u) => UNIT_ALIASES[u.id]?.some((alias) => norm(alias).includes(q)))) return 'alias';
  if (forms.some((u) => pyMatch(u, q))) return 'py';
  return 'none';
}

export function unitEntryMatchesRole(entry: FamilyEntry, role: UnitRole | ''): boolean {
  if (!role) return true;
  return unitRoles(entry.u).includes(role) || (!!entry.elite && unitRoles(entry.elite).includes(role));
}

type UnitPickerGroup = 'available' | 'unavailable' | 'generic' | 'regional' | 'unique';

export type UnitPickerRow =
  | { kind: 'head'; key: string; title: string; group: UnitPickerGroup; count: number }
  | { kind: 'opt'; key: string; entry: FamilyEntry; available: boolean; matchKind: UnitMatchKind; idx: number };

interface UnitPickerModel {
  validCiv: string | undefined;
  rows: UnitPickerRow[];
  opts: FamilyEntry[];
  /** 已排序且已套用 allowUnavailable / onlyAvailable / role 过滤（仅未按 query 过滤）的候选池 */
  pool: FamilyEntry[];
  total: number;
  shown: number;
  availableCount: number;
}

interface UnitPickerModelOptions {
  list: readonly FamilyEntry[];
  civ?: string;
  query: string;
  role: UnitRole | '';
  onlyAvailable: boolean;
  allowUnavailable?: boolean;
  unavailableGroupTitle?: string;
}

export function buildUnitPickerModel(options: UnitPickerModelOptions): UnitPickerModel {
  const validCiv = resolveValidCiv(options.civ);
  const allowUnavailable = options.allowUnavailable ?? true;
  const sorted = sortUnitFamilies(options.list, { civ: validCiv });
  const availableCount = validCiv ? sorted.filter((entry) => isUnitEntryAvailable(entry, validCiv)).length : sorted.length;
  const civScoped = validCiv && (!allowUnavailable || options.onlyAvailable) ? sorted.filter((entry) => isUnitEntryAvailable(entry, validCiv)) : sorted;
  const pool = options.role ? civScoped.filter((entry) => unitEntryMatchesRole(entry, options.role)) : civScoped;
  const matched = norm(options.query) ? pool.filter((entry) => unitEntryMatchesQuery(entry, options.query)) : pool;

  const rows: UnitPickerRow[] = [];
  const opts: FamilyEntry[] = [];
  const pushGroup = (key: string, title: string, group: UnitPickerGroup, items: readonly FamilyEntry[], available: boolean) => {
    if (!items.length) return;
    rows.push({ kind: 'head', key, title, group, count: items.length });
    for (const entry of items) {
      const idx = opts.length;
      opts.push(entry);
      rows.push({
        kind: 'opt',
        key: `u-${entry.u.id}`,
        entry,
        available,
        matchKind: unitEntryMatchKind(entry, options.query),
        idx,
      });
    }
  };

  if (validCiv) {
    const civZh = civByEn(validCiv)?.zh ?? validCiv;
    const avail = matched.filter((entry) => isUnitEntryAvailable(entry, validCiv));
    const unavail = matched.filter((entry) => !isUnitEntryAvailable(entry, validCiv));
    pushGroup('h-avail', `${civZh}可用`, 'available', avail, true);
    pushGroup('h-unavail', options.unavailableGroupTitle ?? `${civZh}不可用（可选择以切换文明）`, 'unavailable', unavail, false);
  } else {
    const generic = matched.filter((entry) => entry.u.type === 'Unit' || entry.u.type === 'UnitUpgrade');
    const regional = matched.filter((entry) => entry.u.type === 'RegionalUnit');
    const unique = matched.filter((entry) => entry.u.type !== 'Unit' && entry.u.type !== 'UnitUpgrade' && entry.u.type !== 'RegionalUnit');
    pushGroup('h-generic', '通用单位', 'generic', generic, true);
    pushGroup('h-regional', '区域单位', 'regional', regional, true);
    pushGroup('h-unique', '独特单位', 'unique', unique, true);
  }

  return {
    validCiv,
    rows,
    opts,
    pool,
    total: validCiv && !allowUnavailable ? availableCount : sorted.length,
    shown: opts.length,
    availableCount,
  };
}

/**
 * Enter 快打竞态保护（对齐 CivPicker enterTarget）：
 * pool 必须为已排序且已套用 allowUnavailable / onlyAvailable / role 过滤（仅未按 query 过滤）的候选池。
 */
export function unitPickerEnterTarget(live: string, shown: string, opts: readonly FamilyEntry[], act: number, pool: readonly FamilyEntry[]): Unit | undefined {
  const ql = norm(live);
  if (ql === norm(shown)) {
    const current = opts[act];
    if (current && unitEntryMatchesQuery(current, live)) return current.u;
  }
  if (!ql) return pool[0]?.u;
  return pool.find((entry) => unitEntryMatchesQuery(entry, live))?.u;
}

/** 分批挂载切片：仅在分组下存在可见选项时输出该分组标题，避免空分组头。 */
export function sliceUnitPickerRows(rows: readonly UnitPickerRow[], limit: number): UnitPickerRow[] {
  const out: UnitPickerRow[] = [];
  let pendingHead: UnitPickerRow | null = null;
  let rendered = 0;
  for (const row of rows) {
    if (row.kind === 'head') {
      pendingHead = row;
      continue;
    }
    if (rendered >= limit) break;
    if (pendingHead) {
      out.push(pendingHead);
      pendingHead = null;
    }
    out.push(row);
    rendered += 1;
  }
  return out;
}
