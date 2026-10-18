import { expect, test } from '@playwright/test';

for (const width of [360, 375, 390, 1280]) {
  test(`逐击伤害拆解 ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (e) => {
      if (e.type() === 'error') errors.push(e.text());
    });
    await page.goto('./#/duel?a=2704.Vikings.4.f.&b=567.Japanese.4.f.&m=1');
    const details = page.locator('[data-t="damage-breakdown"]');
    await details.locator('summary').click();
    await expect(details).toContainText('冲击步兵');
    await expect(details.getByRole('link', { name: '科技：锻造', exact: true })).toHaveCount(2);
    const row = page.locator('#duel-res tr').filter({ has: page.getByText('每击伤害', { exact: true }) });
    for (const [side, cell] of [
      ['A', 1],
      ['B', 2],
    ] as const) {
      expect(Number(await details.locator(`[data-t="damage-total-${side}"]`).textContent())).toBe(Number(await row.locator('td').nth(cell).textContent()));
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await details.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`damage-${width}.png`), fullPage: true });
    await page.goto('./#/duel?a=93.Byzantines.4.f.&b=567.Japanese.4.f.&m=r&bud=3000');
    await page.locator('[data-t="damage-breakdown"] summary').click();
    await expect(page.locator('[data-t="damage-breakdown"]')).toContainText('已计入文明费用加成');
    expect(errors).toEqual([]);
  });
}
