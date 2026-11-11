import { civByEn } from '../../../data';
import type { CostDiscount } from '../../../domain/costDiscount';
import { fighterFrom, type Fighter } from '../../../domain/duel';
import { applicableTrainingTechs, quoteTraining, selectTrainingIds, type TrainingQuote } from '../../../domain/duelTrainingCost';
import { simTechs, simulate, type SimContext } from '../../../domain/simulator';
import type { StatSet, Unit } from '../../../domain/types';
import type { SideSpec } from '../../../domain/duelState';
import { substituteIn } from './substitute';

export interface Resolved {
  spec: SideSpec;
  u: Unit;
  civ: string;
  age: number;
  sel: Set<number>;
  S: StatSet;
  F: Fighter;
  avail: ReturnType<typeof simTechs>;
  /** 常驻文明训练折扣（不含需研究的费用科技），供「已计入 / 未计入」句式 */
  disc: CostDiscount;
  /** 已选且本站已支持的费用科技之后的训练价，与 Fighter.cost 同一笔 unitCost */
  training: TrainingQuote;
}
/** issue 124 选的文明造不了这个单位：保留玩家选的文明，不出属性与战斗结果，等玩家点按钮 */
export interface Unavail {
  unavail: true;
  spec: SideSpec;
  u: Unit;
  civ: string;
  age: number;
  /** 可替代单位；null = 没有替代 */
  sub: Unit | null;
}
export type SideState = Resolved | Unavail;
export const isUnavail = (s: SideState): s is Unavail => 'unavail' in s;

export function resolve(ctx: SimContext, byId: Record<number, Unit>, spec: SideSpec, fallback: number): SideState {
  let u = byId[spec.uid];
  if (!u || !u.civs.length) u = byId[fallback]!;
  // issue 124：URL 里是一个真实文明但它造不了这个单位时，不再静默换成 civs[0]；只有文明为空/不认识时才回落
  if (!u.civs.includes(spec.civ) && civByEn(spec.civ)) {
    const s = substituteIn(byId, u.id, spec.civ);
    return { unavail: true, spec, u, civ: spec.civ, age: Math.max(u.age, spec.age), sub: s !== null && s !== u.id ? byId[s]! : null };
  }
  const civ = u.civs.includes(spec.civ) ? spec.civ : u.civs[0]!;
  const age = Math.max(u.age, spec.age);
  const avail = simTechs(ctx, u, civ);
  const ok = new Set(avail.map((x) => x.t.id));
  // issue 100：模拟、标题、取价统一用 URL 时代（未写时代按帝王）。
  // issue 943：f / c 再纳入本站已支持的适用费用科技；战斗仍只吃 simulate 能用的效果。
  const costs = applicableTrainingTechs(ctx, u, civ, age);
  const sel = selectTrainingIds(spec.techs, avail, age, costs);
  const S = simulate(ctx, u, civ, age, sel, new Set(spec.team));
  const training = quoteTraining(u, civ, age, sel, costs, ok);
  return { spec, u, civ, age, sel, S, F: { ...fighterFrom(u, S), cost: training.price.cost }, avail, disc: training.price.discount, training };
}

export const r1 = (x: number) => String(Math.round(x * 10) / 10);
