import { expect, test } from '@playwright/test';
for (const width of [360, 375, 390, 1280]) {
  test(`地图资料 ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (e) => {
      if (e.type() === 'error') errors.push(e.text());
    });
    await page.goto('./#/maps');
    await expect(page.locator('.map-guide article')).toHaveCount(4);
    for (const map of ['阿拉伯', '竞技场', '游牧', '海图']) {
      const section = page.getByRole('article', { name: map, exact: true });
      await expect(section.getByRole('heading', { name: '资源特点' })).toBeVisible();
      await expect(section.locator('a[href^="#/civ/"]').first()).toBeVisible();
      await expect(section.locator('a[href^="#/builds?bo="]').first()).toBeVisible();
      await section.locator('summary').click();
      await expect(section.locator('a[href^="https://"]').first()).toBeVisible();
    }
    await expect(page.getByRole('region', { name: '码头与渔船经济' })).toContainText('三艘渔船');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`maps-${width}.png`), fullPage: true });
    await page.locator('#map-water a[href^="#/builds"]').first().click();
    await expect(page.getByRole('list', { name: '时间线', exact: true })).toBeVisible();
    await expect(page).toHaveURL(/bo=hybrid-fish-18/);
    await expect(page.locator('.tl-steps')).toContainText('渔船');
    await page.goBack();
    await page.locator('#map-arabia a[href^="#/civ/"]').first().click();
    await expect(page).toHaveURL(/civ\/Franks/);
    expect(errors).toEqual([]);
  });
}
