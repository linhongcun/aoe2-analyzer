import { describe, expect, it } from 'vitest';
import { buildFamilies, collapse } from '../../src/domain/family';
import { filterUnitFamilies, type UnitFilters, unitMatches } from '../../src/domain/unitFilters';
import { unitRoles } from '../../src/domain/unitRoles';
import type { Unit } from '../../src/domain/types';
import { units } from './helpers';

const byId = Object.fromEntries(units.map((u) => [u.id, u]));
const families = buildFamilies(units, byId);
const filters = (overrides: Partial<UnitFilters> = {}): UnitFilters => ({ query: '', type: '', age: '', dlc: '', ...overrides });
const select = (overrides: Partial<UnitFilters>) => filterUnitFamilies(units, families, filters(overrides));

describe('#196 文明与兵种筛选', () => {
  it('无新增条件维持 163 个系列和原有顺序', () => {
    expect(select({ civ: '', role: '' })).toEqual(collapse(units, families));
    expect(select({})).toHaveLength(163);
  });
  it('文明、兵种、搜索、类别、时代、DLC 由同一条记录满足', () => {
    expect(select({ civ: 'Franks', role: 'cavalry', query: 'Knight', type: 'Unit', age: '3', dlc: '0' })).toEqual([{ u: byId[38] }]);
    expect(select({ civ: 'Aztecs', role: 'cavalry', query: 'Knight' })).toEqual([]);
    expect(select({ civ: 'Franks', role: 'infantry', query: 'Knight' })).toEqual([]);
  });
  it('土耳其只能匹配普通掷矛手，不带不可用的精锐标记', () => {
    expect(select({ civ: 'Turks', query: 'Skirmisher' })).toEqual([{ u: byId[7] }]);
    expect(select({ civ: 'Turks', query: 'Elite Skirmisher' })).toEqual([]);
    expect(select({ civ: 'Turks', query: 'Skirmisher', age: '3' })).toEqual([]);
    expect(select({ civ: 'Franks', query: 'Skirmisher', age: '3' })).toEqual([{ u: byId[6] }]);
    expect(select({ civ: 'Franks', query: 'Skirmisher', age: '2' })).toEqual([{ u: byId[7], elite: byId[6] }]);
  });
  it('达罗毗荼战象、蒙古炮舰不展示不可用的精锐版', () => {
    expect(select({ civ: 'Dravidians', query: 'Battle Elephant' })).toEqual([{ u: byId[1132] }]);
    expect(select({ civ: 'Mongols', query: 'Cannon Galleon' })).toEqual([{ u: byId[420] }]);
  });
  it('文明与兵种不能跨普通/精锐/同名生产记录拼接', () => {
    const base = { ...byId[759]!, civs: ['Goths'], cls: [1] };
    const elite = { ...byId[761]!, civs: ['Franks'], cls: [8] };
    const duplicate = { ...byId[41]!, civs: ['Franks'], cls: [1] };
    const list: Unit[] = [base, elite, duplicate];
    const f = buildFamilies(list, Object.fromEntries(list.map((u) => [u.id, u])));
    expect(filterUnitFamilies(list, f, filters({ civ: 'Goths', role: 'cavalry' }))).toEqual([]);
    expect(filterUnitFamilies(list, f, filters({ civ: 'Franks', role: 'cavalry' }))).toEqual([{ u: elite }]);
    expect(filterUnitFamilies(list, f, filters({ civ: 'Franks', role: 'infantry' }))).toEqual([{ u: duplicate }]);
  });
  it('第二条同名精锐仍能按自身文明命中，结果不重复', () => {
    const second = { ...byId[1260]!, civs: ['Franks'] };
    const list = [byId[1231]!, byId[1233]!, second];
    const f = buildFamilies(list, Object.fromEntries(list.map((u) => [u.id, u])));
    expect(filterUnitFamilies(list, f, filters({ civ: 'Franks', role: 'cavalry' }))).toEqual([{ u: second }]);
  });
  it('文明筛选仍区分同中文名不同英文名，不漏多建筑生产记录', () => {
    expect(select({ civ: 'Bengalis', query: '战车' }).map(({ u }) => u.id)).toEqual([1759]);
    expect(select({ civ: 'Shu', query: '战车' }).map(({ u }) => u.id)).toEqual([1962]);
    expect(select({ civ: 'Goths', query: 'Huskarl' })).toHaveLength(1);
  });
  it.each([
    { civ: 'Mongols', role: 'cavalry' },
    { civ: 'Franks', role: 'archer', age: '3' },
    { civ: 'Dravidians', role: 'siege', dlc: '8' },
    { civ: 'Armenians', role: 'monk', type: 'UniqueUnit' },
  ] as const)('每张卡片代表都满足全部条件 %o', (overrides) => {
    const f = filters(overrides);
    const result = select(overrides);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(({ u }) => unitMatches(u, f))).toBe(true);
  });
});

describe('#196 游戏类别边界', () => {
  it.each([
    [11, ['cavalry', 'archer']], // 蒙古突骑
    [1007, ['cavalry', 'archer']], // 骆驼射手，没有骑兵护甲类8
    [873, ['cavalry', 'archer']], // 象弓手
    [1744, ['cavalry', 'siege']], // 铠甲象
    [1962, ['cavalry', 'siege']], // 蜀战车
    [1811, ['infantry', 'monk']], // 战斗牧师
    [775, ['cavalry', 'monk']], // 传教士
    [46, ['archer']], // 火枪兵也有弓手类15
    [13, ['ship']], // 渔船
    [17, ['ship']], // 贸易货船
    [831, ['ship']], // 龟甲船有火药类23，没有弓手类15或攻城类20
    [83, ['other']], // 村民未提供专用兵种护甲类
    [128, ['other']], // 贸易马车
    [440, ['other']], // 爆破者没有攻城类20
    [1263, ['cavalry']], // 烈焰骆驼有村民护甲39，不能据此猜成经济单位
  ] as const)('单位 %i 按原始护甲类别交叉归类', (id, expected) => {
    expect(unitRoles(byId[id]!)).toEqual(expected);
  });
  it('骑射类28独立存在时仍属于骑兵，不要求同时有骑兵类8', () => {
    expect(unitRoles({ ...byId[11]!, cls: [15, 28] })).toEqual(['cavalry', 'archer']);
    expect(unitRoles({ ...byId[11]!, cls: [28] })).toEqual(['cavalry', 'archer']);
  });
  it('不根据名字、生产建筑或对其他类别的攻击加成推断兵种', () => {
    const renamed = { ...byId[38]!, en: 'Villager', zh: '村民', b: 109, bz: '城镇中心', ben: 'Town Center' };
    expect(unitRoles(renamed)).toEqual(['cavalry']);
    expect(unitRoles({ ...byId[38]!, cls: [], atks: [['攻城武器', 999]] })).toEqual(['other']);
  });
  it('全部实际记录都有分类，其他类与具体兵种互斥', () => {
    for (const u of units) {
      const roles = unitRoles(u);
      expect(roles.length).toBeGreaterThan(0);
      if (roles.includes('other')) expect(roles).toEqual(['other']);
    }
  });
});
