import { compareUpdateVersions, validHistoryReturn, type CivUpdateEvent, type CivUpdatesData, type UpdateEffect, type UpdateScope } from './civUpdates';
import { ENTITY_HISTORY_FILTER_KEYS } from './historyFilters';

export type UnitSourceState = 'processed' | 'pending' | 'not-checked' | 'not-located' | 'page-not-found' | 'no-log' | 'read-failed';
export interface UnitCoverage {
  entityId: string;
  catalogOrder: number;
  searchState: 'found' | 'not-checked' | 'not-located' | 'page-not-found' | 'no-log' | 'read-failed';
  sourceState: UnitSourceState;
  checkedAt: string | null;
  sectionIds: string[];
  relatedSectionIds: string[];
  reason: string;
  familyIds: string[];
  identityNote: string;
  eventIds: string[];
  sourceEntryCount: number | null;
}
export interface UnitRelation {
  entityId: string;
  eventId: string;
  effectIds: string[];
  relation: 'direct' | 'related' | 'identity-pending';
  note: string;
}
export interface UnitUpdateData {
  catalogSize: number;
  directorySha256: string;
  coverageNote: string;
  rows: UnitCoverage[];
  relations: UnitRelation[];
  legacyMap: { key: string; eventId: string; claimId: string; effectIds: string[]; reason: string }[];
}
export const UNIT_SOURCE_LABELS: Record<UnitSourceState, string> = {
  processed: '单位来源已逐条处理',
  pending: '单位来源导入待核',
  'not-checked': '单位来源未检查',
  'not-located': '单位来源未定位',
  'page-not-found': '单位来源缺页',
  'no-log': '单位来源无日志',
  'read-failed': '来源读取失败（保留旧快照）',
};
export const UNIT_CONDITIONS = {
  base: '本体（无附加条件）',
  civ: '文明条件',
  team: '团队条件',
  prerequisite: '科技 / 时代等前提',
  unknown: '条件 / 范围待核',
} as const;
export const UNIT_FILTER_KEYS = ENTITY_HISTORY_FILTER_KEYS;
export function unitCoverageQueryError(query: URLSearchParams) {
  const source = query.get('unitSourceState');
  return query.getAll('unitSourceState').length > 1 || (source !== null && !Object.hasOwn(UNIT_SOURCE_LABELS, source))
    ? '单位来源状态筛选无法识别，请清除筛选'
    : undefined;
}
const KEYS = ['obj', 'tab', 'histQuery', 'histReturn', 'histEvent', ...UNIT_FILTER_KEYS];

export function unitQueryError(data: CivUpdatesData, query: URLSearchParams): string | undefined {
  for (const key of query.keys()) {
    if (key.startsWith('hist') && !KEYS.includes(key)) return '此历史筛选参数已失效，请清除历史筛选。';
    if (KEYS.includes(key) && query.getAll(key).length !== 1) return '历史筛选参数重复，请清除历史筛选。';
  }
  const choices: Record<string, string[]> = {
    histVersion: ['unknown', 'unordered', ...data.versions.map((v) => v.id)],
    histVerification: ['verified', 'unverified', 'conflict'],
    histCiv: data.civilizations.map((c) => c.civId),
    histCondition: Object.keys(UNIT_CONDITIONS),
    histOrder: ['newest', 'oldest'],
  };
  for (const [key, values] of Object.entries(choices)) if (query.has(key) && !values.includes(query.get(key)!)) return '历史筛选值无法识别，请清除历史筛选。';
  if (query.has('histEvent') && !data.events.some((e) => e.id === query.get('histEvent'))) return '历史事件定位已失效';
  if (query.has('histReturn') && !unitHistoryReturn(query.get('histReturn'), data)) return '返回地址无法识别，请清除历史筛选。';
  return undefined;
}

