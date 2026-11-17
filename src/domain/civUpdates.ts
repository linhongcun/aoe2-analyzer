import { UNIT_FILTER_KEYS, unitCoverageQueryError, unitHistoryReturn, unitQueryError, type UnitUpdateData } from './unitUpdates';
import { buildingHistoryReturn, type BuildingUpdateData } from './buildingUpdates';
import { techHistoryReturn, type TechUpdateData } from './techUpdates';
/** Historical claims are independent of today's game values and technology tree. */
export type Verification = 'verified' | 'unverified' | 'conflict';
export type SourceCategory = 'official' | 'community' | 'other' | 'unknown';
export type SourceState = 'processed' | 'pending' | 'page-not-found' | 'no-log';
export type EntityType = 'civ' | 'unit' | 'building' | 'tech';
export type EntityRef = { entityId: string } | { unresolvedName: string; type: EntityType | null };

export interface UpdateScope {
  scopeKind: 'civ' | 'team' | 'global' | 'unknown';
  providerCivIds: string[];
  affectedCivIds: string[];
  beneficiary: 'self' | 'allies' | 'team' | 'all' | 'unknown';
  conditions: string[];
}
export interface UpdateEntity {
  id: string;
  type: EntityType;
  catalogId: string;
  nameZh: string;
  nameEn: string | null;
  aliases: string[];
  status: 'current' | 'retired';
  linkPath: string | null;
  identityNote: string;
}
export interface UpdateVersion {
  id: string;
  label: string;
  build: number | null;
  branch: 'DE' | null;
  orderKey: string | null;
  releaseDate: string | null;
  announcedAt: string | null;
  evidenceSourceIds: string[];
  channel?: 'release' | 'pup' | 'hotfix' | 'unknown';
  orderReason?: string;
}
export interface UpdateSource {
  id: string;
  title: string;
  url: string | null;
  category: SourceCategory;
  sourcePublishedAt: string | null;
  capturedAt: string | null;
}
export interface UpdateSection {
  id: string;
  revisionId: string;
  supersedesRevisionId: string | null;
  civId: string | null;
  entityIds?: string[];
  sourceId: string;
  title: string;
  anchor: string;
  documentSha256: string;
  sectionTextSha256: string;
  capturedAt: string;
  sourcePublishedAt: string | null;
  observedEntryCount: number;
  entryIds: string[];
  sourceState: SourceState;
  reason: string;
}
export interface UpdateSourceEntry {
  id: string;
  sourceId: string;
  sectionId: string | null;
  group: string | null;
  locator: string;
  originalText: string | null;
  rawVersionLabels: string[];
  sourceBullet: string | null;
  legacyKeys: string[];
  processing: 'mapped' | 'pending' | 'excluded';
  eventIds: string[];
  reason: string;
  supersedesEntryIds: string[];
}
interface EffectBase {
  id: string;
  entityRefs: EntityRef[];
  text: string;
  conditions: string[];
  scope: UpdateScope | null;
}
interface NumericValues {
  attribute: string;
  before: number | null;
  after: number | null;
  delta: number | null;
  unit: string | null;
  beforeUnit?: string | null;
  afterUnit?: string | null;
}
export type UpdateEffect = EffectBase &
  (
    | ({ type: 'numeric'; operation: 'set' | 'add' | 'unknown' } & NumericValues)
    | ({ type: 'bonus'; operation: 'absolute-discount' | 'percentage-discount' | 'rate' | 'unknown' } & NumericValues)
    | { type: 'availability'; before: boolean | null; after: boolean | null }
    | { type: 'mechanic'; legacyBefore: string | null; legacyAfter: string | null }
    | { type: 'rename'; beforeName: string; afterName: string }
    | { type: 'lifecycle'; action: 'introduced' | 'retired' }
  );
