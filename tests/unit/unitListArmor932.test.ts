import { describe, expect, it } from 'vitest';
import { buildFamilies } from '../../src/domain/family';
import { filterUnitFamilies, type UnitFilters } from '../../src/domain/unitFilters';
import { formatCatalogStat } from '../../src/features/units/catalogStat';
import { projectUnitDisplayAges } from '../../src/features/units/displayAge';
import { units } from './helpers';

const byId = Object.fromEntries(units.map((unit) => [unit.id, unit]));
const families = buildFamilies(units, byId);
const filters = (overrides: Partial<UnitFilters> = {}): UnitFilters => ({ query: '', type: '', age: '', dlc: '', ...overrides });
const select = (overrides: Partial<UnitFilters> = {}) => filterUnitFamilies(projectUnitDisplayAges(units, overrides.civ ?? ''), families, filters(overrides));

describe('#932 单位列表护甲', () => {
  it('有限数字原样显示，0 和负数保留，非有限显示横线', () => {
    expect(formatCatalogStat(0)).toBe('0');
    expect(formatCatalogStat(-3)).toBe('-3');
    expect(formatCatalogStat(195)).toBe('195');
    expect(formatCatalogStat(Number.NaN)).toBe('—');
    expect(formatCatalogStat(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatCatalogStat(Number.NEGATIVE_INFINITY)).toBe('—');
    const ram = byId[1258]!;
    const siegeRam = byId[548]!;
    expect(ram.ma).toBeLessThan(0);
    expect(siegeRam.pa).toBeGreaterThanOrEqual(100);
    expect(formatCatalogStat(ram.ma)).toBe(String(ram.ma));
    expect(formatCatalogStat(siegeRam.pa)).toBe(String(siegeRam.pa));
  });

  it('民兵近战护甲为 0，与同一代表记录的生命和攻击同源', () => {
    const militia = byId[74]!;
    expect(militia.zh).toBe('民兵');
    expect(militia.ma).toBe(0);
    const row = select().find((entry) => entry.u.id === 74);
    expect(row?.u).toMatchObject({ hp: militia.hp, atk: militia.atk, ma: 0, pa: militia.pa, rng: militia.rng });
    expect(formatCatalogStat(row!.u.ma)).toBe('0');
    expect(formatCatalogStat(row!.u.pa)).toBe(String(militia.pa));
  });

  it('护甲与生命、攻击、射程取同一代表记录', () => {
    for (const { query, id } of [
      { query: '蒙古突骑', id: 11 },
      { query: '精锐蒙古突骑', id: 561 },
      { query: '游侠', id: 569 },
    ]) {
      const [row] = select({ query });
      const source = byId[id]!;
      expect(row?.u.id).toBe(id);
      expect(row?.u).toMatchObject({ hp: source.hp, atk: source.atk, ma: source.ma, pa: source.pa, rng: source.rng });
    }
    expect(byId[11]!.ma).not.toBe(byId[561]!.ma);
  });

  it('选文明或时代后护甲仍是目录基础值', () => {
    for (const civ of ['', 'Teutons', 'Britons', 'Armenians']) {
      for (const age of ['', '1', '2', '3', '4']) {
        for (const row of select({ civ, age })) {
          const source = byId[row.u.id]!;
          expect(row.u.ma).toBe(source.ma);
          expect(row.u.pa).toBe(source.pa);
        }
      }
    }
  });

  it('骑士升级线仍分列，巨型投石机不拆两态，护甲词不进搜索', () => {
    const rows = select();
    expect([38, 283, 569].map((id) => rows.find((row) => row.u.id === id)?.u.pa)).toEqual([38, 283, 569].map((id) => byId[id]!.pa));
    const trebuchets = rows.filter((row) => row.u.zh === '巨型投石机');
    expect(trebuchets.map((row) => row.u.id)).toEqual([331]);
    expect(trebuchets[0]!.u).toMatchObject({ ma: byId[331]!.ma, pa: byId[331]!.pa });
    expect(select({ query: '近战护甲' })).toEqual([]);
    expect(select({ query: '远程护甲' })).toEqual([]);
  });
});
