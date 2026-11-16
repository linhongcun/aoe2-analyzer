import { afterEach, describe, expect, it, vi } from 'vitest';
import background from '../../data/content/civs/history.json';
import validateUpdates from '../../src/content/schema/compiled/civ-updates.mjs';
import { CIV_HISTORY } from '../../src/features/civs/history';
import {
  assertCivUpdateReferences,
  clearHistoryQuery,
  compareUpdateVersions,
  detailQueryError,
  eventSourceEntries,
  eventsForCivilization,
  filterCivilizationUpdates,
  filterCivUpdates,
  overviewQueryError,
  safeHistorySourceUrl,
  setHistoryQuery,
  updateEventCounts,
  validHistoryReturn,
} from '../../src/domain/civUpdates';
import { conflictHistoryFixture, emptyHistoryFixture, historyFixture } from '../helpers/civUpdatesFixture';
import { createSchemaCompiler, SCHEMA_ID_BASE } from '../../scripts/content-schema.mjs';

const data = historyFixture();
const params = (text = '') => new URLSearchParams(text);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('civilization update contract, independent of background history', () => {
  it('validates the actual complete payload and reconciles explicit civilization projections', () => {
    expect(validateUpdates(data)).toBe(true);
    expect(() => assertCivUpdateReferences(data)).not.toThrow();
    expect(data.civilizations).toHaveLength(data.meta.catalogSize);
    const cumans = data.civilizations.find((civ) => civ.civId === 'Cumans')!;
    expect(cumans.sourceEntryCount).toBe(20);
    expect(updateEventCounts(filterCivUpdates(data, 'Cumans', params('histSource=community')))).toEqual({ events: 20, versions: 10, unknown: 0 });
    expect(eventsForCivilization(data, 'Cumans')).toHaveLength(cumans.eventCount!);
  });

  it('keeps both JSON schema roots and the old background API separate (R1)', () => {
    const compiler = createSchemaCompiler();
    const oldValidator = compiler.getSchema(SCHEMA_ID_BASE + 'content-civ-history.json');
    if (!oldValidator) throw new Error('Missing background schema boundary');
    expect(oldValidator(background)).toBe(true);
    expect(oldValidator(data)).toBe(false);
    expect(validateUpdates(background)).toBe(false);
    expect(typeof CIV_HISTORY.Cumans?.summary).toBe('string');
  });

  it('ANDs overview keyword, coverage and source status before sorting', () => {
    expect(filterCivilizationUpdates(data, params('histQuery=库曼&histCoverage=partial&histSourceState=processed')).map((row) => row.civId)).toEqual([
      'Cumans',
    ]);
    expect(filterCivilizationUpdates(data, params('histQuery=库曼&histCoverage=partial&histSourceState=no-log'))).toEqual([]);
    expect(
      filterCivilizationUpdates(data, params('histSourceState=no-log'))
        .map((row) => row.civId)
        .sort(),
    ).toEqual(['Danes', 'Saxons']);
    const names = filterCivilizationUpdates(data, params('histListOrder=name'));
    const collator = new Intl.Collator('zh-CN');
    expect(names.every((row, index) => index === 0 || collator.compare(names[index - 1]!.nameZh, row.nameZh) <= 0)).toBe(true);
    const tied = historyFixture();
    for (const civ of tied.civilizations) civ.nameZh = '同名';
    expect(filterCivilizationUpdates(tied, params('histListOrder=name')).map((row) => row.civId)).toEqual(tied.civilizations.map((row) => row.civId));
  });

  it.each([
    'histCoverage=all',
    'histSourceState=ready',
    'histListOrder=date',
    'histQuery=a&histQuery=b',
    'histSourceState=pending&histSourceState=no-log',
    'histFrom=2020-01-01',
    'histVersion=de-34055',
    'histOther=x',
  ])('shows an overview error instead of all records for %s', (raw) => {
    expect(overviewQueryError(params(raw))).toBeTruthy();
    expect(filterCivilizationUpdates(data, params(raw))).toEqual([]);
    expect(overviewQueryError(clearHistoryQuery(params(raw), 'overview'))).toBeUndefined();
  });

  it('combines detail criteria, leaves conflicting claims together and counts events once', () => {
    const fixture = conflictHistoryFixture();
    expect(validateUpdates(fixture)).toBe(true);
    expect(() => assertCivUpdateReferences(fixture)).not.toThrow();
    const results = filterCivUpdates(fixture, 'Cumans', params('histVersion=de-34055&histSource=other&histVerification=conflict&histQuery=测试'));
    expect(results).toHaveLength(1);
    expect(results[0]!.claims).toHaveLength(2);
    expect(results[0]!.claims.map((claim) => claim.effects[0]!.type === 'numeric' && claim.effects[0]!.after)).toEqual([0, 1]);
    expect(eventSourceEntries(fixture, results[0]!)).toHaveLength(2);
    expect(updateEventCounts(results)).toEqual({ events: 1, versions: 1, unknown: 0 });
  });

  it('searches displayed historical entity names and aliases without expanding their civilization scope', () => {
    for (const text of ['补给', 'Supplies', '供给']) {
      expect(filterCivUpdates(data, 'Cumans', params(`histQuery=${text}`)).map((event) => event.id)).toContain('ev-se-23238351-959c-42c5-872f-b6f1355ebc21');
    }
    expect(filterCivUpdates(data, 'Cumans', params('histQuery=木栅栏')).map((event) => event.id)).toContain('ev-se-efeba570-f6ef-4f76-805e-a080f02f7487');
    expect(filterCivUpdates(data, 'Danes', params('histQuery=Supplies'))).toEqual([]);
    expect(filterCivUpdates(data, 'Cumans', params('histQuery=补给&histVersion=de-34055'))).toEqual([]);
  });

  it('keeps unknown chronology last in either order and orders known historical version labels', () => {
    const historical = data.versions.filter((v) => v.id.startsWith('source-')).sort((a, b) => compareUpdateVersions(a, b, true));
    expect(historical[0]!.label).toContain('1.0c');
    expect(compareUpdateVersions(undefined, historical[0])).toBeGreaterThan(0);
    expect(compareUpdateVersions(undefined, historical[0], true)).toBeGreaterThan(0);
    const rows = filterCivUpdates(data, 'Incas', params('histVersion=unknown'));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((event) => event.versionId === null)).toBe(true);
  });

  it('compares five/six-digit builds numerically and rejects inconsistent sort metadata', () => {
    const early = { ...data.versions.find((version) => version.build === 34055)!, orderKey: '2:9999999999' };
    const later = { ...data.versions.find((version) => version.build === 188329)!, orderKey: null };
    expect([early, later].sort(compareUpdateVersions).map((version) => version.build)).toEqual([188329, 34055]);
    expect([later, early].sort((a, b) => compareUpdateVersions(a, b, true)).map((version) => version.build)).toEqual([34055, 188329]);
    for (const orderKey of ['2:9999999999', null]) {
      const changed = structuredClone(data);
      changed.versions.find((version) => version.build === 34055)!.orderKey = orderKey;
      expect(() => assertCivUpdateReferences(changed)).toThrow();
    }
  });

  it.each([
    'histVerification=official',
    'histSource=all',
    'histVersion=123',
    'histOrder=date',
    'histSource=community&histSource=official',
    'histKind=nerf',
    'histCoverage=none',
    'histReturn=https%3A%2F%2Fevil.example',
    'histReturn=%2Fpatches&histReturn=%2Fpatches',
  ])('rejects invalid/old detail parameters without losing its valid return context: %s', (raw) => {
    expect(detailQueryError(params(raw), data, 'Cumans')).toBeTruthy();
    expect(filterCivUpdates(data, 'Cumans', params(raw))).toEqual([]);
    expect(detailQueryError(clearHistoryQuery(params(raw), 'detail'), data, 'Cumans')).toBeUndefined();
  });

  it('round-trips the full overview URL and clears only history filters in detail', () => {
    const path = '/patches?histQuery=%E5%BA%93%E6%9B%BC&histCoverage=partial&histSourceState=processed&histListOrder=name';
    const query = new URLSearchParams({ tab: 'history', histReturn: path, histSource: 'community', histQuery: 'HP' });
    const cleared = clearHistoryQuery(query, 'detail');
    expect(cleared.get('histReturn')).toBe(path);
    expect(cleared.get('tab')).toBe('history');
    expect(cleared.has('histQuery')).toBe(false);
    expect(setHistoryQuery(cleared, 'histOrder', 'oldest').get('histReturn')).toBe(path);
    for (const invalid of ['https://evil.example/patches', '//evil.example/patches', '/patches/1', '/patches#x', '/patches\\evil', '/patches\n'])
      expect(validHistoryReturn(invalid)).toBeNull();
    expect(validHistoryReturn(path)).toBe(path);
    expect(safeHistorySourceUrl('javascript:alert(1)')).toBeNull();
    expect(safeHistorySourceUrl('https://example.com')).toBe('https://example.com/');
  });

  it('preserves empty-history and no-log as different states', () => {
    const empty = emptyHistoryFixture();
    expect(validateUpdates(empty)).toBe(true);
    expect(() => assertCivUpdateReferences(empty)).not.toThrow();
    expect(filterCivilizationUpdates(empty, params('histCoverage=none')).length).toBe(data.civilizations.length);
    expect(filterCivilizationUpdates(data, params('histSourceState=no-log')).every((row) => row.historyCoverage === 'partial')).toBe(true);
  });

  it('fails closed on missing evidence, duplicate identities, stale counts or unsafe entity links', () => {
    const missing = historyFixture();
    missing.events[0]!.claims[0]!.sourceEntryIds = ['missing'];
    expect(() => assertCivUpdateReferences(missing)).toThrow();
    const duplicate = historyFixture();
    duplicate.events.push(duplicate.events[0]!);
    expect(() => assertCivUpdateReferences(duplicate)).toThrow();
    const counts = historyFixture();
    counts.civilizations[0]!.eventCount = 0;
    expect(() => assertCivUpdateReferences(counts)).toThrow();
    const link = historyFixture();
    link.entities[0]!.linkPath = 'https://evil.example';
    expect(() => assertCivUpdateReferences(link)).toThrow();
  });

  it('caches successful typed loads, but clears a failed promise for retry', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValue({ ok: true, json: async () => historyFixture() });
    vi.stubGlobal('fetch', fetch);
    const { loadCivUpdates } = await import('../../src/data/civUpdates');
    await expect(loadCivUpdates()).rejects.toThrow();
    const loaded = await loadCivUpdates();
    expect(loaded.schemaVersion).toBe(1);
    expect(await loadCivUpdates()).toBe(loaded);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
