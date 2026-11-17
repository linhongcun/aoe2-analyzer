import {
  SOURCE_CATEGORY_LABELS,
  VERIFICATION_LABELS,
  eventsForCivilization,
  type CivUpdatesData,
  type EntityType,
  type UpdateEntity,
  type UpdateEffect,
  type UpdateSourceEntry,
  type UpdateVersion,
} from './civUpdates';
import { BUILDING_SOURCE_LABELS, projectBuildingEvents } from './buildingUpdates';
import { TECH_SOURCE_LABELS, projectTechEvents, techCoverageRows } from './techUpdates';
import { effectCondition, projectUnitEvents, UNIT_CONDITIONS, UNIT_SOURCE_LABELS, type UnitEventView } from './unitUpdates';
import { SOURCE_STATE_LABELS } from './civUpdates';
import { GARRISON_HOST_IDS } from '../data/garrisonHosts';
import { ARCHIVE_KINDS, OBJECT_TYPES } from './patches';
import { TEAM_BONUSES } from './effects';

export const HISTORY_TYPES = { civ: '文明', unit: '单位', building: '建筑', tech: '科技' } as const;
export const HISTORY_ADVANCED = ['histSource', 'histVerification', 'histCondition', 'histCiv'] as const;
export const HISTORY_FILTERS = ['histVersion', ...HISTORY_ADVANCED] as const;
export const HISTORY_LABELS = { histVersion: '版本', histSource: '来源', histVerification: '核验', histCondition: '适用范围', histCiv: '文明条件' };
export type HistoryFilter = (typeof HISTORY_FILTERS)[number];
export const UNORDERED_VERSION = 'unordered';

export function historyVersionKey(version: UpdateVersion | undefined) {
  return version?.orderKey ? version.id : UNORDERED_VERSION;
}

function choices(data: CivUpdatesData, key: HistoryFilter): [string, string][] {
  switch (key) {
    case 'histVersion':
      return [...data.versions.map((v): [string, string] => [v.id, v.label]), [UNORDERED_VERSION, '版本未登记或不可比较']];
    case 'histSource':
      return Object.entries(SOURCE_CATEGORY_LABELS);
    case 'histVerification':
      return Object.entries(VERIFICATION_LABELS);
    case 'histCondition':
      return Object.entries(UNIT_CONDITIONS);
    case 'histCiv':
      return data.civilizations.map((c) => [c.civId, c.nameZh]);
  }
}

export const historyOptions = choices;

export function availableReaderFilters(data: CivUpdatesData, views: UnitEventView[]) {
  const matches = Object.fromEntries(HISTORY_FILTERS.map((key) => [key, new Set<string>()])) as Record<HistoryFilter, Set<string>>;
  const versions = new Map(data.versions.map((v) => [v.id, v]));
  const sources = new Map(data.sources.map((s) => [s.id, s.category]));
  const entries = new Map(data.sourceEntries.map((e) => [e.id, sources.get(e.sourceId)]));
  const civilizations = data.civilizations.map((row) => row.civId);
  for (const { event, original } of views) {
    const version = versions.get(event.versionId ?? '');
    matches.histVersion.add(historyVersionKey(version));
    if (version) matches.histVersion.add(version.id);
    matches.histVerification.add(event.verification);
    for (const claim of event.claims) {
      if (!claim.effects.length) continue;
      for (const id of claim.sourceEntryIds) {
        const category = entries.get(id);
        if (category) matches.histSource.add(category);
      }
      for (const effect of claim.effects) {
        const scope = effect.scope ?? original.scope;
        matches.histCondition.add(effectCondition(effect, original));
        for (const civ of scope.scopeKind === 'global' ? civilizations : [...scope.providerCivIds, ...scope.affectedCivIds]) matches.histCiv.add(civ);
      }
    }
  }
  return matches;
}

