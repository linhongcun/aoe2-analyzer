import { expect, test } from '@playwright/test';

test('keeps the regular and elite numeric values separate while preserving unit source entries', async ({ page }) => {
  const id = 'ev-se-73d7a54c-b4cb-44a0-84c3-f58ec2a048fb';
  const card = page.locator('[data-history-event="' + id + '"]');
  for (const [unit, values] of [['1231', ['50 HP', '40 HP']], ['1233', ['55 HP', '45 HP']]] as const) {
    await page.goto('/#/unit/' + unit + '?tab=history&histVersion=de-34055&histEvent=' + id);
    await page.getByRole('link', { name: '查看完整历史' }).click();
    await expect(page).toHaveURL(/histVersion=de-34055/u);
    await expect(card.locator('.civ-update-values .num')).toHaveText([...values]);
  }
  await page.getByRole('button', { name: '收录说明' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '逐条处置' }).click();
  await expect(dialog.getByText(/自有章节/u)).toHaveCount(8);
  const original = dialog.getByRole('button', { name: '查看原文' }).first();
  await original.click();
  await dialog.getByRole('button', { name: '返回逐条处置' }).click();
  await expect(original).toBeFocused();
});
