import { expect, test, type Page } from '@playwright/test';
import civs from '../../src/data/civs.json' with { type: 'json' };
import { guardPage, WIDTHS, wrappedNums } from './v0290-helpers';

/**
 * v0.29.0 验收（#329）B 组 #326 部分：取自 Kent Beck test/v0290-acceptance @ d21a0de tests/e2e/v0290-B.spec.ts。
 * #425：按维护者明确要求移除文明卡 DLC 图标，文明列表改验收图标无残留、盾徽保留及位置文字无旧缩进。
 * 数字不换行断言保持原样。#970 起科技模拟器改为结果行，费用守卫改测资源不被建筑名拆开。
 */
guardPage();

// ---------- #326 ----------
test.describe('#425 文明列表：卡片保留文明盾徽，不放资料片图标或位置评分', () => {
  for (const width of WIDTHS)
    test(`#/civs @${width}：卡片无 DLC 图标和旧缩进，文明盾徽及数字不折行保持可用`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./#/civs');
      const cards = page.locator('#grid .card[data-civ]');
      await expect(cards).toHaveCount(civs.length);
      await page.waitForLoadState('networkidle');
      await expect(cards.locator('img.ico[src*="/img/civs/"]')).toHaveCount(civs.length);
      await expect(cards.locator('.cdl, .dlcb, img[src*="/img/dlc/"]')).toHaveCount(0);
      await expect(cards.locator('.mini')).toHaveCount(0);
      await expect(page.getByRole('group', { name: 'DLC 快捷筛选', exact: true })).toHaveCount(0);
      expect(await wrappedNums(page, 'main')).toEqual([]);
      await page.screenshot({ path: info.outputPath(`civs-${width}.png`), fullPage: false });
    });
});

/** #970 起选单位改为紧凑行。造价整组不拆开，也不和建筑名叠在一起。 */
async function splitCosts(page: Page) {
  return page.locator('#simhub .sim-row').evaluateAll((rows) =>
    rows.flatMap((row) => {
      const cost = row.querySelector('.sim-cost');
      const meta = row.querySelector('.sim-prod');
      if (!cost || !meta) return [row.getAttribute('data-unit-id') ?? 'missing'];
      const resources = [...cost.querySelectorAll('.res')].map((el) => el.getBoundingClientRect()).filter((rect) => rect.width > 0 && rect.height > 0);
      const tops = resources.map((rect) => rect.top);
      const split = tops.length > 1 && Math.max(...tops) - Math.min(...tops) > 6;
      const production = meta.getBoundingClientRect();
      const price = cost.getBoundingClientRect();
      const overlap =
        production.width > 0 &&
        price.width > 0 &&
        production.left < price.right - 1 &&
        price.left < production.right - 1 &&
        production.top < price.bottom - 1 &&
        price.top < production.bottom - 1;
      return split || overlap ? [row.getAttribute('data-unit-id') ?? 'row'] : [];
    }),
  );
}
test.describe('#970 守卫：科技模拟器造价不再被建筑名拆开', () => {
  for (const width of WIDTHS)
    test(`#/simulator @${width}：结果行的资源图标同一行，且不压住生产文字`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./#/simulator');
      await expect(page.locator('#simhub .sim-row').first()).toBeVisible();
      await expect(page.locator('#simhub .ucard, #simhub #ugrid')).toHaveCount(0);
      await page.waitForLoadState('networkidle');
      expect(await page.locator('#simhub .sim-row').count(), '防空转：模拟器结果行').toBeGreaterThan(100);
      expect(await splitCosts(page)).toEqual([]);
    });
});
