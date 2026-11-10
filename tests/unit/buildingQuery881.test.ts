import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import raw from '../../src/data/buildings.json';
import { buildingDlc, buildingType, isUniqueBuilding } from '../../src/domain/buildings';
import { DLCS } from '../../src/domain/dlc';
import type { Building } from '../../src/domain/types';
import { buildingQueryMatches, filterBuildings, type BuildingFilter } from '../../src/features/buildings/logic/filter';

const bs = (raw as unknown as Omit<Building, 'dlc' | 'type'>[]).map((b) => ({ ...b, dlc: buildingDlc(b), type: buildingType(b.en) })) as Building[];
const filters = (overrides: Partial<BuildingFilter> = {}): BuildingFilter => ({ q: '', age: '', type: '', dlc: '', ...overrides });
const ids = (overrides: Partial<BuildingFilter>) => filterBuildings(bs, filters(overrides)).map((b) => b.id);
const barracks = bs.find((b) => b.id === 12)!;

describe('#881 建筑目录搜索与筛选', () => {
  it('搜索调用仓库 norm / pyMatch，不复制原型函数', () => {
    const src = readFileSync('src/features/buildings/logic/filter.ts', 'utf8');
    expect(src).toContain("from '../../../domain/search'");
    expect(src).toMatch(/\bnorm\(/);
    expect(src).toMatch(/\bpyMatch\(/);
    expect(src).not.toContain('function norm');
    expect(src).not.toContain('function pyMatch');
  });

  it('默认保持源顺序和全部条数，造价仍是原对象', () => {
    const all = filterBuildings(bs, filters());
    expect(all).toEqual(bs);
    expect(all[0]!.cost).toBe(bs[0]!.cost);
  });

  it.each(['兵营', 'bingying', 'bing ying', 'BING YING', 'by'])('%s 只命中兵营', (query) => {
    expect(ids({ q: query })).toEqual([12]);
    expect(buildingQueryMatches(barracks, query)).toBe(true);
  });

  it('拼音只认前缀，v 与 u 等价，未收录别名不参与', () => {
    expect(ids({ q: 'ying' })).not.toContain(12);
    const renamed = { ...barracks, id: -1, zh: '不存在', en: 'Nope', py: 'nv', pyi: 'n' };
    expect(filterBuildings([renamed], filters({ q: 'nu' }))).toEqual([renamed]);
    expect(filterBuildings([renamed], filters({ q: '兵工厂' }))).toEqual([]);
  });

  it('军事、封建和未标注沿用同一条记录，时代精确匹配', () => {
    const military = bs.filter((b) => b.type === 'military');
    expect(filterBuildings(bs, filters({ type: 'military' }))).toEqual(military);
    expect(military).toHaveLength(9);
    const feudal = bs.filter((b) => b.age === 2);
    expect(filterBuildings(bs, filters({ age: '2' }))).toEqual(feudal);
    expect(feudal).toHaveLength(8);
    expect(feudal.some((b) => b.age !== 2)).toBe(false);
    expect(bs.filter((b) => b.dlc == null)).toHaveLength(0);
    expect(filterBuildings(bs, filters({ dlc: 'none' }))).toEqual([]);
    expect(ids({ type: 'military', q: '兵营' })).toEqual([12]);
  });

  it('国王时代仍可筛到，卡片规则不把原版资料片写成国王时代', () => {
    const kings = filterBuildings(bs, filters({ dlc: '0' }));
    expect(kings.length).toBeGreaterThan(0);
    expect(kings.every((b) => b.dlc === 0)).toBe(true);
    const gate = bs.find((b) => b.zh === '木城门')!;
    const donjon = bs.find((b) => b.zh === '城楼')!;
    expect(DLCS[gate.dlc!]?.zh).toBe('失落帝国');
    expect(isUniqueBuilding(donjon)).toBe(true);
    expect(DLCS[donjon.dlc!]?.zh).toBe('西方霸主');
    expect(donjon.civs).toEqual(['Sicilians']);
  });
});
