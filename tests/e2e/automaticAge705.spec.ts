import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const width of [360, 375, 390, 1280]) {
  for (const theme of ['light', 'dark']) {
    test(`自动时代属性 ${width}-${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (event) => {
        if (event.type() === 'error') errors.push(event.text());
      });
      for (const [route, expected] of [
        ['unit/448', ['攻击', '视野', '移动速度', '1.55', '黑暗时代', '封建时代']],
        ['building/72', ['生命值', '150', '250', '1.66667']],
      ] as const) {
        await page.goto(`./#/${route}`);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const panel = page.getByRole('region', { name: '升时代自动变化', exact: true });
        await expect(panel).toBeVisible();
        for (const text of expected) await expect(panel).toContainText(text);
        if (route === 'unit/448') {
          for (const [key, before, after, delta] of [
            ['atk', '3', '5', '+2'],
            ['los', '4', '6', '+2'],
            ['spd', '1.2', '1.55', '+0.35'],
          ]) {
            const stat = panel.locator(`[data-stat="${key}"]`);
            await expect(stat.locator('[data-auto-before]')).toHaveText(before!);
            await expect(stat.locator('[data-t="stat-value"]')).toHaveText(after!);
            await expect(stat.locator('[data-auto-delta]')).toHaveText(delta!);
          }
        }
        await expect(panel).toContainText('无需研究科技');
        await expect(panel).toContainText('进入该时代即生效');
        await expect(panel).toContainText('DE 188329');
        await expect(panel.getByRole('link', { name: '数据说明' })).toHaveAttribute('href', '#/about-data');
        const bounds = await panel.getByRole('link', { name: '数据说明' }).boundingBox();
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
        expect(bounds!.width).toBeGreaterThanOrEqual(44);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect((await new AxeBuilder({ page }).include('[aria-label="升时代自动变化"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
        await page.evaluate(() => {
          (document.activeElement as HTMLElement | null)?.blur();
          scrollTo(0, 0);
        });
        await page.screenshot({ path: info.outputPath(`auto-age-${route.replace('/', '-')}-${width}-${theme}.png`), fullPage: true });
        expect(errors).toEqual([]);
      }
    });
  }
}

test('四墙门的时代生命对照与未扩展页面', async ({ page }) => {
  for (const [id, before, after] of [
    [72, 150, 250],
    [792, 240, 400],
    [117, 1080, 1800],
    [487, 1650, 2750],
  ]) {
    await page.goto(`./#/building/${id}`);
    const panel = page.getByRole('region', { name: '升时代自动变化', exact: true });
    await expect(panel.locator('[data-auto-before]')).toHaveText(Number(before).toFixed(2));
    await expect(panel.locator('[data-stat="hp"] [data-t="stat-value"]')).toHaveText(Number(after).toFixed(2));
  }
  for (const route of ['unit/751', 'unit/38', 'building/70', 'building/87']) {
    await page.goto(`./#/${route}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('region', { name: '升时代自动变化', exact: true })).toHaveCount(0);
  }
});
