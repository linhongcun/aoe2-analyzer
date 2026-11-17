import { expectedHit, type Fighter } from './duel';

export const MIXED_RULE = 'queue-v1';
export const MIXED_RULE_LABEL = '受击队列集火 v1';
const ALIVE = 1e-9;
const SAME_TIME = 1e-9;

export interface MixedFighter {
  uid: number;
  count: number;
  fighter: Fighter;
}
export interface MixedLoss {
  uid: number;
  initial: number;
  lost: number;
  alive: number;
  hp: number;
}
export interface MixedArmyResult {
  rows: MixedLoss[];
  total: Omit<MixedLoss, 'uid'>;
}
export type MixedFightResult =
  | { status: 'win'; winner: 'a' | 'b'; duration: number; a: MixedArmyResult; b: MixedArmyResult }
  | { status: 'draw' | 'timeout'; duration: number; a: MixedArmyResult; b: MixedArmyResult }
  | { status: 'error'; reason: string };

export function mixedFighterError(f: Fighter): string | null {
  if (!Number.isFinite(f.hp) || f.hp <= ALIVE) return '生命必须是有限正数';
  if (!Number.isFinite(f.rof) || f.rof <= 0) return '没有可用于持续交战的正攻击间隔';
  if (!Number.isFinite(f.acc) || f.acc < 0 || f.acc > 1) return '命中率无法解析';
  if (![...Object.values(f.attack), ...Object.values(f.armor)].every(Number.isFinite)) return '攻击或护甲不是有限数值';
  if (!Object.values(f.attack).some((n) => n > 0)) return '没有可建模的普通攻击';
  return null;
}

/** The two attack snapshots are taken before either army receives this event's damage. */
export function mixedFight(
  a: readonly MixedFighter[],
  b: readonly MixedFighter[],
  options: { maxTime?: number; maxEvents?: number; maxAttacks?: number } = {},
): MixedFightResult {
  const maxTime = options.maxTime ?? 600;
  const maxEvents = options.maxEvents ?? 250_000;
  const maxAttacks = options.maxAttacks ?? 5_000_000;
  const error = (reason: string): MixedFightResult => ({ status: 'error', reason });
  if (!Number.isFinite(maxTime) || maxTime < 0 || maxTime > 600) return error('模拟时限无效');
  if (![maxEvents, maxAttacks].every((n) => Number.isSafeInteger(n) && n > 0)) return error('运算资源上限无效');
  for (const [side, army] of [
    ['A', a],
    ['B', b],
  ] as const) {
    if (!army.length || army.length > 3) return error(`${side} 方须有 1–3 行`);
    if (new Set(army.map((r) => r.uid)).size !== army.length) return error(`${side} 方有重复单位`);
    if (army.some((r) => !Number.isSafeInteger(r.uid) || r.uid <= 0 || !Number.isSafeInteger(r.count) || r.count < 1 || r.count > 200))
      return error(`${side} 方单位或数量无效`);
    if (army.reduce((s, r) => s + r.count, 0) > 200) return error(`${side} 方合计超过 200`);
    for (const row of army) {
      const reason = mixedFighterError(row.fighter);
      if (reason) return error(`${side} 方 ${row.fighter.name}：${reason}`);
    }
    if (!Number.isFinite(army.reduce((sum, row) => sum + row.count * row.fighter.hp, 0))) return error(`${side} 方总生命超出数值范围`);
  }
  const make = (army: readonly MixedFighter[]) =>
    army.map((row) => ({ ...row, hp: Array<number>(row.count).fill(row.fighter.hp), head: 0, next: 0, shots: 0 }));
  const A = make(a),
    B = make(b);
  const alive = (row: (typeof A)[number]) => row.count - row.head;
  const count = (army: typeof A) => army.reduce((s, r) => s + alive(r), 0);
  const damage = (from: readonly MixedFighter[], to: readonly MixedFighter[]) => from.map((r) => to.map((t) => expectedHit(r.fighter, t.fighter)));
  const ab = damage(a, b),
    ba = damage(b, a);
  if ([...ab.flat(), ...ba.flat()].some((d) => !Number.isFinite(d) || d < 0)) return error('每击期望伤害无法解析');
  const summarize = (army: typeof A): MixedArmyResult => {
    const rows = army.map((r) => ({
      uid: r.uid,
      initial: r.count,
      lost: r.count - alive(r),
      alive: alive(r),
      hp: r.hp.slice(r.head).reduce((s, h) => s + h, 0),
    }));
    return {
      rows,
      total: rows.reduce((s, r) => ({ initial: s.initial + r.initial, lost: s.lost + r.lost, alive: s.alive + r.alive, hp: s.hp + r.hp }), {
        initial: 0,
        lost: 0,
        alive: 0,
        hp: 0,
      }),
    };
  };
  let t = 0,
    events = 0,
    attacks = 0;
  while (count(A) && count(B)) {
    t = Math.min(...[...A, ...B].filter((r) => alive(r)).map((r) => r.next));
    if (t > maxTime) return { status: 'timeout', duration: maxTime, a: summarize(A), b: summarize(B) };
    if (++events > maxEvents) return error('事件数量超过安全上限，未生成有效结果');
    // Reject out-of-horizon attacks before grouping near-equal absolute event times.
    const due = (row: (typeof A)[number]) => row.next <= maxTime && Math.abs(row.next - t) < SAME_TIME;
    const snap = (army: typeof A) => army.map((r) => (due(r) ? alive(r) : 0));
    const na = snap(A),
      nb = snap(B);
    const apply = (to: typeof A, shots: number[], matrix: number[][]) => {
      for (let i = 0; i < shots.length; i++) {
        for (let n = 0; n < shots[i]!; n++) {
          const j = to.findIndex((r) => alive(r));
          if (j < 0) break;
          if (++attacks > maxAttacks) return false;
          const row = to[j]!;
          row.hp[row.head]! -= matrix[i]![j]!;
          if (row.hp[row.head]! <= ALIVE) row.head++;
        }
      }
      return true;
    };
    if (!apply(B, na, ab) || !apply(A, nb, ba)) return error('攻击运算超过安全上限，未生成有效结果');
    for (const row of [...A, ...B]) {
      if (!due(row)) continue;
      row.shots++;
      row.next = row.shots * row.fighter.rof;
    }
  }
  const result = { duration: t, a: summarize(A), b: summarize(B) };
  if (!count(A) && !count(B)) return { ...result, status: 'draw' };
  return { ...result, status: 'win', winner: count(A) ? 'a' : 'b' };
}
