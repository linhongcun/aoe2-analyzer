import { expect, test } from '@playwright/test';

const legacyMaps = [
  { name: '阿拉伯半岛', en: 'Arabia' },
  { name: '竞技场', en: 'Arena' },
  { name: '游牧', en: 'Nomad' },
  { name: '岛屿', en: 'Islands' },
];

for (const width of [360, 375, 390, 1280]) {
  test(`地图资料 ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (e) => {
      if (e.type() === 'error') errors.push(e.text());
    });
    await page.goto('./#/maps');
    const search = page.getByRole('searchbox', { name: '搜索地图', exact: true });
    const nav = page.getByRole('navigation', { name: '选择地图' });
    await expect(page.locator('.map-guide article')).toHaveCount(1);
    for (const map of legacyMaps) {
      await search.fill(map.en);
      await nav.getByRole('button', { name: `${map.name} ${map.en}`, exact: true }).click();
      const section = page.getByRole('article', { name: `${map.name} ${map.en}`, exact: true });
      await expect(section.getByRole('img', { name: /地图预览/ })).toBeVisible();
      await expect(section.getByRole('heading', { name: '资源特点' })).toBeVisible();
      await expect(section.locator('a[href^="#/civ/"]').first()).toBeVisible();
      await expect(section.locator('a[href^="#/builds?bo="]').first()).toBeVisible();
      await section.locator('summary').click();
      await expect(section.locator('a[href^="https://"]').first()).toBeVisible();
      await section.locator('summary').click();
    }
    await expect(page.getByRole('region', { name: '码头与渔船经济' })).toContainText('三艘渔船');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`maps-${width}.png`), fullPage: true });
    await page.locator('#map-details a[href^="#/builds"]').first().click();
    await expect(page.getByRole('list', { name: '时间线', exact: true })).toBeVisible();
    await expect(page).toHaveURL(/bo=hybrid-fish-18/);
    await expect(page.locator('.tl-steps')).toContainText('渔船');
    await page.goBack();
    await search.fill('Arabia');
    await nav.getByRole('button', { name: '阿拉伯半岛 Arabia', exact: true }).click();
    await page.locator('#map-details a[href^="#/civ/"]').first().click();
    await expect(page).toHaveURL(/civ\/Franks/);
    expect(errors).toEqual([]);
  });
}
