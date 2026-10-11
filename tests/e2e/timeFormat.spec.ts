import { expect, test } from '@playwright/test';

/** #53：同一个时间全站一致（向下取整到秒）。archers-19 曾经摘要 9:44、第 8 步 9:45 */
test('archers-19：摘要、第 8 步、时代标记、列表页都是 9:44', async ({ page }) => {
  await page.goto('#/builds?bo=archers-19');
  await expect(page.locator('[data-t="sum-arrive"]')).toContainText('约 9:44');
  await expect(page.locator('[data-age="feudal"]')).toHaveAttribute('aria-label', '到达封建 约 9:44');
  await expect(page.locator('.tl-steps > li').nth(7)).toContainText('约 9:44');
  await expect(page.locator('body')).not.toContainText('9:45');
  await page.goto('#/builds');
  await expect(page.locator('[data-t="build-order"]').filter({ hasText: '9:44' }).first()).toBeAttached();
  await expect(page.locator('body')).not.toContainText('9:45');
});