export interface UpdateClaim {
  id: string;
  verification: Verification;
  verificationNote: string;
  sourceEntryIds: string[];
  legacyKeys: string[];
  effects: UpdateEffect[];
}
export interface CivUpdateEvent {
  id: string;
  versionId: string | null;
  summary: string;
  verification: Verification;
  verificationNote: string;
  scope: UpdateScope;
  civRelations: { civId: string; relation: 'direct' | 'related' | 'provider'; note: string }[];
  claims: UpdateClaim[];
  candidates: { eventId: string; reason: string }[];
}
export interface UpdateCivilization {
  civId: string;
  nameZh: string;
  catalogOrder: number;
  sourceState: SourceState;
  historyCoverage: 'partial' | 'none';
  sectionIds: string[];
  eventIds: string[];
  sourceEntryCount: number | null;
  eventCount: number | null;
  versionCount: number | null;
  unknownVersionEventCount: number | null;
  reason: string;
}
export interface LegacyUpdateMapping {
  key: string;
  patchId: string;
  entryId: string;
  disposition: 'migrated' | 'archive-only';
  eventId: string | null;
  claimId: string | null;
  reason: string;
  projections: { civId: string; relation: 'direct' | 'related'; note: string }[];
  originalRecord: Record<string, unknown>;
}
export interface CivUpdatesData {
  schemaVersion: 1;
  meta: {
    coverageNote: string;
    sourceScopeNote: string;
    catalogSize: number;
    legacyBaseline: { path: string; sha256: string; entryCount: number; civEntryCount: number; metadata: Record<string, unknown> }[];
  };
  versions: UpdateVersion[];
  sources: UpdateSource[];
  sections: UpdateSection[];
  sourceEntries: UpdateSourceEntry[];
  entities: UpdateEntity[];
  events: CivUpdateEvent[];
  civilizations: UpdateCivilization[];
  legacyMap: LegacyUpdateMapping[];
  units?: UnitUpdateData;
  buildings?: BuildingUpdateData;
  techs?: TechUpdateData;
}

export const SOURCE_STATE_LABELS: Record<SourceState, string> = {
  processed: '已逐条处理',
  pending: '导入待核',
  'page-not-found': '未找到页面',
  'no-log': '来源无日志',
};
export const VERIFICATION_LABELS: Record<Verification, string> = { verified: '已核实', unverified: '未核实', conflict: '来源冲突，尚未确认' };
export const SOURCE_CATEGORY_LABELS: Record<SourceCategory, string> = { official: '官方', community: '社区', other: '其他', unknown: '来源类别未知' };
export const OVERVIEW_KEYS = ['histQuery', 'histCoverage', 'histSourceState', 'histListOrder'] as const;
export const DETAIL_KEYS = ['histQuery', 'histVersion', 'histSource', 'histVerification', 'histOrder', 'histEvent'] as const;
const OLD_KEYS = ['histKind', 'histRelation', 'histFrom', 'histTo'];

