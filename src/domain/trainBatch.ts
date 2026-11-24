/**
 * 成对 / 批量训练单位的纯函数口径（Issue 1384）。
 * 底层目录造价与训练时间维持每批原值；仅当 trainCount 为 ≥ 2 的整数时启用成对折算与整批计费。
 */
import type { Cost, Unit } from './types';

function normalizeTrainCount(tc: number): number {
  return Number.isInteger(tc) && tc > 1 ? tc : 1;
}

/** 读取单位每批训练产出数；缺省或非法值一律归一为 1。 */
export function unitTrainCount(u: Pick<Unit, 'trainCount'> | null | undefined): number {
  return normalizeTrainCount(u?.trainCount ?? 1);
}

/** 是否为成对 / 批量训练单位（每次训练产出 ≥ 2 只）。 */
export function isPairTrained(u: Pick<Unit, 'trainCount'> | null | undefined): boolean {
  return unitTrainCount(u) > 1;
}

/** 按目标只数向上取整折算实付批数（对数）。 */
export function batchesForQty(qty: number, tc: number): number {
  const n = normalizeTrainCount(tc);
  return Number.isFinite(qty) && qty > 0 ? Math.ceil(qty / n) : 0;
}

/** 向上取整整批计费后实际得到的只数。 */
export function deliveredQty(qty: number, tc: number): number {
  const n = normalizeTrainCount(tc);
  return batchesForQty(qty, n) * n;
}

/** 将每批造价折算为单只参考价，保持入参资源键顺序并规整到 3 位小数。 */
export function perUnitCost(cost: Cost, tc: number): Cost {
  const n = normalizeTrainCount(tc);
  if (n === 1) return { ...cost };
  const out: Cost = {};
  for (const [key, value] of Object.entries(cost)) {
    if (value === undefined) continue;
    (out as Record<string, number>)[key] = Math.round((value / n) * 1000) / 1000;
  }
  return out;
}

/** 将每批训练秒数折算为单只参考秒数（保留最多 2 位小数）。 */
export function perUnitTime(sec: number, tc: number): number {
  const n = normalizeTrainCount(tc);
  return Math.round((sec / n) * 100) / 100;
}

/** 将任意数量向上对齐到不小于原值的最近整批只数，并钳入 [tc, max] 内的最大整批值。 */
export function ceilToBatch(qty: number, tc: number, max = 200): number {
  const n = normalizeTrainCount(tc);
  const safeQty = Number.isFinite(qty) ? Math.floor(qty) : n;
  const maxBatch = Math.floor(max / n) * n;
  const upper = maxBatch > 0 ? maxBatch : max;
  if (safeQty <= 0) return Math.min(upper, n);
  const rounded = Math.ceil(safeQty / n) * n;
  return Math.min(upper, Math.max(n, rounded));
}
