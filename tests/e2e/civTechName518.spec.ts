import { expect, test } from '@playwright/test';

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#518 @${width} ${theme}：女真文明、科技详情与比较页统一显示强化堡垒`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/civ/Jurchens?tab=tech');
      const tech = page.getByRole('link', { name: '强化堡垒', exact: true });
      await expect(tech).toHaveAttribute('href', '#/tech/996');
      await expect(page.locator('main')).not.toContainText('加固堡垒');
      await expect(tech.locator('..')).toContainText('防御工事每分钟恢复 500 生命值');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`jurchens-tech-${width}-${theme}.png`), fullPage: true });
      await tech.click();
      await expect(page).toHaveURL(/#\/tech\/996(?:\?|$)/);
      await expect(page.locator('main h1')).toContainText('强化堡垒');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.goto('./#/compare');
      await page.getByRole('button', { name: /^文明 A：/ }).click();
      await page.locator('[role="option"][data-civ="Jurchens"]').click();
      const castle = page.locator('#ctab tr').filter({ has: page.getByRole('cell', { name: '城堡科技', exact: true }) });
      await expect(castle.locator('td').nth(1)).toHaveText('强化堡垒 (防御工事每分钟恢复 500 生命值)｜Fortified Bastions');
      await expect(page.locator('#ctab')).not.toContainText('加固堡垒');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
