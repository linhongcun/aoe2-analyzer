import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees, type Core } from '../../src/data';
import { buildGroupReplay, buildOneVOneReplay, deriveReplayPhase, replayAt } from '../../src/domain/battleReplay';
import { breakEven } from '../../src/domain/breakEven';
import { contactFight, contactFighterError, type ArmyRow } from '../../src/domain/contactFight';
import { isKiteEligible, RETREAT_CAP } from '../../src/domain/contactKite';
import { groupFight, oneVOneFight, type Fighter } from '../../src/domain/duel';
import { canonDuelKite, decodeDuelKite } from '../../src/domain/duelParams';
import { decodeMixedDuel, encodeMixedDuel, type MixedDuelInput } from '../../src/domain/mixedDuelParams';
import { MIXED_RULE } from '../../src/domain/mixedFight';
import { makeSimContext, type SimContext } from '../../src/domain/simulator';
import type { Trees } from '../../src/domain/types';
import { resolveDuelKiteEligibility } from '../../src/features/duel/logic/duelKiteView';
import { isUnavail, resolve, type Resolved } from '../../src/features/duel/logic/duelSide';
import { GROUP_STOP_LABELS, summarizeGroup, summarizeOneVOne } from '../../src/features/duel/logic/duelSummary';

let core: Core;
let trees: Trees;
let ctx: SimContext;

beforeAll(async () => {
  core = await loadCore();
  trees = await loadTrees();
  ctx = makeSimContext(core.techs, trees);
});

function getResolved(uid: number, civ: string, techs: 'f' | number[] = 'f'): Resolved {
  const r = resolve(ctx, core.unitById, { uid, civ, age: 4, ageSet: true, techs, team: [] }, uid);
  if (isUnavail(r)) throw new Error(`Unit ${uid} unavailable for ${civ}`);
  return r;
}

const getF = (uid: number, civ: string, techs: 'f' | number[] = 'f'): Fighter => getResolved(uid, civ, techs).F;
const row = (uid: number, count: number, fighter: Fighter): ArmyRow => ({ uid, count, fighter });

