import { expect, test, type Page } from '@playwright/test';
/**
 * #86 缺口用例（Kent 初验草稿，已适配当前 UI：不再有弱提示行、不显示价格）。
 * 切换模式清空 be=1；上限内打不赢（贸易车 vs 游侠 = Paladin ×10）；民兵平局 N=11；单调场景无弱提示、无价格。
 */
const WIDTHS = [360, 375, 390, 1280] as const;
const AB = 'a=359.Byzantines.4.f.&b=569.Franks.4.f.';

const noHScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

for (const w of WIDTHS) {
  test.describe(`盈亏平衡缺口 @${w}`, () => {
    test.use({ viewport: { width: w, height: 900 } });

    test('切换 1v1 与 N vs M：结果直接清空（不是置灰），URL 去掉 be=1', async ({ page }) => {
      await page.goto(`./#/duel?${AB}&m=n&na=10&nb=10`);
      await page.getByRole('button', { name: '算盈亏平衡' }).click();
      await expect(page.locator('[data-t=be-n]')).toHaveText('16');
      await page.getByRole('radio', { name: '1v1' }).click();
      await expect(page.locator('#duel-be')).toHaveCount(0);
      await expect(page.locator('[data-t=be-stale]')).toHaveCount(0);
      await expect(page.getByRole('button', { name: '算盈亏平衡' })).toBeVisible();
      await expect(page).not.toHaveURL(/be=1/);
    });

    test('分享链接带 be=1 时切换模式：不会自动重新算出结果', async ({ page }) => {
      await page.goto(`./#/duel?${AB}&m=n&na=10&nb=10&be=1`);
      await expect(page.locator('[data-t=be-n]')).toHaveText('16');
      await page.getByRole('radio', { name: '1v1' }).click();
      await expect(page.locator('#duel-be')).toHaveCount(0);
      await expect(page).not.toHaveURL(/be=1/);
    });

    test('上限内打不赢：贸易车（无攻击）vs 游侠（Paladin）×10 显示「上限内打不赢」态', async ({ page }) => {
      await page.goto('./#/duel?a=128.Britons.4.f.&b=569.Franks.4.f.&m=n&na=10&nb=10');
      await page.getByRole('button', { name: '算盈亏平衡' }).click();
      await expect(page.locator('[data-t=be-cap]')).toBeVisible();
      await expect(page.locator('[data-t=be-n]')).toHaveCount(0);
      await expect(page.locator('.be-tab tbody tr')).toHaveCount(1);
      await expect(page.getByRole('button', { name: /在 N vs M 中打开/ })).toHaveCount(0);
      await noHScroll(page);
    });

    test('平局：民兵 vs 民兵 × 10，第 10 档平局算不赢，N = 11', async ({ page }) => {
      await page.goto('./#/duel?a=74.Britons.3.c.&b=74.Britons.3.c.&m=n&na=10&nb=10');
      await page.getByRole('button', { name: '算盈亏平衡' }).click();
      await expect(page.locator('[data-t=be-n]')).toHaveText('11');
      await expect(page.locator('.be-tab tbody tr').nth(0)).toContainText('A 负（含平局）');
    });

    test('单调场景：不出现弱提示，不显示价格', async ({ page }) => {
      await page.goto(`./#/duel?${AB}&m=n&na=10&nb=10&be=1`);
      await expect(page.locator('[data-t=be-n]')).toHaveText('16');
      await expect(page.locator('#duel-be')).not.toContainText('部分数量也能赢');
      await expect(page.locator('#duel-be')).not.toContainText(/食物|木头|黄金|总价|价格/);
    });
  });
}
