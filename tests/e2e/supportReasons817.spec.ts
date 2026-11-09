import { expect, test, type Page } from '@playwright/test';

const openCivPicker = async (page: Page) => {
  if (await page.locator('button.tl-setbtn').isVisible()) await page.locator('button.tl-setbtn').click();
  const trigger = page.locator('#tlciv');
  await trigger.nth((await trigger.count()) - 1).click();
};

test.skip(!process.env.VITE_FORCE_UNSUPPORTED_CIVS, 'requires VITE_FORCE_UNSUPPORTED_CIVS test build');

test('#817 强制不支持的文明显示具体原因', async ({ page }) => {
  await page.goto('./#/builds?bo=scouts-18&civ=Khmer');
  const warn = page.locator('[data-t="civ-warn"]');
  await expect(warn).toBeVisible();
  await expect(warn).toContainText('测试构建：该文明被强制标记为不支持');

  const trigger = page.locator('#tlciv');
  await trigger.nth((await trigger.count()) - 1).click();
  const disabled = page.locator('[data-civ="Khmer"]');
  await expect(disabled).toContainText('测试构建：该文明被强制标记为不支持');
  await expect(disabled).toHaveAttribute('title', /测试构建：该文明被强制标记为不支持/);
});

for (const width of [360, 375, 390, 1280]) {
  test(`#817 强制不支持布局 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('./#/builds?bo=scouts-18&civ=Khmer');
    await expect(page.locator('[data-t="civ-warn"]')).toBeVisible();
    await openCivPicker(page);
    await expect(page.locator('[data-civ="Khmer"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
