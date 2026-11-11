import { expect, test } from '@playwright/test';
for (const width of [360, 375, 390, 1280]) {
  test(`补丁筛选与来源 ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (e) => {
      if (e.type() === 'error') errors.push(e.text());
    });
    await page.goto('./#/patches');
    await page.getByRole('link', { name: /DE Update 185872/ }).click();
    const filters = page.locator('.patch-filters');
    if (!(await filters.evaluate((el) => (el as HTMLDetailsElement).open))) await filters.locator('summary').click();
    const combo = page.getByRole('combobox', { name: '搜索文明' });
    await combo.fill('Franks');
    await combo.press('Enter');
    await combo.press('Escape');
    await expect(page).toHaveURL(/civ=Franks/);
    const civs = await page.locator('.patch-entry').evaluateAll((els) => els.map((e) => e.getAttribute('data-civs')));
    expect(civs.every((c) => !c || c.split(',').includes('Franks'))).toBe(true);
    await page.getByRole('link', { name: '掷斧兵', exact: true }).click();
    await expect(page).toHaveURL(/unit\/281/);
    await page.goBack();
    await expect(page.getByRole('button', { name: '移除法兰克' })).toBeVisible();
    await filters.getByRole('button', { name: '削弱', exact: true }).click();
    await expect(page.locator('.patch-buff')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`patches-${width}.png`), fullPage: true });
    await page.goto('./#/patches/185872?q=无此内容');
    await expect(page.getByRole('heading', { name: '没有符合筛选条件的改动' })).toBeVisible();
    await page.goto('./#/patches/185872?q=来源冲突');
    await expect(page.locator('.patch-adjust')).toContainText('仍为 6');
    await expect(page.locator('.patch-nerf')).toHaveCount(0);
    await page.goto('./#/patches/unknown');
    await expect(page.getByRole('heading', { name: '找不到版本 unknown' })).toBeVisible();
    await page.goto('./#/about-data');
    await page.getByRole('link', { name: '查看更新历史' }).click();
    await expect(page.getByRole('heading', { name: '更新历史', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
