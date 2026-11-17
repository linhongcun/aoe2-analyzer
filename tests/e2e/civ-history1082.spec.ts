import { expect, test } from '@playwright/test';

test('shows fixed Cuman effects and original evidence without leaving the object reader', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/#/patches?obj=civ%3ACumans&histVersion=de-34055&histSource=community');
  const card = page.locator('[data-history-event="ev-se-73d7a54c-b4cb-44a0-84c3-f58ec2a048fb"]');
  await expect(card.locator('.civ-update-values .num')).toHaveText(['50 HP', '40 HP', '55 HP', '45 HP']);
  await card.getByRole('button', { name: '依据与原文' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/34055版本后拥有40\/45HP/u).first()).toBeVisible();
  await expect(dialog.getByRole('link', { name: '打开原始来源' }).first()).toHaveAttribute('href', /^https:\/\/seicing\.com\/html\/aoe2\/2\//u);
  await page.keyboard.press('Escape');
  await expect(card.getByRole('button', { name: '依据与原文' })).toBeFocused();
  expect(await card.locator('.num').evaluateAll((nodes) => nodes.every((node) =>
    getComputedStyle(node).whiteSpace === 'nowrap' && parseFloat(getComputedStyle(node).fontSize) >= 12,
  ))).toBe(true);
});
