import type { Civ } from '../../../domain/types';
import { dlcMatch } from '../../../domain/dlc';

/** 与 domain/search 的拼音前缀一致：只认字母，ü 写 v 或 u 都算。 */
const pyPrefix = (c: Pick<Civ, 'py' | 'pyi'>, q: string) => {
  if (!/^[a-z]+$/.test(q)) return false;
  const normalized = q.replace(/v/g, 'u');
  return [c.py, c.pyi].some((item) => !!item && item.replace(/v/g, 'u').startsWith(normalized));
};

export interface CivFilter {
  q: string;
  ty: string;
  pos: string;
  dlc: string;
}

/** 名称查找：中文、英文包含，拼音与首字母按全站前缀规则。空查询匹配全部。 */
export const civNameMatches = (c: Pick<Civ, 'zh' | 'en' | 'py' | 'pyi'>, q: string) => {
  const ql = q.trim().toLowerCase();
  if (!ql) return true;
  return c.zh.toLowerCase().includes(ql) || c.en.toLowerCase().includes(ql) || pyPrefix(c, ql.replace(/\s+/g, ''));
};

export const filterCivs = (list: Civ[], f: CivFilter) =>
  list.filter(
    (c) =>
      civNameMatches(c, f.q) && (!f.ty || (c.ty as string[]).includes(f.ty)) && (!f.pos || (f.pos === 'fl' ? c.fl >= 7 : c.pk >= 7)) && dlcMatch(c.dlc, f.dlc),
  );