export function readerFilters(data: CivUpdatesData, query: URLSearchParams) {
  const valid = new URLSearchParams();
  const invalid: string[] = [];
  for (const key of [...HISTORY_FILTERS, 'histOrder'] as const) {
    const all = query.getAll(key);
    if (!all.length) continue;
    const values = all[0]!.split(',');
    const allowed = new Set(key === 'histOrder' ? ['oldest', 'newest'] : choices(data, key).map(([id]) => id));
    if (key === 'histVersion') allowed.add('unknown');
    if (all.length !== 1 || (key !== 'histVersion' && values.length !== 1)) {
      invalid.push(key);
      continue;
    }
    const accepted = [...new Set(values.filter((v) => allowed.has(v)))];
    if (values.some((v) => !allowed.has(v))) invalid.push(key);
    if (accepted.length) valid.set(key, accepted.join(','));
  }
  return { valid, invalid };
}

export const objectParam = (id: string) => id.replace('/', ':');

export function readerEntity(data: CivUpdatesData, query: URLSearchParams) {
  const obj = query.getAll('obj');
  const legacy = query.getAll('histEntity');
  if (obj.length + legacy.length !== 1) return undefined;
  return data.entities.find((e) => (obj.length ? objectParam(e.id) === obj[0] : e.id === legacy[0]));
}

export function historyReaderPath(id: string, filters?: URLSearchParams, eventId?: string, returnTo?: string) {
  const params = new URLSearchParams({ obj: objectParam(id) });
  for (const key of [...HISTORY_FILTERS, 'histOrder']) if (filters?.has(key)) params.set(key, filters.get(key)!);
  if (eventId) params.set('histEvent', eventId);
  if (returnTo) params.set('histReturn', returnTo);
  return '/patches?' + params.toString();
}

export function readerScopePending(view: UnitEventView, effect: UpdateEffect, entity: UpdateEntity) {
  const scope = effect.scope ?? view.original.scope;
  if (scope.scopeKind === 'unknown') return true;
  if (entity.type !== 'civ' || scope.scopeKind === 'global') return false;
  const civs = [...scope.providerCivIds, ...scope.affectedCivIds];
  return !civs.includes(entity.catalogId) && (civs.length > 0 || effect.entityRefs.some((ref) => !('entityId' in ref) || !ref.entityId.startsWith('civ/')));
}

export function projectReaderEvents(data: CivUpdatesData, entity: UpdateEntity): UnitEventView[] {
  if (entity.type === 'unit') return projectUnitEvents(data, entity.id);
  if (entity.type === 'building') return projectBuildingEvents(data, entity.id);
  if (entity.type === 'tech') return projectTechEvents(data, entity.id);
  return eventsForCivilization(data, entity.catalogId)
    .filter((e) => e.civRelations.some((r) => r.civId === entity.catalogId))
    .flatMap((original) => {
      const claims = original.claims.map((claim) => ({
        ...claim,
        effects: claim.effects.filter((effect) => {
          const scope = effect.scope ?? original.scope;
          const civs = [...scope.providerCivIds, ...scope.affectedCivIds];
          const refs = effect.entityRefs.flatMap((ref) => ('entityId' in ref && ref.entityId.startsWith('civ/') ? [ref.entityId] : []));
          return (
            civs.includes(entity.catalogId) || refs.includes(entity.id) || (!civs.length && !refs.length) || (scope.scopeKind === 'global' && !refs.length)
          );
        }),
      }));
      if (!claims.some((c) => c.effects.length)) return [];
      const view = { original, event: { ...original, claims }, relations: [], unknownScope: false };
      return [{ ...view, unknownScope: claims.some((c) => c.effects.some((f) => readerScopePending(view, f, entity))) }];
    });
}

