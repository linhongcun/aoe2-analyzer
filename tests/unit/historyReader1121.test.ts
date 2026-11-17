import { describe, expect, it } from 'vitest';
import { historyFixture } from '../helpers/civUpdatesFixture';
import { historyFor, type PatchArchive } from '../../src/domain/patchHistory';
import {
  filterReaderEvents,
  historyReaderPath,
  projectReaderEvents,
  readerCoverage,
  readerEntity,
  readerFilters,
  readerNodes,
  readerProcessing,
  readerReturn,
  revealReaderEvent,
} from '../../src/domain/historyReader';
import archive66692 from '../../data/game/patches/66692.json';
import archive81058 from '../../data/game/patches/81058.json';
import archive125283 from '../../data/game/patches/125283.json';
import archive185872 from '../../data/game/patches/185872.json';
import archive188329 from '../../data/game/patches/188329.json';

const data = historyFixture();
const entity = (id: string) => data.entities.find((e) => e.id === id)!;
const project = (id: string) => projectReaderEvents(data, entity(id));
const effectIds = (views: ReturnType<typeof project>) => views.flatMap((v) => v.event.claims.flatMap((c) => c.effects.map((f) => f.id)));
const query = (v: string) => new URLSearchParams(v);

describe('precise history projections', () => {
  it('selects only the Chinese effect of a nine-civilization event', () => {
    const view = project('civ/Chinese').find((v) => v.event.id === 'ev-legacy-66692-b007')!;
    expect(view.original.claims.flatMap((c) => c.effects)).toHaveLength(9);
    const effects = view.event.claims.flatMap((c) => c.effects);
    expect(effects).toHaveLength(1);
    expect(effects[0]?.scope?.affectedCivIds).toContain('Chinese');
  });

  it('preserves a provider and does not infer the identities of beneficiaries', () => {
    const id = 'ev-legacy-81058-b056';
    for (const object of ['civ/Ethiopians', 'building/79']) {
      const view = project(object).find((v) => v.event.id === id)!;
      const effect = view.event.claims.flatMap((c) => c.effects)[0]!;
      expect(effect.scope ?? view.original.scope).toMatchObject({ scopeKind: 'team', providerCivIds: ['Ethiopians'], affectedCivIds: [] });
    }
  });

  it('keeps exact forms and research categories', () => {
    const ids = ['unit/1231', 'unit/1233', 'unit/1260'];
    for (const id of ids) {
      const rows = project(id).filter((r) => r.event.versionId === 'de-61321');
      expect(rows.flatMap((r) => r.relations).every((r) => r.entityId === id)).toBe(true);
      expect(
        rows
          .flatMap((r) => r.event.claims.flatMap((c) => c.effects))
          .every((s) => !s.entityRefs.some((r) => 'entityId' in r && ids.includes(r.entityId) && r.entityId !== id)),
      ).toBe(true);
    }
    const costs = project('tech/10').find(
      (v) => v.event.claims.flatMap((c) => c.effects).filter((f) => 'attribute' in f && f.attribute.includes('成本')).length >= 3,
    )!;
    expect(
      costs.event.claims
        .flatMap((c) => c.effects)
        .filter((f) => 'attribute' in f && f.attribute.includes('成本'))
        .map((f) => 'unit' in f && f.unit),
    ).toEqual(expect.arrayContaining(['食物', '木材', '黄金']));
    expect(effectIds([costs]).some((id) => data.techs?.effectKinds[id] === 'parameter')).toBe(true);
  });
});

it('intersects on the same projected effect/claim and removes a minimal set in fixed order', () => {
  const view = project('tech/463').find((r) => r.event.id === 'ev-se-71636ab5-9a50-4128-bce9-8212abc5e6d7')!;
  const claims = view.event.claims;
  expect(claims.some((c) => c.effects.length)).toBe(true);
  const original = { ...view.original, id: 'labelled-filter-fixture', versionId: 'de-61321' };
  const base = {
    ...original,
    scope: { scopeKind: 'unknown' as const, providerCivIds: [], affectedCivIds: [], beneficiary: 'unknown' as const, conditions: [] },
  };
  const template = claims.flatMap((c) => c.effects)[0]!;
  const official = data.sourceEntries.find((entry) => data.sources.some((s) => s.id === entry.sourceId && s.category === 'official'))!;
  const community = data.sourceEntries.find((entry) => data.sources.some((s) => s.id === entry.sourceId && s.category === 'community'))!;
  const event = {
    ...base,
    claims: [
      {
        ...claims[0]!,
        id: 'a',
        sourceEntryIds: [official.id],
        effects: [{ ...template, id: 'a1', conditions: [], scope: { ...base.scope, scopeKind: 'civ' as const, affectedCivIds: ['Chinese'] } }],
      },
      { ...claims[0]!, id: 'b', sourceEntryIds: [community.id], effects: [{ ...template, id: 'b1', conditions: [], scope: base.scope }] },
    ],
  };
  const rows = [{ ...view, event, original: event }];
  expect(filterReaderEvents(data, rows, query('histVersion=de-34055,de-61321'))).toHaveLength(1);
  expect(filterReaderEvents(data, rows, query('histCiv=Chinese'))).toHaveLength(1);
  expect(filterReaderEvents(data, rows, query('histSource=community'))).toHaveLength(1);
  expect(filterReaderEvents(data, rows, query('histSource=community&histCiv=Chinese'))).toHaveLength(0);
  expect(filterReaderEvents(data, rows, query('histCondition=unknown&histCiv=Chinese'))).toHaveLength(0);
  expect(revealReaderEvent(data, rows[0]!, query('histSource=community&histCiv=Chinese&histOrder=oldest')).removed).toEqual(['histSource']);
});

