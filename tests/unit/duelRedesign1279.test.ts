import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees, type Core } from '../../src/data';
import { duel, groupFight } from '../../src/domain/duel';
import { decodeDuelParams } from '../../src/domain/duelParams';
import { fmtSide, parseSide, type SideSpec } from '../../src/domain/duelState';
import type { MixedDuelInput } from '../../src/domain/mixedDuelParams';
import { makeSimContext, type SimContext } from '../../src/domain/simulator';
import type { Trees } from '../../src/domain/types';
import { extractDuelSourceParams, readDuelMatchupContext, readDuelSourceState } from '../../src/features/duel/logic/duelContext';
import { isUnavail, resolve, type Resolved } from '../../src/features/duel/logic/duelSide';
import { GROUP_STOP_LABELS, summarizeGroup, summarizeOneVOne } from '../../src/features/duel/logic/duelSummary';
import { swapMixedDuelInput, swapSingleDuelParams } from '../../src/features/duel/logic/duelSwap';
import { canRecoverSingleDuelSide, resolveMixedSide } from '../../src/features/duel/logic/mixedDuel';

const DEF_A: SideSpec = { uid: 569, civ: 'Franks', age: 4, techs: 'f', team: [] };
const DEF_B: SideSpec = { uid: 359, civ: 'Japanese', age: 4, techs: 'f', team: [] };

let core: Core;
let trees: Trees;
let ctx: SimContext;

beforeAll(async () => {
  core = await loadCore();
  trees = await loadTrees();
  ctx = makeSimContext(core.techs, trees);
});

function swapRoundTrip(rawQuery: string) {
  const sp = new URLSearchParams(rawQuery);
  const params = decodeDuelParams(sp);
  const a = resolve(ctx, core.unitById, parseSide(sp.get('a'), DEF_A), DEF_A.uid);
  const b = resolve(ctx, core.unitById, parseSide(sp.get('b'), DEF_B), DEF_B.uid);
  const swapped = swapSingleDuelParams(sp, a, b, params);

  const params2 = decodeDuelParams(swapped);
  const a2 = resolve(ctx, core.unitById, parseSide(swapped.get('a'), DEF_A), DEF_A.uid);
  const b2 = resolve(ctx, core.unitById, parseSide(swapped.get('b'), DEF_B), DEF_B.uid);
  const restored = swapSingleDuelParams(swapped, a2, b2, params2);
  return { sp, swapped, restored };
}

