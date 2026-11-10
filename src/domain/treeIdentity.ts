import { buildingMark, regionalBuildings, uniqueBuildings } from './civBuildings';
import type { Building, TreeBlock } from './types';

export interface TreeIdentity {
  group: 'unique' | 'regional';
  label: '独特单位' | '独特科技' | '独特建筑' | '区域单位' | '区域科技' | '区域建筑';
}

const TYPE_MARK: Record<string, { group: TreeIdentity['group']; kind: 'u' | 't' }> = {
  UniqueUnit: { group: 'unique', kind: 'u' },
  UniqueTech: { group: 'unique', kind: 't' },
  RegionalUnit: { group: 'regional', kind: 'u' },
  RegionalTech: { group: 'regional', kind: 't' },
};

/** 单位和科技只看目录 type；建筑只看官方 id。空 type（如 691）保持未分类。 */
export function treeNodeIdentity(kind: 'u' | 't' | 'b', id: number, type?: string | null): TreeIdentity | null {
  if (kind === 'b') {
    const group = buildingMark(id);
    if (group === 'unique') return { group, label: '独特建筑' };
    if (group === 'regional') return { group, label: '区域建筑' };
    return null;
  }
  const hit = type ? TYPE_MARK[type] : undefined;
  if (!hit || hit.kind !== kind) return null;
  if (hit.group === 'unique') return { group: 'unique', label: kind === 'u' ? '独特单位' : '独特科技' };
  return { group: 'regional', label: kind === 'u' ? '区域单位' : '区域科技' };
}

/** 当前树里已经画出来的建筑：列头，以及嵌在其他列里的建筑格（如船坞列的巨港）。 */
export function treePresentBuildingIds(blocks: readonly TreeBlock[] | undefined): Set<number> {
  const present = new Set<number>();
  for (const [bid, , , cells] of blocks ?? []) {
    present.add(bid);
    for (const cell of cells) if (cell[2] === 'b') present.add(cell[3]);
  }
  return present;
}

/**
 * 官方独特/区域建筑里，本文明目录拥有、但当前树没有列也没有建筑格的那些。
 * 不补空列。已经出现在树上的（包括巨港这种格子）不进补充区。
 */
export function offColumnSpecialBuildings<T extends Pick<Building, 'id' | 'civs'>>(
  civ: string,
  buildings: readonly T[],
  blocks: readonly TreeBlock[] | undefined,
): T[] {
  const present = treePresentBuildingIds(blocks);
  return [...uniqueBuildings(civ, buildings), ...regionalBuildings(civ, buildings)].filter((b) => !present.has(b.id));
}
