import { expect, test } from '@playwright/test';

const pages = ['/mixed-army', '/match-review', '/content-guide'] as const;

test.describe('#270 三页只保留一处适用范围与来源', () => {
  for (const route of pages)
    test(`${route} 只有一个「适用范围与来源」，默认收起`, async ({ page }) => {
      await page.goto(`./#${route}`);
      const summary = page.getByText('适用范围与来源', { exact: true });
      await expect(summary).toHaveCount(1);
      expect(await summary.evaluate((node) => (node.parentElement as HTMLDetailsElement).open)).toBe(false);
    });

  test('混兵默认给出示例结论，尚未确认清单收起', async ({ page }) => {
    await page.goto('./#/mixed-army');
    await expect(page.getByTestId('mixed-example')).toContainText('不能解决后方掷矛手');
    await expect(page.getByTestId('mixed-example')).not.toContainText('目前没有可按所填条件采用的路线');
    expect(await page.getByTestId('mixed-pending').evaluate((node) => (node as HTMLDetailsElement).open)).toBe(false);
    await expect(page.locator('[data-card]')).toHaveCount(0);
  });

  test('手填复盘来源写成 Reddit 帖子发布日期', async ({ page }) => {
    await page.goto('./#/match-review');
    await page.getByText('适用范围与来源', { exact: true }).click();
    await expect(page.getByTestId('scope-sources')).toContainText('Reddit 帖子，发布于 2025-10-20');
    await expect(page.getByTestId('match-review-page')).not.toContainText('页面日期导航');
  });

  test('内容指南共用依据只出现一次，战役名带中文', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('./#/content-guide');
    await expect(page.locator('.cg-card')).toHaveCount(17);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(height).toBeLessThan(5800);
    await expect(page.getByText('当前本体购买项列出四件物品')).toBeHidden();
    await page.getByText('适用范围与来源', { exact: true }).click();
    await expect(page.getByText('当前本体购买项列出四件物品')).toHaveCount(1);
    await expect(page.getByRole('link', { name: '官方五周年收录及赠送公告', exact: true })).toHaveCount(1);
    const lords = page.locator('[data-product="lords-of-the-west"]');
    await expect(lords.locator('.cg-contents-names')).toContainText('长腿爱德华');
    await lords.locator('details.cg-contents > summary').click();
    const campaign = lords.locator('[data-content-id="aoe2:Edward Longshanks"]');
    await expect(campaign).toContainText('长腿爱德华');
    await expect(campaign).toContainText('Edward Longshanks');
    await expect(page.locator('[data-product="dawn-of-the-dukes"] .cg-contents-names')).toContainText('雅德维加');
  });

  for (const width of [360, 375, 390, 1280])
    for (const theme of ['light', 'dark'] as const)
      test(`${width}px ${theme} 三页无横向滚动`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
        for (const route of pages) {
          await page.goto(`./#${route}`);
          await expect(page.locator('main')).toBeVisible();
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        }
      });
});
