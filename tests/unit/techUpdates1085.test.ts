import { describe, expect, it } from 'vitest';
import { historyFixture } from '../helpers/civUpdatesFixture';
import { assertCivUpdateReferences, validHistoryReturn } from '../../src/domain/civUpdates';
import { clearUnitFilters, recoverUnitEventQuery, unitHistoryPath, unitHistoryReturn, unitQueryError } from '../../src/domain/unitUpdates';
import { buildingHistoryPath, buildingHistoryReturn, buildingQueryErrors, projectBuildingEvents, recoverBuildingQuery } from '../../src/domain/buildingUpdates';
import {
  filterTechEvents,
  projectTechEvents,
  recoverTechQuery,
  revealTechEvent,
  searchUpdateTechs,
  techCoverageRows,
  techEvidenceStats,
  techHistoryPath,
  techHistoryReturn,
  techQueryErrors,
} from '../../src/domain/techUpdates';

const data = historyFixture();
const q = (text = '') => new URLSearchParams(text);

it.each([
  '/unit/1370?histView=techs',
  '/unit/1370?obj=tech:689',
  '/unit/1370?techIdentity=current',
  '/unit/1370?techSourceState=not-checked',
  '/building/79?histEntity=tech/716@retired',
  '/civ/Cumans?histView=techCoverage',
  '/unknown?histView=techs',
  '/patches?histView=buildings&techSourceState=not-checked',
])('rejects mixed directory/route hints without recursive dispatch: %s', (path) => {
  expect(validHistoryReturn(path, data)).toBeNull();
  expect(unitHistoryReturn(path, data)).toBeNull();
  expect(techHistoryReturn(data, path)).toBeNull();
  expect(buildingHistoryReturn(data, path)).toBeNull();
});

it('clears unit filters while retaining only a validated technology return snapshot', () => {
  const path = '/tech/689?tab=history&histVersion=de-36202';
  const query = q('histVersion=de-81058&histQuery=草原');
  query.set('histReturn', path);
  expect(clearUnitFilters(query, data).get('histReturn')).toBe(path);
  expect(clearUnitFilters(query, data).has('histVersion')).toBe(false);
  expect(clearUnitFilters(query, data).get('histQuery')).toBe('草原');
  query.set('histReturn', path + '&histReturn=%2Fpatches');
  expect(clearUnitFilters(query, data).has('histReturn')).toBe(false);
});

it('retains validated civilization context when returning from technology to a unit event', () => {
  const path = '/unit/1370?tab=history&civ=Cumans&me=Cumans&opp=Aztecs&histVersion=de-36202';
  expect(techHistoryReturn(data, path)).toBe(path);
  expect(unitHistoryReturn(path, data)).toBe(path);
  expect(techHistoryReturn(data, path.replace('civ=Cumans', 'civ=invalid'))).toBeNull();
  expect(techHistoryReturn(data, path + '&civ=Cumans')).toBeNull();
});
const views = (id: string, version: string) => projectTechEvents(data, id).filter((v) => v.event.versionId === version);

it('reveals an event when separate effects match each filter but their conjunction is empty', () => {
  const id = 'ev-se-71636ab5-9a50-4128-bce9-8212abc5e6d7';
  const query = q('tab=history&civ=Armenians&histCiv=Armenians&histCondition=civ&histOrder=oldest&histQuery=保留搜索');
  query.set('histEvent', id);
  query.set('histReturn', '/unit/1370?tab=history');
  expect(filterTechEvents(data, 'tech/463', q('histCiv=Armenians')).some((v) => v.event.id === id)).toBe(true);
  expect(filterTechEvents(data, 'tech/463', q('histCondition=civ')).some((v) => v.event.id === id)).toBe(true);
  expect(filterTechEvents(data, 'tech/463', query).some((v) => v.event.id === id)).toBe(false);
  const recovered = revealTechEvent(data, 'tech/463', query);
  expect(filterTechEvents(data, 'tech/463', recovered).some((v) => v.event.id === id)).toBe(true);
  expect(['histCiv', 'histCondition'].filter((key) => !recovered.has(key))).toHaveLength(1);
  for (const key of ['tab', 'civ', 'histOrder', 'histQuery', 'histEvent', 'histReturn']) expect(recovered.get(key)).toBe(query.get(key));
});

