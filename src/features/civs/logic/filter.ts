import type { Civ } from '../../../domain/types';
import { dlcMatch } from '../../../domain/dlc';
export interface CivFilter {
  q: string;
  ty: string;
  pos: string;
  dlc: string;
}
export const filterCivs = (list: Civ[], f: CivFilter) => {
  const q = f.q.toLowerCase();
  return list.filter(
    (c) =>
      (c.en.toLowerCase().includes(q) || c.zh.includes(q)) &&
      (!f.ty || (c.ty as string[]).includes(f.ty)) &&
      (!f.pos || (f.pos === 'fl' ? c.fl >= 7 : c.pk >= 7)) &&
      dlcMatch(c.dlc, f.dlc),
  );
};
