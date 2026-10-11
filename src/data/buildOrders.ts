import type { BuildOrder, RefData } from '../domain/buildOrder';

/** 全部开局数据（src/data/build-orders/*.json），按 id 排序 */
const mods = import.meta.glob<{ default: BuildOrder }>('./build-orders/*.json', { eager: true });
export const buildOrders: BuildOrder[] = Object.values(mods)
  .map((m) => m.default)
  .sort((a, b) => a.target.age - b.target.age || a.target.vils - b.target.vils || a.id.localeCompare(b.id));

/** 校验用引用数据 */
export function refData(
  units: { id: number; age: number; up?: unknown }[],
  techs: { id: number; age: number }[],
  buildings: { id: number; age: number }[],
  civs: { en: string }[],
): RefData {
  const by = <T extends { id: number }>(xs: T[]) => Object.fromEntries(xs.map((x) => [x.id, x])) as Record<number, T>;
  return { units: by(units), techs: by(techs), buildings: by(buildings), civs: new Set(civs.map((c) => c.en)) };
}
