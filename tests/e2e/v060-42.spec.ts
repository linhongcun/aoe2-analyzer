// #42：最后两文明在 #197 完成后都按自身机制计算。
import { expect, test } from '@playwright/test';

for (const [civ, zh] of [
  ['Poles', '波兰'],
  ['Romans', '罗马'],
])
  test(`#42 ${zh}不再回退通用`, async ({ page }) => {
    await page.goto(`#/builds?bo=fast-castle-boom&civ=${civ}`);
    await expect(page.getByRole('list', { name: /时间线/ })).toBeVisible();
    await expect(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
    await expect(page.locator('[data-t="sum-civ"]')).toHaveText(`按${zh}计`);
    await expect(page.locator('[data-t="share-card-btn"]:visible').first()).not.toHaveAttribute('aria-disabled', 'true');
  });
