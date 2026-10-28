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
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors.get(page)).toEqual([]);
});

for (const width of [360, 375, 390, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`#468 圣骑士两入口 ${width} ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./');
      await expect(page.locator('#home')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.keyboard.press('Control+k');
      const global = page.getByRole('combobox', { name: '全局搜索', exact: true });
      await expect(global).toBeVisible();
      await global.fill('圣骑士');
      const result = page.getByRole('option').filter({ hasText: 'Paladin' });
      await expect(result).toHaveCount(1);
      await expect(result).toContainText('游侠');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`paladin-global-${width}-${theme}.png`) });
      await result.click();
      await expect(page).toHaveURL(/#\/unit\/569(?:[?&]|$)/);
      await expect(page.getByRole('heading', { level: 1, name: '游侠 Paladin', exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

      await page.goto('./#/civs?req=');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const panel = page.getByTestId('civ-requirements');
      const query = panel.getByRole('textbox', { name: '搜索必备单位或科技', exact: true });
      await expect(query).toBeEnabled();
      await query.fill('圣骑士');
      const add = panel.getByRole('button', { name: '添加单位 游侠', exact: true });
      await expect(add).toBeVisible();
      await add.click();
      const chip = panel.getByTestId('requirement-chip');
      await expect(chip).toHaveCount(1);
      await expect(chip.getByRole('link')).toHaveAttribute('href', '#/unit/569');
      expect(new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('req')).toBe('u:569');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`paladin-requirement-${width}-${theme}.png`), fullPage: true });
      await chip.getByRole('link', { name: '游侠', exact: true }).click();
      await expect(page).toHaveURL(/#\/unit\/569(?:[?&]|$)/);
      await expect(page.getByRole('heading', { level: 1, name: '游侠 Paladin', exact: true })).toBeVisible();
    });
  }
}
