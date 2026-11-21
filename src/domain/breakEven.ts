/**
 * #25 PK 盈亏平衡点（纯函数）：B 固定 nb 个，求 A 最少多少个能确定取胜。
 * 胜负复用群战的接触面与接敌先手模拟。
 *
 * 口径（Steve 裁定）：N = 最小的 n，使 n 以及 n..cap 的每一档都严格获胜（平局不算获胜）。
 * 群战胜负对数量不保证单调（同时结算 + 过量伤害可能出现「n 胜、n+1 负」），所以不用二分/倍增：
 * 有界线性扫描 1..cap，每档都真实跑一次 groupFight，取末尾「全胜」后缀的起点。
 * cap 默认 200，扫描次数严格 ≤ cap，不会死循环；cap 档仍不胜时 reached = true。
 */
import { groupFight, type Fighter, type GroupOutcome, type GroupResult } from './duel';
import { FIGHT_CAP } from './contactFight';

export const BREAK_EVEN_CAP = FIGHT_CAP;
export const BREAK_EVEN_DEFAULT_B = 10;

export interface BreakEvenRow {
  n: number;
  win: boolean;
  r: GroupOutcome;
}
export interface BreakEvenResult {
  /** 最少能确定取胜的 A 数量；cap 内没有全胜后缀时为 null */
  n: number | null;
  nb: number;
  cap: number;
  /** cap 内无法取胜（cap 档不胜） */
  capReached: boolean;
  /** N−1 / N / N+1（N=1 不含 N−1；N+1 超过 cap 时不含）；capReached 时只有 cap 一档 */
  rows: BreakEvenRow[];
  /** 1..cap 中获胜但不在末尾全胜后缀里的数量（非单调的证据，便于说明与测试） */
  isolatedWins: number[];
  /** 少于 N 时也有获胜的数量（目前界面不显示，Steve 裁定；由单测守住搜索逻辑） */
  unstableBelow: boolean;
  interrupted?: { n: number; result: GroupResult };
}

/** 战斗函数签名与 groupFight 一致；仅供测试注入（例如构造非单调结果），生产调用一律用默认的 groupFight */
export type FightFn = (a: Fighter, na: number, b: Fighter, nb: number) => GroupResult;

export function* breakEvenSteps(a: Fighter, b: Fighter, nb: number, cap = BREAK_EVEN_CAP, fight: FightFn = groupFight): Generator<void, BreakEvenResult> {
  const C = Number.isFinite(cap) ? Math.max(1, Math.min(BREAK_EVEN_CAP, Math.floor(cap))) : BREAK_EVEN_CAP;
  const res: GroupOutcome[] = [];
  for (let n = 1; n <= C; n++) {
    const result = fight(a, n, b, nb);
    if (result.status === 'error' || result.status === 'timeout' || result.status === 'limit') {
      return { n: null, nb, cap: C, capReached: false, rows: [], isolatedWins: [], unstableBelow: false, interrupted: { n, result } };
    }
    res.push(result);
    yield;
  }
  const win = (n: number) => res[n - 1]!.winner === 'a';
  const row = (n: number): BreakEvenRow => ({ n, win: win(n), r: res[n - 1]! });
  if (!win(C)) {
    const isolatedWins = res.map((_, i) => i + 1).filter(win);
    return { n: null, nb, cap: C, capReached: true, rows: [row(C)], isolatedWins, unstableBelow: false };
  }
  let N = C;
  while (N > 1 && win(N - 1)) N--;
  const rows = [N - 1, N, N + 1].filter((n) => n >= 1 && n <= C).map(row);
  const isolatedWins = res.map((_, i) => i + 1).filter((n) => n < N && win(n));
  return { n: N, nb, cap: C, capReached: false, rows, isolatedWins, unstableBelow: isolatedWins.length > 0 };
}

export function breakEven(a: Fighter, b: Fighter, nb: number, cap = BREAK_EVEN_CAP, fight: FightFn = groupFight): BreakEvenResult {
  const steps = breakEvenSteps(a, b, nb, cap, fight);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}
