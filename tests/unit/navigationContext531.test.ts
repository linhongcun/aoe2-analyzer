import { describe, expect, it } from 'vitest';
import { contextPath, entityPath, mergeNavigationSearch, readNavigation, returnSnapshot, stripNavigation } from '../../src/shared/nav/context';
import { decodeTrainCompare } from '../../src/features/production/trainCompareCodec';
import { decodeTradeIncome, tradeIncomeProductionHref } from '../../src/domain/tradeIncome';
import { DEFAULT_PRODUCTION, encodeProduction } from '../../src/domain/production';

describe('#531 navigation context', () => {
  it('restores a complete previous tool while keeping the original matchup independent of current civ', () => {
    const production = '/production?' + encodeProduction({ ...DEFAULT_PRODUCTION, civ: 'Mongols' });
    const target = contextPath('/eco-payoff?civ=Mongols&age=3', '?me=Franks&opp=Britons', production);
    expect(readNavigation(target.split('?')[1]!)).toEqual({ back: production, me: 'Franks', opp: 'Britons', invalid: false });
    expect(new URLSearchParams(target.split('?')[1]).get('civ')).toBe('Mongols');
  });

  it('stores only one previous tool, strips its own return and retains unrelated repeated parameters', () => {
    const source = '/unit/38/Franks/3//?tab=sim&x=1&ctxReturn=%2Fciv%2FFranks&x=2&me=Franks&opp=Britons';
    expect(returnSnapshot(source)).toBe('/unit/38/Franks/3//?tab=sim&x=1&x=2&me=Franks&opp=Britons');
    const next = contextPath('/production?civ=Franks', '?ctxReturn=%2Fciv%2FFranks&me=Franks&opp=Britons', source);
    expect(readNavigation(next.split('?')[1]!).back).toBe(returnSnapshot(source));
  });

  it.each([
    'https://example.test/production',
    '//example.test/production',
    '/\\example.test/production',
    '/production#external',
    '/unit/../production',
    '/unit/%2e%2e/production',
    '/unit/%252e%252e/production',
    '/%2fexample.test/production',
    '/production\n',
    '/missing-tool',
    '/production?ctxReturn=%2Fduel',
    '/production?CTXRETURN=%2Fduel',
    '/production?' + 'x'.repeat(8193),
  ])('rejects unsafe or unsupported return %s without damaging current tool inputs', (back) => {
    const p = new URLSearchParams({ civ: 'Mongols', ctxReturn: back, rows: '38:101:3' });
    expect(readNavigation(p).back).toBeNull();
    expect(readNavigation(p).invalid).toBe(true);
    expect(new URLSearchParams(stripNavigation(p)).get('rows')).toBe('38:101:3');
  });

  it('rejects duplicate navigation keys and invalid civilizations', () => {
    for (const query of ['ctxReturn=/production&ctxReturn=/duel', 'me=Franks&me=Mongols&opp=Britons', 'me=unknown&opp=Britons']) {
      expect(readNavigation(query).invalid).toBe(true);
    }
    expect(readNavigation('me=Franks').opp).toBeUndefined();
    expect(readNavigation('').back).toBeNull();
  });

  it('merges valid navigation after a tool rewrite, preserving repeated unknown fields in order', () => {
    const input = '?ctxReturn=%2Fproduction%3Fciv%3DMongols&me=Franks&opp=Britons';
    const next = mergeNavigationSearch('a=Mongols&x=1&b=Chinese&x=2', input);
    expect([...new URLSearchParams(next)].filter(([key]) => key === 'x')).toEqual([
      ['x', '1'],
      ['x', '2'],
    ]);
    expect(readNavigation(next).back).toBe('/production?civ=Mongols');
    expect(stripNavigation(next)).toBe('?a=Mongols&x=1&b=Chinese&x=2');
  });

  it('keeps strict tool unknown-key rejection while separating valid navigation', () => {
    const trade = tradeIncomeProductionHref(DEFAULT_PRODUCTION).split('?')[1]!;
    const nav = contextPath('/trade-income?' + trade, '?me=Franks&opp=Britons', '/production?' + encodeProduction(DEFAULT_PRODUCTION));
    expect(decodeTradeIncome(stripNavigation(nav.split('?')[1]!)).errors).toEqual([]);
    expect(decodeTradeIncome(stripNavigation(nav.split('?')[1]! + '&untrusted=1')).errors.length).toBeGreaterThan(0);
    expect(decodeTrainCompare(stripNavigation('?mode=compare&ctxReturn=%2Fproduction&unknown=1')).errors.length).toBeGreaterThan(0);
  });

  it('does not invent a current civilization for entity links', () => {
    expect(entityPath('unit', 38, undefined, '')).toBe('/unit/38');
    expect(entityPath('tech', 202, 'Mongols', '?me=Franks&opp=Britons', '/tree/Mongols')).toContain('civ=Mongols');
    expect(readNavigation(entityPath('tech', 202, 'Mongols', '?me=Franks&opp=Britons', '/tree/Mongols').split('?')[1]!).back).toBe('/tree/Mongols');
  });
});
