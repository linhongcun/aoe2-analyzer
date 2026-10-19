import { expect, test } from '@playwright/test';

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#193 ${theme} @${width}：相关科技按数值作用关联并可查看全部`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.goto('./#/unit/38?tab=rel');
      const related = page.locator('[role="tabpanel"]');
      for (const id of [67, 435, 81, 39]) await expect(related.locator(`a[href="#/tech/${id}"]`)).toBeVisible();
      await expect(related).toContainText('已建模的数值科技');
      await expect(related.locator('a[href="#/tech/577"]')).toBeVisible();
      await expect(related).toContainText('马里');
      for (const link of await related.locator('a[href^="#/tech/"]').all()) expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);

      const side = page.locator('.dside [data-t="unit-related-techs"]');
      await side.locator('summary').click();
      await expect(side.locator('a[href^="#/tech/"]')).toHaveCount(await related.locator('a[href^="#/tech/"]').count());
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: info.outputPath(`knight-${theme}-${width}.png`), fullPage: true });

      await page.goto('./#/unit/38/Franks/4?tab=rel');
      await expect(related.locator('a[href="#/tech/67"]')).toBeVisible();
      await expect(related.locator('a[href="#/tech/81"]')).toBeVisible();
      await expect(related.locator('a[href="#/tech/39"]')).toBeVisible();
      await expect(related.locator('a[href="#/tech/435"]')).toHaveCount(0);
      await expect(related.locator('a[href="#/tech/577"]')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`franks-${theme}-${width}.png`), fullPage: true });

      await page.goto('./#/unit/73?tab=rel');
      await expect(related).toContainText('已建模的数值科技');
      await expect(related.locator('a[href="#/tech/3"]')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
