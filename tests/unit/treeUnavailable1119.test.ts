import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees, type Core } from '../../src/data';
import type { TreeCell, Trees } from '../../src/domain/types';
import { treeAge } from '../../src/domain/treeAge';
import { unavailableSummary, unavailableText, UNAVAILABLE_SCOPE } from '../../src/domain/treeUnavailable';
import {
  consumeTreeSummaryHistory,
  readTreeSummaryMemory,
  treeSummaryDetail,
  treeSummaryMemory,
  treeSummaryReturn,
} from '../../src/domain/treeSummaryNavigation';

let core: Core;
let trees: Trees;
beforeAll(async () => {
  [core, trees] = await Promise.all([loadCore(), loadTrees()]);
});
const cell = (kind: 'u' | 't' | 'b', id: number, row = 6, col = 0, status = 0): TreeCell => [row, col, kind, id, status, null];
const fixture = (cells: TreeCell[], bid = 101): Trees => ({ b: {}, t: { Test: [[bid, 0, 3, cells]] } });

it('汇总恢复消费一次性焦点，收起仅清本功能记录并保留真实history字段', () => {
  const state = { key: 'source', idx: 2, extra: 3, usr: { sentinel: 'keep', treeSummary: treeSummaryMemory('Japanese', '101:u441') } };
  expect(consumeTreeSummaryHistory(state, 'Japanese')).toEqual({
    ...state,
    usr: { ...state.usr, treeSummary: { version: 1, civ: 'Japanese', source: '/civ/Japanese#techtree', open: true } },
  });
  expect(consumeTreeSummaryHistory(state, 'Japanese', true)).toEqual({ ...state, usr: { sentinel: 'keep' } });
  expect(state.usr.treeSummary.focus).toBe('101:u441');
});

it('消费不触碰无记录、无效形态或其他文明history', () => {
  for (const state of [null, [], { key: 'x' }, { usr: 'bad' }, { usr: { treeSummary: treeSummaryMemory('Aztecs', '101:u441') } }])
    expect(consumeTreeSummaryHistory(state, 'Japanese', true)).toBe(state);
});

