/**
 * #25 PK 盈亏平衡点（纯函数）：B 固定 nb 个，求 A 最少多少个能确定取胜。
 * 胜负完全复用 domain/duel.ts 的 groupFight（与「N vs M」同一集火模型），本文件不含任何战斗逻辑。
 *
 * 口径（Steve 裁定）：N = 最小的 n，使 n 以及 n..cap 的每一档都严格获胜（平局不算获胜）。
 * 群战胜负对数量不保证单调（同时结算 + 过量伤害可能出现「n 胜、n+1 负」），所以不用二分/倍增：
 * 有界线性扫描 1..cap，每档都真实跑一次 groupFight，取末尾「全胜」后缀的起点。
 * cap 默认 200，扫描次数严格 ≤ cap，不会死循环；cap 档仍不胜时 reached = true。
 */
import { groupFight, type Fighter, type GroupResult } from './duel';

export const BREAK_EVEN_CAP = 200;
export const BREAK_EVEN_DEFAULT_B = 10;

export interface BreakEvenRow {
  n: number;
  win: boolean;
  r: GroupResult;
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
  /** 少于 N 时也有获胜的数量（界面显示「少于 N 个时，部分数量也能赢，但不稳定」） */
  unstableBelow: boolean;
}

/** 战斗函数签名与 groupFight 一致；仅供测试注入（例如构造非单调结果），生产调用一律用默认的 groupFight */
export type FightFn = (a: Fighter, na: number, b: Fighter, nb: number) => GroupResult;

export function breakEven(a: Fighter, b: Fighter, nb: number, cap = BREAK_EVEN_CAP, fight: FightFn = groupFight): BreakEvenResult {
  const C = Math.max(1, Math.floor(cap));
  const res: GroupResult[] = [];
  for (let n = 1; n <= C; n++) res.push(fight(a, n, b, nb));
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
