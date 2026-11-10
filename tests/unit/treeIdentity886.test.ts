import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees, type Core } from '../../src/data';
import { isUniqueBuilding } from '../../src/domain/buildings';
import { buildingMark } from '../../src/domain/civBuildings';
import { offColumnSpecialBuildings, treeNodeIdentity, treePresentBuildingIds } from '../../src/domain/treeIdentity';
import type { TreeBlock, Trees } from '../../src/domain/types';
import { HD, jumpScrollLeft, layoutTree, LW, TH, TW } from '../../src/features/tree/logic/layout';

let core: Core;
let trees: Trees;

beforeAll(async () => {
  [core, trees] = await Promise.all([loadCore(), loadTrees()]);
});

describe('#886 科技树身份与缺列', () => {
  it('布局常量与画布高度保持不变', () => {
    expect(TW).toBe(52);
    expect(TH).toBe(56);
    expect(HD).toBe(74);
    expect(LW).toBe(60);
    const layout = layoutTree(trees, 'Franks', null, () => true);
    expect(layout.H).toBe(HD + 7 * TH);
  });

  it('单位和科技按目录 type，建筑按官方名单，空 type 不加标志', () => {
    expect(treeNodeIdentity('u', 281, core.unitById[281]!.type)).toEqual({ group: 'unique', label: '独特单位' });
    expect(treeNodeIdentity('t', 1452, core.techById[1452]!.type)).toEqual({ group: 'regional', label: '区域科技' });
    expect(treeNodeIdentity('u', 2700, 'RegionalUnit')).toEqual({ group: 'regional', label: '区域单位' });
    expect(treeNodeIdentity('u', 2701, 'RegionalUnit')).toEqual({ group: 'regional', label: '区域单位' });
    expect(treeNodeIdentity('u', 691, core.unitById[691]!.type)).toBeNull();
    expect(treeNodeIdentity('t', 3, '')).toBeNull();
    expect(treeNodeIdentity('b', 1189, null)).toEqual({ group: 'unique', label: '独特建筑' });
    expect(treeNodeIdentity('b', 1021, null)).toEqual({ group: 'unique', label: '独特建筑' });
    expect(treeNodeIdentity('b', 1806, null)).toEqual({ group: 'regional', label: '区域建筑' });
    expect(treeNodeIdentity('b', 2556, null)).toEqual({ group: 'regional', label: '区域建筑' });
    expect(treeNodeIdentity('b', 12, 'military')).toBeNull();
    expect(treeNodeIdentity('b', 12, null)).toBeNull();
    expect(treeNodeIdentity('u', 74, 'UniqueTech')).toBeNull();
  });

  it('区域建筑不按文明数量当成独特', () => {
    for (const id of [1754, 1806, 1808, 1889, 2556]) {
      const building = core.buildingById[id]!;
      expect(isUniqueBuilding(building)).toBe(true);
      expect(buildingMark(id)).toBe('regional');
      expect(building.civs.length).toBeLessThanOrEqual(4);
    }
    expect(buildingMark(1251)).toBe('unique');
    expect(isUniqueBuilding(core.buildingById[12]!)).toBe(false);
    expect(buildingMark(12)).toBeNull();
  });

  it('缺列按当前树文明和已出现的建筑推导，不写死座数', () => {
    const idsOf = (civ: string) => offColumnSpecialBuildings(civ, core.buildings, trees.t[civ]).map((b) => b.id);
    expect(idsOf('Portuguese')).toEqual([1021]);
    expect(idsOf('Hindustanis')).toEqual([1754]);
    expect(idsOf('Persians')).toEqual([1754]);
    expect(idsOf('Khitans')).toEqual([1889]);
    expect(idsOf('Malay')).toEqual([]);
    expect(idsOf('Franks')).toEqual([]);
    expect(idsOf('Armenians')).toEqual([]);
    expect(idsOf('Incas')).toEqual([]);
    expect(treePresentBuildingIds(trees.t.Malay).has(1189)).toBe(true);

    for (const civ of Object.keys(trees.t)) {
      const blocks = trees.t[civ];
      const present = treePresentBuildingIds(blocks);
      for (const building of offColumnSpecialBuildings(civ, core.buildings, blocks)) {
        expect(present.has(building.id)).toBe(false);
        expect(buildingMark(building.id)).not.toBeNull();
        expect(building.civs).toContain(civ);
      }
    }

    const promoted: TreeBlock[] = [[1021, 0, 1, []], ...(trees.t.Portuguese ?? [])];
    expect(offColumnSpecialBuildings('Portuguese', core.buildings, promoted).some((b) => b.id === 1021)).toBe(false);
  });

  it('定位列跟源数据顺序，不含缺列建筑', () => {
    const incas = layoutTree(trees, 'Incas', null, () => true);
    expect(incas.buildings.map((b) => b.bid)).toEqual((trees.t.Incas ?? []).map((block) => block[0]));
    const ids = incas.buildings.map((b) => b.bid);
    expect(ids).toContain(2556);
    for (const missing of [101, 562, 584, 68, 1021, 1754, 1889]) expect(ids).not.toContain(missing);
  });

  it('滚动位置让出时代标签，右侧停在最大 scrollLeft', () => {
    expect(jumpScrollLeft(400, 2000)).toBe(344);
    expect(jumpScrollLeft(40, 2000)).toBe(0);
    expect(jumpScrollLeft(5000, 800)).toBe(800);
    expect(jumpScrollLeft(10, 0)).toBe(0);
  });
});
