import type { Building, Trees } from './types';

/**
 * 固定科技树的建筑行：0/1 为黑暗、2/3 为封建、4/5 为城堡、6/7 为帝王。
 * trees_build.py 保留各文明的 building.row；同一布局也用于科技树的时代带。
 * 不另加载数据；没有科技树格子的建筑仍使用通用目录时代。
 */
export function treeRowAge(row: number): number {
  return Math.floor(row / 2) + 1;
}

export function buildingAge(building: Pick<Building, 'id' | 'age'>, civ: string, trees: Trees): number {
  const blocks = trees.t[civ];
  const block = Array.isArray(blocks) ? blocks.find((entry) => entry[0] === building.id) : undefined;
  return block ? treeRowAge(block[1]) : building.age;
}

export const SPEARMAN_UNIT_ID = 93;

/** 现有单位提前解锁口径，共用一份；不改变各工具的其他形态/前置检查。 */
export const EARLY_UNIT_AGES: Readonly<Record<string, Readonly<Record<number, number>>>> = {
  Armenians: { 75: 1, 77: 2, 473: 3, 358: 2, 359: 3 },
  Cumans: { 1258: 2, 422: 3 },
  Burgundians: { 283: 3 },
  Bohemians: { 5: 3 },
};

/** 单位在科技树/可用性口径下的最低时代；提前解锁优先于目录与树格。 */
export function availableUnitAge(civ: string, id: number, catalogAge: number, rowAge: number): number {
  return EARLY_UNIT_AGES[civ]?.[id] ?? Math.max(catalogAge, rowAge);
}

/**
 * 生产/驻军口径的最低训练时代。长矛兵在原始目录里是黑暗时代，但实际生产最低封建；
 * 该例外只在这里写一次，Armenian 的黑暗可用性由 availableUnitAge 保留。
 */
export function trainingUnitAge(civ: string, id: number, catalogAge: number, extraFloor = 0): number {
  return Math.max(EARLY_UNIT_AGES[civ]?.[id] ?? catalogAge, id === SPEARMAN_UNIT_ID ? 2 : 1, extraFloor);
}

/** 展示口径：Armenians 长矛兵按黑暗，其他文明按封建；不得用于生产/费用/战斗。 */
export function displayUnitAge(id: number, catalogAge: number, civ = ''): number {
  return id === SPEARMAN_UNIT_ID ? (civ === 'Armenians' ? 1 : 2) : catalogAge;
}
