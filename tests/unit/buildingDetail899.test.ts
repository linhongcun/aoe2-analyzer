import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import buildings from '../../src/data/buildings.json';
import {
  applyCatalogView,
  buildingCiv,
  buildingConstructionEntry,
  buildingHasAttack,
  buildingIdentityMark,
  buildingSurface,
  catalogGroup,
  catalogQueryMatch,
  patchBuildingSearch,
  productionEntries,
  rowMembership,
} from '../../src/domain/buildingDetailView';
import { decodeConstruction } from '../../src/domain/construction';
import { buildFamilies } from '../../src/domain/family';
import { units } from './helpers';

const byId = Object.fromEntries(units.map((unit) => [unit.id, unit]));
const families = buildFamilies(units, byId);
const building = (id: number) => buildings.find((item) => item.id === id)!;
const produced = (id: number) =>
  productionEntries(
    building(id)
      .units.map((unitId) => byId[unitId]!)
      .filter(Boolean),
    families,
  );

describe('建筑详情视图（#899）', () => {
  it('有效文明才算选中，仅有文明参数仍停在概览', () => {
    const owners = building(1251).civs;
    expect(owners).toEqual(['Bulgarians']);
    expect(buildingCiv(null, owners)).toBeNull();
    expect(buildingCiv('Franks', owners)).toBeNull();
    expect(buildingCiv('Bulgarians', owners)).toBe('Bulgarians');
    expect(buildingSurface(null, true)).toEqual({ surface: 'overview', anchor: null });
    expect(buildingSurface('ov', true)).toEqual({ surface: 'overview', anchor: null });
    expect(buildingSurface('sim', false)).toEqual({ surface: 'sim', anchor: null });
    expect(buildingSurface('garrison', true)).toEqual({ surface: 'garrison', anchor: null });
    expect(buildingSurface('garrison', false)).toEqual({ surface: 'overview', anchor: null });
    for (const tab of ['prod', 'tech', 'civs', 'history'] as const) expect(buildingSurface(tab, true)).toEqual({ surface: 'overview', anchor: tab });
  });

  it('切换工作区或文明时保留时代、科技和对照', () => {
    expect(patchBuildingSearch('?age=2&techs=437&cmp=Franks&tab=ov', { tab: 'sim', civ: 'Britons' })).toBe('?age=2&techs=437&cmp=Franks&tab=sim&civ=Britons');
    expect(patchBuildingSearch('?civ=Franks&age=4&techs=1&cmp=Britons&tab=sim', { tab: 'ov' })).toBe('?civ=Franks&age=4&techs=1&cmp=Britons&tab=ov');
    expect(patchBuildingSearch('?civ=Nope&age=3&techs=1&cmp=Britons', { civ: null })).toBe('?age=3&techs=1&cmp=Britons');
  });

  it('攻击组看能力，不因单独一格为 0 整组消失', () => {
    const barracks = building(12);
    const center = building(109);
    const donjon = building(1665);
    expect(buildingHasAttack(barracks)).toBe(false);
    expect(center.minr).toBe(0);
    expect(buildingHasAttack(center)).toBe(true);
    expect(donjon.atk).toBe(0);
    expect(buildingHasAttack(donjon)).toBe(true);
    expect(barracks.ma).toBe(0);
    expect(barracks.hp).toBeGreaterThan(0);
  });

  it('独特和区域只认官方建筑名单', () => {
    expect(buildingIdentityMark(82)).toBeNull();
    expect(buildingIdentityMark(84)).toBeNull();
    expect(buildingIdentityMark(87)).toBeNull();
    expect(buildingIdentityMark(1251)).toBe('独特建筑');
    expect(buildingIdentityMark(1754)).toBe('区域建筑');
    expect(building(1251).civs.length).toBeLessThanOrEqual(4);
    expect(building(82).civs.length).toBeGreaterThan(4);
  });

  it('未选文明不生成带默认文明的完整施工链接', () => {
    expect(buildingConstructionEntry(82, 3, null)).toBeNull();
    const href = buildingConstructionEntry(82, 3, 'Franks');
    const decoded = decodeConstruction('?' + href!.slice(href!.indexOf('?') + 1));
    expect(decoded.errors).toEqual([]);
    expect(decoded.config).toMatchObject({
      buildingId: 82,
      civ: 'Franks',
      age: 3,
      techs: [],
      builders: '4',
      baseline: '1',
      hasTownCenter: true,
      task: '',
      walk: '3',
      farm: '0',
    });
    expect(href).not.toContain('civ=Armenians');
  });

  it('生产先合并精锐再按英文名去重，研究不走这套合并', () => {
    const castle = building(82);
    const rows = produced(82);
    expect(castle.units).toHaveLength(118);
    expect(rows.length).toBeLessThan(118);
    expect(rows.filter((row) => row.u.en === 'Kipchak' || row.elite?.en === 'Elite Kipchak')).toHaveLength(1);
    expect(rows.some((row) => row.elite)).toBe(true);
    const range = building(87);
    expect(produced(87).length).toBeLessThan(range.units.length);
    expect(range.techs).toHaveLength(3);
    expect(catalogGroup('RegionalTech')).toBe('regional');
    expect(catalogGroup('UniqueTech')).toBe('unique');
    expect(catalogGroup('Research')).toBe('common');
  });

  it('目录三态和当前显示分开，未知不混进含有结果', () => {
    expect(rowMembership([['Franks']], null)).toBeNull();
    expect(rowMembership([['Franks', 'Britons']], 'Franks')).toBe('in');
    expect(rowMembership([['Britons']], 'Franks')).toBe('out');
    expect(rowMembership([undefined], 'Franks')).toBe('unknown');
    expect(rowMembership([['Franks'], ['Britons']], 'Franks')).toBe('unknown');
    const rows = [
      { id: 'in', membership: 'in' as const, match: true },
      { id: 'out', membership: 'out' as const, match: true },
      { id: 'unknown', membership: 'unknown' as const, match: true },
      { id: 'hidden', membership: 'in' as const, match: false },
    ];
    expect(applyCatalogView(rows, false)).toMatchObject({
      union: 4,
      shown: [rows[0], rows[1], rows[2]],
      unknown: [],
    });
    const contained = applyCatalogView(rows, true);
    expect(contained.union).toBe(4);
    expect(contained.shown.map((row) => row.id)).toEqual(['in']);
    expect(contained.unknown.map((row) => row.id)).toEqual(['unknown']);
    const archer = units.find((unit) => unit.en === 'Cavalry Archer')!;
    expect(catalogQueryMatch([archer], '骑射')).toBe(true);
    expect(catalogQueryMatch([archer], 'qishe')).toBe(true);
    expect(catalogQueryMatch([archer], '房屋')).toBe(false);
  });

  it('建筑详情不调用单位训练折后价，也不把暂未计算写成结果', () => {
    const detail = readFileSync('src/features/buildings/components/BuildingDetail.tsx', 'utf8');
    const simulator = readFileSync('src/features/buildings/components/BuildingSimulator.tsx', 'utf8');
    expect(detail).not.toMatch(/discountedCost|costDiscount/);
    expect(detail).not.toMatch(/civs\.length\s*<=\s*4/);
    expect(detail + simulator).not.toContain('暂未计算');
    expect(simulator).not.toContain('b.civs[0]');
  });
});
