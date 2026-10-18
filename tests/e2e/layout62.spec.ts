import { expect, test } from '@playwright/test';

test('#62 首页五个工具在桌面同一行显示', async ({ page }) => {
  await page.goto('./#/');
  const cards = page.locator('#home .home-tools-grid .hcard');
  await expect(cards).toHaveCount(5);
  const tops = await cards.evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
});
