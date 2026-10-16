import { expect, test } from '@playwright/test';

/** #124 草案：法兰克不能训练骑射手（39），应保留法兰克并提示、推荐骑马弩兵（2700） */
const URL = '#/duel?a=39.Franks.3.f.&b=39.Magyars.3.f.&m=r&bud=3000';
const head = (p: import('@playwright/test').Page) => p.locator('#duel-a .duel-head');

test('#124 不静默换文明：A 方仍是法兰克', async ({ page }) => {
  await page.goto(URL);
  await expect(head(page)).toContainText('法兰克');
  await expect(head(page)).not.toContainText('亚美尼亚');
});
test('#124 有不能训练的提示与「改用 骑马弩兵」按钮，点击后 URL 与结果一致', async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator('#duel-a')).toContainText('法兰克不能训练骑射手'); // 文案待 Steve 定
  const btn = page.getByRole('button', { name: '改用 骑马弩兵' });
  await expect(btn).toBeVisible();
  await btn.click();
  await expect(page).toHaveURL(/a=2700\.Franks\./);
  await expect(head(page)).toContainText('骑马弩兵');
  await expect(head(page)).toContainText('法兰克');
});
test('#124 无替代（阿兹特克 + 骑射手）：保留阿兹特克，提示，无「改用」按钮', async ({ page }) => {
  await page.goto('#/duel?a=39.Aztecs.3.f.&b=39.Magyars.3.f.&m=r&bud=3000');
  await expect(head(page)).toContainText('阿兹特克');
  await expect(page.getByRole('button', { name: /^改用/ })).toHaveCount(0);
});
for (const w of [360, 375, 390, 1280])
  test(`#124 提示与按钮在 ${w}px 不折行`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(URL);
    for (const loc of [page.locator('[data-t="pk-unavail-a"]'), page.getByRole('button', { name: '改用 骑马弩兵' })]) {
      await expect(loc).toBeVisible();
      const lines = await loc.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight || '20')));
      expect(lines).toBeLessThanOrEqual(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
