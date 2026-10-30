import { afterEach, describe, expect, it, vi } from 'vitest';
import civs from '../../src/data/raw/civs';
import { resolveCompareQuery, selectCompareCivilization } from '../../src/domain/compare';
import { sharePageUrl } from '../../src/domain/sharePage';

afterEach(() => {
  vi.doUnmock('../../src/data/raw/civs');
  vi.resetModules();
});

const pair = (input: string | URLSearchParams) => {
  const { a, b } = resolveCompareQuery(input);
  return { a, b };
};
const unknownEntries = (input: string | URLSearchParams) => [...new URLSearchParams(input)].filter(([key]) => key !== 'a' && key !== 'b');

describe('#403 complete civilization pairs', () => {
  it.each([
    '',
    '?',
    '?a=&b=Muisca',
    '?a=Mapuche&b=',
    '?a=Unknown&b=Muisca',
    '?a=Mapuche&b=Unknown',
    '?a=mapuche&b=Muisca',
    '?a=Mapuche&b=muisca',
    '?a=马普切&b=Muisca',
    '?a=16&b=5',
    '?a=Mapuche&a=Franks&b=Muisca',
    '?a=Mapuche&a=Mapuche&b=Muisca',
    '?a=Mapuche&b=Muisca&b=Muisca',
    '?%61=Mapuche&a=Franks&b=Muisca',
    '?a=Mapuche&%62=Muisca&b=Britons',
    '?a=Mapuche&a&b=Muisca',
    '?a=%FF&b=Muisca',
    '?a=Mapuche%00&b=Muisca',
    '?a=Mapuche%20&b=Muisca',
  ])('falls back as a whole pair and removes only known duplicates: %s', (input) => {
    const resolved = resolveCompareQuery(input);
    expect(pair(input)).toEqual({ a: 'Franks', b: 'Britons' });
    const params = new URLSearchParams(resolved.search);
    expect(params.getAll('a')).toEqual(['Franks']);
    expect(params.getAll('b')).toEqual(['Britons']);
    expect(resolved.needsReplace).toBe(true);
  });

  it.each([
    ['?a=Mapuche', 'Mapuche', 'Britons'],
    ['?b=Muisca', 'Franks', 'Muisca'],
    ['?a=Mapuche&b=Muisca', 'Mapuche', 'Muisca'],
    ['a=Mapuche&b=Muisca', 'Mapuche', 'Muisca'],
    ['?b=Mapuche&a=Muisca', 'Muisca', 'Mapuche'],
    ['?a=Berbers&b=Berbers', 'Berbers', 'Berbers'],
    ['?%61=%4Dapuche&%62=Muisca', 'Mapuche', 'Muisca'],
    ['?a=Mapuche&A=Franks&b=Muisca', 'Mapuche', 'Muisca'],
  ])('accepts exact identifiers without deduplicating the two slots: %s', (input, a, b) => {
    expect(pair(input)).toEqual({ a, b });
    expect(resolveCompareQuery(input).search.startsWith('?')).toBe(true);
  });

  it('accepts every fixed civilization identifier in either side', () => {
    for (const civilization of civs) {
      const input = new URLSearchParams({ a: civilization.en, b: civilization.en });
      expect(pair(input)).toEqual({ a: civilization.en, b: civilization.en });
    }
  });

  it('finds the defaults by identifier when the source catalog is reordered', async () => {
    vi.doMock('../../src/data/raw/civs', () => ({ default: [...civs].reverse() }));
    vi.resetModules();
    const reordered = await import('../../src/domain/compare');
    expect(reordered.resolveCompareQuery('').a).toBe('Franks');
    expect(reordered.resolveCompareQuery('').b).toBe('Britons');
    expect(reordered.resolveCompareQuery('?a=Mapuche&b=Muisca').a).toBe('Mapuche');
  });

  it.each(['Franks', 'Britons'])('explicitly rejects fixed data without the default %s', async (missing) => {
    vi.doMock('../../src/data/raw/civs', () => ({ default: civs.filter((civilization) => civilization.en !== missing) }));
    vi.resetModules();
    await expect(import('../../src/domain/compare')).rejects.toThrow('默认文明不在固定资料中');
  });
});

