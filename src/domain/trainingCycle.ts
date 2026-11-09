import { applyEffectValue } from './numericEffects';

/** 训练周期的有序操作：train 改秒数，work 改生产建筑的工作倍率。 */
export interface TrainingCycleOp {
  kind: 'train' | 'work';
  op?: string;
  v: number;
}

export interface TrainingCycle {
  /**
   * 按操作顺序直接作用在一个周期上的结果；route/castle/buildSim 使用。
   * 前置条件：work 操作只有 `mul`（这些调用点也只产生 mul）。含 work set/add 或
   * train set 时，`cycle` 不保证等于 `seconds`，请使用 `seconds`。
   */
  cycle: number;
  /** train 与 work 分开累计后一次相除的结果；production 使用，保持原算术顺序。 */
  seconds: number;
}

/**
 * 唯一的训练周期求值（D2）。
 *
 * `cycle` 与 `seconds` 在只有乘法时数学等价；分开返回是为了让 production 继续按
 * 「先累计 train 秒数、再累计 work 倍率、最后相除」的浮点顺序计算，而 route /
 * castle / buildSim 继续按交错顺序 `cycle * train / work` 计算。
 */
export function trainingCycle(base: number, ops: readonly TrainingCycleOp[]): TrainingCycle {
  let train = base;
  let work = 1;
  let cycle = base;
  for (const { kind, op, v } of ops) {
    if (kind === 'train') {
      train = applyEffectValue(train, op, v);
      cycle = applyEffectValue(cycle, op, v);
    } else {
      const next = applyEffectValue(work, op, v);
      // 只有乘法时保持原 `cycle /= v`；set/add 用 train/work 的等价比值更新。
      if (op === 'mul') cycle /= v;
      else cycle = (cycle * work) / next;
      work = next;
    }
  }
  return { cycle, seconds: train / work };
}
