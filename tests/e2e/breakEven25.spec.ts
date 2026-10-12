import { expect, test, type Page } from '@playwright/test';
/**
 * #25 盈亏平衡点：场景 1（拜占庭长戟兵 vs 法兰克游侠，满科技）。
 * N 与三档必须和逐档在「N vs M」里手动设置数量的结果一致；四档宽度无横向溢出。
 */
const WIDTHS = [360, 375, 390, 1280] as const;
const AB = 'a=359.Byzantines.4.f.&b=569.Franks.4.f.';

const noHScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

for (const w of WIDTHS) {
  test.describe(`盈亏平衡 @${w}`, () => {
    test.use({ viewport: { width: w, height: 900 } });

    test('N vs M：点「算盈亏平衡」得出 16，三档 15 负 / 16 胜 / 17 胜，无横向溢出', async ({ page }) => {
      await page.goto(`./#/duel?${AB}&m=n&na=10&nb=10`);
      await page.getByRole('button', { name: '算盈亏平衡' }).click();
      await expect(page.locator('[data-t=be-n]')).toHaveText('16');
      await expect(page.locator('#duel-be')).toContainText('个长戟兵，才能打赢 10 个游侠');
      const rows = page.locator('.be-tab tbody tr');
      await expect(rows).toHaveCount(3);
      await expect(rows.nth(0)).toContainText('A 负（含平局）');
      await expect(rows.nth(1)).toContainText('A 胜');
      await expect(rows.nth(2)).toContainText('A 胜');
      await expect(page).toHaveURL(/be=1/);
      await expect(page.locator('[data-t=be-sub]')).toHaveText('16 个及以上直到 200 个都能赢');
      // 该场景 1..200 胜负单调，不显示不稳定提示
      await expect(page.locator('[data-t=be-unstable]')).toHaveCount(0);
      await noHScroll(page);
      // 「在 N vs M 中打开」后，主 PK 结果与第 N 档一致
      await page.getByRole('button', { name: /在 N vs M 中打开 16 vs 10/ }).click();
      await expect(page.locator('#duel-res h3')).toContainText('A · 长戟兵 获胜');
    });

    test('N−1 档与手动 N vs M 一致：15 vs 10 游侠获胜', async ({ page }) => {
      await page.goto(`./#/duel?${AB}&m=n&na=15&nb=10`);
      await expect(page.locator('#duel-res h3')).toContainText('B · 游侠 获胜');
    });

    test('1v1 入口：2 个长戟兵才能打赢 1 个游侠；改参数后旧结果变灰', async ({ page }) => {
      await page.goto(`./#/duel?${AB}&m=1`);
      await page.getByRole('button', { name: '算盈亏平衡' }).click();
      await expect(page.locator('[data-t=be-n]')).toHaveText('2');
      await expect(page.locator('#duel-be')).toContainText('才能打赢 1 个游侠');
      await page.getByRole('radio', { name: '无科技' }).first().click();
      await expect(page.locator('[data-t=be-stale]')).toContainText('参数已变，请重新计算');
      await expect(page.locator('.be-card')).toHaveClass(/is-stale/);
      await noHScroll(page);
      await page.getByRole('button', { name: '重新计算' }).click();
      await expect(page.locator('[data-t=be-stale]')).toHaveCount(0);
    });

    test('分享链接 be=1 打开即显示结果', async ({ page }) => {
      await page.goto(`./#/duel?${AB}&m=n&na=10&nb=10&be=1`);
      await expect(page.locator('[data-t=be-n]')).toHaveText('16');
    });
  });
}
