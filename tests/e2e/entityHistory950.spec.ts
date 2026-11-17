import { expect, test } from '@playwright/test';

test('keeps an archive-only source conflict in the archive without passing it off as verified', async ({ page }) => {
  await page.goto('/#/patches/185872?q=来源冲突');
  const conflict = page.locator('[data-entry="185872-17"]');
  await expect(conflict).toContainText('来源冲突');
  await expect(conflict.locator('.patch-values')).toHaveCount(0);
  await expect(page.getByText('档案日期：2026-09-23')).toBeVisible();
  await expect(page.getByText('类别未知', { exact: true })).toBeVisible();
});
