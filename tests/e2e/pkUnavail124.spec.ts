import { expect, test } from '@playwright/test';

/** #124 补充：造不了时不出结果；「换个文明」打开文明选择器；B 方按钮只改 b，团队加成字段保留 */
test('#124 造不了时不出对战结果，只给提示', async ({ page }) => {
  await page.goto('#/duel?a=39.Franks.3.f.&b=39.Magyars.3.f.&m=r&bud=3000');
  await expect(page.locator('[data-t="pk-pending"]')).toBeVisible();
  await expect(page.locator('#duel-res')).toHaveCount(0);
});
test('#124「换个文明」打开文明选择器，选能造的文明后 URL 才改', async ({ page }) => {
  await page.goto('#/duel?a=39.Aztecs.3.f.&b=39.Magyars.3.f.&m=1');
  await page.getByRole('button', { name: '换个文明' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page).toHaveURL(/a=39\.Aztecs\./);
});
test('#124 B 方点「换成骑马弩兵」只改 b，保留时代/科技/团队字段', async ({ page }) => {
  await page.goto('#/duel?a=39.Magyars.3.f.&b=39.Franks.3.f.1-2&m=1');
  await page.locator('#duel-b').getByRole('button', { name: '换成骑马弩兵' }).click();
  await expect(page).toHaveURL(/b=2700\.Franks\.3\.f\.1-2/);
  await expect(page).toHaveURL(/a=39\.Magyars\./);
  await expect(page.locator('#duel-res')).toBeVisible();
});