export function relatedReaderEntities(data: CivUpdatesData, view: UnitEventView, currentId: string) {
  const effects = view.event.claims.flatMap((claim) => claim.effects);
  const effectIds = new Set(effects.map((f) => f.id));
  const ids = new Set([
    ...effects.flatMap((f) => f.entityRefs.flatMap((ref) => ('entityId' in ref ? [ref.entityId] : []))),
    ...effects.flatMap((f) => {
      const scope = f.scope ?? view.original.scope;
      return [...scope.providerCivIds, ...scope.affectedCivIds].map((id) => 'civ/' + id);
    }),
    ...[...(data.units?.relations ?? []), ...(data.buildings?.relations ?? []), ...(data.techs?.relations ?? [])]
      .filter((r) => r.eventId === view.event.id && r.effectIds.some((id) => effectIds.has(id)))
      .map((r) => r.entityId),
  ]);
  return data.entities.filter((e) => e.id !== currentId && ids.has(e.id));
}

export function filterReaderEvents(data: CivUpdatesData, views: UnitEventView[], query: URLSearchParams) {
  const versions = new Map(data.versions.map((v) => [v.id, v]));
  const sourceById = new Map(data.sources.map((s) => [s.id, s.category]));
  const categoryByEntry = new Map(data.sourceEntries.map((e) => [e.id, sourceById.get(e.sourceId)]));
  const versionValues = query.get('histVersion')?.split(',');
  const verification = query.get('histVerification');
  const source = query.get('histSource');
  const condition = query.get('histCondition');
  const civ = query.get('histCiv');
  return views.flatMap((view) => {
    const { event, original } = view;
    const version = versions.get(event.versionId ?? '');
    if (
      versionValues &&
      !versionValues.some((v) => (v === 'unknown' ? !event.versionId : v === version?.id || v === historyVersionKey(version)))
    )
      return [];
    if (verification && event.verification !== verification) return [];
    if (!source && !condition && !civ) return [view];
    const claims = event.claims.map((claim) => ({
      ...claim,
      effects:
        source && !claim.sourceEntryIds.some((id) => categoryByEntry.get(id) === source)
          ? []
          : claim.effects.filter((effect) => {
              const scope = effect.scope ?? original.scope;
              return (
                (!condition || effectCondition(effect, original) === condition) &&
                (!civ || scope.scopeKind === 'global' || scope.providerCivIds.includes(civ) || scope.affectedCivIds.includes(civ))
              );
            }),
    }));
    if (!claims.some((claim) => claim.effects.length)) return [];
    return event.verification === 'conflict' ? [view] : [{ ...view, event: { ...event, claims } }];
  });
}

export function readerNodes(data: CivUpdatesData, views: UnitEventView[], oldest: boolean) {
  const versions = new Map(data.versions.map((v) => [v.id, v]));
  const nodes = new Map<string, { id: string; version: UpdateVersion | undefined; rows: UnitEventView[] }>();
  for (const view of views) {
    const version = versions.get(view.event.versionId ?? '');
    const id = view.event.versionId ?? 'unknown';
    if (!nodes.has(id)) nodes.set(id, { id, version, rows: [] });
    nodes.get(id)!.rows.push(view);
  }
  return [...nodes.values()].sort((a, b) => {
    const left = a.version?.orderKey;
    const right = b.version?.orderKey;
    if (!left || !right) return left ? -1 : right ? 1 : a.id.localeCompare(b.id);
    return (oldest ? 1 : -1) * left.localeCompare(right) || a.id.localeCompare(b.id);
  });
}

export function revealReaderEvent(data: CivUpdatesData, view: UnitEventView, query: URLSearchParams) {
  const keys = HISTORY_FILTERS.filter((key) => query.has(key));
  const selections = (start: number, length: number): HistoryFilter[][] =>
    !length ? [[]] : keys.slice(start).flatMap((key, index) => selections(start + index + 1, length - 1).map((tail) => [key, ...tail]));
  const subsets = Array.from({ length: keys.length + 1 }, (_, length) => selections(0, length)).flat();
  for (const removed of subsets) {
    const next = new URLSearchParams(query);
    removed.forEach((key) => next.delete(key));
    if (filterReaderEvents(data, [view], next).length) return { removed, next };
  }
  return { removed: [], next: query };
}

