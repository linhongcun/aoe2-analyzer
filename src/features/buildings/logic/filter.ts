import type { Building } from '../../../domain/types';
import { dlcMatch } from '../../../domain/dlc';
export interface BuildingFilter {
  q: string;
  age: string;
  type: string;
  dlc: string;
}
export const filterBuildings = (list: Building[], f: BuildingFilter) => {
  const q = f.q.toLowerCase();
  return list.filter(
    (b) => (b.zh.includes(q) || b.en.toLowerCase().includes(q)) && (!f.age || b.age === +f.age) && (!f.type || b.type === f.type) && dlcMatch(b.dlc, f.dlc),
  );
};
