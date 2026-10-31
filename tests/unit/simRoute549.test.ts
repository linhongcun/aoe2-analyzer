import { describe, expect, it } from 'vitest';
import { decideSimCanonical, routeWithQueryCiv, unitHashLocation, unitPath, type SimRoute } from '../../src/domain/simRoute';

const axeman: SimRoute = { id: 281, civ: 'Franks', age: 4, ids: [], team: [] };
const axemanOpen: SimRoute = { id: 281, ids: [], team: [] };
const archerChinese: SimRoute = { id: 4, civ: 'Chinese', age: 3, ids: [199], team: [] };

describe('#549 simulator path versus query civ', () => {
  it('keeps an explicit path civ and does not let an unavailable query civ become the route', () => {
    expect(routeWithQueryCiv(archerChinese, 'Mongols', ['Chinese', 'Mongols', 'Franks'])).toEqual(archerChinese);
    expect(routeWithQueryCiv(axemanOpen, 'Britons', ['Franks'])).toEqual(axemanOpen);
    expect(routeWithQueryCiv(axemanOpen, 'Mongols', ['Mongols', 'Franks']).civ).toBe('Mongols');
  });

  it('treats the router-collapsed empty segment as the same simulator route', () => {
    const canonical = unitPath(281, 'Franks', 4, [], []);
    expect(canonical).toBe('/unit/281/Franks/4//');
    const resolved = { civ: 'Franks', age: 4, ids: [], team: [] };
    expect(decideSimCanonical('/unit/281/Franks/4/', axeman, resolved)).toEqual({ kind: 'keep' });
    expect(decideSimCanonical('/unit/281/Franks/4', axeman, resolved)).toEqual({ kind: 'keep' });
    expect(decideSimCanonical('/unit/281', axemanOpen, resolved)).toEqual({ kind: 'replace', path: canonical });
  });

  it('does not write the previous fallback over an explicit simulator path', () => {
    const live = unitHashLocation('#/unit/4/Chinese/3/199/?civ=Mongols&tab=sim&x=1&x=2');
    expect(live).toEqual({ pathname: '/unit/4/Chinese/3/199/', search: '?civ=Mongols&tab=sim&x=1&x=2' });
    expect(decideSimCanonical(live.pathname, axeman, { civ: 'Franks', age: 4, ids: [], team: [] })).toEqual({ kind: 'ignore' });
    expect(decideSimCanonical(live.pathname, { id: 4, ids: [], team: [] }, { civ: 'Franks', age: 4, ids: [], team: [] })).toEqual({ kind: 'ignore' });
    expect(decideSimCanonical(live.pathname, archerChinese, { civ: 'Chinese', age: 3, ids: [199], team: [] })).toEqual({ kind: 'keep' });
  });

  it('still replaces a path civ the unit cannot use with the simulator fallback', () => {
    expect(decideSimCanonical('/unit/281/Britons', { id: 281, civ: 'Britons', ids: [], team: [] }, { civ: 'Franks', age: 4, ids: [], team: [] })).toEqual({
      kind: 'replace',
      path: '/unit/281/Franks/4//',
    });
  });
});
