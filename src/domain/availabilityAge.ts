import type { Building, Tech, Trees } from './types';

/**
 * 固定科技树的建筑行：0/1 为黑暗、2/3 为封建、4/5 为城堡、6/7 为帝王。
 * trees_build.py 保留各文明的 building.row；同一布局也用于科技树的时代带。
 * 不另加载数据；没有科技树格子的建筑仍使用通用目录时代。
 */
export function treeRowAge(row: number): number {
  return Math.floor(row / 2) + 1;
}

export function buildingAge(building: Pick<Building, 'id' | 'age'>, civ: string, trees: Trees): number {
  const blocks = Object.hasOwn(trees.t, civ) ? trees.t[civ] : undefined;
  const block = Array.isArray(blocks) ? blocks.find((entry) => entry[0] === building.id) : undefined;
  return block ? treeRowAge(block[1]) : building.age;
}

/** 固定科技树中该文明已点亮节点的最早行时代；未点亮或无该文明时返回 Infinity。不代替四套科技可用性。 */
export function treeNodeEarliestAge(trees: Trees, civ: string, kind: 'u' | 't', id: number): number {
  const blocks = Object.hasOwn(trees.t, civ) ? trees.t[civ] : undefined;
  if (!Array.isArray(blocks)) return Infinity;
  let earliest = Infinity;
  for (const block of blocks) {
    for (const cell of block[3]) {
      if (cell[2] === kind && cell[3] === id && cell[4] === 1) {
        const age = treeRowAge(cell[0]);
        if (age < earliest) earliest = age;
      }
    }
  }
  return earliest;
}

/** 固定科技树中该文明指定节点是否已点亮。 */
export function hasLitTreeNode(trees: Trees, civ: string, kind: 'u' | 't', id: number): boolean {
  const blocks = Object.hasOwn(trees.t, civ) ? trees.t[civ] : undefined;
  if (!Array.isArray(blocks)) return false;
  return blocks.some((block) => block[3].some((cell) => cell[2] === kind && cell[3] === id && cell[4] === 1));
}

/** 单次遍历收集固定科技树中该文明所有已点亮单位或科技 ID。 */
export function litTreeIds(trees: Trees, civ: string, kind: 'u' | 't'): Set<number> {
  const ids = new Set<number>();
  const blocks = Object.hasOwn(trees.t, civ) ? trees.t[civ] : undefined;
  if (!Array.isArray(blocks)) return ids;
  for (const block of blocks) {
    for (const cell of block[3]) {
      if (cell[2] === kind && cell[4] === 1) ids.add(cell[3]);
    }
  }
  return ids;
}

/** 从固定 .dat 派生的文明映射中安全读取禁用科技集合（防原型链键误命中）。 */
export function disabledTechSet(civMap: Readonly<Record<string, { readonly disabled?: readonly number[] } | undefined>>, civ: string): ReadonlySet<number> {
  const entry = Object.hasOwn(civMap, civ) ? civMap[civ] : undefined;
  return new Set(entry?.disabled ?? []);
}

/** 底层公共原语：科技属于该文明、科技树格子点亮且不在 .dat 禁用集合内。不含时代与业务语义，不代替四套科技可用性。 */
export function isCivTechEnabled(
  tech: Pick<Tech, 'id' | 'civs'>,
  civ: string,
  status: Readonly<Record<string, number>>,
  disabled?: ReadonlySet<number>,
): boolean {
  return tech.civs.includes(civ) && status['t' + tech.id] === 1 && !disabled?.has(tech.id);
}

export const SPEARMAN_UNIT_ID = 93;

/** 现有单位提前解锁口径，共用一份；不改变各工具的其他形态/前置检查。新增文明或时代须在 techAvailability.ts 点名。 */
export const EARLY_UNIT_AGES: Readonly<Record<string, Readonly<Record<number, number>>>> = {
  Armenians: { 77: 2, 473: 3, 567: 3, 358: 2, 359: 3 },
  Cumans: { 1258: 2, 422: 3 },
  Burgundians: { 283: 3 },
  Bohemians: { 5: 3 },
  Khitans: { 474: 3 },
};

/** 现有军事科技提前解锁口径，共用一份（不含勃艮第经济科技）；与固定科技树一致并受全量对照测试约束。新增文明或时代须在 techAvailability.ts 点名。 */
export const EARLY_MILITARY_TECH_AGES: Readonly<Record<string, Readonly<Record<number, number>>>> = {
  Bohemians: { 47: 3 },
  Jurchens: { 377: 3 },
  Persians: { 436: 3 },
};

/**
 * 经济采集科技的提前时代（生产/采集口径，不含军事科技）。
 * 勃艮第通用采集科技提前一个时代（最低黑暗 1）；调用方须已核实该科技为通用采集科技。
 * 保持零 JSON 导入与无循环依赖，供 production.ts 及后续采集模型共用，不代替 civStatus / techAvailable / simTechs；例外见 techAvailability.ts。
 */
export function earlyEcoGatherTechAge(t: Pick<Tech, 'age'>, civ: string, isStandardGatherTech: boolean): number {
  if (civ === 'Burgundians' && isStandardGatherTech) return Math.max(1, t.age - 1);
  return t.age;
}

/** 军事科技在当前文明的最早可用时代（含已登记的军事科技提前解锁，不含勃艮第经济科技）。 */
export function militaryTechAge(civ: string, id: number, catalogAge: number): number {
  return Object.hasOwn(EARLY_MILITARY_TECH_AGES, civ) ? (EARLY_MILITARY_TECH_AGES[civ]?.[id] ?? catalogAge) : catalogAge;
}

/** 单位在科技树/可用性口径下的最低时代；提前解锁优先于目录与树格。 */
export function availableUnitAge(civ: string, id: number, catalogAge: number, rowAge: number): number {
  const early = Object.hasOwn(EARLY_UNIT_AGES, civ) ? EARLY_UNIT_AGES[civ]?.[id] : undefined;
  return early ?? Math.max(catalogAge, rowAge);
}

/**
 * 生产/驻军口径的最低训练时代。亚美尼亚长矛兵黑暗时代可训练，其他文明最低封建。
 */
export function trainingUnitAge(civ: string, id: number, catalogAge: number, extraFloor = 0): number {
  const early = Object.hasOwn(EARLY_UNIT_AGES, civ) ? EARLY_UNIT_AGES[civ]?.[id] : undefined;
  return Math.max(early ?? catalogAge, id === SPEARMAN_UNIT_ID ? (civ === 'Armenians' ? 1 : 2) : 1, extraFloor);
}

/** 展示口径：Armenians 长矛兵按黑暗，其他文明按封建；不得用于生产/费用/战斗。登记见 techAvailability.ts。 */
export function displayUnitAge(id: number, catalogAge: number, civ = ''): number {
  return id === SPEARMAN_UNIT_ID ? (civ === 'Armenians' ? 1 : 2) : catalogAge;
}
