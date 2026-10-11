import { test, expect } from '@playwright/test';

test('#14 首页单位数与列表页总数一致：161 · 精锐版并入对应单位计', async ({ page }) => {
  await page.goto('./#/');
  await expect(page.locator('body')).toContainText('161 · 精锐版并入对应单位计');
  await expect(page.locator('body')).not.toContainText('248 个单位');
  await page.goto('./#/units');
  await expect(page.locator('#ucnt')).toHaveText('161 / 161 · 精锐版并入对应单位计');
});
