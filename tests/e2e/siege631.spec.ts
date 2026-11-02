import { expect, test } from '@playwright/test';

for (const width of [360, 375, 390, 1280]) {
  test(`#631 @${width} 不支持的单位无入口，攻城锤入口保持原单位`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    for (const id of [74, 1923]) {
      await page.goto(`./#/unit/${id}`);
      await expect(page.locator('#unit h1')).toBeVisible();
      await expect(page.getByTestId('unit-siege-entry')).toHaveCount(0);
    }
    await page.goto('./#/unit/1258');
    const entry = page.getByTestId('unit-siege-entry');
    await expect(entry).toBeVisible();
    await entry.click();
    await expect(page.getByLabel('攻城单位', { exact: true })).toHaveValue('1258');
    await expect(page.getByTestId('siege-result')).toBeVisible();
    expect(new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('unit')).toBe('1258');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await testInfo.attach(`siege631-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });
}