function singleError(query: URLSearchParams, keys: readonly string[]) {
  return keys.some((key) => query.getAll(key).length > 1) ? '筛选条件无法识别：重复参数' : undefined;
}
function enumError(query: URLSearchParams, choices: Record<string, readonly string[]>) {
  for (const [key, values] of Object.entries(choices)) {
    const value = query.get(key);
    if (value !== null && !values.includes(value)) return `筛选条件无法识别：${key}`;
  }
  return undefined;
}
export function overviewQueryError(query: URLSearchParams) {
  if ([...query.keys()].some((key) => key.startsWith('hist') && !(OVERVIEW_KEYS as readonly string[]).includes(key)))
    return '该文明总览筛选参数不再适用，请清除筛选';
  return (
    singleError(query, OVERVIEW_KEYS) ??
    enumError(query, { histCoverage: ['partial', 'none'], histSourceState: Object.keys(SOURCE_STATE_LABELS), histListOrder: ['catalog', 'name'] })
  );
}
export function detailQueryError(query: URLSearchParams, data: CivUpdatesData, civId: string) {
  if (!data.civilizations.some((civ) => civ.civId === civId)) return '未找到这个文明';
  const invalid = singleError(query, [...DETAIL_KEYS, 'histReturn', ...OLD_KEYS]);
  if (invalid) return invalid;
  if (OLD_KEYS.some((key) => query.has(key))) return '旧文明历史筛选已不再适用，请清除筛选';
  if ([...query.keys()].some((key) => key.startsWith('hist') && ![...DETAIL_KEYS, 'histReturn'].includes(key))) return '该文明历史筛选参数不再适用，请清除筛选';
  if (query.has('histEvent') && !data.events.some((e) => e.id === query.get('histEvent') && e.civRelations.some((r) => r.civId === civId)))
    return '事件定位不属于该文明';
  const choice = enumError(query, {
    histSource: ['official', 'community', 'other'],
    histVerification: ['verified', 'unverified', 'conflict'],
    histOrder: ['newest', 'oldest'],
    histVersion: ['unknown', ...data.versions.map((version) => version.id)],
  });
  if (choice) return choice;
  if (query.has('histReturn') && !validHistoryReturn(query.get('histReturn'), data)) return '返回地址无法识别，请清除无效返回地址';
  return undefined;
}
/** Validate every decoded parameter before dispatching to a history reader. */
export function validHistoryReturn(raw: string | null, data?: CivUpdatesData): string | null {
  const unsafe = (value: string) => /[\\#]/u.test(value) || [...value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);
  if (!raw || unsafe(raw)) return null;
  const [path, ...tail] = raw.split('?');
  if (tail.length > 1) return null;
  const params = new URLSearchParams(tail[0] ?? '');
  if ([...params].some(([key, value]) => key === 'histReturn' || params.getAll(key).length !== 1 || unsafe(key) || unsafe(value))) return null;
  if (
    path?.startsWith('/tech/') ||
    params.get('histView')?.startsWith('tech') ||
    params.get('obj')?.startsWith('tech:') ||
    params.get('histEntity')?.startsWith('tech/') ||
    params.has('techSourceState') ||
    params.has('techIdentity')
  )
    return data ? techHistoryReturn(data, raw) : null;
  if (
    path?.startsWith('/building/') ||
    path?.startsWith('/civ/') ||
    [...params].some(([key, value]) => ['histView', 'histEntity', 'buildingSourceState'].includes(key) || (key === 'obj' && value.startsWith('building:')))
  )
    return data ? buildingHistoryReturn(data, raw) : null;
  if (path?.startsWith('/unit/') || params.get('obj')?.startsWith('unit:') || params.has('unitSourceState')) {
    if (!data || unitQueryError(data, params) || unitCoverageQueryError(params)) return null;
    if (path?.startsWith('/unit/') && params.has('obj')) return null;
    const id = path?.startsWith('/unit/') ? path.slice(1) : params.has('obj') ? 'unit/' + params.get('obj')!.slice(5) : null;
    if (id && !data.units?.rows.some((row) => row.entityId === id)) return null;
    if (path?.startsWith('/unit/')) {
      const allowed = ['tab', 'civ', 'me', 'opp', 'histQuery', 'histEvent', ...UNIT_FILTER_KEYS];
      if ([...params.keys()].some((key) => !allowed.includes(key)) || (params.has('tab') && params.get('tab') !== 'history')) return null;
      for (const key of ['civ', 'me', 'opp']) if (params.has(key) && !data.civilizations.some((c) => c.civId === params.get(key))) return null;
      return path + (params.size ? '?' + params.toString() : '');
    }
    return unitHistoryReturn(raw);
  }
  if (path !== '/patches' || [...params.keys()].some((key) => !(OVERVIEW_KEYS as readonly string[]).includes(key)) || overviewQueryError(params)) return null;
  return raw;
}
export function clearHistoryQuery(query: URLSearchParams, view: 'overview' | 'detail', data?: CivUpdatesData) {
  const result = new URLSearchParams(query);
  for (const key of [...result.keys()]) {
    if (!key.startsWith('hist')) continue;
    if (view === 'detail' && key === 'histReturn' && result.getAll(key).length === 1 && validHistoryReturn(result.get(key), data)) continue;
    result.delete(key);
  }
  return result;
}
export function setHistoryQuery(query: URLSearchParams, key: string, value: string) {
  const result = new URLSearchParams(query);
  if (!value || (key === 'histListOrder' && value === 'catalog') || (key === 'histOrder' && value === 'newest')) result.delete(key);
  else result.set(key, value);
  return result;
}
const collator = new Intl.Collator('zh-CN');
export function filterCivilizationUpdates(data: CivUpdatesData, query: URLSearchParams): UpdateCivilization[] {
  if (overviewQueryError(query)) return [];
  const text = (query.get('histQuery') ?? '').trim().toLowerCase();
  const rows = data.civilizations.filter(
    (civ) =>
      (!text || `${civ.nameZh} ${civ.civId}`.toLowerCase().includes(text)) &&
      (!query.has('histCoverage') || civ.historyCoverage === query.get('histCoverage')) &&
      (!query.has('histSourceState') || civ.sourceState === query.get('histSourceState')),
  );
  return rows.sort(
    (a, b) =>
      (query.get('histListOrder') === 'name' ? collator.compare(a.nameZh, b.nameZh) : 0) || a.catalogOrder - b.catalogOrder || a.civId.localeCompare(b.civId),
  );
}
export function eventSourceEntries(data: CivUpdatesData, event: CivUpdateEvent) {
  const ids = new Set(event.claims.flatMap((claim) => claim.sourceEntryIds));
  return data.sourceEntries.filter((entry) => ids.has(entry.id));
}
export function eventsForCivilization(data: CivUpdatesData, civId: string) {
  const ids = new Set(data.civilizations.find((civ) => civ.civId === civId)?.eventIds ?? []);
  return data.events.filter((event) => ids.has(event.id));
}
export function compareUpdateVersions(a: UpdateVersion | undefined, b: UpdateVersion | undefined, oldest = false) {
  if (!a || !b) return !a ? (!b ? 0 : 1) : -1;
  if (a.build !== null && b.build !== null) return (oldest ? 1 : -1) * (a.build - b.build);
  if (a.orderKey === null || b.orderKey === null) return a.orderKey === null ? (b.orderKey === null ? a.id.localeCompare(b.id) : 1) : -1;
  return (oldest ? 1 : -1) * a.orderKey.localeCompare(b.orderKey);
}
export function filterCivUpdates(data: CivUpdatesData, civId: string, query: URLSearchParams): CivUpdateEvent[] {
  if (detailQueryError(query, data, civId)) return [];
  const versions = new Map(data.versions.map((version) => [version.id, version]));
  const sources = new Map(data.sources.map((source) => [source.id, source]));
  const entries = new Map(data.sourceEntries.map((entry) => [entry.id, entry]));
  const identities = new Map(data.entities.map((entity) => [entity.id, entity]));
  const text = (query.get('histQuery') ?? '').trim().toLowerCase();
  const version = query.get('histVersion');
  const category = query.get('histSource');
  return eventsForCivilization(data, civId)
    .filter((event) => {
      if (version && (version === 'unknown' ? event.versionId !== null : version !== event.versionId)) return false;
      if (query.has('histVerification') && event.verification !== query.get('histVerification')) return false;
      const eventEntries = event.claims.flatMap((claim) => claim.sourceEntryIds.map((id) => entries.get(id)));
      const entityNames = event.claims.flatMap((claim) =>
        claim.effects.flatMap((effect) =>
          effect.entityRefs.flatMap((reference) => {
            const entity = 'entityId' in reference ? identities.get(reference.entityId) : undefined;
            return entity ? [entity.nameZh, entity.nameEn, ...entity.aliases] : [];
          }),
        ),
      );
      if (
        category &&
        !eventEntries.some((entry) => {
          const actual = entry && sources.get(entry.sourceId)?.category;
          return category === 'other' ? actual === 'other' || actual === 'unknown' : actual === category;
        })
      )
        return false;
      return (
        !text ||
        JSON.stringify([event.summary, event.claims.flatMap((claim) => claim.effects), eventEntries.map((entry) => entry?.originalText), entityNames])
          .toLowerCase()
          .includes(text)
      );
    })
    .sort(
      (a, b) =>
        compareUpdateVersions(versions.get(a.versionId ?? ''), versions.get(b.versionId ?? ''), query.get('histOrder') === 'oldest') ||
        a.id.localeCompare(b.id),
    );
}
export function updateEventCounts(events: readonly CivUpdateEvent[]) {
  return {
    events: events.length,
    versions: new Set(events.flatMap((event) => (event.versionId === null ? [] : [event.versionId]))).size,
    unknown: events.filter((event) => event.versionId === null).length,
  };
}
export function safeHistorySourceUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

/** Cross-reference checks at the fetch boundary; schema checks shape before this runs. */
export function assertCivUpdateReferences(data: CivUpdatesData): void {
  const unique = <T extends { id: string }>(rows: readonly T[], label: string) => {
    const index = new Map(rows.map((row) => [row.id, row]));
    if (index.size !== rows.length) throw new Error(`重复的${label}身份`);
    return index;
  };
  const versions = unique(data.versions, '版本');
  const sources = unique(data.sources, '来源');
  const sections = unique(data.sections, '章节');
  const entries = unique(data.sourceEntries, '原文');
  const entities = unique(data.entities, '实体');
  const events = unique(data.events, '事件');
  const civIds = new Set(data.civilizations.map((civ) => civ.civId));
  if (civIds.size !== data.civilizations.length || civIds.size !== data.meta.catalogSize) throw new Error('文明目录不完整或重复');
  const fail = () => {
    throw new Error('文明历史引用或计数无效');
  };
  const scopeCheck = (scope: UpdateScope) => {
    if ([...scope.providerCivIds, ...scope.affectedCivIds].some((id) => !civIds.has(id))) fail();
  };
  const claimIds = new Set<string>();
  const effectIds = new Set<string>();
  for (const event of events.values()) {
    if (event.versionId !== null && !versions.has(event.versionId)) fail();
    if (
      (!event.civRelations.length &&
        ![...(data.units?.relations ?? []), ...(data.buildings?.relations ?? []), ...(data.techs?.relations ?? [])].some((row) => row.eventId === event.id)) ||
      event.civRelations.some((row) => !civIds.has(row.civId))
    )
      fail();
    scopeCheck(event.scope);
    for (const candidate of event.candidates) if (!events.has(candidate.eventId) || candidate.eventId === event.id) fail();
    if (event.verification === 'conflict' && event.claims.length < 2) fail();
    for (const claim of event.claims) {
      if (claimIds.has(claim.id)) fail();
      claimIds.add(claim.id);
      for (const id of claim.sourceEntryIds) if (!entries.get(id)?.eventIds.includes(event.id)) fail();
      for (const effect of claim.effects) {
        if (effectIds.has(effect.id)) fail();
        effectIds.add(effect.id);
        if (effect.scope) scopeCheck(effect.scope);
        for (const ref of effect.entityRefs) if ('entityId' in ref && !entities.has(ref.entityId)) fail();
      }
    }
  }
  for (const source of sources.values()) if (source.url !== null && !safeHistorySourceUrl(source.url)) fail();
  for (const entry of entries.values()) {
    if (!sources.has(entry.sourceId) || (entry.sectionId !== null && !sections.get(entry.sectionId)?.entryIds.includes(entry.id))) fail();
    if (entry.processing === 'mapped' && !entry.eventIds.length) fail();
    if (entry.processing === 'excluded' && entry.eventIds.length) fail();
    for (const id of entry.eventIds) if (!events.get(id)?.claims.some((claim) => claim.sourceEntryIds.includes(entry.id))) fail();
    for (const id of entry.supersedesEntryIds) {
      const old = entries.get(id);
      if (!old || old.id === entry.id || old.sourceId !== entry.sourceId || old.sectionId === entry.sectionId) fail();
    }
  }
  for (const section of sections.values()) {
    if (
      !sources.has(section.sourceId) ||
      (section.civId === null
        ? !section.entityIds?.length || section.entityIds.some((id) => !['unit', 'building'].includes(entities.get(id)?.type ?? ''))
        : !civIds.has(section.civId)) ||
      section.entryIds.length !== section.observedEntryCount
    )
      fail();
    if (new Set(section.entryIds).size !== section.entryIds.length) fail();
    for (const id of section.entryIds) if (entries.get(id)?.sectionId !== section.id) fail();
    if (
      section.sourceState === 'processed' &&
      !section.entityIds?.every((id) => entities.get(id)?.type === 'building') &&
      section.entryIds.some((id) => entries.get(id)?.processing === 'pending')
    )
      fail();
    if (section.sourceState === 'no-log' && section.entryIds.length) fail();
    let parent = section.supersedesRevisionId;
    const visited = new Set([section.revisionId]);
    while (parent !== null) {
      if (visited.has(parent)) fail();
      visited.add(parent);
      const previous = sections.get(`${section.sourceId}:${parent}`);
      if (!previous) fail();
      parent = previous!.supersedesRevisionId;
    }
  }
  for (const civ of data.civilizations) {
    const actual = data.events.filter((event) => event.civRelations.some((relation) => relation.civId === civ.civId));
    const counts = updateEventCounts(actual);
    if (civ.eventIds.length !== new Set(civ.eventIds).size || actual.length !== civ.eventIds.length || actual.some((event) => !civ.eventIds.includes(event.id)))
      fail();
    if (civ.eventCount !== counts.events || civ.versionCount !== counts.versions || civ.unknownVersionEventCount !== counts.unknown) fail();
    if ((actual.length ? 'partial' : 'none') !== civ.historyCoverage) fail();
    const civSections = civ.sectionIds.map((id) => sections.get(id));
    if (civSections.some((section) => !section || section.civId !== civ.civId)) fail();
    const originalCount = new Set(civSections.flatMap((section) => section?.entryIds ?? [])).size;
    if (civ.sourceEntryCount !== originalCount) fail();
    if (civ.sourceState === 'processed' && (!civSections.length || civSections.some((section) => section?.sourceState !== 'processed'))) fail();
    if (civSections.some((section) => section?.sourceState === 'pending') && civ.sourceState !== 'pending') fail();
  }
  for (const mapping of data.legacyMap) {
    if (mapping.disposition === 'archive-only') {
      if (mapping.eventId !== null || mapping.claimId !== null || mapping.projections.length) fail();
    } else {
      const event = events.get(mapping.eventId ?? '');
      if (!event?.claims.some((claim) => claim.id === mapping.claimId && claim.legacyKeys.includes(mapping.key))) fail();
      for (const projection of mapping.projections) if (!event?.civRelations.some((relation) => relation.civId === projection.civId)) fail();
    }
  }
  for (const version of versions.values()) {
    if (version.evidenceSourceIds.some((id) => !sources.has(id))) fail();
    if (version.build !== null && version.orderKey !== `03:${String(version.build).padStart(8, '0')}`) fail();
  }
  for (const entity of entities.values()) {
    if (entity.status === 'retired' && entity.linkPath !== null) fail();
    if (
      entity.linkPath !== null &&
      (!/^\/(civ|unit|building|tech)\/[A-Za-z0-9-]+$/u.test(entity.linkPath) || entity.linkPath !== `/${entity.type}/${entity.catalogId}`)
    )
      fail();
  }
  for (const [kind, units] of [
    ['unit', data.units],
    ['building', data.buildings],
    ['tech', data.techs],
  ] as const) {
    if (!units) continue;
    const ids = new Set(units.rows.map((row) => row.entityId));
    if (ids.size !== units.rows.length || ids.size !== units.catalogSize) fail();
    for (const row of units.rows) {
      if (entities.get(row.entityId)?.type !== kind || row.familyIds.some((id) => !ids.has(id))) fail();
      if (new Set(row.eventIds).size !== row.eventIds.length) fail();
      const actual = new Set(units.relations.filter((relation) => relation.entityId === row.entityId).map((relation) => relation.eventId));
      if (actual.size !== row.eventIds.length || row.eventIds.some((id) => !actual.has(id))) fail();
      const own = row.sectionIds.map((id) => sections.get(id));
      if (own.some((section) => !section?.entityIds?.includes(row.entityId))) fail();
      if (row.sourceEntryCount !== (own.length ? own.reduce((sum, section) => sum + (section?.observedEntryCount ?? 0), 0) : null)) fail();
      if (row.searchState === 'not-checked' && (own.length || row.checkedAt !== null || row.sourceState !== 'not-checked')) fail();
      if (row.sourceState === 'processed' && (!own.length || own.some((section) => section?.sourceState !== 'processed'))) fail();
      if (row.sourceState === 'no-log' && (!own.length || own.some((section) => section?.sourceState !== 'no-log'))) fail();
      if (row.relatedSectionIds.some((id) => !sections.has(id))) fail();
    }
    for (const relation of units.relations) {
      const event = events.get(relation.eventId);
      const effects = event?.claims.flatMap((claim) => claim.effects) ?? [];
      if (
        entities.get(relation.entityId)?.type !== kind ||
        !event ||
        !relation.effectIds.length ||
        relation.effectIds.some((id) => !effects.some((effect) => effect.id === id))
      )
        fail();
      if (
        relation.relation === 'direct' &&
        relation.effectIds.some(
          (id) => !effects.find((effect) => effect.id === id)?.entityRefs.some((ref) => 'entityId' in ref && ref.entityId === relation.entityId),
        )
      )
        fail();
    }
    const legacyKeys = data.legacyMap
      .filter(
        (row) =>
          row.originalRecord.targetType === kind ||
          (Array.isArray(row.originalRecord.relatedTargets) &&
            row.originalRecord.relatedTargets.some((target: { targetType?: string }) => target.targetType === kind)),
      )
      .map((row) => row.key);
    if (units.legacyMap.length !== legacyKeys.length || new Set(units.legacyMap.map((row) => row.key)).size !== legacyKeys.length) fail();
    for (const mapping of units.legacyMap) {
      const claim = events.get(mapping.eventId)?.claims.find((row) => row.id === mapping.claimId);
      if (
        !legacyKeys.includes(mapping.key) ||
        !claim?.legacyKeys.includes(mapping.key) ||
        mapping.effectIds.some((id) => !claim?.effects.some((effect) => effect.id === id))
      )
        fail();
    }
  }
  if (data.techs) {
    const techs = data.techs;
    const retired = data.entities.filter((e) => e.type === 'tech' && e.status === 'retired');
    if (retired.length !== techs.historicalRows.length || new Set(techs.historicalRows.map((r) => r.entityId)).size !== retired.length) fail();
    for (const row of techs.historicalRows) {
      if (
        !retired.some((e) => e.id === row.entityId && e.linkPath === null) ||
        row.sourceState !== 'not-checked' ||
        row.checkedAt !== null ||
        row.sectionIds.length ||
        row.sourceEntryCount !== null ||
        row.familyIds.length
      )
        fail();
      const ids = new Set(techs.relations.filter((r) => r.entityId === row.entityId).map((r) => r.eventId));
      if (ids.size !== row.eventIds.length || row.eventIds.some((id) => !ids.has(id)) || row.relatedSectionIds.some((id) => !sections.has(id))) fail();
    }
    const projected = new Set(techs.relations.flatMap((r) => r.effectIds));
    if (projected.size !== Object.keys(techs.effectKinds).length || Object.keys(techs.effectKinds).some((id) => !projected.has(id))) fail();
    for (const row of techs.legacyMap) {
      const matches = data.events.flatMap((e) => e.claims.filter((c) => c.legacyKeys.includes(row.key)).map((c) => ({ e, c })));
      const old = data.legacyMap.find((r) => r.key === row.key);
      if (matches.length !== 1 || matches[0]!.e.id !== row.eventId || matches[0]!.c.id !== row.claimId || matches[0]!.e.versionId !== 'de-' + old?.patchId)
        fail();
    }
  }
}
