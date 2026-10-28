import { expect, test, type Page } from '@playwright/test';

const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') messages.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'] as const)
    test(`#477 未知文明保留输入并提供恢复入口 ${width} ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const ids = ['Tartars', `不存在的文明-${'UnknownCivilization'.repeat(12)}`];
      for (const [index, id] of ids.entries()) {
        await page.goto(`./#/civ/${encodeURIComponent(id)}`);
        await expect(page.getByRole('heading', { name: '没找到这个文明', exact: true })).toBeVisible();
        const state = page.locator('main .pane').filter({ has: page.getByRole('heading', { name: '没找到这个文明', exact: true }) });
        await expect(state.locator('code')).toHaveText(id);
        await expect(state.getByRole('link', { name: '查看文明列表', exact: true })).toHaveAttribute('href', '#/civs');
        await expect(state.getByRole('link', { name: '回首页', exact: true })).toHaveAttribute('href', '#/');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        for (const action of [
          state.getByRole('link', { name: '查看文明列表', exact: true }),
          state.getByRole('link', { name: '回首页', exact: true }),
          state.getByRole('button', { name: '打开全局搜索', exact: true }),
        ]) {
          const box = await action.boundingBox();
          if (!box) continue;
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
        const screenshot = info.outputPath(`civ-not-found-${index}-${width}-${theme}.png`);
        await page.screenshot({ path: screenshot, fullPage: false });
        await info.attach(index === 0 ? '未知文明' : '长文明ID', { path: screenshot, contentType: 'image/png' });
      }

      await page.getByRole('button', { name: '打开全局搜索', exact: true }).click();
      const search = page.getByRole('dialog', { name: '全局搜索', exact: true });
      await expect(search).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(search).toHaveCount(0);
      await page.getByRole('link', { name: '查看文明列表', exact: true }).click();
      await expect(page).toHaveURL(/#\/civs$/);
      await expect(page.locator('#list')).toBeVisible();
      await page.goto('./#/civ/Tartars');
      await page.getByRole('link', { name: '回首页', exact: true }).click();
      await expect(page.locator('#home')).toBeVisible();
      await page.goto('./#/civ/Tatars');
      await expect(page.locator('main h1')).toContainText('鞑靼');
      await expect(page.getByRole('heading', { name: '没找到这个文明', exact: true })).toHaveCount(0);
    });
