import { expect, test, type Page } from '@playwright/test';

/** #280：全局搜索改为懒加载。首页加载时不请求搜索分包，第一次按 Ctrl+K 才加载，且能正常搜索。 */
function paletteRequests(page: Page) {
  const urls: string[] = [];
  page.on('request', (request) => {
    if (/\/assets\/CommandPalette-[^/]+\.js$/.test(request.url())) urls.push(request.url());
  });
  return urls;
}

for (const width of [360, 1280]) {
  test.describe(`#280 全局搜索懒加载 @${width}`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('首页不加载搜索分包，第一次按 Ctrl+K 后能正常搜索并跳转', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const requests = paletteRequests(page);
      await page.goto('./');
      await expect(page.locator('#home h1')).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(requests).toEqual([]);

      await page.keyboard.press('Control+k');
      const dialog = page.getByRole('dialog', { name: '全局搜索', exact: true });
      const input = dialog.getByRole('combobox');
      await expect(input).toBeFocused();
      expect(requests.length).toBeGreaterThan(0);
      await page.keyboard.type('paladin');
      await expect(page.locator('.cmdk-list li').first()).toContainText('Paladin');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/#\/unit\/569/);
      await expect(dialog).toHaveCount(0);
      expect(errors).toEqual([]);
    });

    test('搜索分包还在加载时立刻输入，字不会丢', async ({ page }) => {
      // 人为拖慢搜索分包，确保输入发生在弹窗出现之前。
      await page.route(/\/assets\/CommandPalette-[^/]+\.js$/, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 800));
        await route.continue();
      });
      await page.goto('./');
      await expect(page.locator('#home h1')).toBeVisible();
      await page.keyboard.press('Control+k');
      await page.keyboard.type('paladinx');
      await page.keyboard.press('Backspace');
      const input = page.getByRole('dialog', { name: '全局搜索', exact: true }).getByRole('combobox');
      await expect(input).toBeFocused();
      await expect(input).toHaveValue('paladin');
      await expect(page.locator('.cmdk-list li').first()).toContainText('Paladin');
      await page.keyboard.type(' ');
      await expect(input).toHaveValue('paladin ');
    });

    test('第一次点击搜索按钮也能打开并搜索，Esc 后焦点回到按钮', async ({ page }) => {
      await page.goto('./#/civs');
      const button = page.getByRole('button', { name: '全局搜索', exact: true });
      await button.click();
      const dialog = page.getByRole('dialog', { name: '全局搜索', exact: true });
      await expect(dialog.getByRole('combobox')).toBeFocused();
      await dialog.getByRole('combobox').fill('文明');
      await expect(dialog.getByRole('option').first()).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(button).toBeFocused();
    });
  });
}
