import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import catalog from '../../src/data/mapCatalog.json';
import Maps from '../../src/features/maps/Maps';
import { mapMatchesQuery, selectMap } from '../../src/features/maps/mapSelection';
import { PAGES } from '../../src/shared/nav/pageRegistry';

const knownIds = catalog.maps.map((map) => map.id);
const filtered = (ids: string[]) => ids;

function view(raw: string | null, ids: string[], implicitId = 'arabia') {
  return selectMap({ raw, filteredIds: filtered(ids), knownIds, implicitId });
}

function page(search = '') {
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [`/maps${search}`] }, createElement(Maps)));
}

describe('地图选择 #935', () => {
  it('空地址显示目录第一张，不改地址', () => {
    expect(knownIds[0]).toBe('arabia');
    expect(view(null, knownIds)).toEqual({ kind: 'map', id: 'arabia', replaceParam: false, implicitId: 'arabia' });
  });

  it('有效 map 原样选中', () => {
    expect(view('black-forest', knownIds)).toMatchObject({ kind: 'map', id: 'black-forest', replaceParam: false });
  });

  it('无效 map 保留判断，不回落第一张', () => {
    expect(view('not-a-map', knownIds)).toEqual({ kind: 'missing', implicitId: 'arabia' });
    expect(view('', knownIds)).toEqual({ kind: 'missing', implicitId: 'arabia' });
    expect(view('Arabia', knownIds)).toEqual({ kind: 'missing', implicitId: 'arabia' });
  });

  it('筛选淘汰当前有效图时改选结果第一张，并标记要改写参数', () => {
    expect(view('arabia', ['black-forest', 'arena'])).toEqual({
      kind: 'map',
      id: 'black-forest',
      replaceParam: true,
      implicitId: 'arabia',
    });
  });

  it('空地址被筛选淘汰时只改页内选择，不写 map', () => {
    expect(view(null, ['black-forest', 'arena'], 'arabia')).toEqual({
      kind: 'map',
      id: 'black-forest',
      replaceParam: false,
      implicitId: 'black-forest',
    });
  });

  it('没有结果时不改有效或无效参数', () => {
    expect(view('arabia', [])).toEqual({ kind: 'none', implicitId: 'arabia' });
    expect(view('not-a-map', [])).toEqual({ kind: 'missing', implicitId: 'arabia' });
    expect(view(null, [], 'arena')).toEqual({ kind: 'none', implicitId: 'arena' });
  });

  it('搜索沿用中英名、id、rm_ 前缀和英文首字母', () => {
    const forest = catalog.maps.find((map) => map.id === 'black-forest');
    expect(forest).toBeTruthy();
    for (const query of ['黑森', 'Black Forest', 'blackforest', 'BLACK-FOREST', 'BF', 'rm_black-forest']) {
      expect(mapMatchesQuery(forest!, query)).toBe(true);
    }
    expect(mapMatchesQuery(forest!, 'Holy Hollow')).toBe(false);
  });
});

describe('地图页标记 #935', () => {
  it('登记表去掉 hideNav，资料顺序在科技树之后', () => {
    const maps = PAGES.find((item) => item.key === 'maps');
    expect(maps).toMatchObject({ path: '/maps', lane: 'wiki', group: 'reference', label: '地图' });
    expect(maps?.hideNav).toBeUndefined();
    const visible = PAGES.filter((item) => item.lane === 'wiki' && !item.hideNav).map((item) => item.key);
    expect(visible).toEqual(['civs', 'units', 'buildings', 'techs', 'tree', 'maps', 'patches']);
  });

  it('路由表没有单图路径，计数不写死目录长度', () => {
    const source = readFileSync('src/features/maps/Maps.tsx', 'utf8');
    const routes = readFileSync('src/app/routes.tsx', 'utf8');
    expect(routes).not.toMatch(/path=["']\/map\//);
    expect(source).toContain('catalog.maps.length');
    expect(source).not.toContain('83 张');
    expect(source).not.toContain('PREVIEW_LIMIT');
    expect(readFileSync('src/features/search/hooks.ts', 'utf8')).not.toContain('mapCatalog');
  });

  it('空地址渲染目录第一张，SD3 默认折叠', () => {
    const html = page();
    expect(html).toContain('data-map-id="arabia"');
    expect(html).toContain(`${catalog.maps.length} / ${catalog.maps.length}`);
    expect(html).toContain('赛事地图专题（SD3，本届已结束）');
    expect(html).not.toContain('链接里的地图不存在');
    expect(html).not.toMatch(/<details class="map-sd3"[^>]*\sopen/);
    expect(html).toContain('黑森林、Black Forest、BF');
  });

  it('有效、无效和缺路位的首屏标记不同', () => {
    const forest = page('?map=black-forest');
    const article = forest.slice(forest.indexOf('id="map-details"'), forest.indexOf('data-testid="map-positions"'));
    expect(forest).toContain('data-map-id="black-forest"');
    expect(article).not.toContain('指南');
    expect(forest).toContain('路位推荐暂缺');
    expect(forest).toContain('反馈数据缺口');
    expect(forest).not.toContain('编辑口径，非官方推荐');
    expect(forest).not.toContain('边路推荐待补');

    const arabia = page('?map=arabia');
    expect(arabia).toContain('编辑口径，非官方推荐');
    expect(arabia).toContain('适用：');
    expect(arabia).toContain('边路推荐');
    expect(arabia).toContain('中路推荐');
    expect(arabia).toContain('/builds?bo=scouts-18');
    expect(arabia).toContain('/civ/Franks');

    const missing = page('?map=not-a-map');
    expect(missing).toContain('链接里的地图不存在');
    expect(missing).not.toContain('data-map-id=');
    expect(missing).not.toContain('aria-pressed="true"');

    const islands = page('?map=islands');
    expect(islands).toContain('码头与渔船经济');
    expect(islands).toContain('https://aoebuddy.com/build-orders/18-fishing-ship-build');
    expect(islands).toContain('查看已核对的单码头速封流程（外部）');
    expect(islands).toContain('/builds?bo=hybrid-fish-18');
    expect(islands).toContain('路位推荐暂缺');
  });
});
