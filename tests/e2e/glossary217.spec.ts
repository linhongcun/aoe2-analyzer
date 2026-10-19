import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const messages = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  messages.set(page, errors);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(messages.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('#217 列表检索、清空、失效条目和实体跳转', async ({ page }) => {
  await page.goto('./#/glossary');
  const input = page.getByRole('searchbox', { name: '搜索术语' });
  await input.fill('双靶场');
  await expect(page.locator('.gl-list article')).toHaveCount(1);
  await page.getByRole('link', { name: /double range：双靶场/ }).click();
  await expect(page.getByRole('heading', { name: 'double range：双靶场', exact: true })).toBeVisible();
  await expect(page.getByText(/不是把单位射程加倍/)).toBeVisible();
  await page.getByRole('link', { name: '靶场详情', exact: true }).click();
  await expect(page.locator('#building h1')).toContainText('靶场');
  await page.goto('./#/glossary?q=missing-term');
  await expect(page.getByRole('heading', { name: '没有匹配的术语' })).toBeVisible();
  await page.getByRole('button', { name: '清空搜索' }).click();
  await expect(page.locator('.gl-list article')).toHaveCount(9);
  await page.goto('./#/glossary/not-a-valid-id');
  await expect(page.getByRole('heading', { name: '没有这个术语' })).toBeVisible();
  expect((await page.getByRole('link', { name: '返回全部术语' }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test('#217 全局搜索有术语类型，可用键盘直达，并保留实体拼音', async ({ page }) => {
  await page.goto('./#/');
  await expect(page.locator('#home h1')).toBeVisible();
  await page.keyboard.press('Control+k');
  const input = page.getByPlaceholder(/搜索文明、单位、科技/);
  await input.fill('MAA');
  const term = page.locator('.cmdk-list li').filter({ hasText: 'MAA：武士' });
  await expect(term.locator('.tag')).toHaveText('术语');
  await input.press('Enter');
  await expect(page.getByRole('heading', { name: 'MAA：武士' })).toBeVisible();
  await page.keyboard.press('Control+k');
  await input.fill('youxia');
  await expect(page.locator('.cmdk-list li').filter({ hasText: '游侠' }).first().locator('.tag')).toHaveText('单位');
  await input.press('Escape');
});

test('#217 静态直达后复制链接保持站点根路径，刷新与来源可用', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./glossary/maa/');
  await expect(page.getByRole('heading', { name: 'MAA：武士' })).toBeVisible();
  await page.getByRole('button', { name: '复制术语链接' }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(copied).pathname).toBe(new URL('./glossary/maa/', test.info().project.use.baseURL).pathname);
  await page.goto(copied);
  await page.reload();
  await page.getByText('来源与核对说明', { exact: true }).click();
  await expect(page.getByRole('link', { name: 'Reddit：Acronyms in this Subreddit' })).toHaveAttribute('href', /gwy29g/);
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#217 ${theme} @${width} 列表与长说明可读`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/glossary');
      await expect(page.locator('.gl-list article')).toHaveCount(9);
      await page.screenshot({ path: info.outputPath(`glossary-list-${theme}-${width}.png`), fullPage: true });
      await page.goto('./#/glossary/rate-and-time');
      await expect(page.getByText(/前提是工作量固定/)).toBeVisible();
      await page.getByText('来源与核对说明', { exact: true }).click();
      const violations = (await new AxeBuilder({ page }).include('.glossary').withRules(['color-contrast']).analyze()).violations;
      expect(violations).toEqual([]);
      await page.screenshot({ path: info.outputPath(`glossary-term-${theme}-${width}.png`), fullPage: true });
    });
