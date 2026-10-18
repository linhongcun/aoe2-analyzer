import { expect, test } from '@playwright/test';
for (const width of [360, 375, 390, 1280]) {
  test(`水图与骑士分支 ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (e) => {
      if (e.type() === 'error') errors.push(e.text());
    });
    await page.goto('./#/builds?bo=hybrid-fish-18');
    const steps = page.locator('.tl-steps');
    await expect(steps).toContainText('码头');
    await expect(steps).toContainText('渔船');
    const ticks = await page.locator('.tl-chart .tl-axis span:visible').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right };
      }),
    );
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]!.left).toBeGreaterThanOrEqual(ticks[i - 1]!.right);
    await expect(page.locator('a[href="https://aoebuddy.com/build-orders/18-fishing-ship-build"]')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`water-${width}.png`), fullPage: true });
    await page.goto('./#/builds?bo=fast-castle-boom');
    await page.getByRole('link', { name: '转骑士', exact: true }).click();
    await expect(steps).toContainText('两座马厩');
    await expect(steps).toContainText('2 个骑士');
    await expect(page.locator('a[href="https://aoebuddy.com/build-orders/25-knight-rush-beginner"]')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`knights-${width}.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}