describe('#1119 当前树不可用项', () => {
  it('日本按建筑、kind+ID 和树时代顺序精确对账 9组16条', () => {
    const summary = unavailableSummary(trees, core, 'Japanese')!;
    expect(summary.complete).toBe(true);
    expect(summary.count).toBe(16);
    expect(summary.groups.map((g) => [g.id, g.items.map((x) => x.kind + x.id)])).toEqual([
      [101, ['u441', 'u569']],
      [49, ['u36', 'u548', 'u588']],
      [82, ['t321']],
      [45, ['u528']],
      [103, ['t80']],
      [209, ['t380', 't909', 't51', 't910', 't64']],
      [104, ['t439']],
      [584, ['t279']],
      [68, ['t12']],
    ]);
  });
  it('阿兹特克没有马厩，精锐炮舰列为不可用的单位升级', () => {
    const summary = unavailableSummary(trees, core, 'Aztecs')!;
    expect(summary.groups).toHaveLength(9);
    expect(summary.count).toBe(27);
    expect(summary.groups.some((g) => g.id === 101)).toBe(false);
    expect(summary.groups.flatMap((g) => g.items).find((x) => x.id === 691 && x.kind === 'u')).toMatchObject({
      type: '单位升级',
      identity: null,
      name: core.unitById[691]!.zh,
    });
  });
  it('勃艮第区域单位与区域科技不丢失或改成建筑', () => {
    const summary = unavailableSummary(trees, core, 'Burgundians')!;
    expect(summary.groups).toHaveLength(8);
    expect(summary.count).toBe(20);
    expect(summary.groups.flatMap((g) => g.items)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'u', id: 2701, identity: '区域单位', type: '单位' }),
        expect.objectContaining({ kind: 't', id: 1452, identity: '区域科技', type: '科技' }),
      ]),
    );
  });
  it('所有现有文明的集合只由原树 st===0 的u/t构成，目录补集与b不混入', () => {
    for (const [civ, blocks] of Object.entries(trees.t)) {
      const expected = new Set(blocks.flatMap(([bid, , , cells]) => cells.filter((c) => c[4] === 0 && c[2] !== 'b').map((c) => `${bid}:${c[2]}${c[3]}`)));
      const summary = unavailableSummary(trees, core, civ)!;
      expect(new Set(summary.groups.flatMap((g) => g.items.map((x) => `${g.id}:${x.kind}${x.id}`))), civ).toEqual(expected);
      expect(summary.unresolved, civ).toBe(0);
    }
  });
  it('合并分散同建筑block；稳定行/列/原索引首个代表去重，跨建筑保留', () => {
    const data = fixture([cell('u', 441, 7), cell('u', 569, 6, 2), cell('t', 80, 4)]);
    data.t.Test!.push([103, 0, 2, [cell('u', 441)]], [101, 0, 3, [cell('u', 441, 6, 1), cell('u', 569, 7), cell('t', 80, 5)]]);
    const summary = unavailableSummary(data, core, 'Test')!;
    expect(summary.groups.map((g) => [g.id, g.items.map((x) => x.kind + x.id)])).toEqual([
      [101, ['t80', 'u441', 'u569']],
      [103, ['u441']],
    ]);
    expect(summary.groups[0]!.items.map((x) => x.row)).toEqual([4, 6, 6]);
    expect(summary.count).toBe(4);
  });
  it('相同ID不同kind不碰撞；可用、非0状态和建筑格不被认成不可用', () => {
    const data = fixture([cell('u', 441), cell('t', 441), cell('b', 101), cell('u', 569, 6, 1, 1), cell('u', 548, 6, 2, -1)]);
    const summary = unavailableSummary(data, core, 'Test')!;
    expect(summary.groups[0]!.items.map((x) => x.kind + x.id)).toEqual(['u441', 't441']);
  });
  it('无树和成功零结果区分，零组不造建筑或空条目', () => {
    expect(unavailableSummary(trees, core, 'NoSuchCiv')).toBeNull();
    expect(unavailableSummary(fixture([cell('u', 441, 6, 0, 1), cell('b', 101)]), core, 'Test')).toEqual({
      groups: [],
      count: 0,
      unresolved: 0,
      complete: true,
    });
    expect(unavailableSummary({ b: {}, t: { Test: [] } }, core, 'Test')?.groups).toEqual([]);
  });
  it.each([1, 2, 3, 4, 5, 6, 7])('row %i 使用布局时代带而不是目录age', (row) => {
    expect(treeAge(row)).toBe(['黑暗时代', '封建时代', '封建时代', '城堡时代', '城堡时代', '帝王时代', '帝王时代'][row - 1]);
    expect(unavailableSummary(fixture([cell('u', 441, row)]), core, 'Test')!.groups[0]!.items[0]!.age).toBe(treeAge(row));
  });
  it.each([0, -1, 8, 1.5, NaN, Infinity])('未知row %s 不丢对象、不取目录age', (row) => {
    const item = unavailableSummary(fixture([cell('u', 441, row)]), core, 'Test')!.groups[0]!.items[0]!;
    expect(item.age).toBe('时代未核实');
    expect(item.name).toBe(core.unitById[441]!.zh);
  });
  it('未知目录和建筑保留可定位诊断，全未解析不冒充零结果', () => {
    const summary = unavailableSummary(fixture([cell('u', 999998), cell('t', 999999, 99)], 999999), core, 'Test')!;
    expect(summary).toMatchObject({ count: 0, unresolved: 2, complete: false });
    expect(summary.groups[0]).toMatchObject({ id: 999999, name: '建筑 ID 999999', named: false });
    const text = unavailableText(summary, '测试', 'DE 测试版', 'https://example.test/#/civ/Test#techtree');
    expect(text).toContain('汇总不完整');
    expect(text).toContain('不代表全部结果');
    expect(text).toContain('t999999');
    expect(text).toContain('时代未核实');
    expect(text).not.toContain('未发现明确标为不可用');
  });
  it('建筑目录缺失时优先保留树内名称，不重归其他生产建筑', () => {
    const data = fixture([cell('u', 441)], 999999);
    data.b['999999'] = ['树内建筑', 'Tree building', 0, 1];
    expect(unavailableSummary(data, core, 'Test')!.groups[0]).toMatchObject({ id: 999999, name: '树内建筑', named: true });
  });
  it('升级只依据type；空值不猜；未知type明确；独特身份沿用现有规则', () => {
    const fake = { ...core, unitById: { ...core.unitById } };
    for (const [i, type] of [null, undefined, '', 'FutureType', 'UniqueUnit', 'RegionalUnit', 'UnitUpgrade'].entries())
      fake.unitById[900000 + i] = { ...core.unitById[441]!, id: 900000 + i, type: type as string };
    const items = unavailableSummary(fixture(Array.from({ length: 7 }, (_, i) => cell('u', 900000 + i, 6, i))), fake, 'Test')!.groups[0]!.items;
    expect(items.map((x) => x.type)).toEqual(['单位', '单位', '单位', '单位（类型未核实：FutureType）', '单位', '单位', '单位升级']);
    expect(items.map((x) => x.identity)).toEqual([null, null, null, null, '独特单位', '区域单位', null]);
  });
  it('复制序列覆盖所有组、全部条目/身份/时代/版本/口径及正确科技树链接', () => {
    const summary = unavailableSummary(trees, core, 'Japanese')!;
    const url = 'https://linhongcun.github.io/aoe2-analyzer/#/civ/Japanese#techtree';
    const text = unavailableText(summary, '日本', 'DE Update 188329', url);
    expect(text).toContain('日本 · 不可用项汇总');
    expect(text).toContain(UNAVAILABLE_SCOPE);
    expect(text).toContain('DE Update 188329');
    expect(text).toContain('树中时代不是解锁承诺');
    expect(text).toContain('跨建筑分别计入');
    expect(text.match(/^- /gm)).toHaveLength(16);
    for (const group of summary.groups) {
      expect(text).toContain(group.name);
      for (const item of group.items)
        expect(text).toContain(`${item.name} · ${item.type}${item.identity ? ` · ${item.identity}` : ''} · 树中时代：${item.age}`);
    }
    expect(text.endsWith(url)).toBe(true);
    expect(unavailableText(unavailableSummary(fixture([]), core, 'Test')!, '测试', '测试', url)).toContain('当前科技树中未发现明确标为不可用');
  });
});

