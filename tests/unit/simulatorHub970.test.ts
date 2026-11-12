import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SPEARMAN_UNIT_ID } from '../../src/domain/availabilityAge';
import { discountedCost, priceAge } from '../../src/domain/costDiscount';
import { buildFamilies } from '../../src/domain/family';
import { unitRoles } from '../../src/domain/unitRoles';
import { buildingName, simHref, simHubRows, simHubTotal, type SimHubFilters } from '../../src/features/simulator/hubList';
import { units } from './helpers';

const byId = Object.fromEntries(units.map((unit) => [unit.id, unit]));
const families = buildFamilies(units, byId);
const filters = (overrides: Partial<SimHubFilters> = {}): SimHubFilters => ({ query: '', civ: '', role: '', age: '', ...overrides });
const rows = (overrides: Partial<SimHubFilters> = {}) => simHubRows(units, families, filters(overrides));

describe('#970 科技模拟器选单位名单', () => {
  it('总数来自 collapse，并排除没有文明可训练的代表', () => {
    const ghost = { ...byId[SPEARMAN_UNIT_ID]!, id: 999001, en: 'Ghost Spearman', zh: '幽灵长矛', civs: [] as string[] };
    const list = [...units, ghost];
    const fam = buildFamilies(list, Object.fromEntries(list.map((unit) => [unit.id, unit])));
    expect(simHubTotal(list, fam).some((entry) => entry.u.id === ghost.id)).toBe(false);
    expect(simHubTotal(units, families).length).toBeGreaterThan(0);
  });

  it('搜索、文明和兵种沿用目录函数，顺序不按命中重排', () => {
    const total = simHubTotal(units, families).map((entry) => entry.u.id);
    for (const sample of [filters({ query: '战车' }), filters({ query: '圣骑士' }), filters({ civ: 'Franks' }), filters({ role: 'cavalry' })]) {
      const ids = simHubRows(units, families, sample).map((entry) => entry.u.id);
      expect(ids).toEqual(total.filter((id) => ids.includes(id)));
    }
    expect(rows({ query: '圣骑士' }).map((entry) => entry.u.id)).toEqual([569]);
    expect(rows({ query: '精锐蒙古突骑' }).map((entry) => entry.u.id)).toEqual([561]);
    const chariot = rows({ query: '战车', role: 'cavalry' }).find((entry) => entry.u.zh === '战车' && buildingName(entry.u.bz) === '攻城武器厂');
    expect(chariot && unitRoles(byId[chariot.u.id]!).includes('cavalry')).toBe(true);
  });

  it('时代是展示时代的精确匹配，投影不改原单位和造价', () => {
    const spear = byId[SPEARMAN_UNIT_ID]!;
    expect(spear.age).toBe(1);
    const shown = rows({ query: 'Spearman' }).find((entry) => entry.u.id === SPEARMAN_UNIT_ID)!;
    expect(shown.u.age).toBe(2);
    expect(shown.u.cost).toEqual(spear.cost);
    expect(spear.age).toBe(1);
    expect(rows({ query: 'Spearman', age: '2' }).some((entry) => entry.u.id === SPEARMAN_UNIT_ID)).toBe(true);
    expect(rows({ query: 'Spearman', age: '1' }).some((entry) => entry.u.id === SPEARMAN_UNIT_ID)).toBe(false);
    const armenian = rows({ query: 'Spearman', civ: 'Armenians', age: '1' }).find((entry) => entry.u.id === SPEARMAN_UNIT_ID)!;
    expect(armenian.u.age).toBe(1);
    expect(armenian.u.cost).toEqual(spear.cost);
    expect(rows({ query: 'Spearman', civ: 'Armenians', age: '2' }).some((entry) => entry.u.id === SPEARMAN_UNIT_ID)).toBe(false);
  });

  it('选了文明仍用目录造价，不改成折后价', () => {
    const listed = rows({ civ: 'Goths' });
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.every((entry) => entry.u.civs.includes('Goths'))).toBe(true);
    const militia = byId[74]!;
    const shown = listed.find((entry) => entry.u.id === militia.id)!;
    expect(discountedCost(militia, 'Goths', priceAge(militia.age, 1)).cost).not.toEqual(militia.cost);
    expect(shown.u.cost).toEqual(militia.cost);
  });

  it('链接只在选了文明时带英文 civ，不带展示时代', () => {
    expect(simHref(93, '')).toBe('/unit/93?tab=sim');
    expect(simHref(93, 'Armenians')).toBe('/unit/93?tab=sim&civ=Armenians');
    expect(buildingName('攻城\n武器厂')).toBe('攻城武器厂');
    expect(buildingName(undefined)).toBe('—');
  });

  it('页面和样式不写死示意计数，也不调用折后价', () => {
    for (const file of [
      'src/features/simulator/hubList.ts',
      'src/features/simulator/components/SimulatorHub.tsx',
      'src/features/simulator/components/simhub.css',
    ]) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/\b(?:82|39|163)\b/);
      expect(source).not.toContain('discountedCost');
    }
  });
});