describe('#403 query preservation and idempotence', () => {
  it.each([
    '?x=1&a=Mapuche&y=2&b=Muisca&x=3',
    '?x=1&a=Mapuche&y=2&a=Franks&b=Muisca&x=3',
    '?a=Mapuche&b=Muisca&x=1+2&x=%2B&flag&empty=&A=Franks',
    '?a=Mapuche&b=Muisca&x=%FF&x=%E0%A4%A',
  ])('retains unknown values, duplicate entries, and their relative order: %s', (input) => {
    const original = new URLSearchParams(input);
    const serialized = original.toString();
    const resolved = resolveCompareQuery(original);
    expect(unknownEntries(resolved.search)).toEqual(unknownEntries(input));
    expect(original.toString()).toBe(serialized);
  });

  it('preserves distinct space, literal plus, and empty unknown values', () => {
    const resolved = resolveCompareQuery('?a=Mapuche&b=Muisca&x=1+2&x=%2B&flag&empty=');
    expect(unknownEntries(resolved.search)).toEqual([
      ['x', '1 2'],
      ['x', '+'],
      ['flag', ''],
      ['empty', ''],
    ]);
  });

  it('normalizes encoded keys and values once and requests no additional replace', () => {
    const first = resolveCompareQuery('?%61=%4dapuche&b=Muisca&flag&x=%FF');
    expect(first.needsReplace).toBe(true);
    const second = resolveCompareQuery(first.search);
    expect(second).toEqual({ ...first, needsReplace: false });
    expect(resolveCompareQuery(new URLSearchParams(first.search))).toEqual(second);
  });

  it('does not reorder a valid query and only adds a missing query prefix once', () => {
    const search = '?b=Muisca&x=1&a=Mapuche&x=2';
    expect(resolveCompareQuery(search)).toEqual({ a: 'Mapuche', b: 'Muisca', search, needsReplace: false });
    expect(resolveCompareQuery(search.slice(1))).toEqual({ a: 'Mapuche', b: 'Muisca', search, needsReplace: true });
  });

  it('makes invalid-query normalization idempotent without mutating the input object', () => {
    const input = new URLSearchParams('x=1&a=Mapuche&y=2&a=Franks&b=Muisca&x=3');
    const before = [...input];
    const normalized = resolveCompareQuery(input);
    expect(normalized.needsReplace).toBe(true);
    expect([...input]).toEqual(before);
    expect(resolveCompareQuery(normalized.search)).toEqual({ ...normalized, needsReplace: false });
    expect(unknownEntries(normalized.search)).toEqual([
      ['x', '1'],
      ['y', '2'],
      ['x', '3'],
    ]);
  });
});

describe('#403 selection navigation decisions and static sharing', () => {
  it.each(['', 'Unknown', 'mapuche', '马普切', '16', 'Mapuche ', '__proto__'])('does not navigate to an invalid target: %s', (target) => {
    expect(selectCompareCivilization('?a=Mapuche&b=Muisca', 'a', target)).toBeNull();
  });

  it('does not add history for the current slot even when the two sides are equal', () => {
    expect(selectCompareCivilization('?a=Mapuche&b=Muisca', 'a', 'Mapuche')).toBeNull();
    expect(selectCompareCivilization('?a=Mapuche&b=Muisca', 'b', 'Muisca')).toBeNull();
    expect(selectCompareCivilization('?a=Berbers&b=Berbers', 'b', 'Berbers')).toBeNull();
    expect(selectCompareCivilization('?a=Unknown&b=Muisca', 'a', 'Franks')).toBeNull();
  });

  it('changes just the selected slot and preserves every unknown parameter without mutating its input', () => {
    const input = new URLSearchParams('x=1&a=Mapuche&y=2&b=Muisca&x=3');
    const before = [...input];
    const selectedA = selectCompareCivilization(input, 'a', 'Berbers')!;
    expect(pair(selectedA)).toEqual({ a: 'Berbers', b: 'Muisca' });
    expect(unknownEntries(selectedA)).toEqual(unknownEntries(input));
    expect([...input]).toEqual(before);
    const selectedB = selectCompareCivilization(selectedA, 'b', 'Berbers')!;
    expect(pair(selectedB)).toEqual({ a: 'Berbers', b: 'Berbers' });
    expect(unknownEntries(selectedB)).toEqual(unknownEntries(input));
    expect(resolveCompareQuery(selectedB).needsReplace).toBe(false);
  });

  it('selects from the whole fallback pair instead of retaining the valid half of an invalid query', () => {
    const selected = selectCompareCivilization('?a=Mapuche&b=&x=1', 'b', 'Muisca')!;
    expect(pair(selected)).toEqual({ a: 'Franks', b: 'Muisca' });
    expect(unknownEntries(selected)).toEqual([['x', '1']]);
  });

  it('produces a static share query that restores the same pair and unknown entries', () => {
    const search = selectCompareCivilization('?a=Mapuche&b=Muisca&x=1&x=2', 'a', 'Berbers')!;
    const url = new URL(sharePageUrl('/compare', search, 'https://example.test/aoe2-analyzer/'));
    expect(url.pathname).toBe('/aoe2-analyzer/compare/');
    expect(url.hash).toBe('');
    expect(pair(url.search)).toEqual({ a: 'Berbers', b: 'Muisca' });
    expect(unknownEntries(url.search)).toEqual([
      ['x', '1'],
      ['x', '2'],
    ]);
    expect(resolveCompareQuery(url.search).needsReplace).toBe(false);
  });
});