it('keeps valid list members, rejects duplicate keys, and preserves legal zero-match conditions', () => {
  const result = readerFilters(data, query('histVersion=de-61321,,invalid&histVerification=conflict&histVerification=unverified&histCiv=Cumans'));
  expect(result.invalid).toEqual(['histVersion', 'histVerification']);
  expect(Object.fromEntries(result.valid)).toEqual({ histVersion: 'de-61321', histCiv: 'Cumans' });
  expect(readerFilters(data, query('histVerification=conflict')).valid.get('histVerification')).toBe('conflict');
});

it('separates request-independent coverage from source processing and shared events', () => {
  const tower = entity('building/79');
  const rows = readerProcessing(data, tower, project(tower.id));
  const own = rows.filter((r) => r.labels.includes('own'));
  expect(['mapped', 'pending', 'excluded'].map((type) => own.filter((r) => r.entry.processing === type).length)).toEqual([19, 8, 2]);
  expect(rows.some((r) => !r.labels.includes('own') && r.labels.includes('claim'))).toBe(true);
  expect(readerCoverage(data, entity('civ/Danes'))?.state).toBe('no-log');
  expect(project('civ/Danes').length).toBeGreaterThan(0);
  expect(readerCoverage(data, entity('tech/10'))?.state).toBe('not-checked');
  expect(project('tech/10').length).toBeGreaterThan(0);
});

it('sorts registered and comparable versions using order keys, not build number or release date', () => {
  const example = project('unit/1231')[0]!;
  const base = data.versions[0]!;
  const versions = [
    { ...base, id: 'pup-fixture', orderKey: '01', channel: 'pup' as const, releaseDate: null },
    { ...base, id: 'hotfix-fixture', orderKey: '02', channel: 'hotfix' as const },
    { ...base, id: 'unordered-fixture', orderKey: null },
  ];
  const views = [...versions.map((v) => v.id), null].map((versionId) => ({ ...example, event: { ...example.event, versionId } }));
  expect(readerNodes({ ...data, versions }, views, false).map((r) => r.id)).toEqual(['hotfix-fixture', 'pup-fixture', 'unknown', 'unordered-fixture']);
  expect(readerNodes({ ...data, versions }, views, true).map((r) => r.id)).toEqual(['pup-fixture', 'hotfix-fixture', 'unknown', 'unordered-fixture']);
});

it('keeps archives and archive-only IDs separate without turning archive dates into release dates', () => {
  const archives = [archive66692, archive81058, archive125283, archive185872, archive188329] as PatchArchive[];
  const identities = new Set(archives.flatMap((a) => a.entries.map((e) => a.id + ':' + e.id)));
  expect(identities.size).toBe(366);
  const archiveOnly = data.legacyMap.filter((row) => row.disposition === 'archive-only');
  expect(archiveOnly).toHaveLength(77);
  expect(archiveOnly.every((r) => identities.has(r.patchId + ':' + r.entryId))).toBe(true);
  expect(archives[3]).toMatchObject({ date: '2026-09-23' });
  expect(archives[3]?.releaseType).toBeUndefined();
  expect(archives[3]?.releaseDate).toBeUndefined();
  expect(archives[4]).toMatchObject({ releaseDate: '2026-10-27', publishedAt: '2026-10-28', sourcePublishedAt: '2026-10-27T10:04:41-07:00' });
  expect(historyFor(archives, { targetType: 'unit', targetId: 1231 }).every((r) => identities.has(r.patch.id + ':' + r.entry.id))).toBe(true);
});

it('accepts exact single-layer object, encyclopedia, and known archive returns', () => {
  const event = project('unit/1231')[0]!.event.id;
  const path = historyReaderPath('unit/1231', query('histVersion=de-61321,de-34055'), event);
  expect(readerReturn(data, path)).toBe(path);
  expect(readerReturn(data, '/unit/1231/Cumans/4//0?tab=history')).toBe('/unit/1231/Cumans/4//0?tab=history');
  expect(readerReturn(data, '/civ/Cumans?tab=history#patches')).toBe('/civ/Cumans?tab=history#patches');
  expect(readerReturn(data, '/building/79?tab=history')).toBe('/building/79?tab=history');
  expect(readerReturn(data, '/patches/185872?kind=adjust&q=111')).toBe('/patches/185872?kind=adjust&q=111');
  expect(readerEntity(data, query('obj=tech:716@retired'))?.id).toBe('tech/716@retired');
  expect(readerReturn(data, historyReaderPath('unit/759', undefined, event))).toBeNull();
  expect(readerEntity(data, query('obj=tech:716@retired&histEntity=tech/716@retired'))).toBeUndefined();
});

it.each([
  '//example.invalid/path',
  'javascript:alert(0)',
  '/patches?obj=unit%3A1231&obj=unit%3A1233',
  '/unit/1231/Cumans/4//0/extra',
  '/unit/1231/invalid/4//0',
  '/unit/1231/Cumans/9//0',
  '/unit/1231/Cumans/4//99999',
  '/unit/1231?tab=history&tab=ov',
  '/unit/1231?tab=history&unknown=x',
  '/unit/1231?civ=Cumans%0a',
  '/unit/1231%5Cx',
  '/patches/123456789?q=abc',
  '/building/79?tab=history&histReturn=%2Fpatches',
  '/tech/10?obj=unit:1231',
])('rejects malformed return %s without changing object identity', (path) => {
  expect(readerReturn(data, path)).toBeNull();
});
