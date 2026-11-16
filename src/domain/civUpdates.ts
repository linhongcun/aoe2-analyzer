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
  civId: string;
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
}

export const SOURCE_STATE_LABELS: Record<SourceState, string> = {
  processed: '已逐条处理',
  pending: '导入待核',
  'page-not-found': '未找到页面',
  'no-log': '来源无日志',
};
export const VERIFICATION_LABELS: Record<Verification, string> = { verified: '已核实', unverified: '未核实', conflict: '存在冲突' };
export const SOURCE_CATEGORY_LABELS: Record<SourceCategory, string> = { official: '官方', community: '社区', other: '其他', unknown: '来源类别未知' };
export const OVERVIEW_KEYS = ['histQuery', 'histCoverage', 'histSourceState', 'histListOrder'] as const;
export const DETAIL_KEYS = ['histQuery', 'histVersion', 'histSource', 'histVerification', 'histOrder'] as const;
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
  const choice = enumError(query, {
    histSource: ['official', 'community', 'other'],
    histVerification: ['verified', 'unverified', 'conflict'],
    histOrder: ['newest', 'oldest'],
    histVersion: ['unknown', ...data.versions.map((version) => version.id)],
  });
  if (choice) return choice;
  if (query.has('histReturn') && !validHistoryReturn(query.get('histReturn'))) return '返回地址无法识别，请清除无效返回地址';
  return undefined;
}
/** Only a complete router-relative /patches URL; never a redirect to an external host. */
export function validHistoryReturn(raw: string | null): string | null {
  if (!raw || !/^\/patches(?:\?[^#\r\n\\]*)?$/u.test(raw) || [...raw].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))
    return null;
  return raw;
}
export function clearHistoryQuery(query: URLSearchParams, view: 'overview' | 'detail') {
  const result = new URLSearchParams(query);
  for (const key of [...result.keys()]) {
    if (!key.startsWith('hist')) continue;
    if (view === 'detail' && key === 'histReturn' && result.getAll(key).length === 1 && validHistoryReturn(result.get(key))) continue;
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
  if (a.orderKey === null || b.orderKey === null) return a.orderKey === null ? (b.orderKey === null ? a.id.localeCompare(b.id) : 1) : -1;
  return (oldest ? 1 : -1) * a.orderKey.localeCompare(b.orderKey);
}
export function filterCivUpdates(data: CivUpdatesData, civId: string, query: URLSearchParams): CivUpdateEvent[] {
  if (detailQueryError(query, data, civId)) return [];
  const versions = new Map(data.versions.map((version) => [version.id, version]));
  const sources = new Map(data.sources.map((source) => [source.id, source]));
  const entries = new Map(data.sourceEntries.map((entry) => [entry.id, entry]));
  const text = (query.get('histQuery') ?? '').trim().toLowerCase();
  const version = query.get('histVersion');
  const category = query.get('histSource');
  return eventsForCivilization(data, civId)
    .filter((event) => {
      if (version && (version === 'unknown' ? event.versionId !== null : version !== event.versionId)) return false;
      if (query.has('histVerification') && event.verification !== query.get('histVerification')) return false;
      const eventEntries = event.claims.flatMap((claim) => claim.sourceEntryIds.map((id) => entries.get(id)));
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
        JSON.stringify([event.summary, event.claims.flatMap((claim) => claim.effects), eventEntries.map((entry) => entry?.originalText)])
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
    if (!event.civRelations.length || event.civRelations.some((row) => !civIds.has(row.civId))) fail();
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
    if (!sources.has(section.sourceId) || !civIds.has(section.civId) || section.entryIds.length !== section.observedEntryCount) fail();
    if (new Set(section.entryIds).size !== section.entryIds.length) fail();
    for (const id of section.entryIds) if (entries.get(id)?.sectionId !== section.id) fail();
    if (section.sourceState === 'processed' && section.entryIds.some((id) => entries.get(id)?.processing === 'pending')) fail();
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
  for (const version of versions.values()) if (version.evidenceSourceIds.some((id) => !sources.has(id))) fail();
  for (const entity of entities.values()) {
    if (entity.status === 'retired' && entity.linkPath !== null) fail();
    if (
      entity.linkPath !== null &&
      (!/^\/(civ|unit|building|tech)\/[A-Za-z0-9-]+$/u.test(entity.linkPath) || entity.linkPath !== `/${entity.type}/${entity.catalogId}`)
    )
      fail();
  }
}
