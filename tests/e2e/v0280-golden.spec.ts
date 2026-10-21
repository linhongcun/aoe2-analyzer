import { expect, test, type Page } from '@playwright/test';
import golden from './fixtures/v0280-golden.json' with { type: 'json' };
import { BUILDS, LAYER_PAGES, PAGES, PK, SEARCH_QUERIES, SIM, capturePage, captureSearch, type Captured, type PageCase } from './v0280-golden-cases';

/**
 * v0.28.0 验收（#310）：纯重构的数值金标准。Kent 写。
 * 期望值是 main @ 6a54c18 构建上录下的字面量（fixtures/v0280-golden.json），这里只比对。
 * 覆盖：单位 PK 28 组（含 URL 夹取边界）、模拟器 9 组、开局 12 组（全部 8 个开局 + 4 个变体）、首页与工具菜单、#281 涉及的 8 个页面、搜索 16 个查询。
 */
const PAGES_GOLDEN = golden.pages as Record<string, Captured>;
const SEARCH_GOLDEN = golden.search as Record<string, string[]>;

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', (e) => list.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') list.push(m.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

test('金标准清单与基线一一对应（防止漏录或多录）', () => {
  expect(Object.keys(PAGES_GOLDEN).sort()).toEqual([...PK, ...SIM, ...BUILDS, ...PAGES, ...LAYER_PAGES].map((c) => c.id).sort());
  expect(Object.keys(SEARCH_GOLDEN).sort()).toEqual([...SEARCH_QUERIES].sort());
  expect(PK).toHaveLength(28);
  expect(BUILDS.filter((c) => !c.url.includes('&'))).toHaveLength(8);
});

const check = (group: string, cases: PageCase[]) =>
  test.describe(group, () => {
    for (const c of cases)
      test(c.id, async ({ page }) => {
        const want = PAGES_GOLDEN[c.id]!;
        const got = await capturePage(page, c);
        expect(got.hash, `${c.id} 规范化后的地址`).toBe(want.hash);
        expect(got.lines, `${c.id} 页面文字与数值`).toEqual(want.lines);
      });
  });
check('单位 PK', PK);
check('模拟器', SIM);
check('开局', BUILDS);
check('首页与导航', PAGES);
check('#281 涉及的页面', LAYER_PAGES);

test.describe('搜索', () => {
  for (const q of SEARCH_QUERIES)
    test(`「${q}」`, async ({ page }) => {
      expect(await captureSearch(page, q), `搜索 ${q}`).toEqual(SEARCH_GOLDEN[q]);
    });
  test('ba 的结果里有百夫长', () => {
    expect(SEARCH_GOLDEN.ba!.some((t) => t.startsWith('百夫长 Centurion'))).toBe(true);
  });
});
