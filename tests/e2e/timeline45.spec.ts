import { expect, test } from '@playwright/test';
for (const width of [360, 375, 390, 1280]) {
  test(`时间线折叠和跟进 ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (e) => {
      if (e.type() === 'error') errors.push(e.text());
    });
    await page.goto('./#/builds?bo=scouts-18');
    await page.locator('.tl-extra-controls > summary').click();
    const group = page.locator('.tl-villagers details').first();
    await expect(group).toBeVisible();
    const summary = group.locator('summary');
    expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(summary).toContainText(/村民 ×\d+ · 约/);
    await summary.click();
    await expect(group.locator('li').first()).toBeVisible();
    await summary.click();
    await expect(group.locator('li').first()).not.toBeVisible();
    await page.goto('./#/builds?bo=scouts-18&house=0&step=13');
    const hint = page.locator('.tl-followup');
    await expect(hint).toContainText('补房子');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await hint.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`timeline-${width}.png`), fullPage: true });
    await hint.getByRole('button', { name: '知道了' }).click();
    await page.reload();
    await expect(page.getByRole('region', { name: '步骤详情' })).toBeVisible();
    await expect(hint).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
