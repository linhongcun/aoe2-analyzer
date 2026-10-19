import { dlcMatch } from './dlc';
import { collapse, type Families, type FamilyEntry } from './family';
import type { Unit } from './types';

export interface UnitFilters {
  query: string;
  type: string;
  age: string;
  dlc: string;
}

/** 所有条件由同一条单位记录满足，不能拼接普通版和精锐版的属性。 */
export function unitMatches(u: Unit, filters: UnitFilters): boolean {
  const query = filters.query.toLowerCase();
  return (
    (u.en.toLowerCase().includes(query) || u.zh.includes(query)) &&
    (!filters.type || u.type === filters.type) &&
    (!filters.age || u.age === +filters.age) &&
    dlcMatch(u.dlc, filters.dlc)
  );
}

/** 保留单位系列的既有顺序和数量口径；仅精锐版命中时，卡片代表也选精锐版。 */
export function filterUnitFamilies(list: readonly Unit[], families: Families, filters: UnitFilters): FamilyEntry[] {
  const forms = new Map<string, Unit[]>();
  for (const u of list) {
    const key = families.baseOf[u.id]?.en ?? u.en;
    const group = forms.get(key) ?? [];
    group.push(u);
    forms.set(key, group);
  }
  return collapse(list, families).flatMap(({ u }) => {
    const group = forms.get(families.baseOf[u.id]?.en ?? u.en)!;
    const matches = group.filter((form) => unitMatches(form, filters));
    // 同名生产记录或少见的第二条精锐记录也必须参与筛选。
    const selected = matches.find((form) => !families.baseOf[form.id]) ?? matches[0];
    if (!selected) return [];
    if (families.baseOf[selected.id]) return [{ u: selected }];
    const elite = group.find((form) => form.id === families.eliteOf[selected.id]?.id) ?? group.find((form) => !!families.baseOf[form.id]);
    return [{ u: selected, ...(elite ? { elite } : {}) }];
  });
}
