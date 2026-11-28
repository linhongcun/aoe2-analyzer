/** 研究费用资源顺序、两位小数舍入与累加原语（零数据依赖，供 armyResearchRules 与 simResearchCost 共用）。 */
import type { Cost } from './types';

export const ARMY_RES = ['Food', 'Wood', 'Gold', 'Stone'] as const;
export type ArmyResource = (typeof ARMY_RES)[number];

export const roundArmyCost = (v: number): number => Math.round(v * 100) / 100 || 0;

export function hasDecimalCost(cost: Cost | null | undefined): boolean {
  return !!cost && ARMY_RES.some((r) => cost[r] !== undefined && !Number.isInteger(cost[r]));
}

export function addArmyCost(to: Cost, from: Cost): void {
  for (const r of ARMY_RES) to[r] = roundArmyCost((to[r] ?? 0) + (from[r] ?? 0));
}
