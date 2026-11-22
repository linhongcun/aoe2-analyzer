import { expectedHit, type Fighter } from './duelFighter';
import { createTraceRecorder, type ContactReplayTrace } from './contactReplayTrace';

export const FIGHT_CAP = 200;
export const FIGHT_TIME = 600;
const EVENT_CAP = 20_000;
const ATTACK_CAP = 1_000_000;
const EPS = 1e-9;

type Side = 'a' | 'b';
export type Timeline = [number, number, number][];
export type FightEnd = 'win' | 'draw' | 'timeout' | 'limit';
export interface ArmyRow {
  uid: number;
  count: number;
  fighter: Fighter;
}
export interface ArmyLoss {
  uid: number;
  initial: number;
  lost: number;
  alive: number;
  hp: number;
}
export interface ArmyResult {
  rows: ArmyLoss[];
  total: Omit<ArmyLoss, 'uid'>;
}
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
  (ResolvedFight & ({ status: 'win'; winner: Side } | { status: 'draw' | 'timeout' | 'limit' })) | { status: 'error'; reason: string };

export function contactFighterError(f: Fighter): string | null {
  if (f.canAttack === false || f.contact?.repeatableAttack === false || f.rof <= 0 || !Object.values(f.attack).some((n) => n > 0))
    return '没有可重复的普通攻击。请更换该单位后重算。';
  if (!f.contact) return '缺少有效碰撞数据';
  const { radiusX, radiusY, speed, minRange, firstHitDelay } = f.contact;
  if (radiusX === undefined || radiusY === undefined || !(radiusX > 0 && radiusY > 0) || !Number.isFinite(8 * radiusX) || !Number.isFinite(30 * radiusY))
    return '缺少有效碰撞数据';
  if (
    ![f.hp, f.rof, f.acc, f.rng, speed, minRange, firstHitDelay, ...Object.values(f.attack), ...Object.values(f.armor)].every(Number.isFinite) ||
    f.hp <= EPS ||
    f.acc < 0 ||
    f.acc > 1 ||
    f.rng < 0 ||
    minRange < 0 ||
    minRange > f.rng ||
    firstHitDelay < 0
  )
    return '战斗属性无效';
  return null;
}

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

function meleeAcross(row: RowState, target: RowState): number {
  return Math.max(1, Math.floor((Math.sqrt(target.alive) * target.radiusY) / row.radiusY + EPS));
}

function summarize(rows: RowState[]): ArmyResult {
  const values = rows.map((r) => ({
    uid: r.uid,
    initial: r.count,
    lost: r.count - r.alive,
    alive: r.alive,
    hp: r.alive ? r.headHp + (r.alive - 1) * r.fighter.hp : 0,
  }));
  return {
    rows: values,
    total: values.reduce(
      (s, r) => ({
        initial: s.initial + r.initial,
        lost: s.lost + r.lost,
        alive: s.alive + r.alive,
        hp: s.hp + r.hp,
      }),
      { initial: 0, lost: 0, alive: 0, hp: 0 },
    ),
  };
}
const survivors = (rows: RowState[]) => rows.reduce((count, row) => count + row.alive, 0);

function applyAttacks(shots: RankShots[][], source: Formation, target: Formation, damage: number[][]) {
  let to = 0;
  attackRows: for (const [from, ranks] of shots.entries()) {
    const attacker = source.rows[from]!;
    for (const { count, distance, minDist } of ranks) {
      for (let n = 0; n < count; n++) {
        while (target.rows[to] && !target.rows[to]!.alive) to++;
        const row = target.rows[to];
        if (!row) return;
        const targetDistance = distance + target.setback[to]!;
        const targetMinDistance = minDist + target.setback[to]!;
        if (targetDistance - attacker.fighter.rng > EPS || targetMinDistance + EPS < attacker.minRange) continue attackRows;
        const hit = damage[from]![to]!;
        if (!hit) continue attackRows;
        row.headHp -= hit;
        if (row.headHp <= EPS) {
          row.alive--;
          row.headHp = row.fighter.hp;
        }
      }
    }
  }
}

