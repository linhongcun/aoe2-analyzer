import { TECH_AKA } from '../../../data/aliases';
import { civByEn } from '../../../data';
import { DLCS } from '../../../domain/dlc';
import { techReleaseMatches } from '../../../domain/introductions';
import { norm, pyMatch } from '../../../domain/search';
import type { Tech } from '../../../domain/types';

export interface TechListFilters {
  query: string;
  type: string;
  age: string;
  building: string;
  release: string;
}

/**
 * 目录搜索：norm 后的中文名、英文名、效果 `desc` 包含查询，或 pyMatch，或已收录 TECH_AKA。
 * 不查 descEn，不查文明名，不打分，不改顺序。
 */
export function techQueryMatches(t: Pick<Tech, 'id' | 'en' | 'zh' | 'desc' | 'py' | 'pyi'>, raw: string): boolean {
  const q = norm(raw);
  if (!q) return true;
  if (norm(t.en).includes(q) || norm(t.zh).includes(q) || norm(t.desc).includes(q)) return true;
  if (TECH_AKA[t.id]?.some((alias) => norm(alias).includes(q))) return true;
  return pyMatch(t, q);
}

export function techMatches(t: Tech, filters: TechListFilters): boolean {
  return (
    techQueryMatches(t, filters.query) &&
    (!filters.type || t.type === filters.type) &&
    (!filters.age || t.age === +filters.age) &&
    (!filters.building || t.bz === filters.building) &&
    techReleaseMatches(t, filters.release)
  );
}

/** 保留 techs.json 源顺序。 */
export function filterTechList(list: readonly Tech[], filters: TechListFilters): Tech[] {
  return list.filter((t) => techMatches(t, filters));
}

export function techBuildingOptions(list: readonly Pick<Tech, 'bz'>[]): string[] {
  return [...new Set(list.map((t) => t.bz))];
}

/** 与 techReleaseMatches(..., 'none') 同一条：dlc 为 null 且没有免费更新号。 */
export function techIsUnlabeled(t: Pick<Tech, 'dlc' | 'introducedUpdate'>): boolean {
  return t.dlc === null && !t.introducedUpdate;
}

export function unlabeledTechCount(list: readonly Pick<Tech, 'dlc' | 'introducedUpdate'>[]): number {
  return list.filter((t) => techIsUnlabeled(t)).length;
}

/** 仅独特科技显示文明中文名。区域科技和通用科技（含单文明研究）留空。 */
export function techCivLabel(t: Pick<Tech, 'type' | 'civs'>): string {
  if (t.type !== 'UniqueTech') return '';
  return t.civs
    .map((en) => civByEn(en)?.zh)
    .filter((zh): zh is string => !!zh)
    .join('/');
}

/** 原版行不写「国王时代」；免费更新和未标注仍写出来。 */
export function techReleaseLabel(t: Pick<Tech, 'dlc' | 'introducedUpdate'>): string {
  if (t.introducedUpdate) return `免费更新 · ${t.introducedUpdate}`;
  if (techIsUnlabeled(t)) return '未标注';
  if (t.dlc === 0) return '';
  return t.dlc == null ? '' : (DLCS[t.dlc]?.zh ?? '');
}
