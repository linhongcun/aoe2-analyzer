import { expect, test, type Page } from '@playwright/test';

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') messages.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

for (const width of [360, 375, 390, 1280]) {
  test.describe(`#291 全局搜索 @${width}`, () => {
    test.use({ viewport: { width, height: 900 } });

    test.beforeEach(async ({ page }) => {
      await page.goto('./#/');
      await expect(page.locator('#home h1')).toBeVisible();
    });

    test.afterEach(async ({ page }) => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });

    test('按钮打开后 Esc 和遮罩关闭都归还焦点', async ({ page }) => {
      const button = page.getByRole('button', { name: '全局搜索', exact: true });
      const dialog = page.getByRole('dialog', { name: '全局搜索', exact: true });
      await button.click();
      await expect(dialog.getByRole('combobox')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(button).toBeFocused();
      await button.click();
      await page.locator('.cmdk-mask').click({ position: { x: 1, y: 1 } });
      await expect(dialog).toHaveCount(0);
      await expect(button).toBeFocused();
    });

    test('Ctrl+K 和 Cmd+K 关闭后回到打开前的 activeElement', async ({ page }) => {
      const original = page.locator('a.brand');
      for (const shortcut of ['Control+k', 'Meta+k']) {
        await original.focus();
        await expect(original).toBeFocused();
        await page.keyboard.press(shortcut);
        const dialog = page.getByRole('dialog', { name: '全局搜索', exact: true });
        await expect(dialog.getByRole('combobox')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(original).toBeFocused();
      }
    });

    test('模态、组合框和选项语义正确，Tab 双向循环，方向键与 Enter 导航可用', async ({ page }) => {
      const button = page.getByRole('button', { name: '全局搜索', exact: true });
      await button.click();
      const dialog = page.getByRole('dialog', { name: '全局搜索', exact: true });
      const input = dialog.getByRole('combobox', { name: '全局搜索', exact: true });
      const list = dialog.getByRole('listbox', { name: '搜索结果', exact: true });
      await expect(dialog).toHaveAttribute('aria-modal', 'true');
      await expect(input).toHaveAttribute('aria-expanded', 'true');
      await expect(input).toHaveAttribute('aria-controls', (await list.getAttribute('id'))!);
      // 空结果时先按向下，再输入，仍能正确选择第一个结果。
      await input.fill('zzzz-no-result-291');
      await input.press('ArrowDown');
      await expect(list.getByRole('option')).toHaveCount(0);
      await expect(input).not.toHaveAttribute('aria-activedescendant');
      await input.fill('文明');
      const options = list.getByRole('option');
      await expect(options.nth(1)).toBeVisible();
      await expect(options.first()).toHaveAttribute('aria-selected', 'true');
      for (const key of ['Tab', 'Tab', 'Shift+Tab', 'Shift+Tab']) {
        await page.keyboard.press(key);
        await expect(input).toBeFocused();
      }
      await input.press('ArrowDown');
      await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
      await expect(options.first()).toHaveAttribute('aria-selected', 'false');
      await expect(input).toHaveAttribute('aria-activedescendant', (await options.nth(1).getAttribute('id'))!);
      await input.press('ArrowUp');
      await expect(options.first()).toHaveAttribute('aria-selected', 'true');
      await expect(input).toHaveAttribute('aria-activedescendant', (await options.first().getAttribute('id'))!);
      await input.press('Enter');
      await expect(page).toHaveURL(/#\/civs$/);
      await expect(dialog).toHaveCount(0);
      await expect(button).toBeFocused();
    });

    test('选中结果移除原触发元素后聚焦新页面主内容', async ({ page }) => {
      const original = page.locator('#home a[data-k="civs"]');
      await original.focus();
      await expect(original).toBeFocused();
      await page.keyboard.press('Control+k');
      const dialog = page.getByRole('dialog', { name: '全局搜索', exact: true });
      await dialog.getByRole('combobox').fill('文明');
      await dialog.getByRole('option').first().click();
      await expect(page).toHaveURL(/#\/civs$/);
      await expect(dialog).toHaveCount(0);
      await expect(original).toHaveCount(0);
      await expect(page.getByRole('main')).toBeFocused();
    });
  });
}
