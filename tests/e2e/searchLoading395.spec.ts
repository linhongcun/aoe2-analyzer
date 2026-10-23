import { expect, test, type Page } from '@playwright/test';

// #395：每条用例使用新上下文，固定延迟首次搜索分包，避免依赖机器网速或缓存命中。
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') messages.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

async function holdSearchChunk(page: Page) {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/assets\/CommandPalette-[^/]+\.js(?:\?.*)?$/, async (route) => {
    await held;
    await route.continue();
  });
  return async () => {
    release();
    await page.unrouteAll({ behavior: 'wait' });
    await page.waitForLoadState('networkidle');
  };
}

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'] as const)
    test.describe(`#395 @${width} ${theme}`, () => {
      test.use({ viewport: { width, height: 900 } });
      test.beforeEach(async ({ page }) => {
        await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      });

      test('加载外壳双向 Tab 不逃逸，随后 Esc 关闭并归还快捷键前的焦点', async ({ page }) => {
        const release = await holdSearchChunk(page);
        try {
          await page.goto('./#/');
          await expect(page.locator('#home h1')).toBeVisible();
          const original = page.locator('a.brand');
          await original.focus();
          await page.keyboard.press('Control+k');
          const dialog = page.getByRole('dialog', { name: '全局搜索', exact: true });
          const input = dialog.getByRole('textbox', { name: '全局搜索', exact: true });
          await expect(dialog).toContainText('加载中');
          await expect(input).toBeFocused();
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          const screenshot = test.info().outputPath(`loading-${width}-${theme}.png`);
          await page.screenshot({ path: screenshot, fullPage: false });
          await test.info().attach('加载外壳', { path: screenshot, contentType: 'image/png' });
          for (const key of ['Tab', 'Shift+Tab']) {
            await input.focus();
            await page.keyboard.press(key);
            await expect.soft(input, `${key} 应保持在加载外壳内`).toBeFocused({ timeout: 1500 });
          }
          await page.keyboard.press('Escape');
          await expect(dialog).toHaveCount(0, { timeout: 1500 });
          await expect(original).toBeFocused();
        } finally {
          await release();
        }
      });

      test('遮罩关闭归还按钮焦点，重开后的查询交接及正式键盘导航正常', async ({ page }) => {
        const release = await holdSearchChunk(page);
        try {
          await page.goto('./#/');
          await expect(page.locator('#home h1')).toBeVisible();
          const button = page.getByRole('button', { name: '全局搜索', exact: true });
          const dialog = page.getByRole('dialog', { name: '全局搜索', exact: true });
          await button.click();
          await expect(dialog).toContainText('加载中');
          await page.locator('.cmdk-mask').click({ position: { x: 1, y: 1 } });
          await expect(dialog).toHaveCount(0);
          await expect(button).toBeFocused();
          await button.click();
          await expect(dialog).toContainText('加载中');
          await dialog.locator('input').fill('文明');
          await release();
          const input = dialog.getByRole('combobox', { name: '全局搜索', exact: true });
          await expect(input).toHaveValue('文明');
          await expect(input).toBeFocused();
          const options = dialog.getByRole('option');
          await expect(options.nth(1)).toBeVisible();
          for (const key of ['Tab', 'Shift+Tab']) {
            await page.keyboard.press(key);
            await expect(input).toBeFocused();
          }
          await input.press('ArrowDown');
          await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
          await input.press('ArrowUp');
          await expect(options.first()).toHaveAttribute('aria-selected', 'true');
          await input.press('Enter');
          await expect(page).toHaveURL(/#\/civs$/);
          await expect(dialog).toHaveCount(0);
          await expect(button).toBeFocused();
        } finally {
          await release();
        }
      });
    });