describe('issue 1295 ranged kiting engine (TRD v4)', () => {
  it('keeps default standing mode 100% bit-for-bit identical across undefined / false / omitted kite', () => {
    const pairs: [ArmyRow[], ArmyRow[]][] = [
      [[{ uid: 2701, count: 37, fighter: getF(2701, 'Franks') }], [{ uid: 359, count: 50, fighter: getF(359, 'Franks') }]],
      [[{ uid: 474, count: 30, fighter: getF(474, 'Magyars') }], [{ uid: 492, count: 42, fighter: getF(492, 'Britons') }]],
      [
        [
          { uid: 871, count: 6, fighter: getF(871, 'Magyars') },
          { uid: 474, count: 15, fighter: getF(474, 'Magyars') },
        ],
        [{ uid: 359, count: 80, fighter: getF(359, 'Franks') }],
      ],
    ];
    for (const [a, b] of pairs) {
      const rOmit = contactFight(a, b, { recordReplay: true });
      const rUndef = contactFight(a, b, { recordReplay: true, kite: undefined });
      const rFalse = contactFight(a, b, { recordReplay: true, kite: { a: false, b: false } });
      expect(rUndef).toEqual(rOmit);
      expect(rFalse).toEqual(rOmit);
      if (rOmit.status !== 'error') expect(rOmit.contact.kite).toBeUndefined();
    }
  });

  it('keeps recordReplay true vs false bit-for-bit identical and coordinate error < 1e-9', () => {
    const cases: [ArmyRow[], ArmyRow[], { a?: boolean; b?: boolean }][] = [
      [[{ uid: 2701, count: 37, fighter: getF(2701, 'Franks') }], [{ uid: 359, count: 50, fighter: getF(359, 'Franks') }], { a: true }],
      [[{ uid: 474, count: 15, fighter: getF(474, 'Magyars') }], [{ uid: 554, count: 30, fighter: getF(554, 'Teutons') }], { a: true }],
      [[{ uid: 474, count: 30, fighter: getF(474, 'Magyars') }], [{ uid: 492, count: 42, fighter: getF(492, 'Britons') }], { a: true, b: true }],
      [[{ uid: 474, count: 30, fighter: getF(474, 'Magyars') }], [{ uid: 492, count: 42, fighter: getF(492, 'Britons') }], { b: true }],
      [[{ uid: 474, count: 10, fighter: getF(474, 'Magyars') }], [{ uid: 548, count: 10, fighter: getF(548, 'Celts') }], { a: true }],
      [
        [
          { uid: 871, count: 1, fighter: getF(871, 'Magyars') },
          { uid: 6, count: 1, fighter: getF(6, 'Byzantines') },
        ],
        [{ uid: 554, count: 1, fighter: getF(554, 'Teutons') }],
        { a: true },
      ],
    ];
    for (const [a, b, kite] of cases) {
      const r0 = contactFight(a, b, { kite, recordReplay: false });
      const r1 = contactFight(a, b, { kite, recordReplay: true });
      expect(r0.status).toBe(r1.status);
      if (r0.status === 'error' || r1.status === 'error') throw new Error('unexpected error');
      expect(r1.duration).toBe(r0.duration);
      expect(r1.a).toEqual(r0.a);
      expect(r1.b).toEqual(r0.b);
      expect(r1.timeline).toEqual(r0.timeline);
      expect(r1.contact.meleeAt).toBe(r0.contact.meleeAt);
      expect(r1.contact.firstStrike).toEqual(r0.contact.firstStrike);
      expect(r1.contact.kite?.a.retreated).toBe(r0.contact.kite?.a.retreated);
      expect(r1.contact.kite?.b.retreated).toBe(r0.contact.kite?.b.retreated);
      expect(r1.contact.kite?.disengagedAt).toBe(r0.contact.kite?.disengagedAt);
      for (const frame of r1.replay!.frames) {
        expect(Math.abs(frame.gap - Math.max(0, frame.bPos - frame.aPos))).toBeLessThan(1e-9);
      }
    }
  });

  it('reverses fast mobile ranged vs slower infantry and respects 40-tile retreat cap with exact capHitX', () => {
    const hmc = getF(2701, 'Franks');
    const halb = getF(359, 'Franks');
    const stand = groupFight(hmc, 37, halb, 50);
    const kite = groupFight(hmc, 37, halb, 50, { recordReplay: true, kite: { a: true } });
    if (stand.status === 'error' || kite.status === 'error') throw new Error('unexpected error');
    expect(stand.winner).toBe('b');
    expect(kite.winner).toBe('a');
    expect(kite.aAlive).toBeGreaterThan(25);
    expect(kite.contact.kite?.a.capHit).toBe(false);
    expect(kite.contact.kite?.a.retreated).toBeGreaterThan(15);
    expect(kite.contact.kite?.a.retreated).toBeLessThan(RETREAT_CAP);
    expect((kite.contact.firstStrike?.volleys ?? 0) - (stand.contact.firstStrike?.volleys ?? 0)).toBeGreaterThan(0);

    // 40-tile cap hit + exact world coordinate x
    const hca = getF(474, 'Magyars');
    const etk = getF(554, 'Teutons');
    const capRes = groupFight(hca, 15, etk, 30, { recordReplay: true, kite: { a: true } });
    if (capRes.status === 'error') throw new Error('unexpected error');
    expect(capRes.contact.kite?.a.capHit).toBe(true);
    expect(capRes.contact.kite?.a.retreated).toBe(RETREAT_CAP);
    expect(capRes.contact.kite?.a.capHitAt).not.toBeNull();
    expect(capRes.contact.kite?.a.capHitX).not.toBeNull();
    expect(capRes.contact.kite!.a.capHitAt!).toBeLessThan(capRes.contact.meleeAt!);
    const capEv = capRes.replay!.events.find((e) => e.kind === 'retreat-cap' && e.side === 'a');
    expect(capEv).toBeDefined();
    if (capEv?.kind === 'retreat-cap') expect(capEv.x).toBeCloseTo(capRes.contact.kite!.a.capHitX!, 6);
  });

  it('catches slower ranged vs faster cavalry without wasting 40-tile retreat after melee contact', () => {
    const arb = getF(492, 'Britons');
    const lcav = getF(546, 'Chinese');
    const stand = groupFight(arb, 42, lcav, 37);
    const kite = groupFight(arb, 42, lcav, 37, { recordReplay: true, kite: { a: true } });
    if (stand.status === 'error' || kite.status === 'error') throw new Error('unexpected error');
    expect(kite.contact.meleeAt).not.toBeNull();
    expect(kite.contact.meleeAt!).toBeGreaterThan(stand.contact.meleeAt!);
    expect(kite.contact.kite?.a.capHit).toBe(false);
    expect(kite.contact.kite!.a.retreated).toBeGreaterThan(0);
    expect(kite.contact.kite!.a.retreated).toBeLessThan(20);
  });

  it('handles openingSpeed > 0 max-range clamp vs slow ram and anti-Zeno chase without moving fire', () => {
    const hca = getF(474, 'Magyars');
    const ram = getF(548, 'Celts');
    const ramRes = contactFight([{ uid: 474, count: 10, fighter: hca }], [{ uid: 548, count: 10, fighter: ram }], {
      kite: { a: true },
      recordReplay: true,
    });
    if (ramRes.status === 'error') throw new Error('unexpected error');
    expect(ramRes.status).not.toBe('limit');
    for (const f of ramRes.replay!.frames) {
      if (f.vxA < -1e-9) expect(f.gap).toBeLessThanOrEqual(hca.rng + 1e-6);
    }

    // Chasing ranged vs kiting ranged: zero firing while moving
    const arb = getF(492, 'Britons');
    const chaseRes = contactFight([{ uid: 474, count: 30, fighter: hca }], [{ uid: 492, count: 42, fighter: arb }], {
      kite: { b: true },
      recordReplay: true,
    });
    if (chaseRes.status === 'error') throw new Error('unexpected error');
    expect(chaseRes.status).toBe('win');
    expect(chaseRes.contact.kite?.b.retreated).toBeGreaterThan(10);
  });

  it('deterministically disengages dual-ranged kiting and prioritizes disengaged before ended in deriveReplayPhase', () => {
    const hca = getResolved(474, 'Magyars');
    const arb = getResolved(492, 'Britons');
    const g = groupFight(hca.F, 30, arb.F, 42, { recordReplay: true, kite: { a: true, b: true } });
    if (g.status === 'error') throw new Error('unexpected error');
    expect(g.status).toBe('disengaged');
    expect(g.winner).toBeNull();
    expect(g.duration).toBeLessThan(60);
    expect(g.contact.kite?.disengagedAt).toBe(g.duration);
    expect(g.replay?.disengagedAt).toBe(g.duration);
    expect(g.replay?.retreatCap).toBe(RETREAT_CAP);

    const model = buildGroupReplay(g, { uid: 474, fighter: hca.F, count: 30, civZh: '马扎尔' }, { uid: 492, fighter: arb.F, count: 42, civZh: '不列颠' });
    const endSnap = replayAt(model, model.duration);
    expect(endSnap.phase).toBe('disengaged');
    expect(endSnap.phaseLabel).toBe('双方脱离接战');
    expect(deriveReplayPhase(model, endSnap).phase).toBe('disengaged');
    expect(model.markers.some((m) => m.kind === 'disengaged')).toBe(true);

    // 1v1 disengaged
    const o = oneVOneFight(hca.F, arb.F, { kite: { a: true, b: true } });
    expect(o.mode).toBe('contact');
    if (o.mode !== 'contact') throw new Error('expected contact');
    expect(o.status).toBe('disengaged');
    expect(o.winner).toBeNull();
    const oneSum = summarizeOneVOne(hca, arb, o);
    expect(oneSum.headline).toBe(GROUP_STOP_LABELS.disengaged);
    expect(oneSum.metrics.map((m) => m.prefix + m.value).join(' ')).toContain('A 剩余 1 / 1');
    const oneModel = buildOneVOneReplay(o, { uid: 474, fighter: hca.F, civZh: '马扎尔' }, { uid: 492, fighter: arb.F, civZh: '不列颠' });
    expect(replayAt(oneModel, oneModel.duration).phase).toBe('disengaged');
  });

  it('preserves bit-for-bit standing equivalence for rng=1 melee fronts/opponents (Round 2 P0-1)', () => {
    const kamayuk = getF(881, 'Incas');
    const slinger = getF(185, 'Incas');
    const paladin = getF(569, 'Franks');
    const hca = getF(474, 'Magyars');
    const steppe = getF(1372, 'Mongols');

    const a1: ArmyRow[] = [
      { uid: 881, count: 10, fighter: kamayuk },
      { uid: 185, count: 10, fighter: slinger },
    ];
    const b1: ArmyRow[] = [{ uid: 569, count: 10, fighter: paladin }];
    const s1 = contactFight(a1, b1);
    const k1 = contactFight(a1, b1, { kite: { a: true } });
    if (s1.status === 'error' || k1.status === 'error') throw new Error('unexpected error');
    expect(k1.duration).toBe(s1.duration);
    expect(k1.a).toEqual(s1.a);
    expect(k1.b).toEqual(s1.b);
    expect(k1.contact.kite?.a.triggered).toBe(false);
    expect(k1.contact.kite?.a.retreated).toBe(0);

    const a2: ArmyRow[] = [
      { uid: 569, count: 10, fighter: paladin },
      { uid: 474, count: 10, fighter: hca },
    ];
    const b2: ArmyRow[] = [{ uid: 1372, count: 10, fighter: steppe }];
    const s2 = contactFight(a2, b2);
    const k2 = contactFight(a2, b2, { kite: { a: true } });
    if (s2.status === 'error' || k2.status === 'error') throw new Error('unexpected error');
    expect(k2.duration).toBe(s2.duration);
    expect(k2.a).toEqual(s2.a);
    expect(k2.b).toEqual(s2.b);
    expect(k2.contact.kite?.a.triggered).toBe(false);
    expect(k2.contact.kite?.a.retreated).toBe(0);
  });

  it('escapes minRange vs stationary ranged (Round 2 P1-1) and resets escapingMinRange for BBC vs BallistaEle/Mameluke (Round 3 P1-1)', () => {
    const huszar = getF(871, 'Magyars');
    const militiaMag = getF(74, 'Magyars');
    const skirm = getF(6, 'Byzantines');
    const britArb = getF(492, 'Britons');

    // [1 骠骑 + 1 精锐掷矛(拉扯)] vs [1 不列颠劲弩(站桩)]
    const rHuszar = contactFight([row(871, 1, huszar), row(6, 1, skirm)], [row(492, 1, britArb)], { kite: { a: true } });
    expect(rHuszar.status).toBe('win');

    // [1 民兵 + 1 拜占庭精锐掷矛(拉扯)] vs [1 不列颠劲弩(站桩)]：站桩死锁盲区 B 胜 → 拉扯脱离反胜
    const milSkm = [row(74, 1, militiaMag), row(6, 1, skirm)];
    const rStand = contactFight(milSkm, [row(492, 1, britArb)]);
    const rKite = contactFight(milSkm, [row(492, 1, britArb)], { kite: { a: true } });
    if (rStand.status !== 'win' || rKite.status !== 'win') throw new Error('expected win');
    expect(rStand.winner).toBe('b');
    expect(rKite.winner).toBe('a');
    expect(rKite.contact.kite!.a.retreated).toBeGreaterThan(0);

    // Round 3 P1-1: BBC(36, minr=5) vs Ballista Elephant(1120) & Elite Mameluke(556) — zero oscillation, zero 40-tile waste
    const milBbc = [row(74, 1, getF(74, 'Turks')), row(36, 1, getF(36, 'Turks'))];
    for (const [oppUid, oppCiv] of [
      [1120, 'Khmer'],
      [556, 'Saracens'],
    ] as const) {
      const res = contactFight(milBbc, [row(oppUid, 1, getF(oppUid, oppCiv))], { kite: { a: true }, recordReplay: true });
      if (res.status === 'error') throw new Error('unexpected error');
      expect(res.status).toBe('win');
      expect(res.contact.kite?.a.capHit).toBe(false);
      expect(res.contact.kite?.a.retreated).toBe(0);
    }
  });

  it('handles mixed 2-melee-front clearing, multi-ranged transition, and isKiteEligible monk filtering', () => {
    const huszar = getF(871, 'Magyars');
    const halb = getF(359, 'Franks');
    const champ = getF(567, 'Japanese');
    const hca = getF(474, 'Magyars');
    const arb = getF(492, 'Britons');
    const res = contactFight([row(871, 2, huszar), row(359, 2, halb), row(474, 15, hca)], [row(567, 40, champ)], { kite: { a: true }, recordReplay: true });
    if (res.status === 'error') throw new Error('unexpected error');
    expect(res.contact.kite?.a.hadMeleeFront).toBe(true);
    expect(res.contact.kite?.a.triggered).toBe(true);
    expect(res.contact.kite?.a.activatedAt).toBeGreaterThan(0);
    expect(res.contact.kite?.a.clearedFrontNames).toEqual([huszar.name, halb.name]);
    expect(res.contact.kite?.a.rangedName).toBe(hca.name);
    expect(res.contact.kite!.a.retreated).toBeGreaterThan(0);

    // Multi-ranged transition shares a single 40-tile retreat budget and joins rangedName by '、'
    const multiRanged = contactFight([row(492, 3, arb), row(474, 15, hca)], [row(567, 50, champ)], { kite: { a: true }, recordReplay: true });
    if (multiRanged.status === 'error') throw new Error('unexpected error');
    expect(multiRanged.contact.kite?.a.rangedName).toBe(`${arb.name}、${hca.name}`);
    expect(multiRanged.contact.kite!.a.retreated).toBeLessThanOrEqual(RETREAT_CAP);

    // isKiteEligible excludes melee and non-attacking casters (125 Monk, 775 Missionary)
    expect(isKiteEligible(hca)).toBe(true);
    expect(isKiteEligible(halb)).toBe(false);
    expect(isKiteEligible(getF(125, 'Franks'))).toBe(false);
    expect(isKiteEligible(getF(775, 'Spanish'))).toBe(false);
  });

  it('fixes P0-1 out-of-range clamp deadlock, P0-2 front transition engaged reset, P0-3 dual-kite freeze, and P1-1 backline retreat fire', () => {
    const milT = getF(74, 'Turks'),
      bbcT = getF(36, 'Turks'),
      mamS = getF(556, 'Saracens');
    const arbB = getF(492, 'Britons'),
      trebB = getF(331, 'Britons'),
      lbowB = getF(530, 'Britons');
    const skmB = getF(6, 'Britons'),
      hcaM = getF(474, 'Magyars'),
      halbF = getF(359, 'Franks');

    // P0-1: BBC+Mil vs Mameluke never deadlocks at 600s; longer backline doesn't freeze B; speed=0 backline doesn't false-error
    for (const kite of [{ b: true }, { a: true, b: true }]) {
      const r = contactFight([row(74, 1, milT), row(36, 1, bbcT)], [row(556, 1, mamS)], { kite });
      expect(r.status).not.toBe('timeout');
      expect(r.status).not.toBe('error');
    }
    for (const [a, b] of [
      [[row(492, 1, arbB), row(331, 1, trebB)], [row(492, 10, arbB)]],
      [[row(492, 1, arbB), row(36, 5, bbcT)], [row(492, 10, arbB)]],
      [[row(6, 1, skmB), row(530, 5, lbowB)], [row(6, 10, skmB)]],
    ] as [ArmyRow[], ArmyRow[]][]) {
      const r = contactFight(a, b, { kite: { b: true }, recordReplay: true });
      if (r.status === 'error') throw new Error(r.reason);
      expect(r.status).toBe('win');
      const frozen = r.replay!.frames.filter(
        (f) => f.t < r.duration - 1e-9 && f.gap > b[0]!.fighter.rng + 1e-6 && Math.abs(f.vxB) <= 1e-9 && f.bRows[0]!.alive > 0,
      );
      expect(frozen).toEqual([]);
    }
    const staticArb: Fighter = { ...arbB, name: '定桩弩', contact: { ...arbB.contact!, speed: 0 } };
    for (const kite of [{ b: true }, { a: true, b: true }]) {
      const r = contactFight([row(492, 1, arbB), row(9991, 3, staticArb)], [row(492, 10, arbB)], { kite });
      expect(r.status).toBe('win');
    }

    // P0-2: Devin Imp Britons no-tech [1 Arb + 3 Skm] vs [10 Arb] never prematurely disengages at 2.52s; unfired backline advances & engages; 3-row ranged->melee->ranged
    const arb0 = getF(492, 'Britons', []),
      skm0 = getF(6, 'Britons', []);
    const devin = contactFight([row(492, 1, arb0), row(6, 3, skm0)], [row(492, 10, arb0)], { kite: { a: true, b: true }, recordReplay: true });
    if (devin.status === 'error') throw new Error(devin.reason);
    expect(devin.status).toBe('win');
    expect(devin.duration).toBeGreaterThan(10);
    expect(devin.replay!.frames.some((f) => f.aFrontRow === 1 && f.vxA > 1e-9)).toBe(true);
    const devinMore = contactFight([row(492, 1, arb0), row(6, 20, skm0)], [row(492, 10, arb0)], { kite: { a: true, b: true } });
    if (devinMore.status === 'error') throw new Error(devinMore.reason);
    expect(devinMore.contact.a[1]!.maxRanged).toBeGreaterThan(0);
    const threeRow = contactFight([row(492, 2, arbB), row(359, 3, halbF), row(474, 10, hcaM)], [row(492, 20, arbB)], { kite: { a: true, b: true } });
    if (threeRow.status === 'error') throw new Error(threeRow.reason);
    expect(threeRow.contact.a[2]!.maxRanged).toBeGreaterThan(0);

    // P0-3: Dual-kite backline longer range triggers retreat to disengage; moveWindow===0 && minRange>0 never freezes opponent
    const backLong1 = contactFight([row(474, 2, hcaM), row(530, 10, lbowB)], [row(474, 15, hcaM)], { kite: { a: true, b: true } });
    const backLong2 = contactFight([row(6, 10, skmB), row(530, 10, lbowB)], [row(474, 15, hcaM)], { kite: { a: true, b: true } });
    if (backLong1.status === 'error' || backLong2.status === 'error') throw new Error('unexpected error');
    expect(backLong1.status).toBe('disengaged');
    expect(backLong1.duration).toBeLessThan(15);
    expect(backLong2.status).toBe('disengaged');
    expect(backLong2.duration).toBeLessThan(20);
    const slowLong: Fighter = { ...arbB, rng: 11, contact: { ...arbB.contact!, minRange: 1, firstHitDelay: arbB.rof + 0.5 } };
    const slowRes = contactFight([row(492, 10, slowLong)], [row(474, 15, hcaM)], { kite: { a: true, b: true } });
    if (slowRes.status !== 'win') throw new Error(`expected win, got ${slowRes.status}`);
    expect(slowRes.winner).toBe('b');
    expect(slowRes.duration).toBeLessThan(20);
    // Devin PR #1365 regression: rear volley while front is still in range must not cancel front's lethal volley into disengagement
    const tupiRes = contactFight([row(6, 15, getF(6, 'Tupi')), row(492, 1, getF(492, 'Tupi'))], [row(474, 2, getF(474, 'Khmer'))], {
      kite: { a: true, b: true },
    });
    if (tupiRes.status !== 'win') throw new Error(`expected Tupi win, got ${tupiRes.status}`);
    expect(tupiRes.winner).toBe('a');
    expect(tupiRes.duration).toBeLessThan(5);
    expect(tupiRes.a.total.alive).toBe(16);
    expect(tupiRes.b.total.alive).toBe(0);

    // P1-1: Backline ranged never fires during retreat frames while standing mode remains bit-for-bit identical
    const mixA = [row(474, 5, hcaM), row(492, 10, arbB)],
      mixB = [row(359, 50, halbF)];
    const retRes = contactFight(mixA, mixB, { kite: { a: true }, recordReplay: true });
    if (retRes.status === 'error') throw new Error(retRes.reason);
    const frames = retRes.replay!.frames;
    expect(frames.some((f) => f.vxA < -1e-9)).toBe(true);
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i]!;
      if (f.vxA < -1e-9) expect(f.aRows.every((r) => r.active === 0)).toBe(true);
      if (i > 0 && frames[i - 1]!.vxA < -1e-9) expect(f.aFired).toBe(0);
    }
    expect(contactFight(mixA, mixB, { kite: { a: false, b: false }, recordReplay: true })).toEqual(contactFight(mixA, mixB, { recordReplay: true }));
  });

  it('handles attackDelaySeconds=0, synthetic delay>=rof, speed=0, full valid ranged sweep, and perf budget', () => {
    const jan = getF(557, 'Turks');
    const halb = getF(359, 'Franks');
    expect(jan.contact?.firstHitDelay).toBe(0);
    const janRes = groupFight(jan, 25, halb, 40, { kite: { a: true } });
    if (janRes.status === 'error') throw new Error('unexpected error');
    expect(janRes.contact.kite?.a.attackDelaySeconds).toBe(0);
    expect(janRes.contact.kite?.a.moveWindowSeconds).toBeCloseTo(jan.rof, 6);

    // Synthetic delay >= rof -> moveWindow === 0, zero retreat, zero NaN
    const slowWindup: Fighter = { ...jan, contact: { ...jan.contact!, firstHitDelay: jan.rof + 0.5 } };
    const swRes = groupFight(slowWindup, 10, halb, 10, { kite: { a: true } });
    if (swRes.status === 'error') throw new Error('unexpected error');
    expect(swRes.contact.kite?.a.moveWindowSeconds).toBe(0);
    expect(swRes.contact.kite?.a.retreated).toBe(0);
    expect(Number.isFinite(swRes.duration)).toBe(true);

    // Synthetic speed = 0 -> zero retreat
    const immobile: Fighter = { ...jan, contact: { ...jan.contact!, speed: 0 } };
    const imRes = groupFight(immobile, 10, halb, 10, { kite: { a: true } });
    if (imRes.status === 'error') throw new Error('unexpected error');
    expect(imRes.contact.kite?.a.retreated).toBe(0);

    // Full catalog sweep across all valid ranged units vs representative opponents
    const opps = [halb, getF(546, 'Chinese'), getF(554, 'Teutons'), getF(492, 'Britons')] as const;
    let checked = 0;
    for (const u of core.units) {
      if (u.rng <= 1 || !u.civs.length) continue;
      const r = resolve(ctx, core.unitById, { uid: u.id, civ: u.civs[0]!, age: 4, ageSet: true, techs: 'f', team: [] }, u.id);
      if (isUnavail(r) || contactFighterError(r.F)) continue;
      checked++;
      for (const opp of opps) {
        const res = contactFight([{ uid: u.id, count: 10, fighter: r.F }], [{ uid: 999, count: 10, fighter: opp }], { kite: { a: true, b: opp.ranged } });
        expect(res.status).not.toBe('error');
        expect(res.status).not.toBe('limit');
        if (res.status !== 'error') {
          expect(Number.isFinite(res.duration)).toBe(true);
          expect(res.contact.kite!.a.retreated).toBeGreaterThanOrEqual(0);
          expect(res.contact.kite!.a.retreated).toBeLessThanOrEqual(RETREAT_CAP + 1e-9);
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(100);

    // Performance budget: 200 vs 200 + breakEven scan
    const t0 = performance.now();
    const big = groupFight(getF(474, 'Magyars'), 200, halb, 200, { kite: { a: true } });
    expect(big.status).toBe('win');
    const be = breakEven(getF(474, 'Magyars'), halb, 20, 200, (fa, na, fb, nb) => groupFight(fa, na, fb, nb, { kite: { a: true } }));
    expect(be.n).not.toBeNull();
    expect(performance.now() - t0).toBeLessThan(2500);
  });

  it('encodes/decodes duel ka/kb, mixed kite, cold-load eligibility, summarizeGroup 3/4-arg, and breakEven disengaged', () => {
    expect(decodeDuelKite(new URLSearchParams(''))).toEqual({ a: false, b: false });
    expect(decodeDuelKite(new URLSearchParams('ka=1&kb=0'))).toEqual({ a: true, b: false });
    expect(decodeDuelKite(new URLSearchParams('ka=yes&kb=1'))).toEqual({ a: false, b: true });

    // eligible === undefined preserves valid ka=1/kb=1 (cold load & upgrade links)
    const preserved = canonDuelKite(new URLSearchParams('m=r&bud=3000&ka=1&kb=1'), { a: true, b: true }, undefined);
    expect(preserved.get('ka')).toBe('1');
    expect(preserved.get('kb')).toBe('1');
    const pruned = canonDuelKite(new URLSearchParams('m=r&bud=3000&ka=1&kb=1'), { a: true, b: true }, { a: true, b: false });
    expect(pruned.get('ka')).toBe('1');
    expect(pruned.has('kb')).toBe(false);

    // resolveDuelKiteEligibility null-safe & 1v1 static-fallback hides toggle
    expect(resolveDuelKiteEligibility('1', null, null)).toBeUndefined();
    const hca = getResolved(474, 'Magyars');
    const petard = getResolved(440, 'Franks');
    expect(resolveDuelKiteEligibility('1', hca, petard)).toEqual({ a: false, b: false });
    expect(resolveDuelKiteEligibility('r', hca, petard)).toEqual({ a: true, b: false });

    // Mixed URL protocol: kite:true round-trips, false stripped, non-boolean rejected
    const mixIn: MixedDuelInput = {
      rule: MIXED_RULE,
      data: 'DE-188329',
      a: { civ: 'Magyars', age: '4', techs: [], team: [], rows: [{ uid: '474', qty: '15' }], kite: true },
      b: { civ: 'Franks', age: '4', techs: [], team: [], rows: [{ uid: '359', qty: '50' }], kite: false },
    };
    const encoded = encodeMixedDuel(mixIn);
    expect(encoded.get('ma')).toContain('"kite":true');
    expect(encoded.get('mb')).not.toContain('kite');
    const decoded = decodeMixedDuel(encoded);
    expect(decoded.errors).toEqual([]);
    expect(decoded.input.a.kite).toBe(true);
    expect('kite' in decoded.input.b).toBe(false);

    const badParams = new URLSearchParams(encoded);
    badParams.set('ma', JSON.stringify({ ...mixIn.a, kite: 'yes' }));
    const badDecoded = decodeMixedDuel(badParams);
    expect(badDecoded.sideErrors.a.some((e) => e.includes('kite'))).toBe(true);

    // summarizeGroup 3-arg & 4-arg compatibility on disengaged
    const arb = getResolved(492, 'Britons');
    const dis = groupFight(hca.F, 30, arb.F, 42, { kite: { a: true, b: true } });
    const s3 = summarizeGroup(hca, arb, dis);
    const s4 = summarizeGroup(hca, arb, dis, { na: 30, nb: 42 });
    expect(s3?.headline).toBe(GROUP_STOP_LABELS.disengaged);
    expect(s4?.metrics.map((m) => m.prefix + m.value)).toContain('A 剩余 22 / 30');
    expect(s4?.metrics.map((m) => m.prefix + m.value)).toContain('B 剩余 38 / 42');

    // breakEven with dual-kite disengaged
    const beDis = breakEven(hca.F, arb.F, 10, 15, (fa, na, fb, nb) => groupFight(fa, na, fb, nb, { kite: { a: true, b: true } }));
    expect(beDis.incomplete?.status).toBe('disengaged');
  });
});
