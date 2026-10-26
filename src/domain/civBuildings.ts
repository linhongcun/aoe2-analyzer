import type { Building } from './types';

// RegionalBuilding nodes in the pinned DE185872 source (including Khitan Pasture).
// https://github.com/SiegeEngineers/aoe2techtree/tree/3bb43b1439eef88dfe7fe892d7f7dc41ac9dd76f/data/trees
// The building export omits node_type; recheck this identity set when updating DE.
const REGIONAL_BUILDING_IDS = new Set([1754, 1806, 1808, 1889, 2556]);

/** 区域建筑的只读查询；归属始终使用当前目录，不按文明数量推断类别。 */
export function regionalBuildings<T extends Pick<Building, 'id' | 'civs'>>(civ: string, buildings: readonly T[]): T[] {
  return buildings.filter((b) => REGIONAL_BUILDING_IDS.has(b.id) && b.civs.includes(civ));
}
