import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore } from '../../src/data';
import BuildingDetail from '../../src/features/buildings/components/BuildingDetail';
import UnitDetail from '../../src/features/units/components/UnitDetail';

const visible = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const before = (html: string, id: string) => {
  const at = html.indexOf(`id="${id}"`);
  return at === -1 ? html : html.slice(0, at);
};
const stat = (html: string, name: string) => html.match(new RegExp(`data-stat="${name}"[\\s\\S]*?<span class="num nw">([^<]+)</span>`))?.[1] ?? '';
const workspace = (html: string) => (html.match(/data-t="workspace-status"[^>]*>([^<]+)/)?.[1] ?? '').trim();
const renderBuilding = (path: string) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(Routes, null, createElement(Route, { path: '/building/:id', element: createElement(BuildingDetail) })),
    ),
  );
const renderUnit = (path: string) => renderToStaticMarkup(createElement(StaticRouter, { location: path }, createElement(UnitDetail)));

beforeAll(async () => {
  await loadCore();
});

describe('详情文案与整数生命（#921 #923）', () => {
  it('骡车未选文明：去掉空句和孤儿预填，基础口径只留一处，生命不带 .00', () => {
    const html = renderBuilding('/building/1808');
    const page = before(html, 'building-history');
    expect(page).not.toContain('目录造价。');
    expect(page.match(/未计文明加成/g)).toEqual(['未计文明加成']);
    expect(stat(html, 'hp')).toBe('300');
    const time = page.slice(page.indexOf('data-t="panel-time"'), page.indexOf('class="bd-tools"'));
    expect(time).toContain('不是多人施工里的村民工时');
    expect(time).not.toContain('预填');
    expect(time).not.toContain('先选择文明');
    expect(page).not.toContain('data-t="construction-note"');
    expect(page).not.toContain('不会补上默认文明');
    expect(page).toContain('先选择文明。');
    expect(workspace(html)).toBe('查看科技效果。未指定文明时需先选择文明。');
    expect(html).toContain('data-view="overview"');
    expect(html).not.toContain('id="building-sim"');
  });

  it('骡车选中亚美尼亚后，预填说明紧邻施工入口，工作区不再提示未指定', () => {
    const html = renderBuilding('/building/1808?civ=Armenians');
    const block = html.match(/data-t="construction-entry-block"[\s\S]*?<\/div>/)?.[0] ?? '';
    expect(block).toContain('data-t="construction-entry"');
    expect(block).toContain('比较多人施工');
    expect(block).toContain('预填目录时代，非解锁条件。');
    expect(block).toContain('civ=Armenians');
    const time = html.slice(html.indexOf('data-t="panel-time"'), html.indexOf('class="bd-tools"'));
    expect(time).not.toContain('预填目录时代');
    expect(workspace(html)).toBe('查看科技效果。');
    expect(html).not.toContain('未指定文明时需先选择文明');
    expect(html).toContain('data-view="overview"');
    expect(html).not.toContain('id="building-sim"');
    expect(html).toContain('打开科技模拟器');
  });

  it('驻军建筑的工作区也按是否已选文明写，不自动打开工具', () => {
    expect(workspace(renderBuilding('/building/12'))).toBe('查看科技效果，或配置驻军预览。未指定文明时需先选择文明。');
    const selected = renderBuilding('/building/12?civ=Britons');
    expect(workspace(selected)).toBe('查看科技效果，或配置驻军预览。');
    expect(selected).toContain('data-view="overview"');
    expect(selected).not.toContain('id="building-sim"');
    expect(selected).not.toContain('id="building-garrison"');
  });

  it('民兵生命为 40，基础口径只留文明选择下那一句，造价折扣说明还在', () => {
    const html = renderUnit('/unit/74');
    const page = before(html, 'unit-history');
    expect(stat(html, 'hp')).toBe('40');
    expect(page.match(/未计文明加成/g)).toEqual(['未计文明加成']);
    expect(page).toContain('目录造价，未计文明折扣。');
    expect(page).not.toContain('未指定文明时需先选择文明');
  });

  it('修复费用主文先给结论和待确认，审计细节仍留在来源', () => {
    const html = renderBuilding('/building/1808');
    const main = visible(html.match(/data-t="repair-cost-main"[\s\S]*?data-t="repair-cost-source"/)?.[0] ?? '');
    const source = visible(html.match(/data-t="repair-cost-source"[\s\S]*$/)?.[0] ?? '');
    expect(main).toContain('修理攻城单位和船');
    expect(main).toContain('修理建筑');
    expect(main).toContain('按造价计算的比例');
    expect(main).toContain('×0.75');
    expect(main).toContain('城镇中心与城门');
    expect(main).toContain('待确认');
    expect(main).toContain('修复速率');
    expect(main).toContain('不估算要花多少资源');
    expect(main).not.toContain('270');
    expect(main).not.toContain('271');
    expect(main).not.toContain('Unit Repair Cost');
    expect(main).not.toContain('eco.json');
    expect(main).not.toContain('2026-11-07');
    expect(source).toContain('270');
    expect(source).toContain('271');
    expect(source).toContain('Unit Repair Cost');
    expect(source).toContain('Building Repair Cost');
    expect(source).toContain('2026-11-07');
    expect(source).toContain('eco.json');
    expect(source).toContain('effects.json');
    expect(source).toContain('待确认');
    expect(source).toContain('这不是 DE 导出的基准比例');
  });
});