/** Router-relative allowlist. Nested returns are never copied into new links. */
export function unitHistoryReturn(raw: string | null, data?: CivUpdatesData): string | null {
  if (!raw || /[\r\n\\#]/u.test(raw) || [...raw].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return null;
  if (data) return validHistoryReturn(raw, data);
  const [path, ...tail] = raw.split('?');
  if (tail.length > 1 || !(path === '/patches' || /^\/unit\/\d+$/u.test(path ?? ''))) return null;
  const params = new URLSearchParams(tail[0] ?? '');
  for (const [key, value] of params) {
    if ((!KEYS.includes(key) && key !== 'unitSourceState') || key === 'histReturn' || params.getAll(key).length !== 1 || /[\r\n\\#]/u.test(value)) return null;
  }
  if (params.has('obj') && !/^unit:\d+$/u.test(params.get('obj')!)) return null;
  if (params.has('tab') && params.get('tab') !== 'history') return null;
  if (unitCoverageQueryError(params)) return null;
  return path + (params.size ? '?' + params.toString() : '');
}
export function unitHistoryPath(entityId: string, query: URLSearchParams, view: 'overview' | 'detail', returnTo?: string, data?: CivUpdatesData): string {
  const id = /^unit\/(\d+)$/u.exec(entityId)?.[1];
  if (!id) return '/patches';
  const next = new URLSearchParams();
  if (view === 'overview') next.set('obj', 'unit:' + id);
  else next.set('tab', 'history');
  for (const key of ['histQuery', 'histEvent', ...UNIT_FILTER_KEYS]) if (query.getAll(key).length === 1) next.set(key, query.get(key)!);
  const back = unitHistoryReturn(returnTo ?? query.get('histReturn'), data);
  if (back) next.set('histReturn', back);
  return (view === 'overview' ? '/patches' : '/unit/' + id) + '?' + next.toString();
}
export function clearUnitFilters(query: URLSearchParams, data?: CivUpdatesData) {
  const next = new URLSearchParams(query);
  for (const key of [...next.keys()])
    if (key.startsWith('hist') && key !== 'histQuery' && !(key === 'histReturn' && query.getAll(key).length === 1 && unitHistoryReturn(query.get(key), data)))
      next.delete(key);
  if (query.getAll('histQuery').length > 1) next.delete('histQuery');
  return next;
}
export function searchUpdateUnits(data: CivUpdatesData, text: string) {
  const value = text.trim().toLocaleLowerCase();
  return data.entities.filter(
    (entity) =>
      entity.type === 'unit' &&
      (!value || [entity.nameZh, entity.nameEn, ...entity.aliases, entity.catalogId].some((name) => name?.toLocaleLowerCase().includes(value))),
  );
}
export function effectCondition(effect: UpdateEffect, event: CivUpdateEvent): keyof typeof UNIT_CONDITIONS {
  const scope = effect.scope ?? event.scope;
  if (scope.scopeKind === 'team') return 'team';
  if (scope.scopeKind === 'civ') return 'civ';
  if (effect.conditions.length || scope.conditions.length) return 'prerequisite';
  return scope.scopeKind === 'global' ? 'base' : 'unknown';
}
function civMatches(scope: UpdateScope, id: string) {
  return scope.scopeKind === 'global' || scope.affectedCivIds.includes(id) || scope.providerCivIds.includes(id);
}
export interface UnitEventView {
  event: CivUpdateEvent;
  original: CivUpdateEvent;
  relations: UnitRelation[];
  unknownScope: boolean;
}
/** Select effects by exact identity. Source originals remain unabridged evidence. */
export function projectUnitEvents(data: CivUpdatesData, entityId: string, sourceRelations = data.units?.relations ?? []): UnitEventView[] {
  const relations = sourceRelations.filter((row) => row.entityId === entityId);
  return data.events.flatMap((original) => {
    const own = relations.filter((row) => row.eventId === original.id);
    if (!own.length) return [];
    const effectIds = new Set(own.flatMap((row) => row.effectIds));
    const claims = original.claims.map((claim) => ({ ...claim, effects: claim.effects.filter((effect) => effectIds.has(effect.id)) }));
    const scopes = claims.flatMap((claim) => claim.effects.map((effect) => effect.scope ?? original.scope));
    const scope = scopes.length && scopes.every((scope) => JSON.stringify(scope) === JSON.stringify(scopes[0])) ? scopes[0]! : original.scope;
    return [{ original, event: { ...original, scope, claims }, relations: own, unknownScope: scopes.some((scope) => scope.scopeKind === 'unknown') }];
  });
}
export function filterUnitEvents(data: CivUpdatesData, entityId: string, query: URLSearchParams): UnitEventView[] {
  if (unitQueryError(data, query)) return [];
  return filterProjectedEvents(data, projectUnitEvents(data, entityId), query);
}
export function filterProjectedEvents(data: CivUpdatesData, views: UnitEventView[], query: URLSearchParams): UnitEventView[] {
  const versions = new Map(data.versions.map((v) => [v.id, v]));
  return views
    .flatMap((view) => {
      const { event } = view;
      const version = versions.get(event.versionId ?? '');
      const selection = query.get('histVersion');
      if (
        selection &&
        !(selection === 'unknown'
          ? event.versionId === null
          : selection === 'unordered'
            ? !!version && version.orderKey === null
            : event.versionId === selection)
      )
        return [];
      if (query.has('histVerification') && event.verification !== query.get('histVerification')) return [];
      const matches = (effect: UpdateEffect) => {
        const scope = effect.scope ?? event.scope;
        return (
          (!query.has('histCondition') || effectCondition(effect, event) === query.get('histCondition')) &&
          (!query.has('histCiv') || scope.scopeKind === 'unknown' || civMatches(scope, query.get('histCiv')!))
        );
      };
      if (!event.claims.some((claim) => claim.effects.some(matches))) return [];
      // Filters decide whether to include the conflict, never which side is true.
      return [
        {
          ...view,
          event:
            event.verification === 'conflict'
              ? event
              : { ...event, claims: event.claims.map((claim) => ({ ...claim, effects: claim.effects.filter(matches) })) },
        },
      ];
    })
    .sort(
      (a, b) =>
        compareUpdateVersions(versions.get(a.event.versionId ?? ''), versions.get(b.event.versionId ?? ''), query.get('histOrder') === 'oldest') ||
        a.event.id.localeCompare(b.event.id),
    );
}

/** Scope belongs to each effect. Keep conflicting claims atomic, including mixed scopes. */
export function partitionUnitScopes(rows: UnitEventView[]) {
  const groups: Record<'known' | 'unknown' | 'mixed', UnitEventView[]> = { known: [], unknown: [], mixed: [] };
  for (const row of rows) {
    const scopes = row.event.claims.flatMap((claim) => claim.effects.map((effect) => effect.scope ?? row.event.scope));
    const hasUnknown = scopes.some((scope) => scope.scopeKind === 'unknown');
    const hasKnown = scopes.some((scope) => scope.scopeKind !== 'unknown');
    if (!hasUnknown || !hasKnown || row.event.verification === 'conflict') {
      groups[hasUnknown ? (hasKnown ? 'mixed' : 'unknown') : 'known'].push(row);
      continue;
    }
    for (const group of ['known', 'unknown'] as const) {
      const claims = row.event.claims
        .map((claim) => ({
          ...claim,
          effects: claim.effects.filter((effect) => ((effect.scope ?? row.event.scope).scopeKind === 'unknown') === (group === 'unknown')),
        }))
        .filter((claim) => claim.effects.length);
      const ownScopes = claims.flatMap((claim) => claim.effects.map((effect) => effect.scope ?? row.event.scope));
      const scope = ownScopes.every((scope) => JSON.stringify(scope) === JSON.stringify(ownScopes[0])) ? ownScopes[0]! : row.event.scope;
      groups[group].push({ ...row, event: { ...row.event, claims, scope }, unknownScope: group === 'unknown' });
    }
  }
  return groups;
}
