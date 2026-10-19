import { expect, test } from '@playwright/test';

for (const width of [360, 375, 390, 1280]) {
  for (const theme of ['light', 'dark']) {
    test(`科技首发筛选与详情 ${width} ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.addInitScript((value) => {
        localStorage.setItem('aoe2-theme', value);
      }, theme);
      await page.goto('./#/techs');
      await expect(page.locator('#tgrid .card').first()).toBeVisible();
      const toggle = page.locator('#techs .catalog-filter-toggle');
      if (width <= 600) await toggle.click();
      await page.locator('#tq').fill('Chivalry');
      await page.locator('#tdlc').selectOption('2');
      await expect(page.locator('#tcnt')).toHaveText('1 / 199');
      await expect(page.locator('#tgrid .card .dlci')).toHaveAttribute('alt', /失落帝国/);
      await page.locator('#tdlc').selectOption('0');
      await expect(page.locator('#tcnt')).toHaveText('0 / 199');
      await page.locator('#tq').fill('Fletching');
      await expect(page.locator('#tcnt')).toHaveText('1 / 199');
      await expect(page.locator('#tgrid .card .dlci')).toHaveAttribute('alt', /国王时代/);
      await page.locator('#tq').fill('Gambesons');
      await page.locator('#tdlc').selectOption('update');
      await expect(page.locator('#tcnt')).toHaveText('1 / 199');
      await expect(page.locator('#tgrid [data-tech-release="update"]')).toHaveText('免费更新 · 81058');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`tech-filter-${width}-${theme}.png`), fullPage: true });
      await page.locator('#tdlc').selectOption('none');
      await expect(page.locator('#tcnt')).toHaveText('0 / 199');
      await page.goto('./#/tech/875');
      await expect(page.locator('#tech [data-tech-release="update"]')).toHaveText('免费更新 · 81058');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`tech-update-${width}-${theme}.png`), fullPage: true });
      await page.goto('./#/tech/493');
      await expect(page.locator('#tech .dlcb.big')).toContainText('失落帝国');
      await expect(page.locator('#tech [data-tech-release="update"]')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
  }
}
