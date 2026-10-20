import { expect, test } from '@playwright/test';

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#290 未知路由 ${theme} @${width}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/this-page-does-not-exist-xyz');
      const content = page.locator('.not-found-page');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByRole('heading', { level: 1, name: '找不到该页', exact: true })).toBeVisible();
      await expect(page).toHaveTitle('找不到该页 | 帝国时代 II 分析器');
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /这个地址没有对应的页面/);
      await expect(page.getByText(/查资料、选文明、练开局/)).toHaveCount(0);
      await expect(page.locator('#home')).toHaveCount(0);
      await expect(page.getByRole('heading', { name: '你是不是要找' })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      // 面包屑沿用全站样式；这里只量本页新增的操作与建议链接。
      const targets = await content.locator('.not-found-actions a, .not-found-actions button, .not-found-suggestions a').evaluateAll((elements) =>
        elements.map((element) => {
          const { width, height } = element.getBoundingClientRect();
          return width >= 44 && height >= 44;
        }),
      );
      expect(targets.every(Boolean)).toBe(true);
      await content.getByRole('button', { name: '打开全局搜索', exact: true }).click();
      await expect(page.getByRole('dialog', { name: '全局搜索', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await content.getByRole('link', { name: '回首页', exact: true }).click();
      await expect(page.locator('#home')).toBeVisible();
      await expect(page).toHaveTitle('帝国时代 II 分析器 | 帝国时代 II 分析器');

      // 很长的未知路径也应换行；建议必须能导航到实际页面。
      await page.goto('./#/team-' + 'x'.repeat(200));
      await expect(page.getByRole('heading', { level: 1, name: '找不到该页' })).toBeVisible();
      const suggestions = page.locator('.not-found-suggestions a');
      await expect(suggestions).toHaveCount(2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await suggestions.filter({ hasText: '团战分工' }).click();
      await expect(page).toHaveURL(/#\/team-plan$/);
      await expect(content).toHaveCount(0);
      expect(errors).toEqual([]);
    });

for (const [oldPath, destination, selector] of [
  ['/trade', '/trade-income', '[data-testid="trade-income-page"]'],
  ['/garrison', '/garrison-healing', '[data-testid="garrison-healing-page"]'],
  ['/garrison-general', '/garrison-healing', '[data-testid="garrison-healing-page"]'],
])
  test(`#290 ${oldPath} 兼容重定向并替换历史`, async ({ page }) => {
    await page.goto('./#/');
    await expect(page.locator('#home')).toBeVisible();
    await page.evaluate((path) => {
      location.hash = path;
    }, oldPath);
    await expect.poll(() => new URL(page.url()).hash).toBe('#' + destination);
    await expect(page.locator(selector)).toBeVisible();
    await expect(page.locator('.not-found-page')).toHaveCount(0);
    await page.goBack();
    await expect(page.locator('#home')).toBeVisible();
  });

test('#290 已注册开局查询链接继续正常显示；元数据存在不能让未知路径冒充页面', async ({ page }) => {
  await page.goto('./#/builds?bo=scouts-18');
  await expect(page.locator('#builds[data-t="timeline"]')).toBeVisible();
  await expect(page).toHaveTitle(/侦察骑兵/);
  await expect(page.locator('.not-found-page')).toHaveCount(0);
  await expect(page.locator('#home')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/builds\?bo=scouts-18$/);
  // /builds/scouts-18 是静态元数据地址，并不是已注册的 hash 路由。
  await page.goto('./#/builds/scouts-18');
  await expect(page.getByRole('heading', { level: 1, name: '找不到该页' })).toBeVisible();
  await expect(page).toHaveTitle('找不到该页 | 帝国时代 II 分析器');
});
