import { expect, test, type Page } from '@playwright/test';

async function chooseCiv(page: Page, civ: string) {
  await page.locator('#uciv').click();
  const picker = page.getByRole('dialog', { name: '可用文明', exact: true });
  await picker.getByRole('combobox').fill(civ);
  await picker.locator(`[role="option"][data-civ="${civ}"]`).click();
  await expect(picker).toHaveCount(0);
}

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#475 长矛兵详情和时代筛选一致 ${width} ${theme}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/unit/93');
      await expect(page.locator('#unit .dhead h1')).toContainText('长矛兵');
      await expect(page.locator('#unit .dhead-tags .tag').filter({ hasText: /^封建时代$/ })).toHaveCount(1);
      await expect(page.locator('#unit p.note').filter({ hasText: /亚美尼亚[^。\n]*黑暗时代/ })).toHaveCount(1);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`spearman-detail-${width}-${theme}.png`), fullPage: true });

      await page.goto('./#/unit/93/Armenians/1');
      await expect(page.locator('#unit .dhead-tags .tag').filter({ hasText: /^黑暗时代$/ })).toHaveCount(1);
      // The header can render before tree data and the simulator's URL-normalizing effect.
      // Finish that navigation before leaving. #550 keeps a path that already parses as the
      // same route, so #/unit/93/Armenians/1 stays without a trailing slash. Either form still opens this page.
      const simulator = page.locator('#sim');
      await expect(simulator.getByRole('button', { name: '文明：亚美尼亚', exact: true })).toBeVisible();
      await expect(page).toHaveURL(/#\/unit\/93\/Armenians\/1$/);
      await expect(simulator.locator('#simage')).toHaveValue('1');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

      await page.goto('./#/units');
      await expect(page).toHaveURL(/#\/units$/);
      await expect(page.locator('#ucnt')).not.toHaveText('0 / 0');
      await page.locator('#uq').fill('Spearman');
      const spear = page.locator('#ugrid [data-unit-id="93"]');
      await page.locator('#ua').selectOption('2');
      await expect(spear).toBeVisible();
      await expect(spear.locator('.mini')).toContainText('封建时代');
      await page.locator('#ua').selectOption('1');
      await expect(spear).toHaveCount(0);
      await chooseCiv(page, 'Armenians');
      await expect(spear).toBeVisible();
      await expect(spear.locator('.mini')).toContainText('黑暗时代');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`spearman-armenian-${width}-${theme}.png`), fullPage: true });
      await page.locator('#ua').selectOption('2');
      await expect(spear).toHaveCount(0);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      expect(errors).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