it('rejects unrelated event snapshots at all four targets and locally repairs unit/building state', () => {
  const id = views('tech/689', 'de-36202')[0]!.event.id;
  const query = q('tab=history&civ=Cumans&histVersion=de-36202&histOrder=oldest');
  query.set('histEvent', id);
  for (const route of ['/unit/4', '/building/79', '/tech/321', '/civ/Aztecs'])
    expect(validHistoryReturn(route + '?tab=history&histEvent=' + id, data)).toBeNull();
  expect(unitQueryError(data, query, 'unit/4')).toContain('事件定位');
  expect(buildingQueryErrors(data, query, true, 'building/79')).toEqual(['histEvent']);
  for (const repaired of [recoverUnitEventQuery(data, query, 'unit/4'), recoverBuildingQuery(data, query, 'building/79')]) {
    const expected = new URLSearchParams(query);
    expected.delete('histEvent');
    expect(repaired.toString()).toBe(expected.toString());
  }
  expect(unitHistoryPath('unit/1370', query, 'detail', undefined, data)).toContain('histEvent=');
  expect(unitHistoryPath('unit/4', query, 'detail', undefined, data)).not.toContain('histEvent=');
  const towerEvent = projectBuildingEvents(data, 'building/79').find(
    (v) => !projectBuildingEvents(data, 'building/109').some((t) => t.event.id === v.event.id),
  )!.event.id;
  query.set('histEvent', towerEvent);
  expect(buildingHistoryPath(data, 'building/79', query, 'detail')).toContain('histEvent=');
  expect(buildingHistoryPath(data, 'building/109', query, 'detail')).not.toContain('histEvent=');
  expect(buildingHistoryPath(data, 'building/109', query, 'detail')).toContain('histVersion=de-36202');
});

it('does not describe compound legacy research/effect records as only research parameters', () => {
  for (const id of ['ef-legacy-81058-150', 'ef-legacy-185872-34']) expect(data.techs!.effectKinds[id]).toBe('unclassified');
});

it('keeps a validated return when changing buildings and drops only the stale event location', () => {
  const back = '/tech/689?tab=history&histVersion=de-36202';
  const query = q('histView=buildings&obj=building:79&histOrder=oldest&histQuery=234');
  query.set(
    'histEvent',
    projectBuildingEvents(data, 'building/79').find(
      (entry) => !projectBuildingEvents(data, 'building/234').some((target) => target.event.id === entry.event.id),
    )!.event.id,
  );
  query.set('histReturn', back);
  const path = buildingHistoryPath(data, 'building/234', query, 'overview');
  const params = q(path.split('?')[1]);
  expect(params.get('histReturn')).toBe(back);
  expect(params.get('obj')).toBe('building:234');
  expect(params.get('histQuery')).toBe('234');
  expect(params.get('histOrder')).toBe('oldest');
  expect(params.has('histEvent')).toBe(false);
  query.set('histReturn', back + '&histReturn=%2Fpatches');
  expect(buildingHistoryPath(data, 'building/234', query, 'overview')).not.toContain('histReturn=');
});

