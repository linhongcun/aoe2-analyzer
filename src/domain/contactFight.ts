import { expectedHit, type Fighter } from './duelFighter';

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
}
export type ContactResult =
  (ResolvedFight & ({ status: 'win'; winner: Side } | { status: 'draw' | 'timeout' | 'limit' })) | { status: 'error'; reason: string };

export function contactFighterError(f: Fighter): string | null {
  if (f.contact?.repeatableAttack === false || f.rof <= 0 || !Object.values(f.attack).some((n) => n > 0)) return '没有可重复的普通攻击。请更换该单位后重算。';
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
  clocks: AttackClock[];
}
interface RankInRange {
  depth: number;
  count: number;
  distance: number;
  leaving: boolean;
  clock: AttackClock;
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

function applyAttacks(shots: RankInRange[][], source: Formation, target: Formation, gap: number, damage: number[][]) {
  let to = 0;
  attackRows: for (const [from, ranks] of shots.entries()) {
    const attacker = source.rows[from]!;
    for (const { count, depth } of ranks) {
      for (let n = 0; n < count; n++) {
        while (target.rows[to] && !target.rows[to]!.alive) to++;
        const row = target.rows[to];
        if (!row) return;
        const distance = gap + source.setback[from]! + depth + target.setback[to]!;
        if (distance - attacker.fighter.rng > EPS || distance + EPS < attacker.minRange) continue attackRows;
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
  options: { maxTime?: number; maxEvents?: number; maxAttacks?: number } = {},
): ContactResult {
  const { maxTime = FIGHT_TIME, maxEvents = EVENT_CAP, maxAttacks = ATTACK_CAP } = options;
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
    const result = { duration: time, a: summarize(A), b: summarize(B), timeline, contact };
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
        const width = ranged ? Math.max(1, row.alive) : meleeAcross(row, target.front);
        const ranks =
          row.alive && (ranged || row === side.front)
            ? Math.min(Math.ceil(row.alive / width), ranged ? 1 : 1 + Math.floor((Math.max(0, rng - setback) + EPS) / diameter))
            : 0;
        let rank = 0;
        for (; rank < ranks; rank++) {
          const depth = rank * diameter;
          const offset = setback + depth;
          const distance = gap + offset;
          if (distance - rng > EPS) {
            // 纵深按距离递增，只需排期下一层的入射程事件。
            if (speed && rng + EPS >= offset) schedule((distance - rng) / speed);
            break;
          }
          const remaining = distance - row.minRange;
          if (remaining < -EPS) {
            const clock = row.clocks[rank];
            if (clock) clock.aimAt = null;
            continue;
          }
          const canCrossMin = speed > 0 && row.minRange - offset > EPS;
          if (canCrossMin && remaining > EPS) schedule(remaining / speed);
          const clock = (row.clocks[rank] ??= { aimAt: null, cycleStart: 0, cycles: 0 });
          eligible.push({ depth, count: Math.min(width, row.alive - rank * width), distance, leaving: canCrossMin && Math.abs(remaining) <= EPS, clock });
        }
        for (let i = rank; i < row.clocks.length; i++) {
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
    )
      contact.meleeAt = time;
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
      from.rows.map((row) =>
        canAttack[row.index]!.filter(({ clock, distance, leaving }) => {
          // 各纵深分别瞄准。刚补入的层在上一批结算结束后才能开始前摇。
          clock.aimAt ??= time === lastAttack ? time + Math.max(row.delay, 2 * EPS) : time + row.delay;
          const due = Math.max(clock.aimAt, clock.cycleStart + clock.cycles * row.fighter.rof);
          if (withinHorizon(due) && due - time <= EPS) return true;
          // 即将穿过最小射程时，等待更近的移动或换行事件。
          if (!leaving && (!speed || distance - speed * (due - time) + EPS >= row.minRange)) nextTime = Math.min(nextTime, due);
          return false;
        }),
      );
    const aShots = shots(left, inA),
      bShots = shots(right, inB);
    const countShots = (ranks: RankInRange[]) => ranks.reduce((total, rank) => total + rank.count, 0);
    const volleySize = [...aShots, ...bShots].reduce((n, ranks) => n + countShots(ranks), 0);
    if (volleySize) {
      if (events >= maxEvents || attacks + volleySize > maxAttacks) return finish('limit');
      events++;
      attacks += volleySize;
      const aFired = aShots.some((ranks) => ranks.length),
        bFired = bShots.some((ranks) => ranks.length);
      contact.firstFire ??= aFired && bFired ? 'both' : aFired ? 'a' : 'b';
      if (opening && (opening.side === 'a' ? aShots : bShots).some((ranks, i) => ranks.length && (opening!.side === 'a' ? A : B)[i]!.fighter.ranged))
        opening.volleys++;
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
          for (const { clock } of ranks) {
            const cooldown = clock.cycleStart + clock.cycles * row.fighter.rof;
            if (clock.aimAt! > cooldown) {
              clock.cycleStart = clock.aimAt!;
              clock.cycles = 0;
            }
            clock.cycles++;
          }
          const key = row.fighter.ranged ? 'maxRanged' : 'maxMelee';
          rows[i]![key] = Math.max(rows[i]![key], fired);
        });
      }
      // 冻结两边出手人数后再逐击结算。同一时刻阵亡仍保留这次出手。
      applyAttacks(aShots, left, right, gap, ab);
      applyAttacks(bShots, right, left, gap, ba);
      // 退到下一行后，前排之间的距离按阵线实际推进重新计算。
      const previousDepth = (side: Formation) => side.setback[side.rows.findIndex((row) => row.alive)] ?? 0;
      gap += previousDepth(left) + previousDepth(right);
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
    for (const [front, eligible, rows] of [
      [left.front, inA, contact.a],
      [right.front, inB, contact.b],
    ] as const) {
      if (front.fighter.ranged) continue;
      for (const { count, leaving } of eligible[front.index]!) {
        if (!leaving) rows[front.index]!.meleeUnitSeconds += count * elapsed;
      }
    }
    gap = Math.max(0, gap - speed * elapsed);
    time = nextTime;
    if (timeout) return finish('timeout');
    events++;
  }
  return finish(survivors(A) || survivors(B) ? 'win' : 'draw');
}
