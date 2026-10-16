import type { Cost } from './types';

/** issue 107 一方损失：阵亡数 × 折后取整单价（逐资源）；存活单位掉的血不计 */
export interface SideLoss {
  dead: number;
  res: Cost;
  total: number;
}
export interface Trade {
  a: SideLoss;
  b: SideLoss;
  /** B 损失 ÷ A 损失；任一方为 0 时为 null */
  ratio: number | null;
}

function loss(n: number, alive: number, cost: Cost): SideLoss {
  const dead = Math.max(0, n - alive);
  const res: Cost = {};
  let total = 0;
  if (dead > 0)
    for (const [k, v] of Object.entries(cost)) {
      if (!v) continue;
      (res as Record<string, number>)[k] = v * dead;
      total += v * dead;
    }
  return { dead, res, total };
}

export function tradeLosses(p: { na: number; nb: number; aAlive: number; bAlive: number; costA: Cost; costB: Cost }): Trade {
  const a = loss(p.na, p.aAlive, p.costA),
    b = loss(p.nb, p.bAlive, p.costB);
  return { a, b, ratio: a.total > 0 && b.total > 0 ? b.total / a.total : null };
}

/** 显示：交换比（A : B）1 : x.xx；零损失时给「A/B 无阵亡」「双方均无阵亡」，且不出「每损失」小字 */
export function formatTrade(t: Trade): { label: string; value: string; note: string } {
  const label = '交换比（A : B）';
  if (t.ratio === null) {
    const value = !t.a.total && !t.b.total ? '双方均无阵亡' : !t.a.total ? 'A 无阵亡' : 'B 无阵亡';
    return { label, value, note: '' };
  }
  const r = t.ratio.toFixed(2);
  return { label, value: `1 : ${r}`, note: `A 每损失 1 资源，B 损失 ${r}` };
}
