/**
 * 数值修正的唯一求值实现（D1）。
 *
 * .dat 的 set / mul / add 按效果顺序累积：set 覆盖之前的一切，之后的 mul / add
 * 依次叠加。普通属性、科技费用与研究时间都使用同一套语义，避免模拟器与开局
 * 模拟各自维护一份取整/覆盖规则。
 */
export interface NumMod {
  set?: number;
  mul: number;
  add: number;
}

/** 按顺序累积一条 set / mul / add；未知 op 按 add 处理（与旧模拟器一致）。 */
export function pushMod(cur: NumMod | undefined, op: string | undefined, v: number): NumMod {
  const m = cur ?? { mul: 1, add: 0 };
  if (op === 'set') return { set: v, mul: 1, add: 0 };
  if (op === 'mul') return { set: m.set, mul: m.mul * v, add: m.add * v };
  return { set: m.set, mul: m.mul, add: m.add + v };
}

/** 把累积修正应用到基础值：值 = (set ?? 原值) × mul + add。 */
export const applyMod = (base: number, m?: NumMod): number => (m ? (m.set ?? base) * m.mul + m.add : base);

/** 单条效果求值，供逐条应用的模拟器使用；与 pushMod + applyMod 同义。 */
export const applyEffectValue = (base: number, op: string | undefined, value: number): number => applyMod(base, pushMod(undefined, op, value));

export const TECH_OPS = new Set(['set', 'mul', 'add']);