describe('#1119 返回协议', () => {
  it('源entry恢复记录与详情凭证分别传递，建筑级身份不碰撞', () => {
    const first = treeSummaryDetail('Japanese', 101, 'u', 441);
    const second = treeSummaryDetail('Japanese', 103, 'u', 441);
    expect(treeSummaryReturn(first, 'Japanese', 'u', 441, '/unit/441')?.focus).toBe('101:u441');
    const memory = treeSummaryReturn(second, 'Japanese', 'u', 441, '/unit/441')!;
    expect(memory.focus).toBe('103:u441');
    expect(readTreeSummaryMemory({ treeSummary: memory }, 'Japanese')).toEqual(memory);
    expect(readTreeSummaryMemory({ treeSummary: memory }, 'Aztecs')).toBeNull();
    expect(readTreeSummaryMemory({ treeSummary: treeSummaryMemory('Japanese') }, 'Japanese')?.open).toBe(true);
  });
  it('直达/未知state、串文明、串实体、错误路径/锚点/形态不伪造返回入口', () => {
    for (const state of [
      undefined,
      null,
      [],
      {},
      treeSummaryDetail('Japanese', 101, 't', 441),
      treeSummaryDetail('Aztecs', 101, 'u', 441),
      treeSummaryDetail('Japanese', 101, 'u', 569),
    ])
      expect(treeSummaryReturn(state, 'Japanese', 'u', 441, '/unit/441')).toBeNull();
    const state = treeSummaryDetail('Japanese', 101, 'u', 441);
    expect(treeSummaryReturn(state, undefined, 'u', 441, '/unit/441')).toBeNull();
    expect(treeSummaryReturn(state, 'Japanese', 'u', 441, '/unit/441/Aztecs')).toBeNull();
    for (const update of [
      { source: '/civ/Japanese' },
      { source: '/civ/Aztecs#techtree' },
      { version: 2 },
      { focus: '103:t441' },
      { focus: '103:u569' },
      { focus: null },
    ])
      expect(treeSummaryReturn({ treeSummaryDetail: { ...state.treeSummaryDetail, ...update } }, 'Japanese', 'u', 441, '/unit/441')).toBeNull();
  });
});
