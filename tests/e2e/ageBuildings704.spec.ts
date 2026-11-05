import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const width of [360, 375, 390, 1280]) {
  for (const theme of ['light', 'dark']) {
    test(`升时代建筑门槛 ${width}-${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (e) => {
        if (e.type() === 'error') errors.push(e.text());
      });
      await page.goto('./#/buildings');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const panel = page.getByRole('region', { name: '升时代需要哪些建筑' });
      await expect(panel).toBeVisible();
      await expect(panel).toContainText('两种不同');
      await expect(panel).toContainText('两座同类建筑不算两种');
      await expect(panel).toContainText('不是完整的文明专属清单');
      for (const [name, ids] of [
        ['封建时代', [68, 562, 584, 12, 45]],
        ['城堡时代', [87, 101, 103, 84]],
        ['帝王时代', [209, 49, 104, 82, 1251]],
      ] as const) {
        const row = panel.getByRole('article', { name: new RegExp(`升${name}$`) });
        await expect(row).toContainText('计入示例');
        await expect(row).toContainText('不计入示例');
        await expect(row.getByRole('link', { name: '房屋', exact: true })).toHaveAttribute('href', '#/building/70');
        await expect(row.getByRole('link', { name: '农田', exact: true })).toHaveAttribute('href', '#/building/50');
        await expect(row.getByRole('link', { name: '木栅栏', exact: true })).toHaveAttribute('href', '#/building/72');
        for (const id of ids) await expect(row.locator(`[data-counts="true"][href="#/building/${id}"]`)).toBeVisible();
      }
      const imperial = panel.getByRole('article', { name: /升帝王时代$/ });
      await expect(imperial).toContainText('一座');
      await expect(imperial.getByRole('link', { name: '城堡', exact: true })).toHaveAttribute('href', '#/building/82');
      await expect(imperial.getByRole('link', { name: '营垒', exact: true })).toHaveAttribute('href', '#/building/1251');
      await expect(panel).toContainText('DE Update 188329');
      await expect(panel).toContainText('高棉');
      await page.locator('#bq').fill('磨坊');
      await expect(page.locator('#bgrid > a')).toHaveCount(1);
      await expect(panel).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
      expect((await new AxeBuilder({ page }).include('[aria-labelledby="age-buildings-title"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual(
        [],
      );
      await page.screenshot({ path: info.outputPath(`age-buildings-${width}-${theme}.png`), fullPage: true });
    });
  }
}