describe('issue 1279 swapSingleDuelParams', () => {
  it('swaps 1v1 cleanly without inventing na/nb and restores losslessly on second swap', () => {
    const { swapped, restored } = swapRoundTrip('a=569.Franks.4.f.&b=359.Japanese.4.c.&m=1');
    expect(swapped.get('a')).toBe('359.Japanese.4.c.');
    expect(swapped.get('b')).toBe('569.Franks.4.f.');
    expect(swapped.get('m')).toBe('1');
    expect(swapped.has('na')).toBe(false);
    expect(swapped.has('nb')).toBe(false);
    expect(restored.get('a')).toBe('569.Franks.4.f.');
    expect(restored.get('b')).toBe('359.Japanese.4.c.');
  });

  it('swaps N vs M quantities na/nb and preserves equal-resource & gather-time budgets', () => {
    const nm = swapRoundTrip('a=569.Franks.4.f.&b=359.Japanese.4.f.&m=n&na=20&nb=10');
    expect(nm.swapped.get('na')).toBe('10');
    expect(nm.swapped.get('nb')).toBe('20');
    expect(nm.restored.get('na')).toBe('20');
    expect(nm.restored.get('nb')).toBe('10');

    const res = swapRoundTrip('a=38.Franks.3.c.&b=329.Berbers..f.&m=r&bud=4500');
    expect(res.swapped.get('a')).toBe('329.Berbers..f.');
    expect(res.swapped.get('b')).toBe('38.Franks.3.c.');
    expect(res.swapped.get('bud')).toBe('4500');
    expect(res.restored.get('a')).toBe('38.Franks.3.c.');
    expect(res.restored.get('b')).toBe('329.Berbers..f.');

    const time = swapRoundTrip('a=569.Franks.4.67-80.0-1&b=359.Japanese.3..2&m=t&vil=18&min=12');
    expect(time.swapped.get('a')).toBe('359.Japanese.3..2');
    expect(time.swapped.get('b')).toBe('569.Franks.4.67-80.0-1');
    expect(time.swapped.get('vil')).toBe('18');
    expect(time.swapped.get('min')).toBe('12');
  });

  it('swaps single-sided na/nb in non-n mode losslessly with strict double-swap idempotency', () => {
    const { swapped, restored } = swapRoundTrip('a=569.Franks.4.f.&b=359.Japanese.4.f.&m=1&na=20');
    expect(swapped.has('na')).toBe(false);
    expect(swapped.get('nb')).toBe('20');
    expect(restored.get('na')).toBe('20');
    expect(restored.has('nb')).toBe(false);
  });

  it('preserves unavailable side chosen civ, be=1 stale marker, upgrade params, and unreversed matchup context', () => {
    const { swapped, restored } = swapRoundTrip(
      'a=569.Aztecs.4.f.&b=359.Japanese.4.f.&m=1&be=1&me=Mongols&opp=Chinese&practice=Mongols.Chinese.scouts&base=569.Franks.4..',
    );
    expect(swapped.get('a')).toBe('359.Japanese.4.f.');
    expect(swapped.get('b')).toBe('569.Aztecs.4.f.');
    expect(swapped.get('be')).toBe('1');
    expect(swapped.get('me')).toBe('Mongols');
    expect(swapped.get('opp')).toBe('Chinese');
    expect(swapped.get('practice')).toBe('Mongols.Chinese.scouts');
    expect(swapped.get('base')).toBe('569.Franks.4..');
    expect(restored.get('a')).toBe('569.Aztecs.4.f.');
    expect(restored.get('b')).toBe('359.Japanese.4.f.');
  });

  it('issue 1295: swaps ka/kb kite flags cleanly and restores on second swap', () => {
    const single = swapRoundTrip('a=474.Magyars.4.f.&b=359.Franks.4.f.&m=r&bud=3000&ka=1');
    expect(single.swapped.has('ka')).toBe(false);
    expect(single.swapped.get('kb')).toBe('1');
    expect(single.restored.get('ka')).toBe('1');
    expect(single.restored.has('kb')).toBe(false);

    const both = swapRoundTrip('a=474.Magyars.4.f.&b=492.Britons.4.f.&m=n&na=30&nb=42&ka=1&kb=1');
    expect(both.swapped.get('ka')).toBe('1');
    expect(both.swapped.get('kb')).toBe('1');
    expect(both.restored.get('ka')).toBe('1');
    expect(both.restored.get('kb')).toBe('1');
  });
});

describe('issue 1279 swapMixedDuelInput', () => {
  it('swaps multi-row sides completely and restores on second swap', () => {
    const input: MixedDuelInput = {
      rule: 'frontline-v2',
      data: 'DE-188329',
      a: {
        civ: 'Franks',
        age: '4',
        techs: ['67', '80'],
        team: ['0'],
        rows: [
          { uid: '569', qty: '12' },
          { uid: '359', qty: '8' },
        ],
      },
      b: {
        civ: 'Britons',
        age: '3',
        techs: ['199'],
        team: [],
        rows: [{ uid: '530', qty: '25' }],
      },
    };
    const swapped = swapMixedDuelInput(input);
    expect(swapped.a).toEqual(input.b);
    expect(swapped.b).toEqual(input.a);
    expect(swapMixedDuelInput(swapped)).toEqual(input);
  });
});

describe('issue 1279 readDuelMatchupContext', () => {
  it('returns null for bare duel or pure a/b links without explicit matchup source', () => {
    expect(readDuelMatchupContext(new URLSearchParams(''))).toBeNull();
    expect(readDuelMatchupContext(new URLSearchParams('a=569.Franks.4.f.&b=359.Japanese.4.f.&m=1'))).toBeNull();
    expect(readDuelMatchupContext(new URLSearchParams('me=NotACiv&opp=AlsoFake'))).toBeNull();
    expect(readDuelMatchupContext(new URLSearchParams('practice=Teutons.Japanese.unknown'))).toBeNull();
  });

  it('rejects duplicate me/opp params and deduplicates mirror civs', () => {
    expect(readDuelMatchupContext(new URLSearchParams('me=Franks&me=Britons&opp=Japanese'))).toBeNull();
    expect(readDuelMatchupContext(new URLSearchParams('me=Franks&opp=Britons&opp=Japanese'))).toBeNull();

    const mirror = readDuelMatchupContext(new URLSearchParams('me=Franks&opp=Franks'));
    expect(mirror).toEqual({
      returnTo: '/matchup?me=Franks&opp=Franks',
      practiceReturnLabel: null,
      civs: ['Franks'],
    });
  });

  it('supports single-sided me, explicit me/opp pair, and practice-derived civs', () => {
    expect(readDuelMatchupContext(new URLSearchParams('me=Mongols'))).toEqual({
      returnTo: '/matchup?me=Mongols',
      practiceReturnLabel: null,
      civs: ['Mongols'],
    });

    expect(readDuelMatchupContext(new URLSearchParams('me=Mongols&opp=Chinese'))).toEqual({
      returnTo: '/matchup?me=Mongols&opp=Chinese',
      practiceReturnLabel: null,
      civs: ['Mongols', 'Chinese'],
    });

    expect(readDuelMatchupContext(new URLSearchParams('practice=Teutons.Japanese.scouts'))).toEqual({
      returnTo: '/matchup?rush=scouts&pair=explicit&me=Teutons&opp=Japanese',
      practiceReturnLabel: '条顿 对 日本 · 肉马',
      civs: ['Teutons', 'Japanese'],
    });

    expect(readDuelMatchupContext(new URLSearchParams('practice=Franks.Franks.militia'))).toEqual({
      returnTo: '/matchup?rush=militia&pair=explicit&me=Franks&opp=Franks',
      practiceReturnLabel: null,
      civs: ['Franks'],
    });
  });
});

