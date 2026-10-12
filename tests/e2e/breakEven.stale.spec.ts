import { expect, test, type Page } from '@playwright/test';
/** Kent #86 复验补充：置灰态保留计算当时的 N / 三档 / 摘要，只有点「重新计算」才更新；上限态文字为弱化色。 */
const AB = 'a=359.Byzantines.4.f.&b=569.Franks.4.f.';
const noH = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
for (const w of [360, 375, 390, 1280] as const)
  test.describe(`盈亏平衡置灰 @${w}`, () => {
    test.use({ viewport: { width: w, height: 900 } });
    test('N vs M 改 B 数量：置灰但 N/三档/摘要不变，点重新计算才更新', async ({ page }) => {
      await page.goto(`./#/duel?${AB}&m=n&na=10&nb=10`);
      await page.getByRole('button', { name: '算盈亏平衡' }).click();
      await expect(page.locator('[data-t=be-n]')).toHaveText('16');
      await page.getByRole('radio', { name: '无科技' }).nth(1).click(); // B 改无科技
      await expect(page.locator('[data-t=be-stale]')).toContainText('参数已变，请重新计算');
      await expect(page.locator('.be-card')).toHaveClass(/is-stale/);
      await expect(page.locator('[data-t=be-n]')).toHaveText('16');
      await expect(page.locator('.be-tab tbody tr').first()).toHaveAttribute('data-n', '15');
      await expect(page.locator('.be-sum')).toContainText('法兰克 游侠 · 满科技');
      await expect(page.getByRole('button', { name: /在 N vs M 中打开/ })).toBeDisabled();
      await noH(page);
      await page.waitForTimeout(300);
      await expect(page.locator('[data-t=be-n]')).toHaveText('16'); // 不自动重算
      await page.getByRole('button', { name: '重新计算' }).click();
      await expect(page.locator('[data-t=be-stale]')).toHaveCount(0);
      await expect(page.locator('[data-t=be-n]')).not.toHaveText('16');
      await expect(page.locator('.be-sum')).toContainText('法兰克 游侠 · 无科技');
    });
  });
