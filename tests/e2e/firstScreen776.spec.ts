import { expect, test, type Page } from '@playwright/test';

// #776：窄屏首列不能被压成逐字竖排。#941 把资料对照拆出分数表，并加上始终可见的评分摘要，
// 整页因此高于当时合并表格的 2200px 上限；单行与首列宽度仍是这项修复的检查。
// #/civs @360 首卡 top=1089、必备单位与科技卡高 520px；@1280 首卡 y=680、卡片高 300px。
const MOBILE = [360, 375, 390] as const;

const failures = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  failures.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(failures.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

/** 等字体就绪：并行跑测试时字体会晚到，行高变化会让整页高度/首卡位置在 ±几像素间抖动。 */
const fontsReady = (page: Page) => page.evaluate(() => document.fonts.ready);

const firstCardTop = (page: Page) =>
  page
    .locator('#grid .card')
    .first()
    .evaluate((element) => Math.round((element.getBoundingClientRect().top + window.scrollY) * 100) / 100);

async function compareColumnMetrics(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((cells) =>
    cells.map((cell) => {
      const rect = cell.getBoundingClientRect();
      const style = getComputedStyle(cell);
      const range = document.createRange();
      range.selectNodeContents(cell);
      return {
        text: cell.textContent ?? '',
        width: rect.width,
        height: rect.height,
        lineHeight: Number.parseFloat(style.lineHeight),
        whiteSpace: style.whiteSpace,
        textLines: new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size,
      };
    }),
  );
}

const compareLabels = (page: Page) =>
  Promise.all([
    compareColumnMetrics(page, '#ctab tbody tr:not(:first-child) td:first-child'),
    compareColumnMetrics(page, '#compare-facts tbody tr:not(:first-child) td:first-child'),
  ]).then(([scores, facts]) => [...scores, ...facts]);

for (const width of MOBILE)
  test(`#776 @${width} /compare 首列标签单行、首列 ≥64`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./#/compare');
    await expect(page.locator('#compare')).toBeVisible();
    await fontsReady(page);
    const cells = await compareLabels(page);
    expect(cells.map((cell) => cell.text)).toEqual([
      '骑兵',
      '弓手',
      '步兵',
      '经济',
      '防御',
      '攻城',
      '僧侣',
      '海军',
      '特色兵种',
      '城堡科技',
      '帝王科技',
      '团队加成',
      '参考开局',
    ]);
    for (const cell of cells) {
      expect(cell.width, `${cell.text} 首列宽`).toBeGreaterThanOrEqual(64);
      expect(cell.whiteSpace, `${cell.text} 用 nowrap`).toBe('nowrap');
      expect(cell.textLines, `${cell.text} 标签单行`).toBe(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollHeight), `${width} 整页高度`).toBeLessThan(3400);
  });

test('#776 @1280 /compare 桌面不套用窄屏首列 nowrap', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/compare');
  await expect(page.locator('#ctab')).toBeVisible();
  await fontsReady(page);
  const cells = await compareLabels(page);
  for (const cell of cells) {
    expect(cell.whiteSpace, `${cell.text} 桌面不强制 nowrap`).toBe('normal');
    expect(cell.textLines, `${cell.text} 标签单行`).toBe(1);
  }
});

for (const width of MOBILE)
  test(`#857 @${width} /civs 首屏直接看到文明卡，条件栏默认收起`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./#/civs');
    await expect(page.locator('#grid .card').first()).toBeVisible();
    await fontsReady(page);
    expect(await firstCardTop(page), `${width} 首卡应在 900px 首屏内`).toBeLessThan(900);
    await expect(page.locator('#filter-panel')).toBeHidden();
    await expect(page.locator('#grid .card .mini')).toHaveCount(0);
  });
