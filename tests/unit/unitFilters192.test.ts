import { describe, expect, it } from 'vitest';
import { buildFamilies, collapse } from '../../src/domain/family';
import { filterUnitFamilies, type UnitFilters, unitMatches } from '../../src/domain/unitFilters';
import type { Unit } from '../../src/domain/types';
import { units } from './helpers';

const byId = Object.fromEntries(units.map((u) => [u.id, u]));
const families = buildFamilies(units, byId);
const filters = (overrides: Partial<UnitFilters> = {}): UnitFilters => ({ query: '', type: '', age: '', dlc: '', ...overrides });
const select = (overrides: Partial<UnitFilters>) => filterUnitFamilies(units, families, filters(overrides));

describe('#192 单位筛选选择实际命中的形态', () => {
  it('无筛选仍按既有顺序显示 163 个系列、普通版与含精锐标记', () => {
    expect(select({})).toEqual(collapse(units, families));
    expect(select({})).toHaveLength(163);
  });
  it('帝王时代筛选显示精锐近卫军的真实记录', () => {
    expect(select({ query: '近卫军', age: '4' })).toEqual([{ u: byId[761] }]);
  });
  it.each(['精锐近卫军', 'ELITE HUSKARL'])('精锐名称 %s 搜索显示精锐记录，不再指向普通版', (query) => {
    expect(select({ query })).toEqual([{ u: byId[761] }]);
  });
  it('普通和精锐都命中仍优先普通代表，保持一条系列与精锐可用标记', () => {
    expect(select({ query: '近卫军' })).toEqual([{ u: byId[759], elite: byId[761] }]);
    expect(select({ query: '近卫军', age: '3' })).toEqual([{ u: byId[759], elite: byId[761] }]);
  });
  it('精锐名称与城堡时代不能跨形态拼成命中', () => {
    expect(select({ query: '精锐近卫军', age: '3' })).toEqual([]);
  });
  it('多条件同时满足时保留精锐；类别或 DLC 不符时排除', () => {
    const elite = byId[761]!;
    expect(select({ query: elite.en, age: String(elite.age), type: elite.type, dlc: String(elite.dlc) })).toEqual([{ u: elite }]);
    expect(select({ query: elite.en, type: 'RegionalUnit' })).toEqual([]);
    expect(select({ query: elite.en, dlc: '2' })).toEqual([]);
  });
  it('DLC 0 与未标注分别匹配，不把国王时代视为空值', () => {
    expect(unitMatches(byId[74]!, filters({ dlc: '0' }))).toBe(true);
    expect(unitMatches(byId[74]!, filters({ dlc: 'none' }))).toBe(false);
    expect(unitMatches({ ...byId[74]!, dlc: null }, filters({ dlc: 'none' }))).toBe(true);
  });
  it('DLC、类别、时代不能各自由不同形态提供', () => {
    const base = { ...byId[759]!, dlc: 0 };
    const elite = { ...byId[761]!, dlc: 1 };
    const list = [base, elite];
    const f = buildFamilies(list, Object.fromEntries(list.map((u) => [u.id, u])));
    expect(filterUnitFamilies(list, f, filters({ age: '4', dlc: '0' }))).toEqual([]);
    expect(filterUnitFamilies(list, f, filters({ age: '4', dlc: '1' }))).toEqual([{ u: elite }]);
  });
  it('不会漏掉同名精锐的第二条记录（精锐钦察 1260）', () => {
    // 只改内存中的筛选字段，以覆盖将来同名记录的元数据出现差异的情况。
    const list: Unit[] = [byId[1231]!, byId[1233]!, { ...byId[1260]!, type: 'UnitUpgrade' }];
    const f = buildFamilies(list, Object.fromEntries(list.map((u) => [u.id, u])));
    expect(filterUnitFamilies(list, f, filters({ query: '精锐钦察', type: 'UnitUpgrade' }))).toEqual([{ u: list[2] }]);
    expect(filterUnitFamilies(list, f, filters({ query: '精锐钦察' }))).toEqual([{ u: list[1] }]);
  });
  it('同名生产记录也参与筛选，只有精锐的输入仍可显示', () => {
    const alternate = { ...byId[41]!, type: 'RegionalUnit' };
    const list = [byId[759]!, alternate, byId[761]!, byId[555]!];
    const f = buildFamilies(list, Object.fromEntries(list.map((u) => [u.id, u])));
    expect(filterUnitFamilies(list, f, filters({ type: 'RegionalUnit' }))[0]!.u).toBe(alternate);
    expect(filterUnitFamilies([byId[761]!], families, filters())).toEqual([{ u: byId[761] }]);
    expect(filterUnitFamilies([byId[759]!], families, filters())).toEqual([{ u: byId[759] }]);
  });
  it('独立名称升级路线与同中文名不同英文名维持既有分组', () => {
    expect(select({ query: '战车' }).map(({ u }) => u.id)).toEqual(expect.arrayContaining([1759, 1962]));
    const chariots = units.filter((u) => [1759, 1962].includes(u.id));
    expect(filterUnitFamilies(chariots, families, filters({ query: '战车' }))).toHaveLength(2);
    const knights = units.filter((u) => ['Knight', 'Cavalier', 'Paladin'].includes(u.en));
    expect(filterUnitFamilies(knights, families, filters())).toHaveLength(3);
  });
  it.each([{}, { age: '4' }, { query: '精锐' }, { dlc: '2' }, { type: 'RegionalUnit', age: '3' }])('每张卡片自身满足全部筛选条件 %o', (overrides) => {
    const f = filters(overrides);
    expect(select(overrides).every(({ u }) => unitMatches(u, f))).toBe(true);
  });
});
