import { expect, test, type Page } from '@playwright/test';
import golden from './fixtures/v0280-golden.json' with { type: 'json' };
import duelUrl from './fixtures/v0280-duel-url.json' with { type: 'json' };
import { PK, capturePage, type Captured } from './v0280-golden-cases';
import { DUEL_URL } from './v0280-duel-url-cases';

/**
 * v0.28.0 验收 #281 ④：Duel URL 数值参数的界面级对照。Kent 写。
 * 1. 17 组 URL 边界（v0280-duel-url-cases.ts）：规范化后的地址与页面文字须与 main @ 4a3f89f 录下的字面量一致；
 *    再打开规范化后的地址，地址不再变化、页面文字相同（规范化是幂等的）。
 * 2. 金标准 28 组 PK：打开金标准里的规范化地址，地址与页面文字不变（往返一致）。
 */
const URL_GOLDEN = duelUrl.pages as Record<string, Captured>;
const PK_GOLDEN = golden.pages as Record<string, Captured>;

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

test('用例清单与录制结果一一对应', () => {
  expect(Object.keys(URL_GOLDEN).sort()).toEqual(DUEL_URL.map((c) => c.id).sort());
  expect(DUEL_URL).toHaveLength(17);
});

test.describe('URL 边界：与 main 一致且规范化幂等', () => {
  for (const c of DUEL_URL)
    test(c.id, async ({ page }) => {
      const want = URL_GOLDEN[c.id]!;
      const got = await capturePage(page, c);
      expect(got.hash, `${c.id} 规范化后的地址`).toBe(want.hash);
      expect(got.lines, `${c.id} 页面文字与数值`).toEqual(want.lines);
      expect(await capturePage(page, { ...c, url: './' + want.hash }), `${c.id} 再次打开规范化地址`).toEqual(want);
    });
});

test.describe('金标准 PK：规范化地址往返一致', () => {
  for (const c of PK)
    test(c.id, async ({ page }) => {
      const want = PK_GOLDEN[c.id]!;
      expect(await capturePage(page, { ...c, url: './' + want.hash }), `${c.id} 打开规范化地址`).toEqual(want);
    });
});
