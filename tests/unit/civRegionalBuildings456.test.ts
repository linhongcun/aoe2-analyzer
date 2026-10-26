import { describe, expect, it } from 'vitest';
import { regionalBuildings } from '../../src/domain/civBuildings';
import buildings from '../../src/data/raw/buildings';
import civs from '../../src/data/raw/civs';
import { trees } from './helpers';

// All 56 pinned upstream trees were audited, including empty-grid regional buildings
// omitted from the local trees.json: Caravanserai and Pasture.
const owners: Record<string, number[]> = {
  Armenians: [1806, 1808],
  Georgians: [1806, 1808],
  Hindustanis: [1754],
  Persians: [1754],
  Khitans: [1889],
  Incas: [2556],
  Mapuche: [2556],
  Muisca: [2556],
  Tupi: [2556],
};
const ids = (civ: string) =>
  regionalBuildings(civ, buildings)
    .map((b) => b.id)
    .sort((a, b) => a - b);

describe('#456 文明区域建筑', () => {
  it.each(civs.map((c) => c.en))('%s 符合固定上游区域分类与实际可用性', (civ) => {
    expect(ids(civ)).toEqual(owners[civ] ?? []);
    for (const id of [1806, 1808, 2556]) expect(ids(civ).includes(id)).toBe((trees.t[civ] ?? []).some((column) => column[0] === id));
  });

  it('只按源分类识别：单文明牧场仍是区域建筑，独特/通用建筑不会混入', () => {
    expect(ids('Khitans')).toEqual([1889]);
    const all = new Set(civs.flatMap((c) => ids(c.en)));
    expect([...all].sort((a, b) => a - b)).toEqual([1754, 1806, 1808, 1889, 2556]);
    for (const id of [1021, 1189, 1251, 1665, 1734, 236, 101, 109]) expect(all.has(id)).toBe(false);
  });

  it('分类身份与可用性独立，读取传入数据的文明归属', () => {
    const church = buildings.find((b) => b.id === 1806)!;
    const changed = [{ ...church, civs: ['Persians'] }];
    expect(regionalBuildings('Armenians', changed)).toEqual([]);
    expect(regionalBuildings('Persians', changed)).toEqual(changed);
    expect(regionalBuildings('Persians', [{ ...church, civs: [] }])).toEqual([]);
  });

  it('缺少区域记录、未知文明或空目录返回空列表', () => {
    expect(ids('unknown-civ')).toEqual([]);
    expect(regionalBuildings('Armenians', [])).toEqual([]);
    expect(
      regionalBuildings(
        'Armenians',
        buildings.filter((b) => ![1806, 1808].includes(b.id)),
      ),
    ).toEqual([]);
  });

  it('查询只读，保留原建筑对象和目录顺序', () => {
    const list = Object.freeze([...buildings]);
    const before = [...list];
    const found = regionalBuildings('Armenians', list);
    expect(found.map((b) => b.id)).toEqual([1808, 1806]);
    for (const b of found) expect(list.find((v) => v.id === b.id)).toBe(b);
    expect(list).toEqual(before);
  });
});
