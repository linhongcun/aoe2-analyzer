import { test, expect } from '@playwright/test';

test('#14 首页单位数与列表页总数一致：163 个单位（精锐版并入对应单位计）', async ({ page }) => {
  await page.goto('./#/');
  await expect(page.locator('body')).toContainText('163 个单位（精锐版并入对应单位计）的属性、克制与升级路线');
  await expect(page.locator('body')).not.toContainText('248 个单位');
  await expect(page.locator('body')).not.toContainText('161 个单位');
  await page.goto('./#/units');
  await expect(page.locator('#ucnt')).toHaveText('163 / 163');
});
