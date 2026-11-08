import civs from '../data/raw/civs';

const DEFAULT_PAIR = { a: 'Franks', b: 'Britons' } as const;
const CIVILIZATIONS = civs.map((civilization) => civilization.en);
const civilizationNames = new Set(CIVILIZATIONS);
if (!civilizationNames.has(DEFAULT_PAIR.a) || !civilizationNames.has(DEFAULT_PAIR.b)) {
  throw new Error('文明对比的默认文明不在固定资料中。');
}

export interface CompareQuery {
  a: string;
  b: string;
  search: string;
  needsReplace: boolean;
  /** 参数完全没写：按对侧自动补一个不同的文明（issue 772） */
  missingA: boolean;
  missingB: boolean;
  /** 写了 a/b 但结构或文明名非法：保留既有宽松回退，整组回到默认对（issue 124/141 同口径） */
  invalid: boolean;
  /** 本次自动补了缺失的一侧，界面据此显示 muted note */
  autoPicked: boolean;
}

/** 缺一侧时选目录里第一个不同的文明，而不是固定默认值，避免静默变成自比（issue 772）。 */
const firstOther = (civilization: string) => CIVILIZATIONS.find((en) => en !== civilization)!;

/** A valid single side seeds the pair; malformed supplied values still reset the whole pair. */
export function resolveCompareQuery(input: string | URLSearchParams): CompareQuery {
  const original = typeof input === 'string' ? input : '?' + input.toString();
  const params = new URLSearchParams(input);
  const valuesA = params.getAll('a'),
    valuesB = params.getAll('b');
  const invalid =
    valuesA.length > 1 ||
    valuesB.length > 1 ||
    (valuesA.length > 0 && !civilizationNames.has(valuesA[0]!)) ||
    (valuesB.length > 0 && !civilizationNames.has(valuesB[0]!));
  let a: string, b: string;
  if (invalid) {
    a = DEFAULT_PAIR.a;
    b = DEFAULT_PAIR.b;
  } else {
    a = valuesA[0] ?? DEFAULT_PAIR.a;
    b = valuesB[0] ?? DEFAULT_PAIR.b;
  }
  const missingA = !invalid && valuesA.length === 0,
    missingB = !invalid && valuesB.length === 0;
  let autoPicked = false;
  if (!invalid && missingA !== missingB) {
    // 只有一侧有效：另一侧取第一个不同的文明，保留有效一侧（issue 521 单边深链）。
    if (missingB) b = firstOther(a);
    else a = firstOther(b);
    autoPicked = true;
  }
  params.set('a', a);
  params.set('b', b);
  const search = '?' + params.toString();
  return { a, b, search, needsReplace: original !== search, missingA, missingB, invalid, autoPicked };
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
