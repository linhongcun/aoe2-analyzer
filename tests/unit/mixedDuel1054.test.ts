import { describe, expect, it } from 'vitest';
import { CORE } from '../../src/data/core';
import { emptyMixedSide, type MixedSideInput } from '../../src/domain/mixedDuelParams';
import { makeSimContext } from '../../src/domain/simulator';
import { resolveMixedSide } from '../../src/features/duel/logic/mixedDuel';
import { trees } from './helpers';

const ctx = makeSimContext(CORE.techs, trees);
const side = (value: Partial<MixedSideInput> = {}): MixedSideInput => ({
  ...emptyMixedSide(),
  civ: 'Japanese',
  rows: [
    { uid: '359', qty: '20' },
    { uid: '567', qty: '15' },
  ],
  ...value,
});
const get = (input = side()) => resolveMixedSide(ctx, CORE, input, 'a');

describe('#1054 mixed strict production adapter', () => {
  it('shared tech applies only to matching rows, sharing context never replaces identity or age', () => {
    const input = side({
      rows: [
        { uid: '359', qty: '20' },
        { uid: '542', qty: '8' },
      ],
      techs: ['47'],
    });
    const base = get({ ...input, techs: [] }),
      result = get(input);
    expect(result.errors).toEqual([]);
    expect(result.army).not.toBeNull();
    expect(result.rows[0]?.resolved?.F.attack).toEqual(base.rows[0]?.resolved?.F.attack);
    expect(result.rows[1]?.resolved?.S.atk).toBe(base.rows[1]!.resolved!.S.atk + 1);
    expect(result.rows.map((r) => [r.resolved?.u.id, r.resolved?.civ, r.resolved?.age])).toEqual([
      [359, 'Japanese', 4],
      [542, 'Japanese', 4],
    ]);
  });
  it('a shared melee technology affects both matching rows', () => {
    const input = side({
      civ: 'Franks',
      rows: [
        { uid: '93', qty: '1' },
        { uid: '567', qty: '1' },
      ],
    });
    const base = get(input),
      next = get({ ...input, techs: ['67'] });
    expect(next.errors).toEqual([]);
    expect(next.rows.map((r, i) => r.resolved!.S.atk - base.rows[i]!.resolved!.S.atk)).toEqual([1, 1]);
  });
  it.each(['', '0', '-1', '1.2', 'NaN', 'Infinity', '201', '9007199254740992'])('quantity %s is preserved and blocked at exact field', (qty) => {
    const input = side({ rows: [{ uid: '359', qty }] }),
      snapshot = structuredClone(input),
      result = get(input);
    expect(result.army).toBeNull();
    expect(result.errors.some((e) => e.field === 'mix-a-qty-0')).toBe(true);
    expect(input).toEqual(snapshot);
  });
  it('side totals 200/201, 1–3 rows and exact duplicate IDs are validated without truncation', () => {
    expect(
      get(
        side({
          rows: [
            { uid: '359', qty: '199' },
            { uid: '567', qty: '1' },
          ],
        }),
      ).errors,
    ).toEqual([]);
    expect(
      get(
        side({
          rows: [
            { uid: '359', qty: '200' },
            { uid: '567', qty: '1' },
          ],
        }),
      ).army,
    ).toBeNull();
    expect(get(side({ rows: [] })).army).toBeNull();
    const tooMany = get(
      side({
        rows: [
          { uid: '359', qty: '1' },
          { uid: '567', qty: '1' },
          { uid: '542', qty: '1' },
          { uid: '93', qty: '1' },
        ],
      }),
    );
    expect(tooMany.rows).toHaveLength(4);
    expect(tooMany.army).toBeNull();
    expect(
      get(
        side({
          rows: [
            { uid: '359', qty: '1' },
            { uid: '359', qty: '1' },
          ],
        }),
      ).army,
    ).toBeNull();
  });
  it('ordinary/elite concrete forms are separate IDs, not collapsed by family', () => {
    const ids = CORE.units.filter((u) => u.civs.includes('Japanese') && (u.en === 'Samurai' || u.en === 'Elite Samurai')).map((u) => String(u.id));
    expect(ids).toHaveLength(2);
    expect(get(side({ rows: ids.map((uid) => ({ uid, qty: '1' })) })).errors).toEqual([]);
  });
  it('unknown unit/civ, incompatible civilization, unavailable age never trigger legacy fallback', () => {
    for (const input of [
      side({ civ: 'NoSuchCiv' }),
      side({ age: '9' }),
      side({ rows: [{ uid: '9999999', qty: '1' }] }),
      side({ civ: 'Aztecs', rows: [{ uid: '569', qty: '1' }] }),
      side({ civ: 'Franks', age: '1', rows: [{ uid: '93', qty: '1' }] }),
    ])
      expect(get(input).army).toBeNull();
  });
  it.each([
    ['Burgundians', '283', '3'],
    ['Bohemians', '5', '3'],
    ['Armenians', '77', '2'],
  ])('keeps existing early-unit exception %s/%s/%s', (civ, uid, age) => {
    const r = get(side({ civ, age, rows: [{ uid, qty: '1' }] }));
    expect(r.errors).toEqual([]);
    expect(r.rows[0]?.resolved?.age).toBe(+age);
    expect(r.rows[0]?.resolved?.earlyAgeMarker).toMatchObject({ unitId: +uid, civ, age: +age });
  });
  it('unknown tech, future catalog age, missing selectable prerequisite and unknown team block without silently deleting', () => {
    for (const input of [
      side({ techs: ['9999999'] }),
      side({ age: '2', rows: [{ uid: '93', qty: '1' }], techs: ['68'] }),
      side({ techs: ['68'] }),
      side({ team: ['999'] }),
      side({ team: ['-1'] }),
      side({ team: ['0', '0'] }),
      side({ techs: ['67', '67'] }),
    ]) {
      const original = structuredClone(input),
        r = get(input);
      expect(r.army).toBeNull();
      expect(input).toEqual(original);
    }
    expect(get(side({ techs: ['67', '68'] })).errors).toEqual([]);
  });
  it('does not import production-only chemistry age exception into new strict combat protocol', () => {
    const r = get(side({ civ: 'Bohemians', age: '3', techs: ['47'], rows: [{ uid: '5', qty: '1' }] }));
    expect(r.errors.some((e) => e.message.includes('高于本方时代'))).toBe(true);
  });
  it('support is based on actual fixed attack attributes, healing/conversion/explosive units fail closed', () => {
    const units = CORE.units.filter((u) => ['Monk', 'Petard'].includes(u.en));
    expect(units.length).toBeGreaterThan(0);
    for (const u of units) {
      const r = get(side({ civ: u.civs[0]!, rows: [{ uid: String(u.id), qty: '1' }] }));
      expect(r.army).toBeNull();
      expect(r.errors.some((e) => e.field === 'mix-a-unit-0')).toBe(true);
    }
  });
});
