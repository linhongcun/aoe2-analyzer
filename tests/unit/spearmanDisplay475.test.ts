import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCore, type Core } from '../../src/data';
import { filterUnitFamilies, type UnitFilters } from '../../src/domain/unitFilters';
import UnitList from '../../src/features/units/components/UnitList';
import { projectUnitDisplayAges, unitDisplayAge } from '../../src/features/units/displayAge';

const state = vi.hoisted(() => ({ core: null as Core | null, sticky: {} as Record<string, string> }));
vi.mock('../../src/data/hooks', () => ({ useCore: () => state.core }));
vi.mock('../../src/shared/utils/sticky', async (original) => ({
  ...(await original<typeof import('../../src/shared/utils/sticky')>()),
  useSticky: <T>(key: string, initial: T) => [state.sticky[key] ?? initial, vi.fn()],
}));

// Keep the real UnitList, family indexes and filter implementation. Only provide
// already-loaded real core data and the user's current filter controls.
const render = () => renderToStaticMarkup(createElement(StaticRouter, { location: '/units' }, createElement(UnitList)));
const card = (html: string, id: number) => html.match(new RegExp(`<a\\b[^>]*\\bdata-unit-id="${id}"[^>]*>([\\s\\S]*?)<\\/a>`))?.[1];
const filters = (age: string, civ = ''): UnitFilters => ({ query: '', type: '', age, dlc: '', civ, role: '' });

beforeAll(async () => {
  state.core = await loadCore();
  for (const unit of state.core.units) Object.freeze(unit);
  Object.freeze(state.core.units);
});
beforeEach(() => {
  state.sticky = {};
});

describe('#475 长矛兵的真实列表展示与原筛选流程', () => {
  it.each(['', 'Franks', 'Britons'])('%s 通用口径在封建显示长矛兵，黑暗筛选排除', (civ) => {
    state.sticky = { 'u.q': 'Spearman', 'u.civ': civ, 'u.a': '2' };
    const spear = card(render(), 93);
    expect(spear).toBeDefined();
    expect(spear).toContain('封建时代');
    state.sticky['u.a'] = '1';
    expect(card(render(), 93)).toBeUndefined();
  });

  it('亚美尼亚的真实卡片显示黑暗，封建筛选排除', () => {
    state.sticky = { 'u.q': 'Spearman', 'u.civ': 'Armenians', 'u.a': '1' };
    expect(card(render(), 93)).toContain('黑暗时代');
    state.sticky['u.a'] = '2';
    expect(card(render(), 93)).toBeUndefined();
  });

  it('长枪兵358的真实卡片及时代筛选仍为城堡', () => {
    state.sticky = { 'u.q': 'Pikeman', 'u.a': '3' };
    expect(card(render(), 358)).toContain('城堡时代');
    state.sticky['u.a'] = '2';
    expect(card(render(), 358)).toBeUndefined();
    expect(state.core!.unitById[358]!.age).toBe(3);
  });

  it('西西里城楼形态1786保留原封建数据与原family筛选行为', () => {
    const alternate = state.core!.unitById[1786]!;
    expect(alternate.age).toBe(2);
    expect(filterUnitFamilies([alternate], state.core!.fam, filters('2', 'Sicilians'))).toEqual([{ u: alternate }]);
    expect(filterUnitFamilies([alternate], state.core!.fam, filters('1', 'Sicilians'))).toEqual([]);
  });

  it('反复展示不同文明不修改冻结的原始单位或共享family引用', () => {
    const core = state.core!;
    const before = JSON.stringify(core.units);
    for (const civ of ['', 'Franks', 'Armenians', 'Sicilians']) {
      state.sticky = { 'u.civ': civ };
      expect(card(render(), 93)).toBeDefined();
    }
    expect(core.unitById[93]!.age).toBe(1);
    expect(core.unitById[1786]!.age).toBe(2);
    expect(JSON.stringify(core.units)).toBe(before);
    for (const unit of [...Object.values(core.fam.baseOf), ...Object.values(core.fam.eliteOf)]) expect(core.unitById[unit.id]).toBe(unit);
  });

  it('局部投影只复制93例外，原family筛选返回的代表和精锐均来自展示输入', () => {
    const core = state.core!;
    const projected = projectUnitDisplayAges(core.units);
    expect(projected.map((unit) => unit.id)).toEqual(core.units.map((unit) => unit.id));
    for (const [index, unit] of projected.entries()) {
      const original = core.units[index]!;
      if (unit.id === 93) {
        expect(unit).not.toBe(original);
        expect(unit).toEqual({ ...original, age: 2 });
      } else expect(unit).toBe(original);
    }
    const inputs = new Set(projected);
    const filtered = filterUnitFamilies(projected, core.fam, filters('2'));
    expect(filtered.find(({ u }) => u.id === 93)!.u).toBe(projected.find((unit) => unit.id === 93));
    for (const entry of filtered) {
      expect(inputs.has(entry.u)).toBe(true);
      if (entry.elite) expect(inputs.has(entry.elite)).toBe(true);
    }
    expect(projectUnitDisplayAges(core.units, 'Armenians').every((unit, index) => unit === core.units[index])).toBe(true);
    expect(unitDisplayAge(core.unitById[358]!, 'Armenians')).toBe(3);
    expect(unitDisplayAge(core.unitById[1786]!, 'Armenians')).toBe(2);
    expect(core.unitById[93]!.age).toBe(1);
  });
});
