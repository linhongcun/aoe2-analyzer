// v0.30.0 #297 验收（单测）：Ctrl+K 查「时间」「市场」「开局」时对应工具页面在前 3 名；页面不被加成挤走；中英文与拼音能力保留。Kent Beck 2026-10-22。
// 验收标准（#297 原文）：
//   - 查询「时间」「市场」「开局」时，对应工具页面出现在结果前 3 名（有页面命中的前提下）
//   - 结果按 kind 分组或至少对 page 加权，避免「持续时间」类加成逼走页面
//   - 保留中英文与拼音现有能力；加单测覆盖上述三个查询的前三名
//   - #291 的键盘选择行为不被破坏（见 tests/e2e/v0300-297.spec.ts 与 tests/unit/search291.test.ts）
// f856c9e 实测：三个查询的前 3 名都已含对应页面（时间换算、市场买卖、开局流程分别第 1/2/1 名），名称命中同分时 KIND_ORDER 已让 page 排前。
// 因此本文件在 f856c9e 上只有 [严格读法] 一条红；其余是本 issue 要求补上的单测（绿）。
// [严格读法·待 Steve] 「对 page 加权」读作：任何档位的页面命中都排在加成命中之前（页面只靠名称包含 / 别名命中，也要排在名称前缀命中的加成之前）。
//   有限加权（如 page +20）或只在面板里按 kind 分组显示，都过不了这一条；若这两种做法也算达标，这条应删除。
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore } from '../../src/data';
import { search, type SearchItem } from '../../src/domain/search';
import { useSearchIndex } from '../../src/features/search/hooks';

let items: SearchItem[];
beforeAll(async () => {
  await loadCore();
  const Probe = () => createElement('script', { dangerouslySetInnerHTML: { __html: JSON.stringify(useSearchIndex()) } });
  const html = renderToStaticMarkup(createElement(Probe));
  items = JSON.parse(html.slice('<script>'.length, -'</script>'.length));
});
/** [查询, 对应工具页 id（sections.ts key）, 页面名] */
const CASES = [
  ['时间', 'game-clock', '时间换算'],
  ['市场', 'market', '市场买卖'],
  ['开局', 'builds', '开局流程'],
] as const;
const top = (q: string, n = 3) => search(items, q).slice(0, n);

describe('#297 三个查询的前三名', () => {
  it('防空转：索引里有这三个页面，也有大量「持续时间」类加成', () => {
    for (const [, id, zh] of CASES) expect(items.find((r) => r.kind === 'page' && r.id === id)?.zh).toBe(zh);
    expect(items.filter((r) => r.kind === 'bonus' && r.zh.includes('持续时间')).length).toBeGreaterThanOrEqual(3);
  });
  for (const [q, id, zh] of CASES)
    it(`「${q}」：「${zh}」页面在前 3 名`, () => {
      expect(
        top(q).map((r) => `${r.kind}:${r.id}`),
        top(q)
          .map((r) => r.zh)
          .join(' | '),
      ).toContain(`page:${id}`);
    });
  for (const [q] of CASES)
    it(`「${q}」：所有页面命中都排在第一个加成命中之前`, () => {
      const res = search(items, q);
      const firstBonus = res.findIndex((r) => r.kind === 'bonus');
      const lastPage = res.map((r) => r.kind).lastIndexOf('page');
      expect(
        firstBonus === -1 || lastPage < firstBonus,
        res
          .slice(0, 8)
          .map((r) => `${r.kind}:${r.zh}`)
          .join(' | '),
      ).toBe(true);
    });
  it('「时间」：前 3 名里「持续时间」类加成不会排在页面之前', () => {
    const res = top('时间');
    const page = res.findIndex((r) => r.kind === 'page' && r.id === 'game-clock');
    expect(res.slice(0, page).filter((r) => r.kind === 'bonus')).toEqual([]);
  });
});

describe('#297 对 page 加权', () => {
  const mk = (kind: SearchItem['kind'], zh: string, aliases?: string[]): SearchItem => ({ kind, id: zh, zh, en: '', href: '/' + zh, sub: '', aliases });
  it('同档名称包含：页面排在加成之前（f856c9e：KIND_ORDER 同分时 page 在前）', () => {
    const res = search([mk('bonus', '资源持续时间 +15%'), mk('page', '游戏时间换算')], '时间');
    expect(res.map((r) => r.kind)).toEqual(['page', 'bonus']);
  });
  it('[严格读法·待 Steve] 页面只靠名称包含命中，也排在名称前缀命中的加成之前', () => {
    const res = search([mk('bonus', '资源持续时间 +15%'), mk('page', '采集资源计算')], '资源');
    expect(res.map((r) => r.kind)).toEqual(['page', 'bonus']);
  });
});

describe('#297 对照：中英文、拼音与别名能力保留（f856c9e 值）', () => {
  const KEEP: [string, string][] = [
    ['game clock', 'game-clock'],
    ['clock', 'game-clock'],
    ['market', 'market'],
    ['build order', 'builds'],
    ['shijian', 'game-clock'],
    ['sjhs', 'game-clock'],
    ['shichang', 'market'],
    ['kaiju', 'builds'],
    ['kjlc', 'builds'],
    ['游戏时间', 'game-clock'],
    ['时间换算', 'game-clock'],
    ['市场买卖', 'market'],
    ['开局流程', 'builds'],
  ];
  for (const [q, id] of KEEP)
    it(`「${q}」第 1 名仍是 page:${id}`, () => {
      expect(`${top(q, 1)[0]?.kind}:${top(q, 1)[0]?.id}`).toBe(`page:${id}`);
    });
  it('「市场」：建筑「市场」（名称完全匹配）仍在前 3 名', () => {
    expect(top('市场').map((r) => `${r.kind}:${r.zh}`)).toContain('building:市场');
  });
  it('「时间」「市场」「开局」的加成仍能搜到（不是把加成删掉）', () => {
    for (const [q] of CASES)
      expect(
        search(items, q).some((r) => r.kind === 'bonus'),
        q,
      ).toBe(true);
  });
});
