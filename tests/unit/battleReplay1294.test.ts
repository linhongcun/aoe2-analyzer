import { describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import {
  buildGroupReplay,
  buildMixedReplay,
  buildOneVOneReplay,
  computeStageBounds,
  deriveReplayPhase,
  formatMeleeCaption,
  isLargeAggregate,
  MAX_TIMELINE_HITS,
  replayAt,
  sampleContactHitTimes,
} from '../../src/domain/battleReplay';
import { contactFight, type ArmyRow } from '../../src/domain/contactFight';
import type { ContactReplayEvent, ContactReplayTrace } from '../../src/domain/contactReplayTrace';
import { groupFight, oneVOneFight, type Fighter } from '../../src/domain/duel';
import { formatHp } from '../../src/domain/hpFormat';
import { parseSide } from '../../src/domain/duelState';
import { makeSimContext } from '../../src/domain/simulator';
import { isUnavail, resolve } from '../../src/features/duel/logic/duelSide';

async function loadHelper() {
  const core = await loadCore();
  const trees = await loadTrees();
  const ctx = makeSimContext(core.techs, trees);
  const side = (raw: string) => {
    const spec = parseSide(raw, { uid: 1, civ: 'Franks', age: 4, techs: 'f', team: [] });
    const res = resolve(ctx, core.unitById, spec, spec.uid);
    if (isUnavail(res)) throw new Error(`Unavailable side: ${raw}`);
    return res;
  };
  return { core, side };
}

function makeFighter(over: Partial<Fighter> & { contact: NonNullable<Fighter['contact']> }): Fighter {
  return { name: '单位', hp: 100, attack: { 近战: 1 }, armor: { 近战: 0, 穿刺: 0 }, rof: 2, acc: 1, ranged: false, rng: 0, cost: {}, ...over };
}

function assertTraceInvariants(trace: ContactReplayTrace, duration: number) {
  expect(trace.frames.length).toBeGreaterThan(0);
  for (let i = 0; i < trace.frames.length; i++) {
    const f = trace.frames[i]!;
    if (i > 0) expect(f.t).toBeGreaterThan(trace.frames[i - 1]!.t);
    const derived = Math.max(0, f.bPos - f.aPos);
    if (f.gap === 0) {
      expect(f.gap).toBe(0);
      expect(Math.abs(f.bPos - f.aPos)).toBeLessThanOrEqual(1e-9);
    } else {
      expect(Math.abs(f.gap - derived)).toBeLessThanOrEqual(1e-9);
    }
    expect(Number.isFinite(f.aPos) && Number.isFinite(f.bPos)).toBe(true);
  }
  expect(Math.abs(trace.frames.at(-1)!.t - duration)).toBeLessThanOrEqual(1e-9);
}

describe('#1294 同源战斗过程回放轨迹与不变量', () => {
  it('代表性群战、混编与 200v200：recordReplay 逐比特等价、坐标恒等且耗时达标', async () => {
    const { side } = await loadHelper();
    const cases: { name: string; a: ArmyRow[]; b: ArmyRow[] }[] = [
      {
        name: '37 精锐马扎尔骠骑 vs 22 西班牙游侠',
        a: [{ uid: 871, count: 37, fighter: side('871.Magyars.4.f.').F }],
        b: [{ uid: 569, count: 22, fighter: side('569.Spanish.4.f.').F }],
      },
      {
        name: '38 精锐印加枪兵长 vs 42 日本冠军',
        a: [{ uid: 881, count: 38, fighter: side('881.Incas.4.f.').F }],
        b: [{ uid: 567, count: 42, fighter: side('567.Japanese.4.f.').F }],
      },
      {
        name: '37 中国轻骑 vs 42 不列颠劲弩',
        a: [{ uid: 546, count: 37, fighter: side('546.Chinese.4.f.').F }],
        b: [{ uid: 492, count: 42, fighter: side('492.Britons.4.f.').F }],
      },
      {
        name: '混编 6 骠骑 + 15 重装骑射 vs 65 法兰克长戟',
        a: [
          { uid: 871, count: 6, fighter: side('871.Magyars.4.f.').F },
          { uid: 474, count: 15, fighter: side('474.Magyars.4.f.').F },
        ],
        b: [{ uid: 359, count: 65, fighter: side('359.Franks.4.f.').F }],
      },
      {
        name: '200 法兰克长戟 vs 200 西班牙游侠',
        a: [{ uid: 359, count: 200, fighter: side('359.Franks.4.f.').F }],
        b: [{ uid: 569, count: 200, fighter: side('569.Spanish.4.f.').F }],
      },
    ];

    for (const item of cases) {
      const base = contactFight(item.a, item.b, { recordReplay: false });
      const t0 = performance.now();
      const rec = contactFight(item.a, item.b, { recordReplay: true });
      const elapsedMs = performance.now() - t0;
      expect(base.status, item.name).not.toBe('error');
      expect(rec.status, item.name).not.toBe('error');
      if (base.status === 'error' || rec.status === 'error') continue;
      expect(rec.replay, item.name).toBeDefined();
      const { replay, ...recWithoutReplay } = rec;
      expect(recWithoutReplay, item.name).toEqual(base);
      assertTraceInvariants(replay!, rec.duration);
      // 致死一击与全过程出手数非零
      const totalFired = replay!.frames.reduce((s, f) => s + f.aFired + f.bFired, 0);
      expect(totalFired, item.name).toBeGreaterThan(0);
      if (item.name.startsWith('200')) {
        expect(elapsedMs).toBeLessThan(300);
      }
    }
  });

  it('图 4：1v1 中国轻骑 vs 条顿手推炮在 t≈5.274s 精确触发 min-range-enter 且过滤 !leaving', async () => {
    const { side } = await loadHelper();
    const lc = side('546.Chinese.4.f.');
    const bbc = side('36.Teutons.4.f.');
    const res = oneVOneFight(lc.F, bbc.F);
    expect(res.mode).toBe('contact');
    if (res.mode !== 'contact') return;
    expect(res.status).toBe('win');
    expect(res.winner).toBe('a');
    expect(res.replay).toBeDefined();
    assertTraceInvariants(res.replay!, res.duration);

    const minEv = res.replay!.events.find((e) => e.kind === 'min-range-enter');
    expect(minEv).toBeDefined();
    expect(minEv!.t).toBeCloseTo(5.274, 2);

    const model = buildOneVOneReplay(res, { uid: lc.u.id, fighter: lc.F, civZh: '中国' }, { uid: bbc.u.id, fighter: bbc.F, civZh: '条顿' });
    const midBlind = replayAt(model, 6.0);
    expect(midBlind.bRows[0]!.active).toBe(0);
    expect(midBlind.bRows[0]!.silencedByMinRange).toBe(true);
    expect(midBlind.phase).toBe('approach');
    expect(midBlind.phaseLabel).toBe('前进接敌 · 突破最小射程');
    expect(model.markers.some((m) => m.label === '突入盲区 5.27s')).toBe(true);

    // 致死一击计入末帧 aFired
    const aHits = sampleContactHitTimes(res.replay, 'a', MAX_TIMELINE_HITS);
    expect(aHits.length).toBeGreaterThan(0);
    expect(aHits.at(-1)!).toBeCloseTo(res.duration, 5);
  });

  it('多人数最小射程远程（40 精锐掷矛手 vs 42 游侠）触发 partialMinRangeSilence 且后排仍活跃', async () => {
    const { side } = await loadHelper();
    const skirms = side('6.Vietnamese.4.f.');
    const paladins = side('569.Spanish.4.f.');
    const res = contactFight([{ uid: 6, count: 40, fighter: skirms.F }], [{ uid: 569, count: 42, fighter: paladins.F }], { recordReplay: true });
    expect(res.status).not.toBe('error');
    if (res.status === 'error') return;
    const partialFrame = res.replay!.frames.find((f) => f.aRows[0]!.partialMinRangeSilence && f.aRows[0]!.active > 0);
    expect(partialFrame).toBeDefined();
  });

  it('日本精锐武士 vs 西班牙游侠 1v1 同源实算：游侠胜、剩 92/180、用时约 10.56s', async () => {
    const { side } = await loadHelper();
    const jp = side('560.Japanese.4.f.');
    const es = side('569.Spanish.4.f.');
    const res = oneVOneFight(jp.F, es.F);
    expect(res.mode).toBe('contact');
    if (res.mode !== 'contact') return;
    expect(res.status).toBe('win');
    expect(res.winner).toBe('b');
    expect(res.remaining).toBe(92);
    expect(res.duration).toBeCloseTo(10.5585, 2);
  });

  it('groupFight 第 5 参同时兼容 number 与 GroupFightOptions，且回传 replay', async () => {
    const { side } = await loadHelper();
    const a = side('569.Franks.4.f.').F;
    const b = side('359.Japanese.4.f.').F;
    const byNum = groupFight(a, 5, b, 5, 10);
    const byOpts = groupFight(a, 5, b, 5, { maxTime: 10, recordReplay: true });
    expect(byNum.status).not.toBe('error');
    expect(byOpts.status).not.toBe('error');
    if (byNum.status === 'error' || byOpts.status === 'error') return;
    expect(byNum.replay).toBeUndefined();
    expect(byOpts.replay).toBeDefined();
    expect(byOpts.duration).toBe(byNum.duration);
    expect(byOpts.aAlive).toBe(byNum.aAlive);
    expect(byOpts.bAlive).toBe(byNum.bAlive);
    const gm = buildGroupReplay(byOpts, { uid: 569, fighter: a, count: 5, civZh: '法兰克' }, { uid: 359, fighter: b, count: 5, civZh: '日本' });
    const endSnap = replayAt(gm, gm.duration);
    expect(endSnap.aAlive).toBe(byOpts.aAlive);
    expect(endSnap.bAlive).toBe(byOpts.bAlive);
  });

  it('双远程对射命中 ranged-exchange、contactX 为 null，且不出现第 0 轮', async () => {
    const { side } = await loadHelper();
    const lb = side('530.Britons.4.f.');
    const arb = side('492.Britons.4.f.');
    const res = oneVOneFight(lb.F, arb.F);
    expect(res.mode).toBe('contact');
    if (res.mode !== 'contact') return;
    expect(res.contact.meleeAt).toBeNull();
    expect(res.replay!.contactX).toBeNull();
    const model = buildOneVOneReplay(res, { uid: lb.u.id, fighter: lb.F, civZh: '不列颠' }, { uid: arb.u.id, fighter: arb.F, civZh: '不列颠' });
    const phases = model.trace.frames.map((f) => deriveReplayPhase(model, replayAt(model, f.t)));
    expect(phases.some((p) => p.label.includes('第 0 轮'))).toBe(false);
    expect(phases.some((p) => p.phase === 'ranged-exchange')).toBe(true);
  });

  it('单批清空多行时 row-cleared.x 计入 setback 不重叠；maxTime=0 无重复帧；sampleContactHitTimes 上限 60 保首尾', () => {
    const cBase = { radiusX: 0.4, radiusY: 0.4, speed: 1, minRange: 0, firstHitDelay: 0, repeatableAttack: true };
    const glassA = makeFighter({ name: '脆皮前排', hp: 5, contact: cBase });
    const glassA2 = { ...glassA, name: '脆皮中排' };
    const tankA3 = { ...glassA, name: '厚血后排', hp: 500 };
    const nukeB = makeFighter({
      name: '高伤齐射',
      hp: 200,
      attack: { 穿刺: 50 },
      rof: 1,
      ranged: true,
      rng: 6,
      contact: { ...cBase, radiusX: 0.3, radiusY: 0.3, firstHitDelay: 1.5 },
    });
    const aRows: ArmyRow[] = [
      { uid: 1, count: 1, fighter: glassA },
      { uid: 2, count: 1, fighter: glassA2 },
      { uid: 3, count: 1, fighter: tankA3 },
    ];
    const bRows: ArmyRow[] = [{ uid: 10, count: 4, fighter: nukeB }];
    const multi = contactFight(aRows, bRows, { recordReplay: true });
    expect(multi.status).not.toBe('error');
    if (multi.status !== 'error') {
      const cleared = multi.replay!.events.filter((e): e is Extract<ContactReplayEvent, { kind: 'row-cleared' }> => e.kind === 'row-cleared' && e.side === 'a');
      expect(cleared.length).toBeGreaterThanOrEqual(2);
      expect(cleared[0]!.t).toBeCloseTo(cleared[1]!.t, 6);
      expect(cleared[0]!.x).not.toBeCloseTo(cleared[1]!.x, 5);
      expect(cleared[0]!.x - cleared[1]!.x).toBeCloseTo(2 * 0.4, 5);
      const model = buildMixedReplay(multi, { civZh: 'A', rows: aRows }, { civZh: 'B', rows: bRows });
      expect(replayAt(model, Number.NaN).t).toBe(0);
      expect(replayAt(model, Number.POSITIVE_INFINITY).t).toBe(0);
      expect(replayAt(model, model.duration + 999).t).toBe(model.duration);
      expect(replayAt(model, -5).t).toBe(0);
      // 空 frames 兜底
      expect(replayAt({ ...model, trace: { ...model.trace, frames: [] } }, 1).phase).toBe('ended');
    }

    // maxTime = 0 无重复时间戳帧
    const zero = contactFight([{ uid: 1, count: 1, fighter: glassA }], [{ uid: 2, count: 1, fighter: nukeB }], { maxTime: 0, recordReplay: true });
    expect(zero.status).toBe('timeout');
    if (zero.status !== 'error') {
      expect(zero.replay!.frames).toHaveLength(1);
      expect(zero.replay!.frames[0]!.t).toBe(0);
    }

    // 高频抽样保首尾且 <= 60
    const f0 = {
      t: 0,
      aPos: 0,
      bPos: 5,
      gap: 5,
      vxA: 0,
      vxB: 0,
      aFired: 1,
      bFired: 0,
      openingSide: null,
      openingVolley: 0,
      aFrontRow: 0,
      bFrontRow: 0,
      aRows: [],
      bRows: [],
    };
    const syntheticTrace: ContactReplayTrace = {
      initialGap: 5,
      contactX: 2,
      events: [],
      frames: Array.from({ length: 240 }, (_, i) => ({ ...f0, t: i * 0.25 })),
    };
    const sampled = sampleContactHitTimes(syntheticTrace, 'a', MAX_TIMELINE_HITS);
    expect(sampled).toHaveLength(60);
    expect(sampled[0]).toBe(0);
    expect(sampled.at(-1)).toBe(239 * 0.25);

    // #1295 负坐标与超 initialGap 扩展边界
    const kitingBounds = computeStageBounds({ initialGap: 10, contactX: null, events: [], frames: [{ ...f0, aPos: -18, bPos: 26 }] });
    expect([kitingBounds.minX, kitingBounds.maxX, kitingBounds.span]).toEqual([-18, 26, 44]);
  });

  it('1v1 优雅降级与 #1322 契约：爆破兵、僧侣与不可移动单位原因文案不重复前缀', async () => {
    const { side } = await loadHelper();
    const petard = side('440.Franks.4.f.');
    const paladin = side('569.Spanish.4.f.');
    const monk = side('125.Aztecs.4.f.');
    const missionary = side('775.Spanish.4.f.');

    // 440 爆破兵 repeatableAttack === true，降级但非 bothNoAttack
    expect(petard.F.contact?.repeatableAttack).toBe(true);
    const rPetard = oneVOneFight(petard.F, paladin.F);
    expect(rPetard.mode).toBe('static-fallback');
    if (rPetard.mode === 'static-fallback') {
      expect(rPetard.fallbackReason).toContain('A 方的爆破兵');
      expect(rPetard.fallbackReason).not.toContain('A 方的爆破兵A 方的');
    }

    // 125 vs 775 均无普攻；125 vs 4 单侧无普攻降级且步弓手保持满血
    expect(monk.F.contact?.repeatableAttack).toBe(false);
    expect(missionary.F.contact?.repeatableAttack).toBe(false);
    const rBothNoAtk = oneVOneFight(monk.F, missionary.F);
    expect(rBothNoAtk.mode).toBe('static-fallback');
    if (rBothNoAtk.mode === 'static-fallback') {
      expect(rBothNoAtk.outcome).toBe('both-no-attack');
    }
    const archer = side('4.Britons.3..');
    const rMonkArcher = oneVOneFight(monk.F, archer.F);
    expect(rMonkArcher.mode).toBe('static-fallback');
    if (rMonkArcher.mode === 'static-fallback') {
      expect(rMonkArcher.outcome).toBe('win');
      expect(rMonkArcher.winner).toBe('b');
      expect(rMonkArcher.remaining).toBe(30);
      expect(rMonkArcher.ab.canAttack).toBe(false);
      expect(rMonkArcher.fallbackReason).toContain('A 方的僧侣没有可重复的普通攻击');
    }

    // 不可移动且射程不足的 contactFight error 回退不重复侧方前缀
    const immobile = makeFighter({
      name: '静止木桩',
      attack: { 近战: 10 },
      contact: { radiusX: 0.3, radiusY: 0.3, speed: 0, minRange: 0, firstHitDelay: 0, repeatableAttack: true },
    });
    const rImmobile = oneVOneFight(immobile, immobile);
    expect(rImmobile.mode).toBe('static-fallback');
    if (rImmobile.mode === 'static-fallback') {
      expect(rImmobile.fallbackReason).toContain('A 方的静止木桩无法移动接敌');
      expect(rImmobile.fallbackReason).not.toMatch(/A 方的.*A 方的/);
    }
  });

  it('复核修复（P1-1/P1-2/P1-5/P2-2）：聚合阈值隔离、1v1 无双重舍入、双最小射程盲区同源与先手一击终局', async () => {
    const { side } = await loadHelper();

    // P1-1：1v1 与小规模群战均不触发大规模聚合文案
    const jp = side('560.Japanese.4.f.');
    const es = side('569.Spanish.4.f.');
    const rOne = oneVOneFight(jp.F, es.F);
    expect(rOne.mode).toBe('contact');
    if (rOne.mode === 'contact') {
      const mOne = buildOneVOneReplay(rOne, { uid: jp.u.id, fighter: jp.F, civZh: '日本' }, { uid: es.u.id, fighter: es.F, civZh: '西班牙' });
      expect(isLargeAggregate(mOne)).toBe(false);
      const meleeMid = replayAt(mOne, (rOne.contact.meleeAt ?? 0) + 1);
      expect(meleeMid.phase).toBe('melee');
      expect(meleeMid.phaseLabel).toBe('近战接敌 · 换血中');
      expect(meleeMid.phaseLabel).not.toContain('规模聚合');
    }

    // P1-2：24 不列颠弩手 vs 492 不列颠劲弩 1v1 剩余生命与回放末帧严格同源（32.35 / 40，无双重舍入）
    const xbow = side('24.Britons.3.f.');
    const arb = side('492.Britons.4.f.');
    const rXbow = oneVOneFight(xbow.F, arb.F);
    expect(rXbow.mode).toBe('contact');
    if (rXbow.mode === 'contact') {
      const mXbow = buildOneVOneReplay(rXbow, { uid: xbow.u.id, fighter: xbow.F, civZh: '不列颠' }, { uid: arb.u.id, fighter: arb.F, civZh: '不列颠' });
      const endSnap = replayAt(mXbow, rXbow.duration);
      expect(rXbow.winner).toBe('b');
      expect(rXbow.remaining).toBeCloseTo(endSnap.bHp, 9);
      expect(formatHp(rXbow.remaining)).toBe('32.35');
      expect(formatHp(endSnap.bHp)).toBe('32.35');
    }

    // P1-5：1 条顿手推炮（minRange=5）vs 20 越南掷矛手（minRange=1），突入盲区时顶栏与盲区目标同源指向 A 方 5 格
    const bbc = side('36.Teutons.4.f.');
    const skirm = side('7.Vietnamese.3..');
    const gDualMin = groupFight(bbc.F, 1, skirm.F, 20, { recordReplay: true });
    expect(gDualMin.status).not.toBe('error');
    if (gDualMin.status !== 'error') {
      const mDualMin = buildGroupReplay(
        gDualMin,
        { uid: bbc.u.id, fighter: bbc.F, count: 1, civZh: '条顿' },
        { uid: skirm.u.id, fighter: skirm.F, count: 20, civZh: '越南' },
      );
      const blindMarker = mDualMin.markers.find((m) => m.kind === 'min-range-enter' && m.side === 'a');
      expect(blindMarker).toBeDefined();
      const snapBlind = replayAt(mDualMin, blindMarker!.t);
      expect(snapBlind.silencedMinRange).toBe(5);
      expect(snapBlind.blindZone).toEqual({ side: 'a', rowIndex: 0, minRange: 5, silenced: true });
    }

    // P2-2：手推炮 36 首轮先手一击击杀封建不列颠步弓手 4（t ≈ 0.81s），终局标记合并保留为「先手终局」
    const feudalArcher = side('4.Britons.2..');
    const rOneShot = oneVOneFight(bbc.F, feudalArcher.F);
    expect(rOneShot.mode).toBe('contact');
    if (rOneShot.mode === 'contact') {
      const mOneShot = buildOneVOneReplay(
        rOneShot,
        { uid: bbc.u.id, fighter: bbc.F, civZh: '条顿' },
        { uid: feudalArcher.u.id, fighter: feudalArcher.F, civZh: '不列颠' },
      );
      const endMarker = mOneShot.markers.find((m) => m.kind === 'end');
      expect(endMarker).toBeDefined();
      expect(endMarker!.shortLabel).toBe('先手终局');
      expect(endMarker!.label).toContain('先手终局');
      expect(endMarker!.side).toBe('a');
    }

    // Round 2/3 P1：全战帧恒定峰值 aPeakActive/bPeakActive，跨时刻恒定且绝不把互斥行相加
    const checkFixedPeak = (m: ReturnType<typeof buildMixedReplay>, prefix: '活跃输出' | '前排限宽', times?: number[]) => {
      const meleeTimes = times ?? m.trace.frames.filter((f) => deriveReplayPhase(m, replayAt(m, f.t)).phase === 'melee').map((f) => f.t);
      expect(meleeTimes.length).toBeGreaterThan(0);
      const peaks = new Set<string>();
      for (const t of meleeTimes) {
        const snap = replayAt(m, t);
        const cap = formatMeleeCaption(m, snap);
        const match = new RegExp(`^${prefix} (\\d+) vs (\\d+) · 峰值 (\\d+) vs (\\d+)$`).exec(cap);
        expect(match, `${cap} @t=${t}`).not.toBeNull();
        expect(Number(match![1])).toBeLessThanOrEqual(m.aPeakActive);
        expect(Number(match![2])).toBeLessThanOrEqual(m.bPeakActive);
        peaks.add(`${match![3]} vs ${match![4]}`);
      }
      expect([...peaks]).toEqual([`${m.aPeakActive} vs ${m.bPeakActive}`]);
    };

    // 图 3 混编：6 骠骑 + 15 重装骑射 vs 65 法兰克长戟，全近战帧恒为 峰值 20 vs 2
    const mixA: ArmyRow[] = [
      { uid: 871, count: 6, fighter: side('871.Magyars.4.f.').F },
      { uid: 474, count: 15, fighter: side('474.Magyars.4.f.').F },
    ];
    const mixB: ArmyRow[] = [{ uid: 359, count: 65, fighter: side('359.Franks.4.f.').F }];
    const mixRes = contactFight(mixA, mixB, { recordReplay: true });
    expect(mixRes.status).not.toBe('error');
    if (mixRes.status !== 'error') {
      const mMix = buildMixedReplay(mixRes, { civZh: '马扎尔', rows: mixA }, { civZh: '法兰克', rows: mixB });
      expect([mMix.aPeakActive, mMix.bPeakActive]).toEqual([20, 2]);
      checkFixedPeak(mMix, '活跃输出');
    }

    // 65 不列颠劲弩 vs 65 精锐印加枪兵长：多时刻（含 9.58s / 10.30s / 56.83s）均恒为 峰值 65 vs 24
    const kam = side('881.Incas.4.f.');
    const gArbKam = groupFight(arb.F, 65, kam.F, 65, { recordReplay: true });
    expect(gArbKam.status).not.toBe('error');
    if (gArbKam.status !== 'error') {
      const mArbKam = buildGroupReplay(
        gArbKam,
        { uid: arb.u.id, fighter: arb.F, count: 65, civZh: '不列颠' },
        { uid: kam.u.id, fighter: kam.F, count: 65, civZh: '印加' },
      );
      expect([mArbKam.aPeakActive, mArbKam.bPeakActive]).toEqual([65, 24]);
      checkFixedPeak(mArbKam, '活跃输出', [9.58, 10.3, 56.83]);
      checkFixedPeak(mArbKam, '活跃输出');
    }

    // 65 精锐印加枪兵长 vs 65 日本冠军（纯近战）与 30 西班牙游侠 + 40 日本冠军 vs 70 法兰克长戟（双近战混编，绝不把互斥行相加）
    const jpChamp = side('567.Japanese.4.f.');
    const gPureMelee = groupFight(kam.F, 65, jpChamp.F, 65, { recordReplay: true });
    expect(gPureMelee.status).not.toBe('error');
    if (gPureMelee.status !== 'error') {
      const mPure = buildGroupReplay(
        gPureMelee,
        { uid: kam.u.id, fighter: kam.F, count: 65, civZh: '印加' },
        { uid: jpChamp.u.id, fighter: jpChamp.F, count: 65, civZh: '日本' },
      );
      checkFixedPeak(mPure, '前排限宽');
    }
    const dualA: ArmyRow[] = [
      { uid: 569, count: 30, fighter: es.F },
      { uid: 567, count: 40, fighter: jpChamp.F },
    ];
    const dualB: ArmyRow[] = [{ uid: 359, count: 70, fighter: mixB[0]!.fighter }];
    const dualRes = contactFight(dualA, dualB, { recordReplay: true });
    expect(dualRes.status).not.toBe('error');
    if (dualRes.status !== 'error') {
      const mDual = buildMixedReplay(dualRes, { civZh: '混编A', rows: dualA }, { civZh: '法兰克', rows: dualB });
      expect(mDual.aPeakActive).toBeLessThan(mDual.a.rows[0]!.maxMelee + mDual.a.rows[1]!.maxMelee);
      checkFixedPeak(mDual, '前排限宽');
    }

    // Round 2 P2-1：最小射程单位在 < minRange 终局获胜时，finalize() 帧不误标 silencedByMinRange / partialMinRangeSilence
    const closeWinBbc = makeFighter({
      name: '高血盲区炮',
      hp: 500,
      attack: { 穿刺: 40 },
      ranged: true,
      rng: 10,
      contact: { radiusX: 0.5, radiusY: 0.5, speed: 0.7, minRange: 5, firstHitDelay: 3.6, repeatableAttack: true },
    });
    const fastGlass = makeFighter({
      name: '高速脆皮',
      hp: 40,
      attack: { 近战: 5 },
      rof: 1,
      contact: { radiusX: 0.3, radiusY: 0.3, speed: 1.5, minRange: 0, firstHitDelay: 0, repeatableAttack: true },
    });
    const rFinalSilence = groupFight(closeWinBbc, 25, fastGlass, 1, { recordReplay: true });
    expect(rFinalSilence.status).toBe('win');
    if (rFinalSilence.status === 'win') {
      const last = rFinalSilence.replay!.frames.at(-1)!;
      expect(last.gap).toBeLessThan(5);
      expect(last.aRows[0]!.silencedByMinRange).toBe(false);
      expect(last.aRows[0]!.partialMinRangeSilence).toBe(false);
      const mFinal = buildGroupReplay(
        rFinalSilence,
        { uid: 1, fighter: closeWinBbc, count: 25, civZh: '条顿' },
        { uid: 2, fighter: fastGlass, count: 1, civZh: '中国' },
      );
      const endSnap = replayAt(mFinal, mFinal.duration);
      expect(endSnap.aRows[0]!.silencedByMinRange).toBe(false);
      expect(endSnap.aRows[0]!.partialMinRangeSilence).toBe(false);
      expect(endSnap.silencedMinRange).toBeNull();
    }
  });
});
