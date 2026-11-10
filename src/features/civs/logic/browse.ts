import { DLCS } from '../../../domain/dlc';
import { TYPE_ZH } from '../../../domain/ratings';
import type { CivType } from '../../../domain/types';
import type { Civ, Tech, Unit } from '../../../domain/types';
import {
  filterCivsByRequirements,
  requirementToken,
  resolveRequirements,
  type RequirementCondition,
  type RequirementContext,
  type RequirementOption,
  type RequirementRef,
} from '../../../domain/civRequirements';
import { filterCivs, type CivFilter } from './filter';

/** 列表只保留名称、类型、首发版本。位置评分不参与。 */
export interface BrowseFilters {
  q: string;
  ty: string;
  dlc: string;
}

export interface BrowseResult {
  civs: Civ[];
  blocked: boolean;
  loading: boolean;
}

const SUGGESTED_ZH = ['骑士', '弩手', '长戟兵', '血统', '扳指'] as const;

export function activeDlc(dlc: string): string {
  if (dlc === '') return '';
  const index = Number(dlc);
  return Number.isInteger(index) && DLCS[index] ? String(index) : '';
}

export function normalizeBrowseFilters(filters: BrowseFilters): BrowseFilters {
  return {
    q: filters.q,
    ty: filters.ty in TYPE_ZH ? filters.ty : '',
    dlc: activeDlc(filters.dlc),
  };
}

/** 卡片上的独特单位只保留中文部分，英文对照在全角括号之后。 */
export function uniqueUnitLabel(uu: string): string {
  const zh = uu.split('（')[0]?.trim();
  return zh || uu.trim();
}

/**
 * 名称、类型、首发版本与必备单位/科技取交集。
 * 位置参数不读取。条件未加载完或含无效项时不放宽为全体。
 */
export function browseCivs(
  list: readonly Civ[],
  filters: BrowseFilters,
  conditions: readonly RequirementCondition[],
  ctx: RequirementContext | null,
): BrowseResult {
  const normalized = normalizeBrowseFilters(filters);
  const legacy: CivFilter = { ...normalized, pos: '' };
  const base = filterCivs([...list], legacy);
  if (!conditions.length) return { civs: base, blocked: false, loading: false };
  if (!ctx) return { civs: [], blocked: false, loading: true };
  if (resolveRequirements(conditions, ctx).some((item) => item.error)) return { civs: [], blocked: true, loading: false };
  return { civs: filterCivsByRequirements(base, conditions, ctx), blocked: false, loading: false };
}

function preferredExact(zh: string, entities: readonly (Unit | Tech)[], kind: RequirementRef['kind']): RequirementOption | null {
  const hits = entities.filter((entity) => entity.zh === zh);
  const first = hits[0];
  if (!first) return null;
  const entity = hits.reduce((best, item) => (item.civs.length > best.civs.length ? item : best), first);
  return { ref: { kind, id: entity.id }, entity };
}

/** 未输入候选词时给出的常用单位与科技；同名记录取可用文明更多的一条。 */
export function suggestedRequirements(ctx: Pick<RequirementContext, 'units' | 'techs'>): RequirementOption[] {
  return SUGGESTED_ZH.flatMap((zh) => {
    const unit = preferredExact(zh, ctx.units, 'unit');
    if (unit) return [unit];
    const tech = preferredExact(zh, ctx.techs, 'tech');
    return tech ? [tech] : [];
  });
}

/** 地址栏只保留生效条件。pos 从列表链接删除；空项删除；无关参数保留。 */
export function writeBrowseQuery(current: URLSearchParams, filters: BrowseFilters, conditions: readonly RequirementCondition[]): URLSearchParams {
  const next = new URLSearchParams(current);
  const normalized = normalizeBrowseFilters(filters);
  next.delete('pos');
  if (normalized.q.trim()) next.set('q', normalized.q);
  else next.delete('q');
  if (normalized.ty) next.set('ty', normalized.ty);
  else next.delete('ty');
  if (normalized.dlc) next.set('dlc', normalized.dlc);
  else next.delete('dlc');
  if (conditions.length) next.set('req', conditions.map((item) => item.token).join(',') || ',');
  else next.delete('req');
  return next;
}

export const typeLabel = (ty: string) => (ty in TYPE_ZH ? TYPE_ZH[ty as CivType] : ty);

export function requirementKindLabel(kind: RequirementRef['kind']) {
  return kind === 'unit' ? '单位' : '科技';
}

export { requirementToken };
