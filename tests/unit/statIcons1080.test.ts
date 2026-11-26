import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadCore, type Core } from '../../src/data';
import { mainAttackType } from '../../src/domain/duel';
import type { Unit } from '../../src/domain/types';
import BuildingDetail from '../../src/features/buildings/components/BuildingDetail';
import UnitList from '../../src/features/units/components/UnitList';
import { CatalogStats } from '../../src/features/units/components/unitDetailParts';

const state = vi.hoisted(() => ({ core: null as Core | null }));
vi.mock('../../src/data/hooks', async (original) => ({
  ...(await original<typeof import('../../src/data/hooks')>()),
  useCore: () => state.core,
}));

beforeAll(async () => {
  state.core = await loadCore();
});

function at(path: string, element: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(
    createElement(
      StaticRouter,
      { location: path },
      createElement(Routes, null, createElement(Route, { path: '/building/:id', element }), createElement(Route, { path: '/units', element })),
    ),
  );
}

function stats(unit: Unit, base = unit, elite = false) {
  return renderToStaticMarkup(createElement(CatalogStats, { u: unit, base, elite }));
}

function tile(html: string, stat: string) {
  const start = html.indexOf(`data-stat="${stat}"`);
  expect(start).toBeGreaterThan(-1);
  const next = html.indexOf('data-stat=', start + 1);
  return html.slice(start, next < 0 ? undefined : next);
}

function icon(html: string) {
  const svg = html.match(/<svg[^>]*>.*?<\/svg>/s)?.[0];
  expect(svg).toContain('aria-hidden="true"');
  expect(svg).not.toMatch(/tabindex|<title|onClick/i);
  return svg!;
}

describe('Issue 1080 局部属性图形与术语', () => {
  it.each([4, 74, 331])('单位 %i 保留固定字段与零值，不同属性使用不同 SVG', (id) => {
    const unit = state.core!.unitById[id]!;
    const html = stats(unit);
    const icons: string[] = [];
    for (const stat of ['ma', 'pa', 'atk', 'rng'] as const) {
      const part = tile(html, stat);
      expect(part).toContain(`<span class="num nw">${unit[stat]}</span>`);
      icons.push(icon(part));
    }
    expect(new Set(icons).size).toBe(4);
    expect(icon(tile(html, 'ma'))).toContain('lucide-shield ');
    expect(icon(tile(html, 'pa'))).toContain('lucide-shield-half');
    expect(icon(tile(html, 'atk'))).toContain(mainAttackType(unit) === '穿刺' ? 'lucide-bow-arrow' : 'lucide-sword');
    expect(icon(tile(html, 'rng'))).toContain('lucide-crosshair');
  });

  it.each([531, 1015, 1907])('远程近战单位 %i 目录攻击图标采用近战剑而非弓箭，射程图标不变', (id) => {
    const unit = state.core!.unitById[id]!;
    expect(unit.rng).toBeGreaterThan(1);
    expect(mainAttackType(unit)).toBe('近战');
    const html = stats(unit);
    expect(icon(tile(html, 'atk'))).toContain('lucide-sword');
    expect(icon(tile(html, 'atk'))).not.toContain('lucide-bow-arrow');
    expect(icon(tile(html, 'rng'))).toContain('lucide-crosshair');
  });

  it.each([492, 559, 542])('远程穿刺与双类别穿刺单位 %i 目录攻击图标维持弓箭', (id) => {
    const unit = state.core!.unitById[id]!;
    expect(mainAttackType(unit)).toBe('穿刺');
    const html = stats(unit);
    expect(icon(tile(html, 'atk'))).toContain('lucide-bow-arrow');
  });

  it('营垒的两类护甲图形与单位一致，数值仍来自对应字段', () => {
    const html = at('/building/1251', createElement(BuildingDetail));
    const building = state.core!.buildingById[1251]!;
    const unit = stats(state.core!.unitById[4]!);
    for (const [stat, label] of [
      ['ma', '近战护甲'],
      ['pa', '穿刺护甲'],
    ] as const) {
      const part = tile(html, stat);
      expect(part).toContain(label);
      expect(part).toContain(`>${building[stat]}</span>`);
      expect(icon(part)).toBe(icon(tile(unit, stat)));
    }
    expect(tile(html, 'pa')).not.toContain('远程护甲');
    // #1219 起建筑攻击由 BuildingAttackDetails（data-stat="atk"）分列基础攻击类别，不再在 bd-stat-grid 渲染 sword 图标卡片
    const atkBlock = html.match(/<dl[^>]*data-stat="atk"[^>]*>.*?<\/dl>/s)?.[0] ?? '';
    expect(atkBlock).toContain('基础穿刺攻击');
    expect(atkBlock).toContain(`>${building.atk}</dd>`);
  });

  it('巨投后缀、精锐差值与负值不因换图改变', () => {
    const base = state.core!.unitById[331]!;
    const unit = { ...base, ma: -1, pa: 0, atk: base.atk + 1 };
    const html = stats(unit, base, true);
    expect(tile(html, 'ma')).toContain('近战护甲（打包态）');
    expect(tile(html, 'ma')).toContain('<span class="num nw">-1</span>');
    expect(tile(html, 'pa')).toContain('穿刺护甲（打包态）');
    expect(tile(html, 'pa')).toContain('<span class="num nw">0</span>');
    expect(tile(html, 'atk')).toContain('攻击力（展开态）');
    expect(tile(html, 'atk')).toContain('相对普通 <span class="num nw">+1</span>');
    expect(tile(html, 'rng')).toContain('射程（展开态）');
  });

  it('列表说明、表头和响应式标签同词，不给属性列添加图标', () => {
    const html = at('/units', createElement(UnitList));
    expect(html).toContain('生命、攻击、近战护甲、穿刺护甲、射程和造价是目录基础值，不是满科技或折后结果。');
    expect(html).toContain('<span class="unit-head-stat">穿刺护甲</span>');
    expect(html).toContain('<dt class="stat-label">穿刺护甲</dt>');
    expect(html).not.toContain('远程护甲');
    const part = tile(html, 'pa');
    expect(part).not.toContain('<svg');
    expect(html).toContain('href="/unit/4"');
  });
});
