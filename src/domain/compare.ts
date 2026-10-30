import civs from '../data/raw/civs';

const DEFAULT_PAIR = { a: 'Franks', b: 'Britons' } as const;
const civilizationNames = new Set(civs.map((civilization) => civilization.en));
if (!civilizationNames.has(DEFAULT_PAIR.a) || !civilizationNames.has(DEFAULT_PAIR.b)) {
  throw new Error('文明对比的默认文明不在固定资料中。');
}

export interface CompareQuery {
  a: string;
  b: string;
  search: string;
  needsReplace: boolean;
}

/** A valid single side seeds the pair; malformed supplied values still reset the whole pair. */
export function resolveCompareQuery(input: string | URLSearchParams): CompareQuery {
  const original = typeof input === 'string' ? input : '?' + input.toString();
  const params = new URLSearchParams(input);
  const valuesA = params.getAll('a'),
    valuesB = params.getAll('b');
  const valid =
    valuesA.length <= 1 &&
    valuesB.length <= 1 &&
    (!valuesA.length || civilizationNames.has(valuesA[0]!)) &&
    (!valuesB.length || civilizationNames.has(valuesB[0]!));
  const a = valid && valuesA.length ? valuesA[0]! : DEFAULT_PAIR.a,
    b = valid && valuesB.length ? valuesB[0]! : DEFAULT_PAIR.b;
  params.set('a', a);
  params.set('b', b);
  const search = '?' + params.toString();
  return { a, b, search, needsReplace: original !== search };
}

/** A null result means no selection history should be added; normalization remains a replace. */
export function selectCompareCivilization(input: string | URLSearchParams, side: 'a' | 'b', civilization: string): string | null {
  if (!civilizationNames.has(civilization)) return null;
  const resolved = resolveCompareQuery(input);
  if (resolved[side] === civilization) return null;
  const params = new URLSearchParams(resolved.search);
  params.set(side, civilization);
  return '?' + params.toString();
}
