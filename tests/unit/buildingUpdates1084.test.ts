import { describe, expect, it } from 'vitest';
import {
  buildingHistoryPath,
  buildingHistoryReturn,
  buildingQueryErrors,
  clearBuildingFilters,
  filterBuildingEvents,
  projectBuildingEvents,
  recoverBuildingQuery,
  searchUpdateBuildings,
} from '../../src/domain/buildingUpdates';
import { assertCivUpdateReferences, validHistoryReturn, type UpdateEffect } from '../../src/domain/civUpdates';
import { partitionUnitScopes } from '../../src/domain/unitUpdates';
import { historyFixture } from '../helpers/civUpdatesFixture';

const data = historyFixture();
const q = (text = '') => new URLSearchParams(text);
const effects = (id: string, version: string) =>
  filterBuildingEvents(data, id, q('histVersion=' + version)).flatMap((r) => r.event.claims.flatMap((c) => c.effects));
const numeric = (f: UpdateEffect) => f.type === 'numeric' || f.type === 'bonus';

describe('bounded building history #1084', () => {
  it('validates the full graph, unique coverage, pins, dispositions, originals and all 25 legacy keys', () => {
    expect(() => assertCivUpdateReferences(data)).not.toThrow();
    expect(data.buildings!.rows).toHaveLength(38);
    expect(new Set(data.buildings!.rows.map((r) => r.entityId)).size).toBe(38);
    expect(data.buildings!.rows.filter((r) => r.sourceState === 'processed')).toHaveLength(2);
    expect(data.buildings!.rows.filter((r) => r.sourceState === 'not-checked')).toHaveLength(36);
    expect(data.buildings!.legacyMap).toHaveLength(25);
    for (const [id, count] of [
      ['building/109', 17],
      ['building/79', 29],
    ] as const) {
      const row = data.buildings!.rows.find((r) => r.entityId === id)!;
      const entries = data.sourceEntries.filter((e) => row.sectionIds.includes(e.sectionId ?? ''));
      expect(entries).toHaveLength(count);
      expect(entries.every((e) => e.originalText && e.locator && e.reason && ['mapped', 'excluded', 'pending'].includes(e.processing))).toBe(true);
    }
    expect(data.buildings!.sourceIndex.documentSha256).toBe('d2182ee1ef3bfc59df5c77317325e244597db9080146e8620c6c84c4728decc6');
    for (const legacy of data.buildings!.legacyMap) {
      const original = data.legacyMap.find((r) => r.key === legacy.key)!;
      expect(original.originalRecord).toBeDefined();
      const claim = data.events.find((e) => e.id === legacy.eventId)!.claims.find((c) => c.id === legacy.claimId)!;
      expect(claim.legacyKeys).toContain(legacy.key);
      expect(legacy.effectIds.every((id) => claim.effects.some((f) => f.id === id))).toBe(true);
    }
  });

  it('projects exact building effects, keeping team scope, per-version absolute discounts and conditions', () => {
    const tc = effects('building/109', 'de-34055').filter(numeric);
    expect(tc.map((f) => [f.before, f.after, f.unit])).toEqual([[225, 270, '秒']]);
    expect(tc[0]!.conditions).toEqual(['库曼', '封建时代']);
    const wall = filterBuildingEvents(data, 'building/72', q('histVersion=de-47820&histCondition=team&histCiv=Cumans'));
    expect(wall).toHaveLength(1);
    expect(wall[0]!.event.scope).toMatchObject({ scopeKind: 'team', providerCivIds: ['Cumans'], beneficiary: 'team' });
    expect(
      wall[0]!.event.claims
        .flatMap((c) => c.effects)
        .filter(numeric)
        .map((f) => [f.before, f.after]),
    ).toEqual([[50, 33]]);
    for (const [version, value] of [
      ['de-51737', 100],
      ['de-56005', 75],
    ] as const) {
      for (const id of ['building/87', 'building/101']) {
        const fs = effects(id, version).filter(numeric);
        expect(fs).toHaveLength(1);
        expect(fs[0]).toMatchObject({ type: 'bonus', before: null, after: value, operation: 'absolute-discount' });
        expect(fs[0]!.entityRefs).toEqual([{ entityId: id }]);
      }
      expect(effects('building/109', version)).toHaveLength(0);
    }
    expect(
      effects('building/79', 'de-61321')
        .filter(numeric)
        .map((f) => [f.before, f.after, f.conditions]),
    ).toEqual([[700, 850, ['封建时代']]]);
    expect(
      effects('building/1665', 'de-61321')
        .filter(numeric)
        .map((f) => [f.before, f.after]),
    ).toEqual([[1000, 1250]]);
    expect(
      effects('building/109', 'de-151401')
        .filter(numeric)
        .map((f) => [f.before, f.after]),
    ).toEqual([
      [7, 8],
      [0.1, 0.15],
    ]);
    expect(effects('building/79', 'de-151401')).toHaveLength(0);
  });

  it('keeps related tech effects labelled, excludes other tower shapes and searches sourced aliases', () => {
    const market = projectBuildingEvents(data, 'building/84');
    expect(market.some((r) => r.relations.some((rel) => rel.relation === 'related'))).toBe(true);
    for (const view of projectBuildingEvents(data, 'building/79')) {
      for (const relation of view.relations.filter((r) => r.relation === 'direct'))
        expect(
          relation.effectIds.every((id) =>
            view.event.claims.some((c) => c.effects.some((f) => f.id === id && f.entityRefs.some((r) => 'entityId' in r && r.entityId === 'building/79'))),
          ),
        ).toBe(true);
    }
    expect(searchUpdateBuildings(data, '木墙').map((r) => r.id)).toContain('building/72');
    expect(searchUpdateBuildings(data, 'Town Center').map((r) => r.id)).toContain('building/109');
    const unknown = partitionUnitScopes(filterBuildingEvents(data, 'building/109', q('histVersion=de-151401&histCiv=Cumans')));
    expect(unknown.known).toHaveLength(0);
    expect(unknown.unknown).toHaveLength(1);
  });

  it('retains both conflicting claims rather than filtering away an inconvenient scope', () => {
    const fixture = historyFixture();
    const event = fixture.events.find((e) => e.id === effects('building/79', 'de-61321')[0]!.id.replace('ef-', 'ev-').replace(/-1$/, ''))!;
    expect(event).toBeDefined();
    event.verification = 'conflict';
    const other = structuredClone(event.claims[0]!);
    other.id += '-opposing';
    other.effects.forEach((f) => {
      f.id += '-opposing';
      f.scope = { ...event.scope, scopeKind: 'civ', affectedCivIds: ['Chinese'] };
    });
    event.claims.push(other);
    const relation = fixture.buildings!.relations.find((r) => r.eventId === event.id && r.entityId === 'building/79')!;
    relation.effectIds.push(...other.effects.map((f) => f.id));
    const views = filterBuildingEvents(fixture, 'building/79', q('histVerification=conflict&histCiv=Chinese'));
    expect(views).toHaveLength(1);
    expect(views[0]!.event.claims).toHaveLength(2);
    expect(partitionUnitScopes(views).mixed).toHaveLength(1);
  });

  it.each([
    'obj=building:109&obj=building:79',
    'obj=unit:79',
    'obj=building:999999',
    'obj=building:79&histEntity=building/79',
    'histEntity=building/79',
    'histVersion=bad',
    'histCondition=bad',
    'histOrder=bad',
    'histCiv=bad',
    'histVerification=bad',
    'histView=bad',
    'histEvent=missing',
    'histQuery=a&histQuery=b',
    'histFoo=bar',
    'histQuery=%00',
  ])('rejects invalid/duplicate URL parameters: %s', (text) => {
    expect(buildingQueryErrors(data, q(text)).length).toBeGreaterThan(0);
    expect(filterBuildingEvents(data, 'building/109', q(text))).toHaveLength(0);
  });

  it('recovers only bad keys and preserves selected building, search and valid filters', () => {
    const query = q('obj=building:109&histQuery=城镇&histVersion=de-34055&histOrder=bad&keep=yes');
    const recovered = recoverBuildingQuery(data, query);
    expect([...recovered]).toEqual([...query].filter(([key]) => key !== 'histOrder'));
    expect(clearBuildingFilters(recovered).toString()).toBe(q('obj=building:109&histQuery=城镇&keep=yes').toString());
  });

  it('shares the same projection in overview/detail and admits safe round trips from civilization readers', () => {
    const query = q('histVersion=de-34055&histCiv=Cumans&histCondition=prerequisite&histOrder=oldest&histQuery=城镇');
    const overview = buildingHistoryPath(data, 'building/109', query, 'overview');
    const detail = buildingHistoryPath(data, 'building/109', query, 'detail', overview);
    const params = q(detail.split('?')[1]);
    expect(buildingHistoryReturn(data, params.get('histReturn'))).toBe(overview);
    expect(filterBuildingEvents(data, 'building/109', params)).toEqual(filterBuildingEvents(data, 'building/109', q(overview.split('?')[1])));
    expect(buildingHistoryReturn(data, '/civ/Cumans?tab=history&histVersion=de-34055')).toBe('/civ/Cumans?tab=history&histVersion=de-34055');
    expect(validHistoryReturn(overview, data)).toBe(overview);
    expect(validHistoryReturn('/patches?%6fbj=building%3A79&histVersion=bad', data)).toBeNull();
    expect(buildingHistoryPath(data, 'building/109', params, 'overview')).not.toContain('histReturn');
  });

  it.each([
    'https://example.com/',
    '//example.com/',
    '/building/999999?tab=history',
    '/patches?obj=unit:79',
    '/patches?histVersion=bad',
    '/patches?histReturn=%2Fpatches',
    '/patches?histQuery=%00',
    '/patches?histQuery=%5Cevil',
    '/patches?obj=building:79&obj=building:109',
    '/building/79?tab=ov',
    '/civ/NoSuch?tab=history',
    '/civ/Cumans?histSource=bad',
  ])('rejects unsafe or semantically invalid returns: %s', (raw) => {
    expect(buildingHistoryReturn(data, raw)).toBeNull();
  });
});
