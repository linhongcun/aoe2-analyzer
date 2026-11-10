/**
 * 建筑详情的视图口径。
 * 只决定地址、名单和入口怎么呈现；不重算施工、驻军或科技效果。
 */
import { buildingMark } from './civBuildings';
import { DEFAULT_CONSTRUCTION, encodeConstruction } from './construction';
import { collapse, type Families, type FamilyEntry } from './family';
import { norm, pyMatch } from './search';
import type { Unit } from './types';

export type BuildingAnchor = 'prod' | 'tech' | 'civs' | 'history';
export type BuildingSurface = 'overview' | 'sim' | 'garrison';

/** 只有名单里的文明算选中。缺失或无效都不回退到第一位。 */
export function buildingCiv(civ: string | null, owners: readonly string[]): string | null {
  return civ && owners.includes(civ) ? civ : null;
}

/**
 * 仅有文明参数时仍是概览。
 * 旧生产、研究、文明、历史地址回到概览对应段落。
 * 非宿主的驻军地址不进入驻军工作区。
 */
export function buildingSurface(tab: string | null, host: boolean): { surface: BuildingSurface; anchor: BuildingAnchor | null } {
  if (tab === 'sim') return { surface: 'sim', anchor: null };
  if (tab === 'garrison' && host) return { surface: 'garrison', anchor: null };
  if (tab === 'prod' || tab === 'tech' || tab === 'civs' || tab === 'history') return { surface: 'overview', anchor: tab };
  return { surface: 'overview', anchor: null };
}

/** 改 tab 或文明时保留其余查询，包括时代、科技和对照。null 表示删除该参数。 */
export function patchBuildingSearch(search: string, patch: Record<string, string | null>): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  for (const [key, value] of Object.entries(patch)) {
    if (value == null) params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** 攻击、射程、最小射程、间隔有任一项不是 0，就保留整组。四项都是 0 才算没有攻击能力。 */
export function buildingHasAttack(stats: { atk: number; rng: number; minr: number; rof: number }): boolean {
  return stats.atk !== 0 || stats.rng !== 0 || stats.minr !== 0 || stats.rof !== 0;
}

/** 官方独特 / 区域只认建筑名单，不看拥有文明的数量。 */
export function buildingIdentityMark(id: number): '独特建筑' | '区域建筑' | null {
  const mark = buildingMark(id);
  if (mark === 'unique') return '独特建筑';
  if (mark === 'regional') return '区域建筑';
  return null;
}

/**
 * 已选文明时给出完整施工方案。时代是目录时代的预填。
 * 未选文明时不补默认文明，也不补名单第一位。
 */
export function buildingConstructionEntry(buildingId: number, age: number, civ: string | null): string | null {
  if (!civ) return null;
  return '/construction?' + encodeConstruction({ ...DEFAULT_CONSTRUCTION, buildingId, civ, age, techs: [] });
}

/** 先合并同名单里的精锐，再按英文名去掉重复。 */
export function productionEntries(list: readonly Unit[], families: Families): FamilyEntry[] {
  const seen = new Set<string>();
  const out: FamilyEntry[] = [];
  for (const row of collapse(list, families)) {
    if (seen.has(row.u.en)) continue;
    seen.add(row.u.en);
    out.push(row);
  }
  return out;
}

export type CatalogGroup = 'common' | 'unique' | 'regional';

export function catalogGroup(type: string): CatalogGroup {
  if (type === 'UniqueUnit' || type === 'UniqueTech') return 'unique';
  if (type === 'RegionalUnit' || type === 'RegionalTech') return 'regional';
  return 'common';
}

export type CatalogMembership = 'in' | 'out' | 'unknown';

/** 未选文明时不下三种判断。名单缺失，或同一行的名单互相矛盾，都是名单未知。 */
export function rowMembership(lists: readonly (readonly string[] | null | undefined)[], civ: string | null): CatalogMembership | null {
  if (!civ) return null;
  if (!lists.length) return 'unknown';
  let inside = false;
  let outside = false;
  for (const list of lists) {
    if (list == null) return 'unknown';
    if (list.includes(civ)) inside = true;
    else outside = true;
  }
  if (inside && outside) return 'unknown';
  if (inside) return 'in';
  if (outside) return 'out';
  return 'unknown';
}

/** 本页名单的中文名、英文名和拼音。空查询匹配全部。 */
export function catalogNameMatch(item: { zh: string; en: string; py?: string; pyi?: string }, raw: string): boolean {
  const query = norm(raw);
  if (!query) return true;
  if (norm(item.zh).includes(query) || norm(item.en).includes(query)) return true;
  return pyMatch(item, query);
}

export function catalogQueryMatch(items: readonly { zh: string; en: string; py?: string; pyi?: string }[], raw: string): boolean {
  return items.some((item) => catalogNameMatch(item, raw));
}

export interface CatalogViewRow {
  membership: CatalogMembership | null;
  match: boolean;
}

/**
 * 并集是筛选前的条数。
 * 「只看目录含有」只留下确认含有的匹配项；名单未知另计，不进当前显示。
 */
export function applyCatalogView<T extends CatalogViewRow>(rows: readonly T[], onlyContained: boolean): { union: number; shown: T[]; unknown: T[] } {
  const matched = rows.filter((row) => row.match);
  if (!onlyContained) return { union: rows.length, shown: matched, unknown: [] };
  return {
    union: rows.length,
    shown: matched.filter((row) => row.membership === 'in'),
    unknown: matched.filter((row) => row.membership === 'unknown'),
  };
}
