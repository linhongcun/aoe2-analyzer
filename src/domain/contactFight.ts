import { expectedHit } from './duelFighter';
import { createTraceRecorder, type ContactReplayTrace } from './contactReplayTrace';
import {
  advanceKiteRetreat,
  buildSideKiteSummary,
  computeKiteStep,
  createKiteRuntime,
  recordKiteVolley,
  RETREAT_CAP,
  scheduleKiteEvents,
  syncKiteFront,
  type KiteOptions,
  type KiteSummary,
} from './contactKite';
import {
  applyVolleyAttacks,
  ATTACK_CAP,
  contactFighterError,
  EVENT_CAP,
  FIGHT_CAP,
  FIGHT_TIME,
  meleeAcross,
  summarizeArmy,
  validateContactInputs,
  type ArmyLoss,
  type ArmyResult,
  type ArmyRow,
} from './contactValidate';

export { contactFighterError, FIGHT_CAP, FIGHT_TIME, type ArmyLoss, type ArmyResult, type ArmyRow };

const EPS = 1e-9;

type Side = 'a' | 'b';
export type Timeline = [number, number, number][];
export type FightEnd = 'win' | 'draw' | 'timeout' | 'limit' | 'disengaged';
interface RowContact {
  maxMelee: number;
  maxRanged: number;
  meleeUnitSeconds: number;
}
export interface ContactSummary {
  /** 第一次有近战够到对方前排的时间。 */
  meleeAt: number | null;
  firstStrike: { side: Side; duration: number; volleys: number } | null;
  firstFire: Side | 'both' | null;
  a: RowContact[];
  b: RowContact[];
  kite?: KiteSummary;
}
interface ResolvedFight {
  duration: number;
  a: ArmyResult;
  b: ArmyResult;
  timeline: Timeline;
  contact: ContactSummary;
  replay?: ContactReplayTrace;
}
export type ContactResult =
  (ResolvedFight & ({ status: 'win'; winner: Side } | { status: 'draw' | 'timeout' | 'limit' | 'disengaged' })) | { status: 'error'; reason: string };

interface AttackClock {
  aimAt: number | null;
  cycleStart: number;
  cycles: number;
}
interface RowState extends ArmyRow {
  index: number;
  radiusX: number;
  radiusY: number;
  speed: number;
  minRange: number;
  delay: number;
  alive: number;
  headHp: number;
  canFightAtMultipleDepths: boolean;
  clocks: AttackClock[];
}
interface RankInRange {
  first: number;
  count: number;
  distance: number;
  minDist: number;
  leaving: boolean;
  leavingMin: boolean;
}
interface RankShots {
  count: number;
  distance: number;
  minDist: number;
  clocks: AttackClock[];
}
interface Formation {
  rows: RowState[];
  front: RowState;
  setback: number[];
}

function formation(rows: RowState[]): Formation {
  let depth = 0;
  const setback = rows.map((row) => {
    const offset = depth;
    if (row.alive) depth += 2 * row.radiusX;
    return offset;
  });
  return { rows, front: rows.find((row) => row.alive)!, setback };
}

function advance(front: RowState, gap: number): number {
  const stopAt = front.fighter.ranged ? front.fighter.rng : 0;
  return gap - stopAt > EPS ? Math.max(0, front.speed) : 0;
}

const survivors = (rows: RowState[]) => rows.reduce((count, row) => count + row.alive, 0);

