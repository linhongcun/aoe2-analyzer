import { expect, test } from '@playwright/test';
/** #129 草案：哥特民兵（74）黑暗时代 PK 价不应再标「未计入」，并在 4 宽不折行 */
for (const w of [360, 375, 390, 1280])
  test(`#129 哥特民兵 PK 价统一取整，${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto('#/duel?a=74.Goths.1.f.&b=74.Franks.1.f.&m=r&bud=3000');
    const a = page.locator('[data-t="pk-cost-a"]');
    await expect(a).toBeVisible();
    await expect(a).not.toContainText('未计入');
    await expect(a).toContainText('42.5');
    await expect(a).toContainText('17');
    const h = await a.evaluate((el) => el.scrollWidth <= el.clientWidth);
    expect(h).toBe(true);
  });