describe('issue 1279 summarizeOneVOne & summarizeGroup', () => {
  it('produces identical headline and structured metrics for 1v1 win and draw', () => {
    const a = resolve(ctx, core.unitById, DEF_A, DEF_A.uid);
    const b = resolve(ctx, core.unitById, DEF_B, DEF_B.uid);
    expect(isUnavail(a) || isUnavail(b)).toBe(false);
    const resA = a as Resolved;
    const resB = b as Resolved;

    const r = duel(resA.F, resB.F);
    const summary = summarizeOneVOne(resA, resB, r);
    expect(summary.winner).toBe(r.winner);
    expect(summary.headline).toContain('获胜');
    expect(summary.metrics).toHaveLength(2);
    expect(summary.metrics[0]!.value).toMatch(/s$/);

    const mirror = duel(resA.F, resA.F);
    const drawSummary = summarizeOneVOne(resA, resA, mirror);
    expect(drawSummary.winner).toBe('draw');
    expect(drawSummary.headline).toBe('平局（同时击杀）');
    expect(drawSummary.metrics).toHaveLength(1);
  });

  it('produces group summary for win, stop states, and returns null on error', () => {
    const a = resolve(ctx, core.unitById, DEF_A, DEF_A.uid) as Resolved;
    const b = resolve(ctx, core.unitById, DEF_B, DEF_B.uid) as Resolved;

    const g = groupFight(a.F, 10, b.F, 10);
    const summary = summarizeGroup(a, b, g);
    expect(summary).not.toBeNull();
    expect(summary!.headline).toContain(g.winner === 'a' ? a.u.zh : b.u.zh);
    expect(summary!.metrics[0]!.value).toMatch(/秒$/);

    expect(summarizeGroup(a, b, { status: 'error', reason: 'invalid', winner: null })).toBeNull();

    const timeout = summarizeGroup(a, b, {
      ...(g.status === 'error' ? ({} as never) : g),
      status: 'timeout',
      winner: null,
    });
    expect(timeout?.headline).toBe(GROUP_STOP_LABELS.timeout);
    expect(timeout?.icon).toBe('info');

    const limit = summarizeGroup(a, b, {
      ...(g.status === 'error' ? ({} as never) : g),
      status: 'limit',
      winner: null,
    });
    expect(limit?.headline).toBe(GROUP_STOP_LABELS.limit);
  });

  it('preserves explicit ageSet formatting when switching from omitted age URL', () => {
    const parsed = parseSide('329.Berbers..f.', DEF_A);
    expect(parsed.ageSet).toBe(false);
    expect(fmtSide({ ...parsed, age: 3, ageSet: true, techs: 'c' })).toBe('329.Berbers.3.c.');
  });
});

