import { expect, test } from '@playwright/test';

for (const width of [360, 375, 390, 1280]) {
  test(`#168 克制摘要 ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (e) => {
      if (e.type() === 'error') errors.push(e.text());
    });
    for (const civ of ['Vikings', 'Varangians']) {
      await page.goto(`./#/duel?a=2704.${civ}.4.f.&b=567.Japanese.4.f.&m=r&bud=3000`);
      const summary = page.locator('[data-t="counter-summary"]');
      await expect(summary).toContainText('冠军剑士对冲击步兵 +9');
      await summary.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`${civ}-${width}.png`), fullPage: true });
    }
    await page.goto('./#/duel?a=567.Japanese.4.f.&b=567.Japanese.4.f.&m=1');
    await expect(page.locator('#duel-res')).toBeVisible();
    await expect(page.locator('[data-t="counter-summary"]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('#168 1v1 也显示克制摘要', async ({ page }) => {
  await page.goto('./#/duel?a=2704.Vikings.4.f.&b=567.Japanese.4.f.&m=1');
  await expect(page.locator('#duel-res [data-t="counter-summary"]')).toContainText('冠军剑士对冲击步兵 +9');
});
