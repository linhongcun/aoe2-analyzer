import type { Building, Trees } from './types';

/**
 * 固定科技树的建筑行：0/1 为黑暗、2/3 为封建、4/5 为城堡、6/7 为帝王。
 * trees_build.py 保留各文明的 building.row；同一布局也用于科技树的时代带。
 * 不另加载数据；没有科技树格子的建筑仍使用通用目录时代。
 */
export function buildingAge(building: Pick<Building, 'id' | 'age'>, civ: string, trees: Trees): number {
  const blocks = trees.t[civ];
  const block = Array.isArray(blocks) ? blocks.find((entry) => entry[0] === building.id) : undefined;
  return block ? Math.floor(block[1] / 2) + 1 : building.age;
}

/** 现有单位提前解锁口径，共用一份；不改变各工具的其他形态/前置检查。 */
export const EARLY_UNIT_AGES: Readonly<Record<string, Readonly<Record<number, number>>>> = {
  Armenians: { 75: 1, 77: 2, 473: 3, 358: 2, 359: 3 },
  Cumans: { 1258: 2, 422: 3 },
  Burgundians: { 283: 3 },
  Bohemians: { 5: 3 },
};
