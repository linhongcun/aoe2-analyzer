import { detailQueryError, validHistoryReturn, type CivUpdatesData } from './civUpdates';
import { ENTITY_HISTORY_FILTER_KEYS } from './historyFilters';
import { UNIT_CONDITIONS, filterProjectedEvents, projectUnitEvents, type UnitCoverage, type UnitRelation, type UnitUpdateData } from './unitUpdates';

export interface BuildingCoverage extends UnitCoverage {
  aliases: string[];
  sourceUrl: string | null;
  indexLabel: string | null;
}
export interface BuildingUpdateData extends Omit<UnitUpdateData, 'rows'> {
  rows: BuildingCoverage[];
  sourceIndex: { url: string; documentSha256: string; capturedAt: string; links: { label: string; href: string }[] };
}
export type BuildingRelation = UnitRelation;
export const BUILDING_SOURCE_LABELS = {
  processed: '建筑来源已逐条处理',
  pending: '建筑来源尚待处理',
  'not-checked': '已定位、未检查',
  'not-located': '建筑来源未定位',
  'page-not-found': '建筑来源缺页',
  'no-log': '建筑来源已读无日志',
  'read-failed': '来源读取失败（保留旧快照）',
} as const;
export const BUILDING_FILTER_KEYS = ENTITY_HISTORY_FILTER_KEYS;
const KEYS = ['obj', 'histEntity', 'histView', 'histQuery', 'histReturn', 'histEvent', 'buildingSourceState', ...BUILDING_FILTER_KEYS];
const unsafe = (value: string) => /[\\#]/u.test(value) || [...value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);
const building = (data: CivUpdatesData, id: string) => data.entities.find((e) => e.type === 'building' && e.id === id);

/** Invalid keys are returned separately so recovery cannot erase valid filters. */
export function buildingQueryErrors(data: CivUpdatesData, query: URLSearchParams, checkReturn = true): string[] {
  const errors = new Set<string>();
  const choices: Record<string, string[]> = {
    histView: ['buildings', 'buildingCoverage'],
    histVersion: ['unknown', 'unordered', ...data.versions.map((v) => v.id)],
    histOrder: ['newest', 'oldest'],
    histVerification: ['verified', 'unverified', 'conflict'],
    histCondition: Object.keys(UNIT_CONDITIONS),
    histCiv: data.civilizations.map((c) => c.civId),
    buildingSourceState: Object.keys(BUILDING_SOURCE_LABELS),
  };
  for (const [key, value] of query) {
    if (key.startsWith('hist') && !KEYS.includes(key)) errors.add(key);
    if (KEYS.includes(key) && (query.getAll(key).length !== 1 || unsafe(value))) errors.add(key);
    if (choices[key] && !choices[key]!.includes(value)) errors.add(key);
  }
  if (query.has('obj')) {
    const match = /^building:(\d+)$/u.exec(query.get('obj') ?? '');
    if (!match || !data.buildings?.rows.some((row) => row.entityId === 'building/' + match[1])) errors.add('obj');
  }
  if (query.has('histEntity')) {
    const id = query.get('histEntity')!;
    if (!building(data, id) || data.buildings?.rows.some((row) => row.entityId === id)) errors.add('histEntity');
  }
  if (query.has('obj') && query.has('histEntity')) {
    errors.add('obj');
    errors.add('histEntity');
  }
  if (query.has('histEvent') && !data.events.some((event) => event.id === query.get('histEvent'))) errors.add('histEvent');
  if (checkReturn && query.has('histReturn') && !buildingHistoryReturn(data, query.get('histReturn'))) errors.add('histReturn');
  return [...errors];
}

/** Complete router-relative allowlist with route-specific parameter values. */
export function buildingHistoryReturn(data: CivUpdatesData, raw: string | null): string | null {
  if (!raw || unsafe(raw)) return null;
  const [path = '', ...tail] = raw.split('?');
  if (tail.length > 1) return null;
  const query = new URLSearchParams(tail[0] ?? '');
  if ([...query].some(([key, value]) => key === 'histReturn' || query.getAll(key).length !== 1 || unsafe(value))) return null;
  if (
    path.startsWith('/tech/') ||
    path.startsWith('/unit/') ||
    query.get('histView')?.startsWith('tech') ||
    query.get('obj')?.startsWith('tech:') ||
    query.get('histEntity')?.startsWith('tech/')
  )
    return validHistoryReturn(raw, data);
  let allowed: readonly string[];
  if (path === '/patches') {
    allowed = KEYS.filter((key) => key !== 'histReturn');
    if (buildingQueryErrors(data, query, false).length) return null;
  } else if (/^\/building\/\d+$/u.test(path)) {
    if (!data.buildings?.rows.some((r) => r.entityId === path.slice(1))) return null;
    allowed = ['tab', 'civ', 'histQuery', 'histEvent', ...BUILDING_FILTER_KEYS];
    if ((query.has('tab') && query.get('tab') !== 'history') || (query.has('civ') && !data.civilizations.some((c) => c.civId === query.get('civ'))))
      return null;
    if (buildingQueryErrors(data, query, false).length) return null;
  } else if (path.startsWith('/civ/') && data.civilizations.some((c) => path === '/civ/' + c.civId)) {
    allowed = ['tab', 'histQuery', 'histVersion', 'histSource', 'histVerification', 'histOrder', 'histEvent'];
    if ((query.has('tab') && query.get('tab') !== 'history') || detailQueryError(query, data, path.slice(5))) return null;
  } else return null;
  if ([...query.keys()].some((key) => !allowed.includes(key))) return null;
  return path + (query.size ? '?' + query.toString() : '');
}

export function recoverBuildingQuery(data: CivUpdatesData, query: URLSearchParams) {
  const next = new URLSearchParams(query);
  buildingQueryErrors(data, query).forEach((key) => next.delete(key));
  return next;
}
export function clearBuildingFilters(query: URLSearchParams) {
  const next = new URLSearchParams(query);
  BUILDING_FILTER_KEYS.forEach((key) => next.delete(key));
  return next;
}
export function buildingHistoryPath(data: CivUpdatesData, entityId: string, query: URLSearchParams, view: 'overview' | 'detail', returnTo?: string) {
  const entity = building(data, entityId);
  const current = data.buildings?.rows.some((row) => row.entityId === entityId);
  const detail = view === 'detail' && current;
  const next = new URLSearchParams();
  for (const key of ['histQuery', 'histEvent', ...BUILDING_FILTER_KEYS]) if (query.getAll(key).length === 1) next.set(key, query.get(key)!);
  if (detail) next.set('tab', 'history');
  else {
    next.set('histView', 'buildings');
    if (entity && current) next.set('obj', 'building:' + entity.catalogId);
    else if (entity) next.set('histEntity', entity.id);
  }
  const back = buildingHistoryReturn(data, returnTo ?? null);
  if (back) next.set('histReturn', back);
  return (detail ? '/building/' + entity!.catalogId : '/patches') + '?' + next.toString();
}
export function searchUpdateBuildings(data: CivUpdatesData, text: string) {
  const value = text.trim().toLocaleLowerCase();
  return data.entities.filter(
    (e) => e.type === 'building' && (!value || [e.nameZh, e.nameEn, e.catalogId, ...e.aliases].some((s) => s?.toLocaleLowerCase().includes(value))),
  );
}
export function projectBuildingEvents(data: CivUpdatesData, entityId: string) {
  return projectUnitEvents(data, entityId, data.buildings?.relations ?? []);
}
export function filterBuildingEvents(data: CivUpdatesData, entityId: string, query: URLSearchParams) {
  return buildingQueryErrors(data, query).length ? [] : filterProjectedEvents(data, projectBuildingEvents(data, entityId), query);
}
