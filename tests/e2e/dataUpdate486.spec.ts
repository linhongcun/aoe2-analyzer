import { expect, test } from '@playwright/test';

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#486 当前数据与补丁 ${width} ${theme}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/unit/873');
      await expect(page.locator('[data-t="footer-version"]')).toContainText('DE 188329');
      await expect(page.locator('#unit [data-stat="hp"] [data-t="stat-value"]')).toHaveText('220');
      await expect(page.locator('#unit .detail-cost-grid .res:has(img[alt="食物"])')).toHaveText('70');
      await expect(page.locator('#unit .detail-cost-grid .res:has(img[alt="黄金"])')).toHaveText('80');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`unit-873-${width}-${theme}.png`), fullPage: true });

      await page.goto('./#/patches');
      await page.getByRole('link', { name: /DE Update 188329/ }).click();
      await expect(page.getByRole('heading', { name: 'DE Update 188329', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: /当前数据版本：DE 188329/ })).toBeVisible();
      for (const id of [873, 875, 2569, 2550]) await expect(page.locator(`.patch-entry a[href="#/unit/${id}"]`).first()).toBeVisible();
      await expect(page.getByRole('link', { name: '官方完整补丁说明' })).toHaveAttribute(
        'href',
        'https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-188329/',
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`patch-188329-${width}-${theme}.png`), fullPage: true });
      await page.goto('./#/patches/185872');
      await expect(page.getByRole('link', { name: /当前数据版本：DE 188329/ })).toBeVisible();
      await expect(page.locator('.patches')).toContainText('数值依据当时公告，不代表当前属性');
      expect(errors).toEqual([]);
    });

test('#486 精锐与移速不变对照、PK 和当前版本来源', async ({ page }) => {
  await page.goto('./#/unit/875');
  await expect(page.locator('#unit [data-stat="hp"] [data-t="stat-value"]')).toHaveText('270');
  await expect(page.locator('#unit .detail-cost-grid .res:has(img[alt="食物"])')).toHaveText('70');
  for (const [id, speed] of [
    [2569, '1.45'],
    [2571, '1.5'],
  ] as const) {
    await page.goto(`./#/unit/${id}`);
    await expect(page.locator('#unit [data-stat="spd"] [data-t="stat-value"]')).toHaveText(speed);
  }
  await page.goto('./#/duel?a=873.Dravidians.3..&b=4.Britons.3..&m=n');
  await expect(page.locator('#duel-a .duel-stats tr').filter({ hasText: '生命值' }).locator('td').last()).toHaveText('220');
  await expect(page.locator('#duel-a .duel-head .res:has(img[alt="食物"])')).toHaveText('70');
  await page.goto('./#/about-data');
  await expect(page.locator('[data-t="data-version"]')).toHaveText('DE 188329（2026-10-28）');
  await expect(page.locator('[data-t="src-dat"]')).toContainText('e293dc1');
  await expect(page.locator('[data-t="src-aoe2techtree"]')).toContainText('e56728e');
  const response = await page.request.get('./unit/873/');
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain('数据版本 DE 188329');
});

test('#486 当前站点保留计算深链，185872 专用预置不跨版本开放', async ({ page }) => {
  const query = 'a=1704.Bohemians.3.c.&b=280.Franks.3.c.&m=1';
  await page.goto('./#/duel?' + query);
  await expect(page.locator('#duel-res')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('#/duel?' + query);
  await expect(page.locator('#duel-a .duel-side-title')).toContainText('胡斯派战车');
  await expect(page.getByRole('region', { name: '波希米亚预置对战', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '查看波希米亚预置', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#duel-res')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('#/duel?' + query);
  for (const patch of ['185872', '188329']) {
    await page.goto('./#/patches/' + patch);
    await expect(page.locator('.patch-entry').first()).toBeVisible();
    await expect(page.getByRole('region', { name: '骑马弩兵与骑射手预置', exact: true })).toHaveCount(0);
  }
});

test('#486 实际分享图片使用当前版本声明', async ({ page }) => {
  await page.addInitScript(() => {
    const labels: string[] = [];
    (window as Window & { dataUpdateDraws?: string[] }).dataUpdateDraws = labels;
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, width) {
      labels.push(text);
      if (width === undefined) original.call(this, text, x, y);
      else original.call(this, text, x, y, width);
    };
  });
  await page.goto('./#/unit/873');
  await page.getByRole('button', { name: '生成分享图', exact: true }).click();
  await expect(page.locator('.share-preview img')).toBeVisible();
  const drawn = await page.evaluate(() => (window as Window & { dataUpdateDraws?: string[] }).dataUpdateDraws ?? []);
  expect(drawn).toContain('数据版本 DE 188329 · 模拟结果仅作参考');
  expect(drawn.some((text) => text.includes('数据版本 DE 185872'))).toBe(false);
});
