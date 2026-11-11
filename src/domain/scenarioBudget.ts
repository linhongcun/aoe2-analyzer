/**
 * 情景预算与中性采集上下文（D9 / issue 907）。
 *
 * 两时代路线与城堡情景共用同一套「固定投入是否付得起、剩余预算还能买几个」，
 * 以及同一个中性采集模型；调用方只传预算、固定工秒、单兵工秒和可选 limit。
 */
import { gatherModel, type GatherModel } from './realCost';
import { SCENE_EPS } from './positionScenarioMath';

export interface AffordableCount {
  /** 固定投入是否已付得起。 */
  paid: boolean;
  /** 付得起时剩余预算能买的数量；limit 缺省不设上限。 */
  count: number;
}

export function affordableCount(budget: number, fixedWork: number, unitWork: number, limit = Number.POSITIVE_INFINITY): AffordableCount {
  const paid = budget + SCENE_EPS >= fixedWork;
  const count = paid ? Math.min(limit, Math.max(0, Math.floor((budget - fixedWork) / unitWork + SCENE_EPS))) : 0;
  return { paid, count };
}

/** 两时代路线/城堡情景的中性采集上下文：无文明、无科技、3 格步行、农田贴磨坊。 */
export function neutralGatherModel(): GatherModel {
  return gatherModel(3, '', { techIds: new Set(), walkTiles: 3, farmTiles: 0 });
}