export function contactFight(
  a: readonly ArmyRow[],
  b: readonly ArmyRow[],
  options: { maxTime?: number; maxEvents?: number; maxAttacks?: number; recordReplay?: boolean; kite?: KiteOptions } = {},
): ContactResult {
  const { maxTime = FIGHT_TIME, maxEvents = EVENT_CAP, maxAttacks = ATTACK_CAP, recordReplay = false, kite } = options;
  const error = (reason: string): ContactResult => ({ status: 'error', reason });
  const inputError = validateContactInputs(a, b, maxTime, maxEvents, maxAttacks);
  if (inputError) return error(inputError);

  const make = (army: readonly ArmyRow[]): RowState[] =>
    army.map((row, index) => {
      const f = row.fighter.contact!;
      return {
        ...row,
        index,
        radiusX: f.radiusX!,
        radiusY: f.radiusY!,
        speed: f.speed,
        minRange: f.minRange,
        delay: f.firstHitDelay,
        alive: row.count,
        headHp: row.fighter.hp,
        canFightAtMultipleDepths: (!row.fighter.ranged && row.fighter.rng + EPS >= 2 * f.radiusX!) || (row.fighter.ranged && f.minRange > 0),
        clocks: [],
      };
    });
  const A = make(a),
    B = make(b);
  const ab = a.map((r) => b.map((t) => expectedHit(r.fighter, t.fighter)));
  const ba = b.map((r) => a.map((t) => expectedHit(r.fighter, t.fighter)));
  if ([...ab.flat(), ...ba.flat()].some((d) => !Number.isFinite(d) || d < 0)) return error('每击期望伤害无法解析');

  let gap = 1 + Math.max(...[...A, ...B].map((row) => row.fighter.rng));
  if (!Number.isFinite(gap + A.reduce((s, r) => s + 2 * r.radiusX, 0) + B.reduce((s, r) => s + 2 * r.radiusX, 0))) return error('接敌距离无法解析');
  const kiteMode = Boolean(kite?.a || kite?.b);
  const kA = createKiteRuntime(Boolean(kite?.a), A);
  const kB = createKiteRuntime(Boolean(kite?.b), B);
  const recorder = recordReplay ? createTraceRecorder(gap) : null;
  let time = 0,
    events = 0,
    attacks = 0;
  const timeline: Timeline = [[0, survivors(A), survivors(B)]];
  const blank = (rows: RowState[]) => rows.map(() => ({ maxMelee: 0, maxRanged: 0, meleeUnitSeconds: 0 }));
  const contact: ContactSummary = { meleeAt: null, firstStrike: null, firstFire: null, a: blank(A), b: blank(B) };
  let opening: { side: Side; time: number; volleys: number } | null = null;
  let openingClosed = false;
  let lastAttack = -1;
  const closeOpening = () => {
    openingClosed = true;
    if (opening && (time > opening.time || opening.volleys > 0))
      contact.firstStrike = { side: opening.side, duration: time - opening.time, volleys: opening.volleys };
    opening = null;
  };
  const finish = (status: FightEnd): ContactResult => {
    closeOpening();
    if (timeline.at(-1)![0] !== time) timeline.push([time, survivors(A), survivors(B)]);
    const disengagedAt = status === 'disengaged' ? time : null;
    if (kiteMode) {
      if (status === 'disengaged') recorder?.noteDisengaged(time);
      contact.kite = { a: buildSideKiteSummary(kA, A), b: buildSideKiteSummary(kB, B), disengagedAt };
    }
    const kiteFinal = kiteMode
      ? { retreatCap: RETREAT_CAP, disengagedAt, aRetreated: kA.retreated, bRetreated: kB.retreated, aRetreatCapHit: kA.capHit, bRetreatCapHit: kB.capHit }
      : undefined;
    const replay = recorder ? recorder.finalize(time, gap, A, B, kiteFinal) : undefined;
    const result: ResolvedFight = { duration: time, a: summarizeArmy(A), b: summarizeArmy(B), timeline, contact, ...(replay ? { replay } : {}) };
    return status === 'win' ? { ...result, status, winner: survivors(A) ? 'a' : 'b' } : { ...result, status };
  };
  const withinHorizon = (t: number) => t <= maxTime + Number.EPSILON * Math.max(1, maxTime) * 4;

  while (survivors(A) && survivors(B)) {
    const left = formation(A),
      right = formation(B);
    let vxA: number,
      vxB: number,
      gapRate: number,
      closingSpeed = 0,
      openingSpeed = 0;
    let retA = false,
      retB = false,
      bothEngaged = false,
      aFrontMoving = false,
      bFrontMoving = false;
    let nextTime = Infinity;
    const schedule = (delay: number) => {
      if (delay > EPS) nextTime = Math.min(nextTime, time + delay);
    };

    if (kiteMode) {
      if (syncKiteFront(left, kA, time) && kA.hadMeleeFront) recorder?.noteKiteStart(time, 'a');
      if (syncKiteFront(right, kB, time) && kB.hadMeleeFront) recorder?.noteKiteStart(time, 'b');
      const step = computeKiteStep(left, right, kA, kB, gap, time);
      ({ vxA, vxB, gapRate, closingSpeed, openingSpeed, retA, retB, bothEngaged, aFrontMoving, bFrontMoving } = step);
      if (!Number.isFinite(gapRate)) return error('接敌速度无法解析');
      scheduleKiteEvents(step, left, right, kA, kB, gap, time, schedule);
    } else {
      const va = advance(left.front, gap),
        vb = advance(right.front, gap);
      closingSpeed = va + vb;
      vxA = va;
      vxB = -vb;
      gapRate = -closingSpeed;
      if (!Number.isFinite(closingSpeed)) return error('接敌速度无法解析');
      if (closingSpeed) {
        if (va) schedule((gap - (left.front.fighter.ranged ? left.front.fighter.rng : 0)) / closingSpeed);
        if (vb) schedule((gap - (right.front.fighter.ranged ? right.front.fighter.rng : 0)) / closingSpeed);
      }
    }

    const eligibility = (side: Formation, target: Formation, frontMoving: boolean) =>
      side.rows.map((row) => {
        const eligible: RankInRange[] = [];
        const { ranged, rng } = row.fighter;
        const diameter = 2 * row.radiusX;
        const setback = side.setback[row.index]!;
        const firstSurvivor = row.canFightAtMultipleDepths ? row.count - row.alive : 0;
        if (frontMoving && row === side.front) {
          for (let i = firstSurvivor; i < row.clocks.length; i++) {
            const clock = row.clocks[i];
            if (clock) clock.aimAt = null;
          }
          return eligible;
        }
        if (row.alive && ranged && row.minRange > 0) {
          const frontRemMax = rng - (gap + setback);
          const engaged = frontRemMax >= -EPS;
          for (let rank = 0, placed = 0; placed < row.alive; rank++) {
            const count = Math.min(2 * rank + 1, row.alive - placed);
            const offset = setback + rank * diameter;
            const minDist = gap + offset;
            const distance = engaged ? Math.min(minDist, rng) : minDist;
            if (distance - rng > EPS) {
              if (closingSpeed > EPS && rng + EPS >= offset) schedule((minDist - rng) / closingSpeed);
              break;
            }
            const remaining = minDist - row.minRange;
            if (remaining >= -EPS) {
              const canCrossMin = closingSpeed > EPS && row.minRange - offset > EPS;
              if (canCrossMin && remaining > EPS) schedule(remaining / closingSpeed);
              if (openingSpeed > EPS && frontRemMax > EPS) schedule(frontRemMax / openingSpeed);
              const leavingMin = canCrossMin && Math.abs(remaining) <= EPS;
              const leavingMax = openingSpeed > EPS && frontRemMax <= EPS;
              eligible.push({ first: firstSurvivor + placed, count, distance, minDist, leaving: leavingMin || leavingMax, leavingMin });
            } else if (openingSpeed > EPS) {
              schedule((row.minRange - minDist) / openingSpeed);
            }
            placed += count;
          }
        } else {
          const width = ranged ? row.alive : Math.min(row.alive, meleeAcross(row, target.front));
          const ranks =
            row.alive && (ranged || row === side.front)
              ? Math.min(Math.ceil(row.alive / width), ranged ? 1 : 1 + Math.floor((Math.max(0, rng - setback) + EPS) / diameter))
              : 0;
          for (let rank = 0; rank < ranks; rank++) {
            const offset = setback + rank * diameter;
            const distance = gap + offset;
            const remMax = rng - distance;
            if (remMax < -EPS) {
              if (closingSpeed > EPS && rng + EPS >= offset) schedule((distance - rng) / closingSpeed);
              break;
            }
            const remaining = distance - row.minRange;
            if (remaining < -EPS) {
              if (openingSpeed > EPS) schedule((row.minRange - distance) / openingSpeed);
              continue;
            }
            const canCrossMin = closingSpeed > EPS && row.minRange - offset > EPS;
            if (canCrossMin && remaining > EPS) schedule(remaining / closingSpeed);
            if (openingSpeed > EPS && remMax > EPS) schedule(remMax / openingSpeed);
            const leavingMin = canCrossMin && Math.abs(remaining) <= EPS;
            const leavingMax = openingSpeed > EPS && remMax <= EPS;
            eligible.push({
              first: firstSurvivor + rank * width,
              count: Math.min(width, row.alive - rank * width),
              distance,
              minDist: distance,
              leaving: leavingMin || leavingMax,
              leavingMin,
            });
          }
        }
        const last = eligible.at(-1);
        const from = eligible[0]?.first ?? row.clocks.length;
        const to = last ? last.first + last.count : row.clocks.length;
        for (let i = firstSurvivor; i < row.clocks.length; i++) {
          if (i >= from && i < to) continue;
          const clock = row.clocks[i];
          if (clock) clock.aimAt = null;
        }
        return eligible;
      });
    const inA = eligibility(left, right, aFrontMoving),
      inB = eligibility(right, left, bFrontMoving);
    const hasMeleeHit = (front: RowState, eligible: RankInRange[][]) => !front.fighter.ranged && eligible[front.index]!.some((r) => !r.leaving);
    if (contact.meleeAt === null && (hasMeleeHit(left.front, inA) || hasMeleeHit(right.front, inB))) {
      contact.meleeAt = time;
      recorder?.noteTouch(gap);
      recorder?.noteMeleeContact(time);
    }
    const aReady = inA.some((ranks) => ranks.length),
      bReady = inB.some((ranks) => ranks.length);
    const rangedReady = (rows: RowState[], amounts: typeof inA, includeBoundary: boolean) =>
      rows.some((row, i) => row.fighter.ranged && amounts[i]!.some((rank) => includeBoundary || !rank.leaving));
    const aKiteHold = kiteMode && retA && gap <= left.front.fighter.rng + EPS;
    const bKiteHold = kiteMode && retB && gap <= right.front.fighter.rng + EPS;
    if (!openingClosed) {
      if (opening) {
        const aLeads = opening.side === 'a';
        const leaderOk = aLeads ? rangedReady(A, inA, true) || aKiteHold : rangedReady(B, inB, true) || bKiteHold;
        if ((aLeads ? bReady : aReady) || !leaderOk) closeOpening();
      } else if (aReady || bReady) {
        if (aReady && !bReady && rangedReady(A, inA, true)) opening = { side: 'a', time, volleys: 0 };
        else if (bReady && !aReady && rangedReady(B, inB, true)) opening = { side: 'b', time, volleys: 0 };
        else closeOpening();
      }
    }
    const leavingOpening = opening && !(opening.side === 'a' ? rangedReady(A, inA, false) || aKiteHold : rangedReady(B, inB, false) || bKiteHold);
    const shots = (from: Formation, canAttack: typeof inA) =>
      from.rows.map((row) => {
        const ready: RankShots[] = [];
        const setback = from.setback[row.index]!;
        for (const { first, count, distance, minDist, leaving } of canAttack[row.index]!) {
          const clocks: AttackClock[] = [];
          const length = row.canFightAtMultipleDepths ? count : 1;
          const maxCheckDist = row.fighter.ranged && row.minRange > 0 ? gap + setback : distance;
          for (let i = first; i < first + length; i++) {
            const clock = (row.clocks[i] ??= { aimAt: null, cycleStart: 0, cycles: 0 });
            clock.aimAt ??= time === lastAttack ? time + Math.max(row.delay, 2 * EPS) : time + row.delay;
            const due = Math.max(clock.aimAt, clock.cycleStart + clock.cycles * row.fighter.rof);
            if (withinHorizon(due) && due - time <= EPS) clocks.push(clock);
            else if (
              !leaving &&
              (!closingSpeed || minDist - closingSpeed * (due - time) + EPS >= row.minRange) &&
              (!openingSpeed || maxCheckDist + openingSpeed * (due - time) - EPS <= row.fighter.rng)
            )
              nextTime = Math.min(nextTime, due);
          }
          if (clocks.length) ready.push({ count: row.canFightAtMultipleDepths ? clocks.length : count, distance, minDist, clocks });
        }
        return ready;
      });
    const aShots = shots(left, inA),
      bShots = shots(right, inB);
    const countShots = (ranks: RankShots[]) => ranks.reduce((total, rank) => total + rank.count, 0);
    const volleySize = [...aShots, ...bShots].reduce((n, ranks) => n + countShots(ranks), 0);
    if (volleySize) {
      if (events >= maxEvents || attacks + volleySize > maxAttacks) return finish('limit');
      events++;
      attacks += volleySize;
      const aFiredCount = aShots.reduce((n, ranks) => n + countShots(ranks), 0);
      const bFiredCount = bShots.reduce((n, ranks) => n + countShots(ranks), 0);
      contact.firstFire ??= aFiredCount > 0 && bFiredCount > 0 ? 'both' : aFiredCount > 0 ? 'a' : 'b';
      if (opening && (opening.side === 'a' ? aShots : bShots).some((ranks, i) => ranks.length && (opening!.side === 'a' ? A : B)[i]!.fighter.ranged)) {
        opening.volleys++;
        if (opening.volleys === 1) recorder?.noteOpeningStart(time, opening.side);
      }
      if (leavingOpening) closeOpening();
      lastAttack = time;
      for (const [army, volley, rows, ks, front] of [
        [A, aShots, contact.a, kA, left.front],
        [B, bShots, contact.b, kB, right.front],
      ] as const) {
        army.forEach((row, i) => {
          const ranks = volley[i]!;
          const fired = countShots(ranks);
          if (!fired) return;
          for (const { clocks } of ranks) {
            for (const clock of clocks) {
              const cooldown = clock.cycleStart + clock.cycles * row.fighter.rof;
              if (clock.aimAt! > cooldown) {
                clock.cycleStart = clock.aimAt!;
                clock.cycles = 0;
              }
              clock.cycles++;
            }
          }
          const key = row.fighter.ranged ? 'maxRanged' : 'maxMelee';
          rows[i]![key] = Math.max(rows[i]![key], fired);
          if (kiteMode) recordKiteVolley(row, front, ks, time);
        });
      }
      const prevAPos = recorder?.getAPos() ?? 0,
        prevBPos = recorder?.getBPos() ?? 0;
      const prevAliveA = recorder ? A.map((r) => r.alive) : null,
        prevAliveB = recorder ? B.map((r) => r.alive) : null;
      recorder?.addFired(aFiredCount, bFiredCount);
      applyVolleyAttacks(aShots, left.rows, right.rows, right.setback, ab);
      applyVolleyAttacks(bShots, right.rows, left.rows, left.setback, ba);
      const previousDepth = (side: Formation) => side.setback[side.rows.findIndex((row) => row.alive)] ?? 0;
      const aStep = previousDepth(left),
        bStep = previousDepth(right);
      gap += aStep + bStep;
      if (recorder && prevAliveA && prevAliveB) {
        for (const [side, rows, prevAlive, form, basePos] of [
          ['a', A, prevAliveA, left, prevAPos],
          ['b', B, prevAliveB, right, prevBPos],
        ] as const) {
          for (const row of rows) {
            if (prevAlive[row.index]! > 0 && row.alive === 0) {
              const nextAlive = rows.find((r) => r.index > row.index && r.alive > 0);
              const stepDist = nextAlive ? form.setback[nextAlive.index]! - form.setback[row.index]! : 2 * row.radiusX;
              const x = side === 'a' ? basePos - form.setback[row.index]! : basePos + form.setback[row.index]!;
              recorder.noteRowCleared({ t: time, side, rowIndex: row.index, uid: row.uid, initial: row.count, stepDist, x });
            }
          }
        }
        recorder.onRowShift(aStep, bStep, gap);
      }
      timeline.push([time, survivors(A), survivors(B)]);
      continue;
    }
    if (leavingOpening) closeOpening();
    if (!Number.isFinite(nextTime) && Math.abs(vxA) <= EPS && Math.abs(vxB) <= EPS) {
      if (kiteMode && bothEngaged && gap > Math.max(left.front.fighter.rng, right.front.fighter.rng) + EPS) return finish('disengaged');
      const unreachable = (
        [
          ['A', left.front],
          ['B', right.front],
        ] as const
      ).find(([, row]) => row.speed <= 0 && gap - row.fighter.rng > EPS);
      if (unreachable) return error(`${unreachable[0]} 方的${unreachable[1].fighter.name}无法移动接敌`);
    }
    const timeout = !withinHorizon(nextTime);
    nextTime = Math.min(nextTime, maxTime);
    if (!timeout && (events >= maxEvents || !(nextTime > time))) return finish('limit');
    const elapsed = nextTime - time;
    if (kiteMode) {
      if (retA && vxA < -EPS) recorder?.noteKiteStart(time, 'a');
      if (retB && vxB > EPS) recorder?.noteKiteStart(time, 'b');
    }
    const kiteFrame = kiteMode ? { aRetreated: kA.retreated, bRetreated: kB.retreated, aRetreatCapHit: kA.capHit, bRetreatCapHit: kB.capHit } : undefined;
    recorder?.recordSettled(time, gap, vxA, vxB, A, left.setback, inA, B, right.setback, inB, opening, kiteFrame);
    for (const [front, eligible, rows] of [
      [left.front, inA, contact.a],
      [right.front, inB, contact.b],
    ] as const) {
      if (front.fighter.ranged) continue;
      for (const { count, leaving } of eligible[front.index]!) {
        if (!leaving) rows[front.index]!.meleeUnitSeconds += count * elapsed;
      }
    }
    const prevGap = gap;
    gap = Math.max(0, gap + gapRate * elapsed);
    recorder?.onAdvance(vxA, vxB, gapRate, prevGap, elapsed, gap);
    if (kiteMode) {
      if (vxA < -EPS && advanceKiteRetreat(kA, -vxA, elapsed, nextTime, recorder ? recorder.getAPos() : null)) {
        recorder?.noteRetreatCap(nextTime, 'a');
      }
      if (vxB > EPS && advanceKiteRetreat(kB, vxB, elapsed, nextTime, recorder ? recorder.getBPos() : null)) {
        recorder?.noteRetreatCap(nextTime, 'b');
      }
    }
    time = nextTime;
    if (timeout) return finish('timeout');
    events++;
  }
  return finish(survivors(A) || survivors(B) ? 'win' : 'draw');
}
