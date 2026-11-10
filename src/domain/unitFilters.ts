import { UNIT_ALIASES } from '../data/aliases';
import { dlcMatch } from './dlc';
import { collapse, type Families, type FamilyEntry } from './family';
import { norm, pyMatch } from './search';
import type { Unit } from './types';
import { unitRoles, type UnitRole } from './unitRoles';

export interface UnitFilters {
  query: string;
  type: string;
  age: string;
  dlc: string;
  civ?: string;
  role?: UnitRole | '';
}

/** 文明可用性与目录兵种必须由同一实际形态提供。 */
const available = (u: Unit, filters: UnitFilters): boolean =>
  (!filters.civ || u.civs.includes(filters.civ)) && (!filters.role || unitRoles(u).includes(filters.role));

/**
 * 目录搜索：中英包含，加上已收录别名，以及 `norm` / `pyMatch` 的全拼或首字母前缀。
 * 不打分、不按命中重排，也不查护甲类别关键词。
 */
export function unitQueryMatches(u: Pick<Unit, 'id' | 'zh' | 'en' | 'py' | 'pyi'>, raw: string): boolean {
  const q = norm(raw);
  if (!q) return true;
  if (norm(u.zh).includes(q) || norm(u.en).includes(q)) return true;
  if (UNIT_ALIASES[u.id]?.some((alias) => norm(alias).includes(q))) return true;
  return pyMatch(u, q);
}

/** 所有条件由同一条单位记录满足，不能拼接普通版和精锐版的属性。 */
export function unitMatches(u: Unit, filters: UnitFilters): boolean {
  return (
    unitQueryMatches(u, filters.query) &&
    (!filters.type || u.type === filters.type) &&
    (!filters.age || u.age === +filters.age) &&
    dlcMatch(u.dlc, filters.dlc) &&
    available(u, filters)
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
    const eligible = group.filter((form) => available(form, filters));
    const elite = eligible.find((form) => form.id === families.eliteOf[selected.id]?.id) ?? eligible.find((form) => !!families.baseOf[form.id]);
    return [{ u: selected, ...(elite ? { elite } : {}) }];
  });
}
