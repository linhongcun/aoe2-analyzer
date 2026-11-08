import { describe, expect, it } from 'vitest';
import { resolveCompareQuery, selectCompareCivilization } from '../../src/domain/compare';

describe('#521 single-civilization comparison entry', () => {
  it.each([
    // issue 772：缺的一侧补目录里第一个不同的文明，不再固定默认侧或变成自比。
    ['?a=Jurchens', 'Jurchens', 'Armenians'],
    ['?b=Chinese', 'Armenians', 'Chinese'],
    ['?a=Britons', 'Britons', 'Armenians'],
    ['?b=Franks', 'Armenians', 'Franks'],
  ])('keeps the one explicit side and fills only the missing side: %s', (input, a, b) => {
    const resolved = resolveCompareQuery(input);
    expect({ a: resolved.a, b: resolved.b }).toEqual({ a, b });
    expect(resolved.needsReplace).toBe(true);
    expect(resolved.autoPicked).toBe(true);
    expect(resolveCompareQuery(resolved.search)).toMatchObject({ a, b, search: resolved.search, needsReplace: false, autoPicked: false });
  });

  it('preserves unknown entries and updates the opposite side from the seeded pair', () => {
    const input = '?x=1&a=Jurchens&flag&x=2';
    const selected = selectCompareCivilization(input, 'b', 'Chinese')!;
    expect([...new URLSearchParams(selected)]).toEqual([
      ['x', '1'],
      ['a', 'Jurchens'],
      ['flag', ''],
      ['x', '2'],
      ['b', 'Chinese'],
    ]);
    expect(selectCompareCivilization(input, 'a', 'Jurchens')).toBeNull();
  });

  it.each(['?a=', '?b=', '?a=Unknown', '?a=Jurchens&a=Jurchens', '?a=Jurchens&b=', '?a=Jurchens&b=Unknown'])(
    'retains the whole-pair fallback for malformed input: %s',
    (input) => {
      const { a, b } = resolveCompareQuery(input);
      expect({ a, b }).toEqual({ a: 'Franks', b: 'Britons' });
    },
  );
});
