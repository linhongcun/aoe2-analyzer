import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const maps = [
  { name: '阿拉伯半岛', en: 'Arabia', file: 'arabia' },
  { name: '黑森林', en: 'Black Forest', file: 'black-forest' },
  { name: '游牧', en: 'Nomad', file: 'nomad' },
  { name: '岛屿', en: 'Islands', file: 'islands' },
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
      const search = page.getByRole('searchbox', { name: '搜索地图', exact: true });
      const group = page.getByRole('combobox', { name: '地图类型', exact: true });
      for (const control of [search, group, page.getByRole('button', { name: '清除筛选', exact: true })]) {
        const size = await control.boundingBox();
        expect(size!.height).toBeGreaterThanOrEqual(44);
      }
      for (const map of maps) {
        await search.fill(map.en);
        const button = nav.getByRole('button', { name: `${map.name} ${map.en}`, exact: true });
        const buttonSize = await button.boundingBox();
        expect(buttonSize!.width).toBeGreaterThanOrEqual(44);
        expect(buttonSize!.height).toBeGreaterThanOrEqual(44);
        await button.focus();
        await button.press('Enter');
        const article = page.getByRole('article', { name: `${map.name} ${map.en}`, exact: true });
        await expect(article).toBeFocused();
        await expect(article.getByRole('heading', { level: 3 }).first()).toBeInViewport();
        const preview = article.getByRole('img', { name: /地图预览/ });
        await preview.scrollIntoViewIfNeeded();
        await expect(preview).toBeVisible();
        await expect(preview).toHaveAttribute('src', new RegExp(`/img/maps/${map.file}[.]webp$`));
        await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth >= 224)).toBe(true);
        const imageSize = await preview.boundingBox();
        expect(imageSize!.width).toBeGreaterThanOrEqual(200);
        await expect(article).toContainText('侦察');
        await article.locator('summary').click();
        await expect(article.locator('a[href*="github.com/denniske/aoe2companion/blob/"]')).toHaveAttribute(
          'href',
          /github\.com\/denniske\/aoe2companion\/blob\/[a-f0-9]{40}\/app\/assets\/maps\/rm_/,
        );
        await expect(article.locator('a[href*="language=zh-hans"]')).toBeVisible();
        await article.locator('summary').click();
      }
      await expect(page.locator('#map-details figcaption')).toContainText('岛屿 Islands');
      await page.getByRole('button', { name: '清除筛选', exact: true }).click();
      await expect(nav.getByRole('button', { name: '岛屿 Islands', exact: true })).toHaveAttribute('aria-pressed', 'true');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const violations = (await new AxeBuilder({ page }).include('.map-guide').withTags(['wcag2a', 'wcag2aa']).analyze()).violations;
      expect(violations).toEqual([]);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: info.outputPath(`maps-${theme}-${width}.png`), fullPage: true });
      expect(externalRequests).toEqual([]);
      expect(errors).toEqual([]);
      await expect(guide).toBeVisible();
    });
  }
}
