import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadCore, loadTrees, type Core } from '../../src/data';
import type { Trees } from '../../src/domain/types';
import UnitDetail from '../../src/features/units/components/UnitDetail';

const state = vi.hoisted(() => ({ core: null as Core | null, trees: null as Trees | null }));
vi.mock('../../src/shared/utils/useCoreTrees', () => ({
  useCoreTrees: () => ({ core: { data: state.core, error: false }, trees: { data: state.trees, error: false } }),
}));
const render = (id = 280) => renderToStaticMarkup(createElement(StaticRouter, { location: `/unit/${id}` }, createElement(UnitDetail)));
const visible = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const section = (html: string) => {
  const found = html.match(/<section[^>]*aria-label="溅射与最小射程"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  expect(found, '真实单位页应有表外溅射说明').toBeDefined();
  return found ?? '';
};
const field = (html: string, name: string) => {
  const found = section(html).match(new RegExp(`<dd[^>]*data-splash-field="${name}"[^>]*>([\\s\\S]*?)<\\/dd>`))?.[1];
  expect(found).toBeDefined();
  return visible(found ?? '');
};
const desc = (html: string) => (html.match(/<p class="desc">([\s\S]*?)<\/p>/)?.[1] ?? '').replace(/<br\s*\/?\s*>/g, '\n').replace(/<[^>]*>/g, '');
function changed(id: number, patch: Record<string, unknown>, check: (html: string) => void) {
  const original = state.core!;
  const map = { ...original.unitById, [id]: { ...original.unitById[id]!, ...patch } };
  const before = structuredClone(map);
  state.core = { ...original, unitById: map };
  try {
    check(render(id));
    expect(map).toEqual(before);
  } finally {
    state.core = original;
  }
}
beforeAll(async () => {
  state.core = await loadCore();
  state.trees = await loadTrees();
});

describe('#712 半径语义与局部说明', () => {
  it.each([
    [280, '1'],
    [550, '1.25'],
    [588, '1.5'],
  ])('真实%i字段独立呈现且保有义链接', (id, radius) => {
    const before = structuredClone(state.core!.unitById);
    const html = render(Number(id));
    expect(state.core!.unitById).toEqual(before);
    expect(field(html, 'radius')).toBe(radius);
    expect(field(html, 'minimum')).toBe('3');
    const text = visible(section(html));
    for (const phrase of ['落点周围的溅射半径', '单位（是否以格计）待确认', '满伤区与边缘伤害/衰减待确认', '攻击者至瞄准点的发射限制', '不是免伤圈'])
      expect(text).toContain(phrase);
    const description = desc(html);
    expect(description).not.toMatch(/\([ \t]*\)|（[ \t]*）/);
    for (const name of ['大学', '修道院', ...(id === 588 ? [] : ['攻城武器厂'])]) {
      expect(description).toContain(`(${name})`);
      const building = state.core!.buildings.find((b) => b.zh === name)!;
      expect(html.match(/<p class="desc">([\s\S]*?)<\/p>/)?.[1]).toContain(`href="/building/${building.id}"`);
    }
  });
  it('两个字段扰动随输入变化且不改来源', () =>
    changed(280, { blast: 2.75, minr: 5 }, (html) => {
      expect(field(html, 'radius')).toBe('2.75');
      expect(field(html, 'minimum')).toBe('5');
    }));
  it.each([0, -1, undefined, NaN, Infinity])('半径%j待确认，不掩盖已知minr', (value) =>
    changed(280, { blast: value }, (html) => {
      expect(field(html, 'radius')).toBe('数据待确认');
      expect(field(html, 'minimum')).toBe('3');
    }),
  );
  it.each([-1, undefined, NaN, Infinity])('最小射程%j独立待确认，不掩盖已知半径', (value) =>
    changed(280, { minr: value }, (html) => {
      expect(field(html, 'minimum')).toBe('数据待确认');
      expect(field(html, 'radius')).toBe('1');
    }),
  );
  it('合法最小射程0仍是已知值', () => changed(280, { minr: 0 }, (html) => expect(field(html, 'minimum')).toBe('0')));
  it.each([
    ['甲 () 乙', '甲 乙'],
    ['甲\n ()\n乙', '甲\n\n乙'],
    ['甲 （ ） 乙', '甲 乙'],
    ['甲\t()\t（）\t乙', '甲 乙'],
    ['甲 (大学)\n（修道院）  乙', '甲 (大学)\n（修道院）  乙'],
    ['甲 (） 乙', '甲 (） 乙'],
    ['甲 (\n) 乙', '甲 (\n) 乙'],
    ['甲 （\n） 乙', '甲 （\n） 乙'],
  ])('只清平衡空括号%j，保分段与有义内容', (input, expected) => changed(280, { desc: input }, (html) => expect(desc(html)).toBe(expected)));
  it('非目标源说明原样，331既有视图修正仍在', () => {
    changed(38, { desc: '甲 ()\n（ ） (大学) 乙' }, (html) => {
      expect(desc(html)).toBe('甲 ()\n（ ） (大学) 乙');
      expect(html).not.toContain('aria-label="溅射与最小射程"');
    });
    expect(desc(render(331))).toContain('打包后可移动，展开后可攻击');
    expect(state.core!.unitById[331]!.desc).toContain('组装后才能移动，拆装后即可攻击');
  });
});