describe('technology evidence projections and route boundaries #1085', () => {
  it('validates all current identities, retired aliases and the 97 shared legacy claims', () => {
    expect(() => assertCivUpdateReferences(data)).not.toThrow();
    expect(data.techs?.rows).toHaveLength(199);
    expect(techCoverageRows(data)).toHaveLength(202);
    expect(data.techs?.legacyMap).toHaveLength(97);
    expect(searchUpdateTechs(data, '供给').map((e) => e.id)).toContain('tech/716@retired');
    expect(data.entities.find((e) => e.id === 'tech/716@retired')?.linkPath).toBeNull();
    expect(data.entities.some((e) => e.id === 'tech/716')).toBe(false);
    expect(data.techs?.rows.every((r) => r.sourceState === 'not-checked' && r.sourceEntryCount === null)).toBe(true);
  });

  it('keeps applicability and train efficiency in one shared steppe event with distinct effects', () => {
    const projected = views('tech/689', 'de-36202');
    expect(projected).toHaveLength(1);
    expect(projected[0]?.event.claims.flatMap((c) => c.effects).map((f) => f.type)).toEqual(['availability', 'bonus']);
    const effect = projected[0]!.event.claims.flatMap((c) => c.effects).find((f) => f.type === 'bonus')!;
    expect(effect).toMatchObject({ before: 80, after: 50, attribute: '训练效率加成' });
  });

  it('preserves all four explicit mercenary effects and separates per-castle from total quantities', () => {
    const effects = views('tech/690', 'de-61321').flatMap((v) => v.event.claims.flatMap((c) => c.effects));
    expect(effects).toHaveLength(4);
    const quantity = effects.find((f) => f.type === 'numeric' && f.attribute.includes('数量'));
    expect(quantity).toMatchObject({ before: null, after: 5, delta: null });
    const all = JSON.stringify(effects);
    expect(all).toContain('10');
    expect(all).toContain('12');
    expect(all).not.toContain('unit/1260');
    expect(all).not.toContain('unit/1233');
  });

  it('retains technology research values separately from unit attack effects and original evidence', () => {
    const supply = views('tech/716@retired', 'de-81058').flatMap((v) => v.event.claims.flatMap((c) => c.effects));
    expect(supply.some((f) => f.type === 'mechanic' && f.text.includes('研究时间') && f.legacyBefore === '35 秒' && f.legacyAfter === '20 秒')).toBe(true);
    const sappers = views('tech/321', 'de-81058').flatMap((v) => v.event.claims.flatMap((c) => c.effects));
    expect(sappers.some((f) => f.type === 'numeric' && f.attribute.includes('研究费用'))).toBe(true);
    expect(sappers.some((f) => f.type === 'mechanic' && f.text.includes('攻击加成增加 3') && data.techs?.effectKinds[f.id] === 'effect')).toBe(true);
    const stats = techEvidenceStats(data, 'tech/321');
    expect(stats.linked).toBeGreaterThan(0);
    expect(stats.originals).toBeGreaterThanOrEqual(stats.linked);
    expect(stats.mapped + stats.pending + stats.excluded).toBe(stats.originals);
  });

  it.each([
    'histView=bad',
    'obj=tech:716',
    'histEntity=tech/689',
    'histVersion=bad',
    'histVerification=bad',
    'histCiv=bad',
    'histCondition=bad',
    'histEvent=missing',
    'histOrder=bad',
    'techSourceState=bad',
    'techIdentity=bad',
    'histQuery=%00',
    'histOther=x',
    'histQuery=x&histQuery=y',
    'histView=techs&obj=tech:689&histEntity=tech/716@retired',
  ])('rejects invalid values or duplicated/ambiguous state: %s', (raw) => expect(techQueryErrors(data, q(raw)).length).toBeGreaterThan(0));

  it('recovers only erroneous keys while retaining object, legal filters and detail context', () => {
    const query = q('tab=history&civ=Cumans&me=Cumans&opp=Britons&histVersion=de-61321&histCiv=Cumans&histVerification=bad&histOrder=oldest');
    const recovered = recoverTechQuery(data, query, 'tech/690');
    expect(recovered.has('histVerification')).toBe(false);
    expect(recovered.get('histVersion')).toBe('de-61321');
    expect(recovered.get('histCiv')).toBe('Cumans');
    expect(recovered.get('civ')).toBe('Cumans');
    expect(recovered.get('opp')).toBe('Britons');
    expect(techQueryErrors(data, recovered, true, 'tech/690')).toEqual([]);
  });

  const badReturns = [
    'https://evil.example/',
    '//evil.example/',
    '/tech/689#x',
    '/tech/689?histReturn=/patches',
    '/tech/689?tab=history&tab=history',
    '/tech/999999?tab=history',
    '/tech/716?tab=history',
    '/tech/689?unitSourceState=processed',
    '/tech/689?histVersion=no-version',
    '/unit/1370?histQuery=%00',
    '/unit/1370?histVersion=bad-version',
    '/patches?obj=tech:689&histReturn=%2Fpatches',
    '/tech/689?histQuery=%5Cevil',
    '/tech/689?civ=bad',
    '/tech/689?tab=history&histEvent=missing',
  ];
  it.each(badReturns)('rejects unsafe or inapplicable snapshots at all entry points: %s', (path) => {
    expect(techHistoryReturn(data, path)).toBeNull();
    expect(validHistoryReturn(path, data)).toBeNull();
    expect(unitHistoryReturn(path, data)).toBeNull();
    expect(buildingHistoryReturn(data, path)).toBeNull();
  });

  it.each([
    '/tech/689?tab=history&histVersion=de-36202',
    '/patches?histView=techCoverage&techIdentity=retired',
    '/patches?histEntity=tech%2F716%40retired',
    '/unit/1370?tab=history',
    '/building/79?tab=history',
    '/civ/Cumans?tab=history',
  ])('accepts one strict return layer for each supported entity: %s', (path) => {
    expect(techHistoryReturn(data, path)).not.toBeNull();
    expect(validHistoryReturn(path, data)).not.toBeNull();
    expect(unitHistoryReturn(path, data)).not.toBeNull();
    expect(buildingHistoryReturn(data, path)).not.toBeNull();
  });

  it('round trips context and focus while revealing only filters which hide the anchored event', () => {
    const event = views('tech/689', 'de-36202')[0]!.event;
    const query = q('histVersion=de-81058&histOrder=oldest&histQuery=impossible-text');
    query.set('histEvent', event.id);
    const visible = revealTechEvent(data, 'tech/689', query);
    expect(visible.has('histVersion')).toBe(false);
    expect(visible.get('histQuery')).toBe('impossible-text');
    expect(visible.get('histOrder')).toBe('oldest');
    expect(filterTechEvents(data, 'tech/689', visible).some((v) => v.event.id === event.id)).toBe(true);
    const path = techHistoryPath(data, 'tech/689', q('tab=history&civ=Cumans&histEvent=' + event.id), 'detail', '/unit/1370?tab=history');
    expect(path).toContain('civ=Cumans');
    expect(techHistoryReturn(data, path)).toBeNull(); // nested return snapshots are never accepted
    expect(techHistoryPath(data, 'tech/716@retired', q(), 'detail')).toContain('histEntity=');
  });

  it.each(['historicalRows', 'effectKinds', 'legacyMap'] as const)('rejects incomplete runtime technology state: %s', (key) => {
    const broken = historyFixture();
    if (key === 'effectKinds') delete broken.techs!.effectKinds[Object.keys(broken.techs!.effectKinds)[0]!];
    else broken.techs![key].pop();
    expect(() => assertCivUpdateReferences(broken)).toThrow();
  });
});
