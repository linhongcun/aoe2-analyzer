import { describe, expect, it } from 'vitest';
import { decodeMixedDuel, emptyMixedDuel, encodeMixedDuel, isMixedDuelLink, mixedDataVersion } from '../../src/domain/mixedDuelParams';

const sample = () => ({
  ...emptyMixedDuel('fixed-data'),
  a: {
    civ: 'Japanese',
    age: '4',
    techs: ['67', '68'],
    team: ['0'],
    rows: [
      { uid: '359', qty: '20' },
      { uid: '567', qty: '15' },
    ],
  },
  b: { civ: 'Franks', age: '3', techs: [], team: [], rows: [{ uid: '283', qty: '2' }] },
});
describe('#1054 strict mixed configuration protocol', () => {
  it('all context, row order, form IDs and quantities round-trip without local state', () => {
    const input = sample(),
      query = encodeMixedDuel(input);
    expect(decodeMixedDuel(new URLSearchParams(query.toString()))).toEqual({ input, errors: [] });
    expect(query.get('m')).toBe('mix');
    expect(input.a.rows[0]?.uid).toBe('359');
  });
  it('invalid raw quantities, unknown identities and fourth row survive decode for field correction', () => {
    const input = sample();
    input.a.rows = [
      { uid: 'unknown', qty: '' },
      { uid: '93', qty: '1.2' },
      { uid: '93', qty: '-2' },
      { uid: '567', qty: 'Infinity' },
    ];
    expect(decodeMixedDuel(encodeMixedDuel(input))).toEqual({ input, errors: [] });
  });
  it.each(['m=n&m=mix', 'm=mix&m=n', '', 'm=Mix'])('dispatches malformed mode %s to strict decoding before old fallback', (prefix) => {
    const query = new URLSearchParams(prefix + '&rule=queue-v1&data=x&ma={}&mb={}');
    expect(isMixedDuelLink(query)).toBe(true);
    expect(decodeMixedDuel(query).errors.length).toBeGreaterThan(0);
  });
  it('normal legacy links remain legacy and no input is mutated', () => {
    for (const raw of ['', 'm=n&na=20', 'm=1&a=93.Franks.4..', 'm=r&bud=5000', 'm=t&vil=10']) expect(isMixedDuelLink(new URLSearchParams(raw))).toBe(false);
    const query = encodeMixedDuel(sample()),
      before = query.toString();
    decodeMixedDuel(query);
    expect(query.toString()).toBe(before);
  });
  it.each(['rule', 'data', 'ma', 'mb'])('missing %s is an explicit protocol failure', (key) => {
    const q = encodeMixedDuel(sample());
    q.delete(key);
    expect(decodeMixedDuel(q).errors.length).toBeGreaterThan(0);
  });
  it('unknown rule, duplicate/unknown fields and broken JSON do not become a valid default duel', () => {
    for (const change of [
      (q: URLSearchParams) => q.set('rule', 'queue-v99'),
      (q: URLSearchParams) => q.append('ma', '{}'),
      (q: URLSearchParams) => q.set('extra', 'x'),
      (q: URLSearchParams) => q.set('ma', '{'),
      (q: URLSearchParams) => q.set('ma', '[]'),
      (q: URLSearchParams) => q.set('ma', JSON.stringify({ ...sample().a, rows: [null, { uid: 93, qty: 1 }, { uid: '93', qty: '1', extra: true }], other: 1 })),
    ]) {
      const q = encodeMixedDuel(sample());
      change(q);
      expect(decodeMixedDuel(q).errors.length).toBeGreaterThan(0);
    }
  });
  it('data identity uses sorted fixed source pins, not app SHA/version; changes are detectable but not auto-confirmed', () => {
    const one = { patch: { build: 188329 }, sources: { tree: { commit: 'abc' }, dat: { commit: 'def', sha256: 'hash' } } };
    expect(mixedDataVersion(one)).toBe('DE-188329|dat:hash|tree:abc');
    expect(mixedDataVersion({ ...one, sources: { dat: one.sources.dat, tree: one.sources.tree } })).toBe(mixedDataVersion(one));
    const input = sample();
    const before = encodeMixedDuel(input);
    const after = decodeMixedDuel(before);
    expect(after.input.data).toBe('fixed-data');
    expect(after.input.data).not.toBe(mixedDataVersion(one));
  });
});
