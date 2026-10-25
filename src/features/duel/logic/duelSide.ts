import { civByEn } from '../../../data';
import { discountedCost, priceAge, type CostDiscount } from '../../../domain/costDiscount';
import { fighterFrom, type Fighter } from '../../../domain/duel';
import { presetUpTo, simTechs, simulate, type SimContext } from '../../../domain/simulator';
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
  /** 训练费用（已按已核实的常驻文明加成折算，#24） */
  disc: CostDiscount;
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
  // issue 100：模拟、标题、取价统一用 URL 时代（未写时代按帝王）；「满科技」= 该时代及以前可研究的科技全算
  const sel = spec.techs === 'f' || spec.techs === 'c' ? presetUpTo(avail, age) : new Set(spec.techs.filter((i) => ok.has(i)));
  const S = simulate(ctx, u, civ, age, sel, new Set(spec.team));
  const disc = discountedCost(u, civ, priceAge(u.age, age), { techIds: ok });
  return { spec, u, civ, age, sel, S, F: { ...fighterFrom(u, S), cost: disc.cost }, avail, disc };
}

export const r1 = (x: number) => String(Math.round(x * 10) / 10);
