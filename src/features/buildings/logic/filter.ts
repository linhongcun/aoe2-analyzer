import { dlcMatch } from '../../../domain/dlc';
import { norm, pyMatch } from '../../../domain/search';
import type { Building } from '../../../domain/types';

export interface BuildingFilter {
  q: string;
  age: string;
  type: string;
  dlc: string;
}

/** 中英包含，外加仓库 `norm` / `pyMatch` 的全拼或首字母前缀。不打分、不重排，也不使用未收录别名。 */
export function buildingQueryMatches(b: Pick<Building, 'zh' | 'en' | 'py' | 'pyi'>, raw: string): boolean {
  const q = norm(raw);
  if (!q) return true;
  return norm(b.zh).includes(q) || norm(b.en).includes(q) || pyMatch(b, q);
}

/** 同一条记录同时满足搜索、类型、目录时代和资料片。保持源顺序。 */
export const filterBuildings = (list: Building[], f: BuildingFilter) =>
  list.filter((b) => buildingQueryMatches(b, f.q) && (!f.age || b.age === +f.age) && (!f.type || b.type === f.type) && dlcMatch(b.dlc, f.dlc));
