import { detailQueryError, validHistoryReturn, type CivUpdatesData } from './civUpdates';
import { ENTITY_HISTORY_FILTER_KEYS } from './historyFilters';
import { UNIT_CONDITIONS, filterProjectedEvents, projectUnitEvents, type UnitCoverage, type UnitUpdateData } from './unitUpdates';

export const TECH_EFFECT_LABELS = {
  parameter: '科技本体 · 研究参数 / 前提',
  effect: '研究后效果 / 作用对象',
  availability: '文明可用性（不表示全游戏删除）',
  identity: '科技身份变化',
  unclassified: '未分类历史主张（以原文为准）',
} as const;
export interface TechUpdateData extends UnitUpdateData {
  historicalRows: UnitCoverage[];
  effectKinds: Record<string, keyof typeof TECH_EFFECT_LABELS>;
}
export const TECH_SOURCE_LABELS = {
  processed: '科技来源已逐条处理',
  pending: '科技来源尚待处理',
  'not-checked': '科技独立来源未检查',
  'not-located': '科技来源未定位',
  'page-not-found': '科技来源缺页',
  'no-log': '科技来源已读无日志',
  'read-failed': '来源读取失败（保留旧快照）',
} as const;
export const TECH_FILTER_KEYS = ENTITY_HISTORY_FILTER_KEYS;
const KEYS = ['obj', 'histEntity', 'histView', 'histQuery', 'histReturn', 'histEvent', 'techSourceState', 'techIdentity', ...TECH_FILTER_KEYS];
const unsafe = (value: string) => /[\\#]/u.test(value) || [...value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);
const tech = (data: CivUpdatesData, id: string) => data.entities.find((e) => e.type === 'tech' && e.id === id);
export const techCoverageRows = (data: CivUpdatesData) => [...(data.techs?.rows ?? []), ...(data.techs?.historicalRows ?? [])];

/** Errors are individual keys: recovery must retain valid state. */
export function techQueryErrors(data: CivUpdatesData, query: URLSearchParams, checkReturn = true, detailId?: string): string[] {
  const errors = new Set<string>();
  const choices: Record<string, string[]> = {
    histView: ['techs', 'techCoverage'],
    histVersion: ['unknown', 'unordered', ...data.versions.map((v) => v.id)],
    histOrder: ['newest', 'oldest'],
    histVerification: ['verified', 'unverified', 'conflict'],
    histCondition: Object.keys(UNIT_CONDITIONS),
    histCiv: data.civilizations.map((c) => c.civId),
    techSourceState: Object.keys(TECH_SOURCE_LABELS),
    techIdentity: ['current', 'retired'],
  };
  for (const [key, value] of query) {
    if ((key.startsWith('hist') || key.startsWith('tech')) && !KEYS.includes(key)) errors.add(key);
    if (unsafe(key) || (KEYS.includes(key) && (query.getAll(key).length !== 1 || unsafe(value)))) errors.add(key);
    if (choices[key] && !choices[key]!.includes(value)) errors.add(key);
  }
  if (detailId)
    for (const key of ['tab', 'civ', 'me', 'opp']) {
      if (
        query.has(key) &&
        (query.getAll(key).length !== 1 || (key === 'tab' ? query.get(key) !== 'history' : !data.civilizations.some((c) => c.civId === query.get(key))))
      )
        errors.add(key);
    }
  if (query.has('obj')) {
    const match = /^tech:(\d+)$/u.exec(query.get('obj') ?? '');
    if (!match || !data.techs?.rows.some((r) => r.entityId === 'tech/' + match[1])) errors.add('obj');
  }
  if (query.has('histEntity') && tech(data, query.get('histEntity')!)?.status !== 'retired') errors.add('histEntity');
  if (query.has('obj') && query.has('histEntity')) {
    errors.add('obj');
    errors.add('histEntity');
  }
  if (detailId) for (const key of ['obj', 'histEntity', 'histView', 'techIdentity', 'techSourceState']) if (query.has(key)) errors.add(key);
  const selected = detailId ?? (query.has('obj') ? 'tech/' + query.get('obj')!.slice(5) : query.get('histEntity'));
  if (query.has('histEvent') && !data.techs?.relations.some((r) => r.eventId === query.get('histEvent') && (!selected || r.entityId === selected)))
    errors.add('histEvent');
  if (checkReturn && query.has('histReturn') && !techHistoryReturn(data, query.get('histReturn'))) errors.add('histReturn');
  return [...errors];
}

/** Single decoded router-relative layer; each target validates its own values. */
export function techHistoryReturn(data: CivUpdatesData, raw: string | null): string | null {
  if (!raw || unsafe(raw)) return null;
  const [path = '', ...tail] = raw.split('?');
  if (tail.length > 1) return null;
  const query = new URLSearchParams(tail[0] ?? '');
  if ([...query].some(([key, value]) => key === 'histReturn' || query.getAll(key).length !== 1 || unsafe(key) || unsafe(value))) return null;
  const techOverview =
    path === '/patches' &&
    (query.get('histView')?.startsWith('tech') ||
      query.has('techSourceState') ||
      query.has('techIdentity') ||
      query.get('obj')?.startsWith('tech:') ||
      query.get('histEntity')?.startsWith('tech/'));
  if (path.startsWith('/tech/') || techOverview) {
    let allowed: readonly string[] = KEYS.filter((k) => k !== 'histReturn');
    if (path !== '/patches') {
      if (!/^\/tech\/\d+$/u.test(path) || !data.techs?.rows.some((r) => r.entityId === path.slice(1))) return null;
      allowed = ['tab', 'civ', 'me', 'opp', 'histQuery', 'histEvent', ...TECH_FILTER_KEYS];
      if (query.has('tab') && query.get('tab') !== 'history') return null;
    }
    if ([...query.keys()].some((k) => !allowed.includes(k)) || techQueryErrors(data, query, false, path === '/patches' ? undefined : path.slice(1)).length)
      return null;
  } else if (path.startsWith('/civ/')) {
    if (!data.civilizations.some((c) => path === '/civ/' + c.civId)) return null;
    if (
      [...query.keys()].some((k) => !['tab', 'histQuery', 'histVersion', 'histVerification', 'histOrder', 'histSource', 'histEvent'].includes(k)) ||
      (query.has('tab') && query.get('tab') !== 'history') ||
      detailQueryError(query, data, path.slice(5))
    )
      return null;
  } else return validHistoryReturn(raw, data);
  return path + (query.size ? '?' + query.toString() : '');
}
export function recoverTechQuery(data: CivUpdatesData, query: URLSearchParams, detailId?: string) {
  const next = new URLSearchParams(query);
  for (const key of techQueryErrors(data, query, true, detailId)) next.delete(key);
  return next;
}
export function techHistoryPath(data: CivUpdatesData, entityId: string, query: URLSearchParams, view: 'overview' | 'detail', returnTo?: string) {
  const entity = tech(data, entityId);
  if (!entity) return '/patches?histView=techs';
  const detail = view === 'detail' && entity.status === 'current';
  const next = new URLSearchParams(
    detail ? { tab: 'history' } : { histView: 'techs', ...(entity.status === 'current' ? { obj: 'tech:' + entity.catalogId } : { histEntity: entityId }) },
  );
  for (const key of ['histQuery', 'histEvent', ...TECH_FILTER_KEYS])
    if (query.getAll(key).length === 1 && !techQueryErrors(data, query, false).includes(key)) next.set(key, query.get(key)!);
  if (detail)
    for (const key of ['civ', 'me', 'opp'])
      if (query.getAll(key).length === 1 && data.civilizations.some((c) => c.civId === query.get(key))) next.set(key, query.get(key)!);
  if (next.has('histEvent') && !data.techs?.relations.some((r) => r.entityId === entityId && r.eventId === next.get('histEvent'))) next.delete('histEvent');
  const back = techHistoryReturn(data, returnTo ?? query.get('histReturn'));
  if (back) next.set('histReturn', back);
  return (detail ? '/tech/' + entity.catalogId : '/patches') + '?' + next.toString();
}
export function searchUpdateTechs(data: CivUpdatesData, text: string) {
  const value = text.trim().toLocaleLowerCase();
  return data.entities.filter(
    (e) => e.type === 'tech' && (!value || [e.nameZh, e.nameEn, e.catalogId, ...e.aliases].some((s) => s?.toLocaleLowerCase().includes(value))),
  );
}
export function projectTechEvents(data: CivUpdatesData, entityId: string) {
  return projectUnitEvents(data, entityId, data.techs?.relations ?? []);
}
export function filterTechEvents(data: CivUpdatesData, entityId: string, query: URLSearchParams) {
  if (techQueryErrors(data, query).length) return [];
  return filterProjectedEvents(data, projectTechEvents(data, entityId), query);
}
export function revealTechEvent(data: CivUpdatesData, entityId: string, query: URLSearchParams) {
  const event = projectTechEvents(data, entityId).filter((v) => v.event.id === query.get('histEvent'));
  const keys = TECH_FILTER_KEYS.filter((key) => key !== 'histOrder' && query.has(key));
  // Test the complete conjunction: separate effects can each match one filter
  // while no effect matches both. Remove the smallest stable subset of filters.
  const subsets = Array.from({ length: 1 << keys.length }, (_, mask) => keys.filter((_, index) => mask & (1 << index)));
  subsets.sort((a, b) => a.length - b.length);
  for (const removed of subsets) {
    const next = new URLSearchParams(query);
    removed.forEach((key) => next.delete(key));
    if (filterProjectedEvents(data, event, next).length) return next;
  }
  return new URLSearchParams(query);
}
export function techEvidenceStats(data: CivUpdatesData, entityId: string) {
  const views = projectTechEvents(data, entityId);
  const claims = views.flatMap((v) => v.event.claims.filter((c) => c.effects.length));
  const sourceIds = new Set(claims.flatMap((c) => c.sourceEntryIds));
  const row = techCoverageRows(data).find((r) => r.entityId === entityId);
  const sections = new Set([...(row?.sectionIds ?? []), ...(row?.relatedSectionIds ?? [])]);
  const originals = data.sourceEntries.filter((e) => sourceIds.has(e.id) || (e.sectionId && sections.has(e.sectionId)));
  return {
    linked: sourceIds.size,
    originals: originals.length,
    mapped: originals.filter((e) => e.processing === 'mapped').length,
    pending: originals.filter((e) => e.processing === 'pending').length,
    excluded: originals.filter((e) => e.processing === 'excluded').length,
    verified: claims.filter((c) => c.verification === 'verified').length,
    unverified: claims.filter((c) => c.verification === 'unverified').length,
    conflicts: views.filter((v) => v.event.verification === 'conflict').length,
  };
}