describe('issue 1279 review fixes: mixed recovery and matchup source state', () => {
  it('allows recovering 1v1-valid explosive and dark-age-spearman rows from mixed duel while still blocking invalid rows', () => {
    const resolvedFireCamel = resolve(ctx, core.unitById, { uid: 1263, civ: 'Tatars', age: 4, techs: 'f', team: [] }, DEF_A.uid) as Resolved;
    const fireCamel = { civ: 'Tatars', age: '4', techs: [...resolvedFireCamel.sel].map(String), team: [], rows: [{ uid: '1263', qty: '10' }] };
    const petard = { civ: 'Franks', age: '3', techs: [], team: [], rows: [{ uid: '440', qty: '10' }] };
    const darkSpear = { civ: 'Franks', age: '1', techs: [], team: [], rows: [{ uid: '93', qty: '10' }] };

    expect(resolveMixedSide(ctx, core, fireCamel, 'a').army).toBeNull();
    expect(resolveMixedSide(ctx, core, petard, 'a').army).toBeNull();
    expect(resolveMixedSide(ctx, core, darkSpear, 'a').army).toBeNull();

    expect(canRecoverSingleDuelSide(ctx, core, fireCamel, false)).toBe(true);
    expect(canRecoverSingleDuelSide(ctx, core, fireCamel, true)).toBe(true);
    expect(canRecoverSingleDuelSide(ctx, core, petard, false)).toBe(true);
    expect(canRecoverSingleDuelSide(ctx, core, darkSpear, false)).toBe(true);

    const badQty = { ...fireCamel, rows: [{ uid: '1263', qty: '201' }] };
    expect(canRecoverSingleDuelSide(ctx, core, badQty, false)).toBe(true);
    expect(canRecoverSingleDuelSide(ctx, core, badQty, true)).toBe(false);

    expect(canRecoverSingleDuelSide(ctx, core, { ...fireCamel, rows: [] }, false)).toBe(false);
    expect(canRecoverSingleDuelSide(ctx, core, { ...fireCamel, civ: 'UnknownCiv' }, false)).toBe(false);
    expect(canRecoverSingleDuelSide(ctx, core, { ...fireCamel, age: '5' }, false)).toBe(false);
    expect(canRecoverSingleDuelSide(ctx, core, { ...fireCamel, rows: [{ uid: '999999', qty: '10' }] }, false)).toBe(false);

    // 降时代遗留超时代科技、未知科技、文明不可用科技、重复科技及非法团队索引均拒绝退出
    const franksCastle = { civ: 'Franks', age: '3', techs: ['67', '68'], team: ['0'], rows: [{ uid: '38', qty: '10' }] };
    expect(canRecoverSingleDuelSide(ctx, core, franksCastle, false)).toBe(true);
    expect(canRecoverSingleDuelSide(ctx, core, { ...franksCastle, techs: ['67', '68', '75'] }, false)).toBe(false); // 75=鼓风炉（帝王）
    expect(canRecoverSingleDuelSide(ctx, core, { ...franksCastle, techs: ['80'] }, false)).toBe(false); // 80=骑兵钢甲（帝王）
    expect(canRecoverSingleDuelSide(ctx, core, { ...franksCastle, techs: ['435'] }, false)).toBe(false); // 435=血统（法兰克不可用）
    expect(canRecoverSingleDuelSide(ctx, core, { ...franksCastle, techs: ['999999'] }, false)).toBe(false);
    expect(canRecoverSingleDuelSide(ctx, core, { ...franksCastle, techs: ['67', '67'] }, false)).toBe(false);
    expect(canRecoverSingleDuelSide(ctx, core, { ...franksCastle, team: ['9999'] }, false)).toBe(false);
    expect(canRecoverSingleDuelSide(ctx, core, { ...franksCastle, team: ['0', '0'] }, false)).toBe(false);
  });

  it('extracts and validates matchup source state without accepting malformed or duplicate params', () => {
    expect(extractDuelSourceParams(new URLSearchParams('a=569.Franks.4.f.&m=1'))).toBeNull();
    expect(extractDuelSourceParams(new URLSearchParams('me=Mongols&opp=Chinese'))).toEqual({ me: 'Mongols', opp: 'Chinese' });
    expect(extractDuelSourceParams(new URLSearchParams('practice=Teutons.Japanese.scouts'))).toEqual({ practice: 'Teutons.Japanese.scouts' });
    expect(extractDuelSourceParams(new URLSearchParams('me=Mongols&me=Franks&opp=Chinese'))).toBeNull();

    expect(readDuelSourceState(null)).toBeNull();
    expect(readDuelSourceState({ duelSource: { me: 'NotACiv', opp: 'AlsoFake' } })).toBeNull();
    expect(readDuelSourceState({ duelSource: { me: 'Mongols', opp: 'Chinese', practice: 'Teutons.Japanese.unknown' } })).toEqual({
      me: 'Mongols',
      opp: 'Chinese',
    });
    expect(readDuelSourceState({ duelSource: { practice: 'Teutons.Japanese.scouts' } })).toEqual({
      practice: 'Teutons.Japanese.scouts',
    });
  });
});
