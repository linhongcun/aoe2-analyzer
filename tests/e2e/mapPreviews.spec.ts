import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const maps = [
  { id: 'arabia', name: '阿拉伯', file: 'arabia' },
  { id: 'arena', name: '竞技场', file: 'arena' },
  { id: 'nomad', name: '游牧', file: 'nomad' },
  { id: 'water', name: '海图', file: 'islands' },
];

for (const width of [360, 375, 390, 1280]) {
  for (const theme of ['light', 'dark']) {
    test(`地图预览 ${theme} ${width}：本地图片、键盘定位与来源`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const errors: string[] = [];
      const externalRequests: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (e) => {
        if (e.type() === 'error') errors.push(e.text());
      });
      await page.route('**/*', (route) => {
        if (new URL(route.request().url()).origin !== new URL(test.info().project.use.baseURL!).origin) {
          externalRequests.push(route.request().url());
          return route.abort();
        }
        return route.continue();
      });
      await page.goto('./#/maps');
      const guide = page.locator('.map-guide');
      const nav = page.getByRole('navigation', { name: '选择地图' });
      for (const map of maps) {
        const article = page.getByRole('article', { name: map.name, exact: true });
        const preview = article.getByRole('img', { name: /地图预览/ });
        await preview.scrollIntoViewIfNeeded();
        await expect(preview).toBeVisible();
        await expect(preview).toHaveAttribute('src', new RegExp(`/img/maps/${map.file}[.]webp$`));
        await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth >= 224)).toBe(true);
        const imageSize = await preview.boundingBox();
        expect(imageSize!.width).toBeGreaterThanOrEqual(200);
        await expect(article.getByRole('heading', { name: '地形与侦察' })).toBeVisible();
        await article.locator('summary').click();
        await expect(article.getByRole('link', { name: /AoE2 Companion.*预览图/ })).toHaveAttribute(
          'href',
          /github\.com\/denniske\/aoe2companion\/blob\/[a-f0-9]{40}\/assets\/maps\/rm_/,
        );
        await article.locator('summary').click();
        const button = nav.getByRole('button', { name: map.name, exact: true });
        const buttonSize = await button.boundingBox();
        expect(buttonSize!.width).toBeGreaterThanOrEqual(44);
        expect(buttonSize!.height).toBeGreaterThanOrEqual(44);
        await button.focus();
        await button.press('Enter');
        await expect(article).toBeFocused();
        await expect(article.getByRole('heading', { level: 3 })).toBeInViewport();
      }
      await expect(page.locator('#map-water figcaption')).toContainText('岛屿 Islands');
      await expect(page.locator('#map-water figcaption')).toContainText('海图示例');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const violations = (await new AxeBuilder({ page }).include('.map-guide').withTags(['wcag2a', 'wcag2aa']).analyze()).violations;
      expect(violations).toEqual([]);
      await nav.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath(`maps-${theme}-${width}.png`), fullPage: true });
      expect(externalRequests).toEqual([]);
      expect(errors).toEqual([]);
      await expect(guide).toBeVisible();
    });
  }
}
