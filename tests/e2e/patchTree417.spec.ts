import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#417 科技树汇总 ${theme} ${width}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (e) => {
        if (e.type() === 'error') errors.push(e.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/patches/185872');
      const summary = page.locator('.patch-tree-summary');
      await expect(summary).not.toHaveAttribute('open');
      await summary.locator('summary').focus();
      await summary.locator('summary').press('Enter');
      await expect(summary.locator('h4')).toHaveCount(21);
      const shortestCiv = await summary.getByRole('link', { name: '蜀', exact: true }).boundingBox();
      expect(shortestCiv!.width).toBeGreaterThanOrEqual(44);
      expect(shortestCiv!.height).toBeGreaterThanOrEqual(44);
      await expect(summary.getByRole('listitem')).toHaveCount(57);
      await expect(page.locator('.patch-entry')).not.toHaveCount(0);
      await expect(summary.getByRole('link', { name: '萨拉森', exact: true })).toHaveAttribute('href', '#/tree/Saracens');
      await expect(summary.getByRole('link', { name: '脚踏起重机', exact: true })).toHaveCount(8);
      await expect(summary.locator('a[href="#/unit/2700"]').first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.goto('./#/patches/185872?civ=Saracens');
      if (!(await summary.evaluate((el) => (el as HTMLDetailsElement).open))) await summary.locator('summary').click();
      await expect(summary.locator('h4')).toHaveCount(1);
      await expect(summary).toContainText('改动前 已开放');
      await expect(summary).toContainText('改动后 未开放');
      const tech = summary.getByRole('link', { name: '脚踏起重机', exact: true });
      await tech.focus();
      await expect(tech).toBeFocused();
      expect((await tech.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect((await new AxeBuilder({ page }).include('.patch-tree-summary').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      await page.screenshot({ path: info.outputPath(`patch-tree-${width}-${theme}.png`), fullPage: true });
      await tech.press('Enter');
      await expect(page).toHaveURL(/#\/tech\/54$/);
      await page.goto('./#/patches/185872?civ=Saracens&q=无此内容');
      await summary.locator('summary').click();
      await expect(summary).toContainText('当前筛选下没有科技树开放或移除项');
      await expect(page.getByRole('heading', { name: '没有符合筛选条件的改动' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