export function contactFight(
  a: readonly ArmyRow[],
  b: readonly ArmyRow[],
  options: { maxTime?: number; maxEvents?: number; maxAttacks?: number; recordReplay?: boolean } = {},
): ContactResult {
  const { maxTime = FIGHT_TIME, maxEvents = EVENT_CAP, maxAttacks = ATTACK_CAP, recordReplay = false } = options;
  const error = (reason: string): ContactResult => ({ status: 'error', reason });
  if (!Number.isFinite(maxTime) || maxTime < 0 || maxTime > FIGHT_TIME) return error('模拟时限无效');
  if (
    !Number.isSafeInteger(maxEvents) ||
    maxEvents < 1 ||
    maxEvents > EVENT_CAP ||
    !Number.isSafeInteger(maxAttacks) ||
    maxAttacks < 1 ||
    maxAttacks > ATTACK_CAP
  )
    return error('运算资源上限无效');
  for (const [side, army] of [
    ['A', a],
    ['B', b],
  ] as const) {
    if (!army.length || army.length > 3) return error(`${side} 方须有 1–3 行`);
    if (new Set(army.map((r) => r.uid)).size !== army.length) return error(`${side} 方有重复单位`);
    if (army.some((r) => !Number.isSafeInteger(r.uid) || r.uid <= 0 || !Number.isSafeInteger(r.count) || r.count < 1)) return error(`${side} 方单位或数量无效`);
    if (army.reduce((s, r) => s + r.count, 0) > FIGHT_CAP) return error(`${side} 方超过每方 ${FIGHT_CAP} 个单位的模拟上限。请调低数量、预算或采集时间后重算。`);
    for (const row of army) {
      const reason = contactFighterError(row.fighter);
      if (reason) return error(`${side} 方的${row.fighter.name}${reason}`);
    }
    if (!Number.isFinite(army.reduce((sum, row) => sum + row.count * row.fighter.hp, 0))) return error(`${side} 方总生命超出数值范围`);
  }
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
  const A = make(a);
  const B = make(b);
  const damage = (from: readonly ArmyRow[], to: readonly ArmyRow[]) => from.map((r) => to.map((t) => expectedHit(r.fighter, t.fighter)));
  const ab = damage(a, b),
    ba = damage(b, a);
  if ([...ab.flat(), ...ba.flat()].some((d) => !Number.isFinite(d) || d < 0)) return error('每击期望伤害无法解析');

  let gap = 1 + Math.max(...[...A, ...B].map((row) => row.fighter.rng));
  if (!Number.isFinite(gap + A.reduce((s, r) => s + 2 * r.radiusX, 0) + B.reduce((s, r) => s + 2 * r.radiusX, 0))) return error('接敌距离无法解析');
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
  const finish = (status: 'draw' | 'timeout' | 'limit' | 'win'): ContactResult => {
    closeOpening();
    if (timeline.at(-1)![0] !== time) timeline.push([time, survivors(A), survivors(B)]);
    const replay = recorder ? recorder.finalize(time, gap, A, B) : undefined;
    const result: ResolvedFight = { duration: time, a: summarize(A), b: summarize(B), timeline, contact, ...(replay ? { replay } : {}) };
    return status === 'win' ? { ...result, status, winner: survivors(A) ? 'a' : 'b' } : { ...result, status };
  };
  const withinHorizon = (t: number) => t <= maxTime + Number.EPSILON * Math.max(1, maxTime) * 4;

  while (survivors(A) && survivors(B)) {
    const left = formation(A),
      right = formation(B);
    const va = advance(left.front, gap),
      vb = advance(right.front, gap);
    const speed = va + vb;
    if (!Number.isFinite(speed)) return error('接敌速度无法解析');
    let nextTime = Infinity;
    const schedule = (delay: number) => {
      nextTime = Math.min(nextTime, time + delay);
    };
    if (speed) {
      if (va) schedule((gap - (left.front.fighter.ranged ? left.front.fighter.rng : 0)) / speed);
      if (vb) schedule((gap - (right.front.fighter.ranged ? right.front.fighter.rng : 0)) / speed);
    }
    const eligibility = (side: Formation, target: Formation) =>
      side.rows.map((row) => {
        const eligible: RankInRange[] = [];
        const { ranged, rng } = row.fighter;
        const diameter = 2 * row.radiusX;
        const setback = side.setback[row.index]!;
        // 同一阵容行按顺序损失单位，幸存单位的时钟不随敌方接触面变窄而换位。
        const firstSurvivor = row.canFightAtMultipleDepths ? row.count - row.alive : 0;
        if (row.alive && ranged && row.minRange > 0) {
          // issue 1296：多人数最小射程远程行按固定递增排容 2r+1 展开纵深，避免整排压在 0 格停火及减员回弹。
          const engaged = gap + setback - rng <= EPS;
          for (let rank = 0, placed = 0; placed < row.alive; rank++) {
            const count = Math.min(2 * rank + 1, row.alive - placed);
            const offset = setback + rank * diameter;
            const minDist = gap + offset;
            const distance = engaged ? Math.min(minDist, rng) : minDist;
            if (distance - rng > EPS) {
              if (speed && rng + EPS >= offset) schedule((minDist - rng) / speed);
              break;
            }
            const remaining = minDist - row.minRange;
            if (remaining >= -EPS) {
              const canCrossMin = speed > 0 && row.minRange - offset > EPS;
              if (canCrossMin && remaining > EPS) schedule(remaining / speed);
              eligible.push({ first: firstSurvivor + placed, count, distance, minDist, leaving: canCrossMin && Math.abs(remaining) <= EPS });
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
            const depth = rank * diameter;
            const offset = setback + depth;
            const distance = gap + offset;
            if (distance - rng > EPS) {
              // 纵深按距离递增，只需排期下一层的入射程事件。
              if (speed && rng + EPS >= offset) schedule((distance - rng) / speed);
              break;
            }
            const remaining = distance - row.minRange;
            if (remaining < -EPS) continue;
            const canCrossMin = speed > 0 && row.minRange - offset > EPS;
            if (canCrossMin && remaining > EPS) schedule(remaining / speed);
            const first = firstSurvivor + rank * width;
            eligible.push({
              first,
              count: Math.min(width, row.alive - rank * width),
              distance,
              minDist: distance,
              leaving: canCrossMin && Math.abs(remaining) <= EPS,
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
    const inA = eligibility(left, right),
      inB = eligibility(right, left);
    if (
      contact.meleeAt === null &&
      ((!left.front.fighter.ranged && inA[left.front.index]!.length) || (!right.front.fighter.ranged && inB[right.front.index]!.length))
    ) {
      contact.meleeAt = time;
      recorder?.noteTouch(gap);
      recorder?.noteMeleeContact(time);
    }
    const aReady = inA.some((ranks) => ranks.length),
      bReady = inB.some((ranks) => ranks.length);
    const rangedReady = (rows: RowState[], amounts: typeof inA, includeBoundary: boolean) =>
      rows.some((row, i) => row.fighter.ranged && amounts[i]!.some((rank) => includeBoundary || !rank.leaving));
    if (!openingClosed) {
      if (opening) {
        const aLeads = opening.side === 'a';
        if ((aLeads ? bReady : aReady) || !rangedReady(aLeads ? A : B, aLeads ? inA : inB, true)) closeOpening();
      } else if (aReady || bReady) {
        if (aReady && !bReady && rangedReady(A, inA, true)) opening = { side: 'a', time, volleys: 0 };
        else if (bReady && !aReady && rangedReady(B, inB, true)) opening = { side: 'b', time, volleys: 0 };
        else closeOpening();
      }
    }
    const leavingOpening = opening && !(opening.side === 'a' ? rangedReady(A, inA, false) : rangedReady(B, inB, false));
    const shots = (from: Formation, canAttack: typeof inA) =>
      from.rows.map((row) => {
        const ready: RankShots[] = [];
        for (const { first, count, distance, minDist, leaving } of canAttack[row.index]!) {
          const clocks: AttackClock[] = [];
          // 只有能分多层出手的近战或最小射程远程行需要独立时钟。单层单位仍按同一出手批次计算。
          const length = row.canFightAtMultipleDepths ? count : 1;
          for (let i = first; i < first + length; i++) {
            const clock = (row.clocks[i] ??= { aimAt: null, cycleStart: 0, cycles: 0 });
            // 进入射程时开始前摇。换位或重新瞄准仍受该单位原有的冷却限制。
            clock.aimAt ??= time === lastAttack ? time + Math.max(row.delay, 2 * EPS) : time + row.delay;
            const due = Math.max(clock.aimAt, clock.cycleStart + clock.cycles * row.fighter.rof);
            if (withinHorizon(due) && due - time <= EPS) clocks.push(clock);
            // 即将穿过最小射程时，等待更近的移动或换行事件。
            else if (!leaving && (!speed || minDist - speed * (due - time) + EPS >= row.minRange)) nextTime = Math.min(nextTime, due);
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
      const aFired = aFiredCount > 0,
        bFired = bFiredCount > 0;
      contact.firstFire ??= aFired && bFired ? 'both' : aFired ? 'a' : 'b';
      if (opening && (opening.side === 'a' ? aShots : bShots).some((ranks, i) => ranks.length && (opening!.side === 'a' ? A : B)[i]!.fighter.ranged)) {
        opening.volleys++;
        if (opening.volleys === 1) recorder?.noteOpeningStart(time, opening.side);
      }
      if (leavingOpening) closeOpening();
      lastAttack = time;
      for (const [army, volley, rows] of [
        [A, aShots, contact.a],
        [B, bShots, contact.b],
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
        });
      }
      const prevAPos = recorder?.getAPos() ?? 0;
      const prevBPos = recorder?.getBPos() ?? 0;
      const prevAliveA = recorder ? A.map((r) => r.alive) : null;
      const prevAliveB = recorder ? B.map((r) => r.alive) : null;
      recorder?.addFired(aFiredCount, bFiredCount);
      // 冻结两边出手人数后再逐击结算。同一时刻阵亡仍保留这次出手。
      applyAttacks(aShots, left, right, ab);
      applyAttacks(bShots, right, left, ba);
      // 退到下一行后，前排之间的距离按阵线实际推进重新计算。
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
      // 换前排可能改变射程、位移及接敌容量，下一轮用新行重新排期。
      continue;
    }
    if (leavingOpening) closeOpening();
    // 静止前排也能受击；只在双方既不能继续接近、也没有已安排的攻击时判定无法接敌。
    if (!speed && !Number.isFinite(nextTime)) {
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
    recorder?.recordSettled(time, gap, va, vb, A, left.setback, inA, B, right.setback, inB, opening);
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
    gap = Math.max(0, gap - speed * elapsed);
    recorder?.onAdvance(va, vb, speed, prevGap, elapsed, gap);
    time = nextTime;
    if (timeout) return finish('timeout');
    events++;
  }
  return finish(survivors(A) || survivors(B) ? 'win' : 'draw');
}