const DETAIL_TABS: Record<EntityType, readonly string[]> = {
  civ: ['ov', 'data', 'tech', 'formations', 'techtree', 'history'],
  unit: ['ov', 'rel', 'sim', 'history'],
  building: ['ov', 'sim', 'garrison', 'prod', 'tech', 'civs', 'history'],
  tech: ['affects', 'civs', 'history'],
};
const DETAIL_CIV_KEYS: Record<EntityType, readonly string[]> = { civ: [], unit: ['civ', 'me', 'opp'], building: ['civ'], tech: ['civ', 'me', 'opp'] };
const CIV_CHAPTERS = ['identity', 'bonuses', 'kit', 'formations', 'techtree', 'more', 'patches'];
const unsafe = (value: string) => /[\\#]/u.test(value) || [...value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);

export function encyclopediaHistoryPath(id: string, pathname: string, search: string, hash: string) {
  const type = id.slice(0, id.indexOf('/')) as EntityType;
  const params = new URLSearchParams(search);
  const clean = new URLSearchParams();
  for (const key of ['tab', ...(DETAIL_CIV_KEYS[type] ?? [])]) if (params.getAll(key).length === 1) clean.set(key, params.get(key)!);
  const chapter = type === 'civ' && CIV_CHAPTERS.includes(hash.slice(1)) ? hash : '';
  return historyReaderPath(
    id,
    params,
    params.getAll('histEvent').length === 1 ? params.get('histEvent')! : undefined,
    pathname + (clean.size ? '?' + clean : '') + chapter,
  );
}

export function readerReturn(data: CivUpdatesData, raw: string | null) {
  if (!raw) return null;
  const [address, hash, extraHash] = raw.split('#');
  if (!address || extraHash !== undefined || unsafe(address) || (hash !== undefined && !CIV_CHAPTERS.includes(hash))) return null;
  const [path, search, extra] = address.split('?');
  if (!path || extra !== undefined) return null;
  const query = new URLSearchParams(search);
  if ([...query].some(([key, value]) => key === 'histReturn' || query.getAll(key).length !== 1 || unsafe(key) || unsafe(value))) return null;
  if (path === '/patches') {
    if (!hash && !query.size) return path;
    if (!hash && query.size === 1 && query.get('read') === 'versions') return path + '?read=versions';
    const entity = readerEntity(data, query);
    if (hash || !entity || [...query.keys()].some((key) => !['obj', 'histEvent', 'histOrder', ...HISTORY_FILTERS].includes(key))) return null;
    if (readerFilters(data, query).invalid.length) return null;
    if (query.has('histEvent') && !projectReaderEvents(data, entity).some((v) => v.event.id === query.get('histEvent'))) return null;
  } else if (/^\/patches\/\d+$/u.test(path) && data.legacyMap.some((row) => '/patches/' + row.patchId === path)) {
    const choices = {
      kind: ARCHIVE_KINDS,
      type: OBJECT_TYPES,
      civ: data.civilizations.map((c) => c.civId),
      ctype: ['fix'],
    };
    if (
      hash ||
      [...query].some(
        ([key, value]) =>
          key !== 'q' &&
          (!Object.hasOwn(choices, key) || !value.split(',').every((v) => (choices[key as keyof typeof choices] as readonly string[]).includes(v))),
      )
    )
      return null;
  } else {
    const unit = /^\/unit\/(\d+)(?:\/([A-Za-z]+)(?:\/([1-4])(?:\/((?:\d+(?:,\d+)*)?)(?:\/((?:\d+(?:,\d+)*)?))?)?)?)?$/u.exec(path);
    const entity = data.entities.find(
      (e) =>
        (e.status === 'current' && e.linkPath === (unit ? '/unit/' + unit[1] : path)) ||
        (e.status === 'retired' &&
          e.type === 'tech' &&
          !data.entities.some((current) => current.id === 'tech/' + e.catalogId) &&
          path === '/tech/' + e.catalogId),
    );
    if (!entity || (hash && entity.type !== 'civ') || [...query.keys()].some((key) => key !== 'tab' && !DETAIL_CIV_KEYS[entity.type].includes(key)))
      return null;
    if (
      unit?.[2] &&
      (!data.civilizations.some((c) => c.civId === unit[2]) ||
        (query.has('civ') && query.get('civ') !== unit[2]) ||
        (!!unit[4] && unit[4].split(',').some((n) => !data.entities.some((e) => e.type === 'tech' && e.status === 'current' && e.catalogId === n))) ||
        (!!unit[5] && unit[5].split(',').some((n) => n !== String(Number(n)) || Number(n) >= TEAM_BONUSES.length)))
    )
      return null;
    for (const key of ['civ', 'me', 'opp']) if (query.has(key) && !data.civilizations.some((c) => c.civId === query.get(key))) return null;
    const tab = query.get('tab');
    if (tab && !DETAIL_TABS[entity.type].includes(tab)) return null;
    if (query.has('tab') && !tab) return null;
    if (tab === 'garrison' && !GARRISON_HOST_IDS.includes(Number(entity.catalogId))) return null;
  }
  return path + (query.size ? '?' + query.toString() : '') + (hash ? '#' + hash : '');
}

export function readerCoverage(data: CivUpdatesData, entity: UpdateEntity) {
  if (entity.type === 'civ') {
    const row = data.civilizations.find((c) => c.civId === entity.catalogId);
    return row && { label: SOURCE_STATE_LABELS[row.sourceState], state: row.sourceState, reason: row.reason, own: row.sectionIds, related: [] as string[] };
  }
  const [rows, labels] =
    entity.type === 'unit'
      ? [data.units?.rows, UNIT_SOURCE_LABELS]
      : entity.type === 'building'
        ? [data.buildings?.rows, BUILDING_SOURCE_LABELS]
        : [techCoverageRows(data), TECH_SOURCE_LABELS];
  const row = rows?.find((r) => r.entityId === entity.id);
  return row && { label: labels[row.sourceState], state: row.sourceState, reason: row.reason, own: row.sectionIds, related: row.relatedSectionIds };
}

export const PROCESSING_LABEL = { mapped: '已关联', pending: '待核', excluded: '已排除' } as const;
export const PROVENANCE_LABEL = { own: '自有章节', related: '相关章节', claim: '共享证据' } as const;
export function readerProcessing(data: CivUpdatesData, entity: UpdateEntity, views: UnitEventView[]) {
  const coverage = readerCoverage(data, entity);
  const own = new Set(data.sections.filter((s) => coverage?.own.includes(s.id)).flatMap((s) => s.entryIds));
  const related = new Set(data.sections.filter((s) => coverage?.related.includes(s.id)).flatMap((s) => s.entryIds));
  const claim = new Set(
    views.flatMap(({ event, original }) =>
      (event.verification === 'conflict' ? original.claims : event.claims.filter((c) => c.effects.length)).flatMap((c) => c.sourceEntryIds),
    ),
  );
  const claimTargets = new Map<string, Set<string>>();
  for (const { event } of views) {
    for (const claim of event.claims) {
      if (!claim.effects.length) continue;
      for (const id of claim.sourceEntryIds) {
        const targets = claimTargets.get(id) ?? new Set<string>();
        targets.add(event.id);
        claimTargets.set(id, targets);
      }
    }
  }
  return data.sourceEntries.flatMap((entry: UpdateSourceEntry) => {
    const provenance = [
      { kind: 'own', ids: own },
      { kind: 'related', ids: related },
      { kind: 'claim', ids: claim },
    ] as const;
    const labels = provenance.filter((p) => p.ids.has(entry.id)).map((p) => p.kind);
    return labels.length
      ? [{ entry, labels, targets: entry.processing === 'mapped' ? entry.eventIds.filter((id) => claimTargets.get(entry.id)?.has(id)) : [] }]
      : [];
  });
}
