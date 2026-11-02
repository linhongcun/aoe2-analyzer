import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import TestRenderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { expect, it } from 'vitest';
import { formatGames, formatPercent, type LadderSnapshot } from '../../src/domain/ladder';
import { LadderMeta, type BandCiv } from '../../src/features/ladder/LadderBands';

const snapshot = JSON.parse(readFileSync('src/data/ladder-4v4-rm-e1200-1400-90d.json', 'utf8')) as LadderSnapshot;
const catalog = JSON.parse(readFileSync('src/data/civs.json', 'utf8')) as { en: string; zh: string }[];
const rows: BandCiv[] = snapshot.brackets[0]!.civs.filter((row) => row.playRate != null).map((row) => ({
  ...row,
  playRate: row.playRate!,
  zh: catalog.find((civ) => civ.en === row.en)!.zh,
  linked: true,
}));
const first = rows[0]!;
const other = rows.find((row) => row.winRate !== first.winRate && row.games !== first.games)!;
const text = (node: ReactTestInstance): string => node.children.map((child) => (typeof child === 'string' ? child : text(child))).join('');
const props = (civs: readonly BandCiv[], sampleUnit: '人次' | '局' = '人次') => ({ civs, sampleUnit });
function render() {
  let renderer: ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(createElement(LadderMeta, props(rows)));
  });
  return renderer!;
}
function select(renderer: ReactTestRenderer, en: string) {
  act(() => {
    renderer.root.findByType('select').props.onChange({ target: { value: en } });
  });
}

it('#635 详情使用当前props及样本口径，不缓存选中时的旧数值', () => {
  const renderer = render();
  select(renderer, first.en);
  const readout = () => text(renderer.root.findByProps({ 'data-testid': 'ladder-meta-detail' }));
  expect(readout()).toContain(first.zh);
  expect(readout()).toContain(formatGames(first.games) + ' 人次');
  // 以另一真实数据行的数值构造更新输入，验证展示数据流，不更改游戏数据文件。
  const updated = { ...first, winRate: other.winRate, playRate: other.playRate, games: other.games };
  act(() => {
    renderer.update(createElement(LadderMeta, props([updated], '局')));
  });
  expect(readout()).toContain(first.zh);
  expect(readout()).toContain(formatPercent(other.winRate));
  expect(readout()).toContain(formatPercent(other.playRate));
  expect(readout()).toContain('样本局数');
  expect(readout()).toContain(formatGames(other.games) + ' 局');
  act(() => renderer.unmount());
});

it('#635 筛选移除选中文明后清空详情，空集合不保留旧统计', () => {
  const renderer = render();
  select(renderer, first.en);
  act(() => {
    renderer.update(createElement(LadderMeta, props([other])));
  });
  expect(renderer.root.findAllByProps({ 'data-testid': 'ladder-meta-name' })).toHaveLength(0);
  expect(renderer.root.findByType('select').props.value).toBe('');
  act(() => {
    renderer.update(createElement(LadderMeta, props([])));
  });
  expect(text(renderer.root.findByProps({ 'data-testid': 'ladder-meta-detail' }))).toBe('暂无符合筛选的文明。');
  act(() => {
    renderer.update(createElement(LadderMeta, props(rows)));
  });
  expect(renderer.root.findAllByProps({ 'data-testid': 'ladder-meta-name' })).toHaveLength(0);
  act(() => renderer.unmount());
});
