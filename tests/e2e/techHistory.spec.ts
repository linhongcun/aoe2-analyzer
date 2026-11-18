import { expect, test } from '@playwright/test';

test('retired research retains its exact identity and distinct time values', async ({ page }) => {
  await page.goto('/#/patches?histEntity=tech%2F716%40retired&histVersion=de-81058');
  await expect(page).toHaveURL(/obj=tech%3A716%40retired/u);
  const reader = page.getByTestId('patch-object');
  await expect(reader.getByRole('heading', { name: /补给.*退役/u })).toBeVisible();
  const adjustment = reader.locator('[data-history-event="ev-unit-legacy-81058-81058-b011"]');
  await expect(adjustment.locator('.num')).toHaveText(['35 秒', '20 秒']);
});
