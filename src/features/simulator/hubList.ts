import { displayUnitAge } from '../../domain/availabilityAge';
import { collapse, type Families, type FamilyEntry } from '../../domain/family';
import { filterUnitFamilies } from '../../domain/unitFilters';
import type { UnitRole } from '../../domain/unitRoles';
import type { Unit } from '../../domain/types';

export interface SimHubFilters {
  query: string;
  civ: string;
  role: UnitRole | '';
  age: string;
}

/**
 * 只改这一页展示和时代筛选用的副本。
 * 链接只带单位 id 和可选的英文文明，不得把副本传进模拟器。
 */
export function projectDisplayAges(units: readonly Unit[], civ = ''): Unit[] {
  return units.map((unit) => {
    const age = displayUnitAge(unit.id, unit.age, civ);
    return age === unit.age ? unit : { ...unit, age };
  });
}

/** 系列总数：collapse 之后仍排除没有任何文明可训练的代表。 */
export function simHubTotal(units: readonly Unit[], families: Families): FamilyEntry[] {
  return collapse(units, families).filter((entry) => entry.u.civs.length > 0);
}

/** 搜索、文明、兵种、展示时代都走目录同一套函数，顺序不按命中重排。 */
export function simHubRows(units: readonly Unit[], families: Families, filters: SimHubFilters): FamilyEntry[] {
  const projected = projectDisplayAges(units, filters.civ);
  return filterUnitFamilies(projected, families, {
    query: filters.query,
    type: '',
    age: filters.age,
    dlc: '',
    civ: filters.civ,
    role: filters.role,
  }).filter((entry) => entry.u.civs.length > 0);
}

export function simHref(id: number, civ: string): string {
  return civ ? `/unit/${id}?tab=sim&civ=${encodeURIComponent(civ)}` : `/unit/${id}?tab=sim`;
}

/** 数据里的换行是旧卡片折行，拼回建筑名，避免把造价拆开。 */
export function buildingName(bz: string | undefined): string {
  const name = bz?.replace(/\s+/g, '') ?? '';
  return name || '—';
}
