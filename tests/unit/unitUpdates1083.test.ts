import { describe, expect, it } from 'vitest';
import { assertCivUpdateReferences, type UpdateEffect } from '../../src/domain/civUpdates';
import {
  clearUnitFilters,
  effectCondition,
  filterUnitEvents,
  projectUnitEvents,
  searchUpdateUnits,
  unitHistoryPath,
  unitHistoryReturn,
  unitQueryError,
  unitCoverageQueryError,
} from '../../src/domain/unitUpdates';
import { conflictHistoryFixture, historyFixture } from '../helpers/civUpdatesFixture';
const data = historyFixture();
const q = (s = '') => new URLSearchParams(s);
const effects = (id: string, version: string) =>
  filterUnitEvents(data, id, q('histVersion=' + version)).flatMap((v) => v.event.claims.flatMap((c) => c.effects));
const numeric = (f: UpdateEffect) => f.type === 'numeric' || f.type === 'bonus';

describe('unit history exact identities and source semantics #1083', () => {
  it('reconciles all directory identities, old keys and final graph references', () => {
    expect(() => assertCivUpdateReferences(data)).not.toThrow();
    expect(new Set(data.units!.rows.map((r) => r.entityId)).size).toBe(248);
    expect(data.units!.legacyMap).toHaveLength(238);
    expect(data.legacyMap).toHaveLength(366);
    expect(data.versions.find((v) => v.id === 'de-125283')?.channel).toBe('release');
    expect(data.civilizations.every((c) => c.historyCoverage === 'partial')).toBe(true);
    expect(data.civilizations.filter((c) => ['Japanese', 'Wei'].includes(c.civId)).every((c) => c.sourceState === 'pending')).toBe(true);
  });
  it('validates persistent directory states and safe returns separately from event filters', () => {
    expect(unitCoverageQueryError(q('unitSourceState=not-checked'))).toBeUndefined();
    expect(unitCoverageQueryError(q('unitSourceState=ready'))).toBeTruthy();
    expect(unitCoverageQueryError(q('unitSourceState=no-log&unitSourceState=pending'))).toBeTruthy();
    expect(unitHistoryReturn('/patches?unitSourceState=processed')).toBe('/patches?unitSourceState=processed');
    expect(unitHistoryReturn('/patches?unitSourceState=ready')).toBeNull();
  });
  it('projects ordinary and elite HP independently and keeps the raw mixed bullet as evidence', () => {
    for (const [id, before, after] of [
      ['unit/1231', 50, 40],
      ['unit/1233', 55, 45],
    ] as const) {
      const hp = effects(id, 'de-34055').filter((f) => numeric(f) && f.attribute === '生命值');
      expect(hp).toHaveLength(1);
      expect(hp[0]).toMatchObject({ before, after, entityRefs: [{ entityId: id }] });
    }
    expect(projectUnitEvents(data, 'unit/1260').flatMap((v) => v.event.claims.flatMap((c) => c.effects))).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ attribute: '生命值', before: 55, after: 45 })]),
    );
    expect(searchUpdateUnits(data, '钦察骑射手').map((e) => e.id)).toContain('unit/1231');
    expect(searchUpdateUnits(data, '精锐钦察').map((e) => e.id)).toEqual(expect.arrayContaining(['unit/1233', 'unit/1260']));
  });
  it('keeps total arrows and secondary-arrow increments in one event on separate semantic axes', () => {
    for (const [id, before, after] of [
      ['unit/1231', 2, 3],
      ['unit/1233', 3, 4],
    ] as const) {
      const views = filterUnitEvents(data, id, q('histVersion=de-36202'));
      expect(views).toHaveLength(1);
      const fs = views[0]!.event.claims.flatMap((c) => c.effects);
      expect(fs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ attribute: '副箭数量', delta: 1, before: null, after: null }),
          expect.objectContaining({ attribute: '每次射击箭矢总数', before, after }),
        ]),
      );
    }
  });
  it('keeps zero delay, interval, gold cost and unknown elite delay distinct', () => {
    expect(effects('unit/1231', 'de-42848')).toEqual(expect.arrayContaining([expect.objectContaining({ attribute: '发射延迟', before: 0, after: 0.5 })]));
    expect(effects('unit/1233', 'de-42848')).toEqual(expect.arrayContaining([expect.objectContaining({ attribute: '发射延迟', before: null, after: 0.5 })]));
    expect(effects('unit/1231', 'de-34055')).toEqual(expect.arrayContaining([expect.objectContaining({ attribute: '攻击间隔', before: 1.8, after: 2.2 })]));
    expect(JSON.stringify(effects('unit/1370', 'de-47820'))).toContain('45');
    expect(effects('unit/1372', 'de-47820').some((f) => numeric(f) && f.before === 45 && f.after === 40)).toBe(false);
  });
  it('preserves mercenary ambiguity and team prerequisites without turning 12s into a unit stat', () => {
    const merc = filterUnitEvents(data, 'unit/1231', q('histVersion=de-61321&histCondition=team'));
    expect(merc).toHaveLength(1);
    expect(merc[0]!.relations[0]!.relation).toBe('identity-pending');
    const time = merc[0]!.event.claims.flatMap((c) => c.effects).find((f) => numeric(f) && f.after === 12)!;
    expect(time.entityRefs).toEqual([{ unresolvedName: '佣兵钦察骑射手', type: 'unit' }]);
    expect(filterUnitEvents(data, 'unit/1260', q('histVersion=de-61321'))).toHaveLength(0);
    expect(filterUnitEvents(data, 'unit/1231', q('histVersion=de-34055&histCondition=base')).length).toBeGreaterThan(0);
    expect(merc[0]!.event.claims.flatMap((c) => c.effects).every((f) => effectCondition(f, merc[0]!.event) === 'team')).toBe(true);
  });
  it('retains both conflicting claims when a civilization/condition filter matches either side', () => {
    const fixture = conflictHistoryFixture();
    const event = fixture.events.find((e) => e.id === 'fixture-conflict')!;
    for (const c of event.claims) for (const f of c.effects) f.entityRefs = [{ entityId: 'unit/1231' }];
    fixture.units!.relations.push({
      entityId: 'unit/1231',
      eventId: event.id,
      effectIds: event.claims.flatMap((c) => c.effects.map((f) => f.id)),
      relation: 'direct',
      note: '测试夹具，不是游戏事实',
    });
    const conflict = filterUnitEvents(fixture, 'unit/1231', q('histVerification=conflict&histCiv=Cumans'));
    expect(conflict).toHaveLength(1);
    expect(conflict[0]!.event.claims).toHaveLength(2);
    expect(conflict[0]!.event.claims.every((c) => c.effects.length > 0)).toBe(true);
  });
  it('round trips stable identity and filters without nesting a return or accepting offsite redirects', () => {
    const query = q('histQuery=钦察&histVersion=de-34055&histVerification=unverified&histCiv=Cumans&histCondition=base&histOrder=oldest');
    const path = unitHistoryPath('unit/1233', query, 'detail', '/patches?obj=unit%3A1231');
    expect(path).toContain('/unit/1233?tab=history');
    const params = new URLSearchParams(path.split('?')[1]);
    expect(unitQueryError(data, params)).toBeUndefined();
    const cleared = clearUnitFilters(params);
    expect(cleared.get('histQuery')).toBe('钦察');
    expect(cleared.get('histReturn')).toBe('/patches?obj=unit%3A1231');
    expect(cleared.has('histVersion')).toBe(false);
    expect(unitHistoryPath('unit/1233', params, 'overview')).not.toContain('histReturn');
    for (const bad of [
      'https://evil.example/',
      '//evil.example',
      '/patches?histReturn=%2Fpatches',
      '/unit/1231?tab=other',
      '/patches?obj=unit:1231&obj=unit:1233',
      '/patches?unknown=1',
    ])
      expect(unitHistoryReturn(bad)).toBeNull();
    for (const bad of ['histVersion=bad', 'histOrder=oldest&histOrder=newest', 'histFrom=2020', 'histCondition=all'])
      expect(unitQueryError(data, q(bad))).toBeTruthy();
  });
  it('fails closed on coverage, effect and legacy reference corruption', () => {
    const cases = [
      (d: typeof data) => d.units!.rows.pop(),
      (d: typeof data) => d.units!.relations[0]!.effectIds.push('missing'),
      (d: typeof data) => {
        d.units!.legacyMap[0]!.effectIds = ['missing'];
      },
      (d: typeof data) => {
        d.units!.rows[0]!.eventIds = ['missing'];
      },
    ];
    for (const mutate of cases) {
      const clone = historyFixture();
      mutate(clone);
      expect(() => assertCivUpdateReferences(clone)).toThrow();
    }
  });
});
