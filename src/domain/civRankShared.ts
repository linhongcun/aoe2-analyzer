/**
 * 单位与建筑「各文明满科技对照」共享纯领域工具（issue 1387 / issue 1393）。
 */
import { civByEn, civs } from '../data';
import { AGE_ZH } from './ratings';
import { norm, pyMatch } from './search';
import type { Civ } from './types';

export type SortDir = 'asc' | 'desc';

export const RANK_EPS = 1e-6;

export const finiteOr = (value: number, fallback = 0): number => (Number.isFinite(value) ? value : fallback);

export function fmtTrim(value: number, maxDecimals: number): string {
  if (!Number.isFinite(value)) return '—';
  const factor = 10 ** maxDecimals;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? '0' : rounded.toFixed(maxDecimals).replace(/\.?0+$/, '');
}

export const cmpNum = (a: number, b: number, dir: SortDir): number => (Math.abs(a - b) <= RANK_EPS ? 0 : dir === 'desc' ? b - a : a - b);

export function matchesCivQuery(c: Pick<Civ, 'zh' | 'en' | 'py' | 'pyi'>, normalizedQuery: string): boolean {
  return c.zh.toLowerCase().includes(normalizedQuery) || c.en.toLowerCase().includes(normalizedQuery) || pyMatch(c, normalizedQuery);
}

export function formatCivList(list: readonly Civ[]): string {
  if (list.length <= 2) return list.map((c) => c.zh).join('、');
  return `${list[0]!.zh}、${list[1]!.zh} 等 ${list.length} 个文明`;
}

export interface CivRankFilterResult<Row> {
  rows: Row[];
  emptyMessage: string | null;
}

/** 文明搜索与空结果三态分类：中/英文子串匹配 + 拼音前缀（先经 norm 归一化）。 */
export function filterCivRankRows<Row extends { civ: string; civZh: string }>(
  rows: readonly Row[],
  rawQuery: string,
  entity: { zh: string; civs: readonly string[] },
  age: number,
  verb: '训练' | '建造',
): CivRankFilterResult<Row> {
  const trimmed = rawQuery.trim();
  if (!trimmed) return { rows: [...rows], emptyMessage: null };
  const q = norm(trimmed);
  if (!q) return { rows: [...rows], emptyMessage: null };

  const matched = rows.filter((r) => {
    const c = civByEn(r.civ);
    if (c) return matchesCivQuery(c, q);
    return r.civZh.toLowerCase().includes(q) || r.civ.toLowerCase().includes(q);
  });
  if (matched.length > 0) return { rows: matched, emptyMessage: null };

  const ownerSet = new Set(entity.civs);
  const allMatched = civs.filter((c) => matchesCivQuery(c, q));
  if (allMatched.length === 0) {
    return { rows: [], emptyMessage: `没有匹配「${trimmed}」的文明。` };
  }

  const laterAgeCivs = allMatched.filter((c) => ownerSet.has(c.en));
  const neverCivs = allMatched.filter((c) => !ownerSet.has(c.en));
  const ageLabel = AGE_ZH[age] ?? `${age}时代`;
  const parts: string[] = [];
  if (laterAgeCivs.length > 0) parts.push(`${formatCivList(laterAgeCivs)}在${ageLabel}不能${verb}${entity.zh}`);
  if (neverCivs.length > 0) parts.push(`${formatCivList(neverCivs)}不能${verb}${entity.zh}`);
  return { rows: [], emptyMessage: `${parts.join('；')}。` };
}
