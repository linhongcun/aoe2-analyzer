import { describe, expect, it } from 'vitest';
import { uniqueBuildings, regionalBuildings } from '../../src/domain/civBuildings';
import buildings from '../../src/data/raw/buildings';
import civs from '../../src/data/raw/civs';
import { trees } from './helpers';

const owners: Record<string, number[]> = { Portuguese: [1021], Malay: [1189], Bulgarians: [1251], Sicilians: [1665], Poles: [1734] };
const ids = (civ: string) => uniqueBuildings(civ, buildings).map((b) => b.id);

describe('#463 文明独特建筑', () => {
  it.each(civs.map((c) => c.en))('%s 符合固定上游分类与可用性', (civ) => {
    expect(ids(civ)).toEqual(owners[civ] ?? []);
    for (const id of [1251, 1665, 1734]) expect(ids(civ).includes(id)).toBe((trees.t[civ] ?? []).some((column) => column[0] === id));
    const harbor = (trees.t[civ] ?? []).some((column) => column[3].some((cell) => cell[2] === 'b' && cell[3] === 1189 && cell[4] === 1));
    expect(ids(civ).includes(1189)).toBe(harbor);
  });
  it('五类独特建筑完整，区域与通用建筑不混入', () => {
    const all = [...new Set(civs.flatMap((c) => ids(c.en)))].sort((a, b) => a - b);
    expect(all).toEqual([1021, 1189, 1251, 1665, 1734]);
    for (const c of civs) {
      const regional = regionalBuildings(c.en, buildings).map((b) => b.id);
      expect(ids(c.en).some((id) => regional.includes(id))).toBe(false);
    }
    expect(ids('Khitans')).toEqual([]);
    expect(regionalBuildings('Khitans', buildings).map((b) => b.id)).toEqual([1889]);
  });
  it('按输入归属筛选，缺失/空目录或未知文明返回空', () => {
    const krepost = buildings.find((b) => b.id === 1251)!;
    const changed = [{ ...krepost, civs: ['Poles'] }];
    expect(uniqueBuildings('Bulgarians', changed)).toEqual([]);
    expect(uniqueBuildings('Poles', changed)).toEqual(changed);
    expect(uniqueBuildings('Bulgarians', [])).toEqual([]);
    expect(ids('unknown-civ')).toEqual([]);
  });
  it('查询只读，保留对象和目录顺序', () => {
    const list = Object.freeze(buildings.map((b) => ({ ...b, civs: ['fixture'] })));
    const before = [...list];
    const found = uniqueBuildings('fixture', list);
    expect(found.map((b) => b.id)).toEqual(list.filter((b) => [1021, 1189, 1251, 1665, 1734].includes(b.id)).map((b) => b.id));
    for (const b of found) expect(list.find((v) => v.id === b.id)).toBe(b);
    expect(list).toEqual(before);
  });
});
