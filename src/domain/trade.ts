import { perUnitCost } from './trainBatch';
import type { Cost } from './types';

/** issue 107 / issue 1384 一方损失：阵亡数 × 单只折算价（成对训练按每批价除以产出数）；存活单位掉的血不计 */
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

function loss(n: number, alive: number, cost: Cost, trainCount = 1): SideLoss {
  const dead = Math.max(0, n - alive);
  const unitCost = perUnitCost(cost, trainCount);
  const res: Cost = {};
  let total = 0;
  if (dead > 0)
    for (const [k, v] of Object.entries(unitCost)) {
      if (!v) continue;
      const part = Math.round(v * dead * 1000) / 1000;
      (res as Record<string, number>)[k] = part;
      total += part;
    }
  return { dead, res, total: Math.round(total * 1000) / 1000 };
}

export function tradeLosses(p: {
  na: number;
  nb: number;
  aAlive: number;
  bAlive: number;
  costA: Cost;
  costB: Cost;
  trainCountA?: number;
  trainCountB?: number;
}): Trade {
  const a = loss(p.na, p.aAlive, p.costA, p.trainCountA ?? 1),
    b = loss(p.nb, p.bAlive, p.costB, p.trainCountB ?? 1);
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
