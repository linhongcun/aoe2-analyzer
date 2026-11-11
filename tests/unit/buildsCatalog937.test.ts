import { createElement as h } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { buildOrders } from '../../src/data/buildOrders';
import { displayBuildMap } from '../../src/features/builds/buildMapLabel';
import BuildOrderList, { sortCivs } from '../../src/features/builds/BuildOrderList';
import { listMeta } from '../../src/features/builds/listMeta';

function textOf(node: { children: unknown[] }): string {
  return node.children.map((child) => (typeof child === 'string' ? child : textOf(child as { children: unknown[] }))).join('');
}

function LocationProbe() {
  const location = useLocation();
  return h('p', { 'data-t': 'loc' }, `${location.search}|${JSON.stringify(location.state)}`);
}

async function renderAt(entry: string) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(h(MemoryRouter, { initialEntries: [entry] }, h(BuildOrderList), h(LocationProbe)));
  });
  return renderer;
}

describe('#937 开局目录', () => {
  it('Arabia 使用地图目录中文名，中文地图原文保留', () => {
    expect(displayBuildMap('Arabia')).toBe('阿拉伯半岛');
    expect(displayBuildMap('Arabia / 封闭地图')).toBe('阿拉伯半岛 / 封闭地图');
    expect(displayBuildMap('混合图 / 近岸安全渔场')).toBe('混合图 / 近岸安全渔场');
  });

  it('未计入文明沉底，其余保持原顺序', () => {
    expect(sortCivs(['A', 'B', 'C', 'D'], ['B', 'D'])).toEqual(['A', 'C', 'B', 'D']);
    expect(sortCivs(['A', 'B'], [])).toEqual(['A', 'B']);
  });

  it('目录时间按 listMeta 现算，人口口径和适用文明不截断', async () => {
    const renderer = await renderAt('/builds');
    for (let i = 0; i < 40 && renderer.root.findAllByProps({ 'data-t': 'bo-time' }).length < buildOrders.length; i++) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
    }
    const times = renderer.root.findAllByProps({ 'data-t': 'bo-time' }).map((node) => textOf(node));
    expect(times).toEqual(buildOrders.map((order) => listMeta(order).time));
    const page = textOf(renderer.root);
    expect(page).toContain(`${buildOrders.length} 个主流开局`);
    expect(page).toContain('比较并选择一套开局，再查看时间线或专注跟练。');
    expect(page).toContain('资料标注适用文明');
    expect(page).not.toContain('推荐文明');
    expect(page).not.toContain('选一个开局，看看你会卡在哪');
    expect(page).not.toMatch(/难度|风格|beginner|intermediate|advanced/);
    const hybrid = buildOrders.find((order) => order.id === 'hybrid-fish-18')!;
    expect(page).toContain(`${hybrid.target.vils} 村民封建`);
    expect(page).toContain('阿拉伯半岛');
    expect(page).toContain('混合图 / 近岸安全渔场');
    const anchors = (className: string) => renderer.root.findAll((node) => node.type === 'a' && node.props.className === className);
    expect(anchors('bo-catalog-practice')).toHaveLength(buildOrders.length);
    expect(renderer.root.findAllByProps({ className: 'bo-steps' })).toHaveLength(0);
    const listed = buildOrders.flatMap((order) => order.civs);
    expect(renderer.root.findAll((node) => node.type === 'a' && node.props['data-t'] === 'bo-civ')).toHaveLength(listed.length);
    for (const order of buildOrders) {
      const off = listMeta(order).unsupported;
      const names = renderer.root
        .findByProps({ id: `bo-${order.id}` })
        .findAll((node) => node.type === 'a' && node.props['data-t'] === 'bo-civ')
        .map((node) => ({ off: node.props['data-off'] === '', text: textOf(node) }));
      const supported = order.civs.filter((civ) => !off.includes(civ));
      expect(names.filter((item) => item.off).map((item) => item.text)).toEqual(
        off.length ? expect.arrayContaining([expect.stringContaining('加成未计入')]) : [],
      );
      expect(names.map((item) => item.off)).toEqual([...supported.map(() => false), ...off.map(() => true)]);
    }
  });

  it('非法 bo 只清掉自身并保留其它参数', async () => {
    const renderer = await renderAt('/builds?bo=not-a-build&civ=Franks&dist=7&house=0&step=3&var=aggr&view=practice&from=matchup&me=Mongols&opp=Chinese');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const probe = textOf(renderer.root.findByProps({ 'data-t': 'loc' }));
    const [search, state] = probe.split('|');
    const params = new URLSearchParams(search);
    expect(params.has('bo')).toBe(false);
    expect(params.get('civ')).toBe('Franks');
    expect(params.get('dist')).toBe('7');
    expect(params.get('house')).toBe('0');
    expect(params.get('step')).toBe('3');
    expect(params.get('var')).toBe('aggr');
    expect(params.get('view')).toBe('practice');
    expect(params.get('from')).toBe('matchup');
    expect(params.get('me')).toBe('Mongols');
    expect(params.get('opp')).toBe('Chinese');
    expect(state).toContain('buildsInvalidBo');
    expect(textOf(renderer.root)).toContain('链接中的开局无效，已显示全部开局。');
  });
});
