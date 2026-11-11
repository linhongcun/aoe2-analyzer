import { describe, expect, it } from 'vitest';
import { buildFamilies, collapse } from '../../src/domain/family';
import { filterUnitFamilies, unitMatches, unitQueryMatches, type UnitFilters } from '../../src/domain/unitFilters';
import { unitRoles } from '../../src/domain/unitRoles';
import type { Unit } from '../../src/domain/types';
import { projectUnitDisplayAges } from '../../src/features/units/displayAge';
import { units } from './helpers';

const byId = Object.fromEntries(units.map((u) => [u.id, u]));
const families = buildFamilies(units, byId);
const filters = (overrides: Partial<UnitFilters> = {}): UnitFilters => ({ query: '', type: '', age: '', dlc: '', ...overrides });
const select = (overrides: Partial<UnitFilters>) => filterUnitFamilies(units, families, filters(overrides));
const ids = (overrides: Partial<UnitFilters>) => select(overrides).map(({ u }) => u.id);

describe('#879 单位目录搜索与系列口径', () => {
  it('默认仍是 163 个系列，顺序与合并结果一致', () => {
    expect(select({})).toEqual(collapse(units, families));
    expect(select({})).toHaveLength(163);
  });

  it('骑兵仍是 57 个系列，并保留战车等交叉结果', () => {
    const cavalry = select({ role: 'cavalry' });
    expect(cavalry).toHaveLength(57);
    expect(cavalry.some(({ u }) => u.zh.includes('战车'))).toBe(true);
    expect(cavalry.every(({ u }) => unitRoles(u).includes('cavalry'))).toBe(true);
  });

  it.each(['蒙古突骑', 'menggutuqi', 'menggu tuqi', 'MENGGU TUQI', 'mgtq'])('%s 命中普通蒙古突骑且标出精锐', (query) => {
    expect(select({ query })).toEqual([{ u: byId[11], elite: byId[561] }]);
  });

  it('精锐蒙古突骑只展示精锐记录', () => {
    expect(select({ query: '精锐蒙古突骑' })).toEqual([{ u: byId[561] }]);
  });

  it('tuqi 不是拼音前缀，不必命中', () => {
    expect(select({ query: 'tuqi' })).toEqual([]);
    expect(unitQueryMatches(byId[11]!, 'tuqi')).toBe(false);
  });

  it('圣骑士走已收录别名，命中游侠', () => {
    expect(ids({ query: '圣骑士' })).toEqual([569]);
    expect(byId[569]!.zh).toBe('游侠');
  });

  it('选中文明不改目录基础值', () => {
    const [row] = select({ civ: 'Mongols', query: '蒙古突骑' });
    expect(row).toEqual({ u: byId[11], elite: byId[561] });
    const shown = projectUnitDisplayAges(units, 'Mongols').find((unit) => unit.id === 11)!;
    expect(shown.hp).toBe(byId[11]!.hp);
    expect(shown.atk).toBe(byId[11]!.atk);
    expect(shown.ma).toBe(byId[11]!.ma);
    expect(shown.pa).toBe(byId[11]!.pa);
    expect(shown.rng).toBe(byId[11]!.rng);
    expect(shown.cost).toEqual(byId[11]!.cost);
  });

  it('v 与 u 等价，护甲类别词不参与目录搜索', () => {
    const base = units[0]!;
    const renamed = { ...base, id: 1, zh: '不存在的名字', en: 'Nope', py: 'nv', pyi: 'n', armc: [['独有护甲词', 0]] as Unit['armc'] };
    expect(unitMatches(renamed, filters({ query: 'nu' }))).toBe(true);
    expect(unitMatches(renamed, filters({ query: '独有护甲词' }))).toBe(false);
  });
});
