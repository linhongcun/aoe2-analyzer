import { expect, test } from '@playwright/test';

test('keeps building base values separate from team relations', async ({ page }) => {
  await page.goto('/#/building/79?tab=history&histVersion=de-61321');
  await page.getByRole('link', { name: '查看完整历史' }).click();
  const reader = page.getByTestId('patch-object');
  await expect(reader.locator('.civ-update-values .num')).toHaveText(['700 生命值', '850 生命值']);
  await page.reload();
  await expect(reader.locator('.civ-update-values .num')).toHaveText(['700 生命值', '850 生命值']);
  await page.goto('/#/patches?obj=building%3A79&histVersion=de-81058');
  const card = reader.locator('[data-history-event="ev-legacy-81058-b056"]');
  await expect(card).toContainText('提供者：埃塞俄比亚');
  await expect(card).toContainText('受益文明未列明');
  await expect(card).toContainText('瞭望箭塔不再享有埃塞俄比亚的组队视野加成');
  await expect(card.getByRole('heading').first()).not.toContainText('哨站');
  await card.getByRole('button', { name: '依据与原文' }).click();
  await expect(page.getByRole('dialog')).toContainText('哨站的视野+3且不消耗石头');
});
