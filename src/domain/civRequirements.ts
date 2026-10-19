/** issue 206：文明的必备单位/科技交集。条件保留具体形态和类型；非法条件不会放宽结果。 */
import type { Civ, Tech, Trees, Unit } from './types';
import { civStatus } from './simulator';

export interface RequirementRef {
  kind: 'unit' | 'tech';
  id: number;
}
export interface RequirementCondition {
  token: string;
  ref: RequirementRef | null;
}
export interface RequirementContext {
  units: readonly Unit[];
  techs: readonly Tech[];
  trees: Trees;
}
export interface ResolvedRequirement extends RequirementCondition {
  entity: Unit | Tech | null;
  error: string | null;
}
export interface CivRequirementFilters {
  q: string;
  ty: string;
  pos: string;
  dlc: string;
}
export const EMPTY_CIV_FILTERS: CivRequirementFilters = { q: '', ty: '', pos: '', dlc: '' };
export const requirementToken = (ref: RequirementRef) => `${ref.kind === 'unit' ? 'u' : 't'}:${ref.id}`;

/** 接受 getAll('req')；重复 query 键均参与 AND，格式错误和空片段保留供删除。 */
export function parseRequirements(values: readonly string[]): RequirementCondition[] {
  const seen = new Set<string>();
  return values.flatMap((value) =>
    value === ''
      ? []
      : value.split(',').flatMap((token) => {
          const match = /^(u|t):([1-9]\d*)$/.exec(token);
          const id = match ? Number(match[2]) : NaN;
          const ref: RequirementRef | null = match && Number.isSafeInteger(id) ? { kind: match[1] === 'u' ? 'unit' : 'tech', id } : null;
          const key = ref ? requirementToken(ref) : `invalid:${token}`;
          if (seen.has(key)) return [];
          seen.add(key);
          return [{ token: ref ? requirementToken(ref) : token, ref }];
        }),
  );
}

export function resolveRequirements(conditions: readonly RequirementCondition[], ctx: Pick<RequirementContext, 'units' | 'techs'>): ResolvedRequirement[] {
  const units = new Map(ctx.units.map((u) => [u.id, u]));
  const techs = new Map(ctx.techs.map((t) => [t.id, t]));
  return conditions.map((condition) => {
    if (!condition.ref) return { ...condition, entity: null, error: '条件格式无效，请移除后重新添加。' };
    const { kind, id } = condition.ref;
    const entity = (kind === 'unit' ? units : techs).get(id) ?? null;
    return { ...condition, entity, error: entity ? null : `该${kind === 'unit' ? '单位' : '科技'} ID 已移除或不存在，请重新选择。` };
  });
}

/** 查询只检查固定科技树可用性；不替换单位、不将普通/精锐合并，不推断满科技。 */
export function filterCivsByRequirements(list: readonly Civ[], conditions: readonly RequirementCondition[], ctx: RequirementContext): Civ[] {
  const resolved = resolveRequirements(conditions, ctx);
  if (resolved.some((r) => r.error)) return [];
  return list.filter((civ) => {
    const status = civStatus(ctx.trees, civ.en);
    return resolved.every((r) => r.ref && r.entity?.civs.includes(civ.en) && status[`${r.ref.kind === 'unit' ? 'u' : 't'}${r.ref.id}`] === 1);
  });
}

export interface RequirementOption {
  ref: RequirementRef;
  entity: Unit | Tech;
}
export function searchRequirements(ctx: Pick<RequirementContext, 'units' | 'techs'>, query: string, kind: 'all' | 'unit' | 'tech'): RequirementOption[] {
  const q = query.trim().toLowerCase();
  const matches = (entity: Unit | Tech) => `${entity.zh} ${entity.en} ${entity.py ?? ''} ${entity.pyi ?? ''}`.toLowerCase().includes(q);
  return [
    ...(kind === 'tech' ? [] : ctx.units.filter(matches).map((entity) => ({ ref: { kind: 'unit' as const, id: entity.id }, entity }))),
    ...(kind === 'unit' ? [] : ctx.techs.filter(matches).map((entity) => ({ ref: { kind: 'tech' as const, id: entity.id }, entity }))),
  ];
}

/** 带任一筛选参数的链接拥有完整筛选状态；缺失项为空，不叠加接收者的 sticky。 */
export function readCivRequirements(params: URLSearchParams, sticky: CivRequirementFilters) {
  const owned = ['req', 'q', 'ty', 'pos', 'dlc'].some((key) => params.has(key));
  const filters = owned ? { q: params.get('q') ?? '', ty: params.get('ty') ?? '', pos: params.get('pos') ?? '', dlc: params.get('dlc') ?? '' } : sticky;
  return { filters, conditions: parseRequirements(params.getAll('req')), owned };
}

/** 空旧条件也写入 URL，移除最后一个组合条件后仍保持 URL 的优先权。 */
export function writeCivRequirements(params: URLSearchParams, filters: CivRequirementFilters, conditions: readonly RequirementCondition[]): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(filters)) next.set(key, value);
  if (conditions.length) next.set('req', conditions.map((r) => r.token).join(',') || ',');
  else next.delete('req');
  return next;
}
