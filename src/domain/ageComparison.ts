import { trainingUnitAge } from './availabilityAge';
import { duel, fighterFrom } from './duel';
import { presetUpTo, simTechs, simulate, type SimContext } from './simulator';
import type { Trees, Unit } from './types';
import { unitAvailable } from './unitAvailability';

/** 回溯所选版本的前置单位，不猜测旁支或文明替代单位。 */
export function unitAtAge(byId: Record<number, Unit>, id: number, civ: string, age: number, trees?: Trees): Unit | null {
  let u = byId[id];
  const seen = new Set<number>();
  while (u && !seen.has(u.id)) {
    seen.add(u.id);
    const available = trees
      ? unitAvailable({ core: { unitById: byId }, trees }, civ, u.id, age)
      : u.civs.includes(civ) && trainingUnitAge(civ, u.id, u.age) <= age;
    if (available) return u;
    u = u.from_ === null ? undefined : byId[u.from_];
  }
  return null;
}

export interface AgeSide {
  uid: number;
  civ: string;
  team: number[];
  relics?: number;
}
export function ageComparison(ctx: SimContext, byId: Record<number, Unit>, a: AgeSide, b: AgeSide) {
  const resolve = (side: AgeSide, age: number) => {
    const u = unitAtAge(byId, side.uid, side.civ, age, ctx.trees);
    if (!u) return null;
    const sel = presetUpTo(simTechs(ctx, u, side.civ), age, side.civ);
    const stats = simulate(ctx, u, side.civ, age, sel, new Set(side.team), undefined, side.relics ?? 0);
    return { u, stats, fighter: fighterFrom(u, stats) };
  };
  return [1, 2, 3, 4].map((age) => {
    const A = resolve(a, age),
      B = resolve(b, age);
    return { age, a: A, b: B, result: A && B ? duel(A.fighter, B.fighter) : null };
  });
}
