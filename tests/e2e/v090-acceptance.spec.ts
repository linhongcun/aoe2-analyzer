import { expect, test } from '@playwright/test';

/** v0.9.0 验收（#145）C #140。取自 kent/v090-acceptance @ 57fb3f1，不含尚未实现的 D/E/F。 */
const WIDTHS = [360, 375, 390, 1280];

for (const width of WIDTHS)
  test(`C #140 @${width}：「数量」表每格一行，数字不断行`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./#/duel?a=39.Romans.3.f.&b=2700.Franks.3.f.&m=r&bud=3000');
    await page.locator('table.duel-tab td').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    const cells = await page.locator('table.duel-tab td').evaluateAll((els) =>
      els.map((e) => {
        const lh = parseFloat(getComputedStyle(e).lineHeight) || 20;
        const r = document.createRange();
        r.selectNodeContents(e);
        return { t: e.textContent?.trim(), lines: r.getClientRects().length ? Math.round(r.getBoundingClientRect().height / lh) : 0 };
      }),
    );
    expect(cells.length).toBe(3);
    for (const c of cells) expect(c.lines, c.t).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
