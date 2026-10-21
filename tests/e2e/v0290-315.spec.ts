import { expect, test } from '@playwright/test';
import { guardPage } from './v0290-helpers';

/**
 * v0.29.0 验收（#329）B 组 #315 部分：取自 Kent Beck test/v0290-acceptance @ 66530fc tests/e2e/v0290-B.spec.ts，断言原样未改。
 */
guardPage();

// ---------- #315 ----------
test.describe('#315 404 页容错建议', () => {
  for (const [input, label] of [
    ['/glossery', '术语与缩写'],
    ['/glosary', '术语与缩写'],
    ['/buildorder', '开局流程'],
    ['/build-orders', '开局流程'],
    ['/tradeincome', '商路供给'],
  ] as const)
    test(`#${input} 第 1 条建议是「${label}」`, async ({ page }) => {
      await page.goto('./#' + input);
      await expect(page.getByRole('heading', { level: 1, name: '找不到该页' })).toBeVisible();
      const links = page.locator('.not-found-suggestions a');
      await expect(links.first()).toHaveText(label);
      expect(await links.count()).toBeLessThanOrEqual(3);
    });
  test('守卫：#/hotkey 建议 快捷键速查，#/civ 建议 文明', async ({ page }) => {
    await page.goto('./#/hotkey');
    await expect(page.locator('.not-found-suggestions a').first()).toHaveText('快捷键速查');
    await page.goto('./#/civ');
    await expect(page.locator('.not-found-suggestions a').first()).toHaveText('文明');
  });
  test('反例：#/ab 不出建议', async ({ page }) => {
    await page.goto('./#/ab');
    await expect(page.getByRole('heading', { level: 1, name: '找不到该页' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '你是不是要找' })).toHaveCount(0);
  });
});
