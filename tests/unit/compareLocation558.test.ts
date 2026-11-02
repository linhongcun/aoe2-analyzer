import { describe, expect, it } from 'vitest';
import { compareLocationIsCurrent } from '../../src/features/compare/compareLocation';

const snapshot = (pathname = '/compare', search = '', hash = '') => ({ pathname, search, hash });
describe('#558 delayed Compare normalization owns only its current location snapshot', () => {
  it('rejects the actual stale render that runs after browser navigation to Matchup', () => {
    expect(compareLocationIsCurrent(snapshot(), '#/matchup')).toBe(false);
    expect(compareLocationIsCurrent(snapshot('/matchup'), '#/matchup')).toBe(false);
  });
  it.each([
    [snapshot(), '#/compare'],
    [snapshot(), '#compare'],
    [snapshot('/COMPARE'), '#/COMPARE'],
    [snapshot('/%63ompare'), '#/%63ompare'],
    [snapshot('/compare/'), '#/compare/'],
    [snapshot('/compare', '?a=Mapuche&x=1&x=2&flag', '#ratings'), '#/compare?a=Mapuche&x=1&x=2&flag#ratings'],
  ])('preserves HashRouter normalization and exact current aliases: %j', (rendered, hash) => {
    expect(compareLocationIsCurrent(rendered, hash)).toBe(true);
  });
  it.each([
    [snapshot(), '#/compare?a=Mapuche&b=Muisca'],
    [snapshot('/compare', '?a=Franks&b=Britons'), '#/compare?a=Mapuche&b=Britons'],
    [snapshot('/compare', '?x=1&x=2'), '#/compare?x=2&x=1'],
    [snapshot('/compare', '?flag'), '#/compare?flag='],
    [snapshot('/compare', '?x=%20'), '#/compare?x=+'],
    [snapshot('/compare', '', '#old'), '#/compare#new'],
    [snapshot('/compare', '', '#old'), '#/compare'],
    [snapshot('/compare', '', '#new'), '#/compare#old'],
    [snapshot(), '#/'],
    [snapshot('/compare/other'), '#/compare/other'],
    [snapshot('/compare%2F'), '#/compare%2F'],
    [snapshot('/compare%2Fother'), '#/compare%2Fother'],
    [snapshot('/%ZZ'), '#/%ZZ'],
  ])('does not overwrite a newer pair, raw query, fragment, or unrelated route: %j', (rendered, hash) => {
    expect(compareLocationIsCurrent(rendered, hash)).toBe(false);
  });
});
