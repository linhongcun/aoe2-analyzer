import { duel, fighterFrom } from './duel';
import { presetUpTo, simTechs, simulate, type SimContext } from './simulator';
import type { Unit } from './types';

/** 回溯所选版本的前置单位，不猜测旁支或文明替代单位。 */
export function unitAtAge(byId: Record<number, Unit>, id: number, civ: string, age: number): Unit | null {
  let u = byId[id];
  const seen = new Set<number>();
  while (u && !seen.has(u.id)) {
    seen.add(u.id);
    if (u.age <= age && u.civs.includes(civ)) return u;
    u = u.from_ === null ? undefined : byId[u.from_];
  }
  return null;
}

export interface AgeSide {
  uid: number;
  civ: string;
  team: number[];
}
export function ageComparison(ctx: SimContext, byId: Record<number, Unit>, a: AgeSide, b: AgeSide) {
  const resolve = (side: AgeSide, age: number) => {
    const u = unitAtAge(byId, side.uid, side.civ, age);
    if (!u) return null;
    const sel = presetUpTo(simTechs(ctx, u, side.civ), age);
    const stats = simulate(ctx, u, side.civ, age, sel, new Set(side.team));
    return { u, stats, fighter: fighterFrom(u, stats) };
  };
  return [1, 2, 3, 4].map((age) => {
    const A = resolve(a, age),
      B = resolve(b, age);
    return { age, a: A, b: B, result: A && B ? duel(A.fighter, B.fighter) : null };
  });
}
