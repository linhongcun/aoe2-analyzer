import { expect, test, type Page, type TestInfo } from '@playwright/test';

const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
});
async function healthy(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(runtimeErrors.get(page)).toEqual([]);
}
test.afterEach(async ({ page }) => healthy(page));
const params = (page: Page) => new URLSearchParams(new URL(page.url()).hash.split('?')[1]);
async function capture(page: Page, info: TestInfo, name: string) {
  await healthy(page);
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
}

test('#521 文明情境入口预填当前文明，单边对比和生产可刷新', async ({ page }) => {
  await page.goto('./#/civ/Jurchens');
  const nav = page.locator('#detail').getByRole('navigation', { name: '本页相关工具', exact: true });
  for (const [name, href] of [
    ['开局流程', '#/builds?civ=Jurchens'],
    ['生产对照', '#/production?civ=Jurchens'],
    ['对局助手', '#/matchup?me=Jurchens'],
    ['文明对比', '#/compare?a=Jurchens'],
    ['职业选手视角', '#/civ/Jurchens?tab=pro'],
  ])
    await expect(nav.getByRole('link', { name, exact: true })).toHaveAttribute('href', href!);
  await nav.getByRole('link', { name: '生产对照', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '生产文明', exact: true })).toHaveValue('Jurchens');
  await page.reload();
  await expect(page.getByRole('combobox', { name: '生产文明', exact: true })).toHaveValue('Jurchens');
  await healthy(page);
  await page.goBack();
  await nav.getByRole('link', { name: '文明对比', exact: true }).click();
  await expect(page.locator('#ca')).toHaveAttribute('data-value', 'Jurchens');
  await expect(page.locator('#cb')).toHaveAttribute('data-value', 'Britons');
  await expect(page.locator('#ctab th').nth(1).getByRole('link')).toHaveAttribute('href', '#/civ/Jurchens');
  await expect.poll(() => params(page).get('a')).toBe('Jurchens');
  await expect.poll(() => params(page).get('b')).toBe('Britons');
  await page.reload();
  await expect(page.locator('#ca')).toHaveAttribute('data-value', 'Jurchens');
  await page.goBack();
  await expect(page.locator('#detail h1')).toContainText('女真');
});

test('#521 文明目录整卡是真链接，键盘与新标签可打开', async ({ page, context }) => {
  await page.goto('./#/civs');
  await page.locator('#q').fill('Jurchens');
  const card = page.locator('#grid [data-civ="Jurchens"]');
  await expect(card).toHaveAttribute('href', '#/civ/Jurchens');
  await expect(card).toHaveJSProperty('tagName', 'A');
  await card.focus();
  await expect(card).toBeFocused();
  const popupPromise = context.waitForEvent('page');
  await card.click({ modifiers: ['ControlOrMeta'] });
  const popup = await popupPromise;
  await expect(popup.locator('#detail h1')).toContainText('女真');
  await popup.close();
  await card.press('Enter');
  await expect(page.locator('#detail h1')).toContainText('女真');
});

test('#521 单位查询文明、模拟器改选、完整文明列表与对阵回链', async ({ page }) => {
  await page.goto('./#/unit/4?civ=Mongols&from=matchup&me=Mongols&opp=Chinese');
  const nav = page.locator('#unit').getByRole('navigation', { name: '文明相关入口', exact: true });
  await expect(nav.locator('a[href="#/civ/Mongols"]')).toContainText('蒙古');
  await expect(nav.getByRole('link', { name: '回对局助手', exact: true })).toHaveAttribute('href', '#/matchup?me=Mongols&opp=Chinese');
  await page.getByRole('tab', { name: '科技模拟器', exact: true }).click();
  await expect(page.locator('#simciv')).toHaveAttribute('data-value', 'Mongols');
  await page.locator('#simciv').click();
  await page.getByRole('dialog', { name: '文明', exact: true }).locator('[role="option"][data-civ="Chinese"]').click();
  await expect(nav.locator('a[href="#/civ/Chinese"]')).toContainText('中国');
  expect(params(page).get('me')).toBe('Mongols');
  expect(params(page).get('opp')).toBe('Chinese');
  await page.getByRole('tab', { name: '概览', exact: true }).click();
  const available = page.locator('#unit .sideblk').filter({ has: page.getByRole('heading', { name: /^可用文明/ }) });
  await expect(available.locator('a[href^="#/civ/"]').first()).toBeVisible();
  await nav.getByRole('link', { name: '回对局助手', exact: true }).click();
  await expect(page.locator('#ma')).toHaveAttribute('data-value', 'Mongols');
  await expect(page.locator('#me')).toHaveAttribute('data-value', 'Chinese');
});

test('#521 科技文明上下文与概览文明列表可导航，非法文明不造链接', async ({ page }) => {
  await page.goto('./#/tech/996?civ=Jurchens&me=Mongols&opp=Chinese');
  const nav = page.locator('#tech').getByRole('navigation', { name: '文明相关入口', exact: true });
  await expect(nav.locator('a[href="#/civ/Jurchens"]')).toContainText('女真');
  await expect(nav.getByRole('link', { name: '回对局助手', exact: true })).toHaveAttribute('href', '#/matchup?me=Mongols&opp=Chinese');
  await page.getByRole('tab', { name: '文明', exact: true }).click();
  expect(params(page).get('civ')).toBe('Jurchens');
  await expect(page.getByRole('tabpanel').locator('a[href="#/civ/Jurchens"]')).toBeVisible();
  await page.getByRole('tab', { name: '概览', exact: true }).click();
  await expect(page.locator('#tech .dside a[href="#/civ/Jurchens"]')).toBeVisible();
  await nav.locator('a[href="#/civ/Jurchens"]').click();
  await expect(page.locator('#detail h1')).toContainText('女真');
  await page.goto('./#/tech/996?civ=Unknown&me=Mongols&opp=Unknown');
  await expect(page.locator('#tech h1')).toContainText('强化堡垒');
  await expect(page.locator('#tech a[href*="Unknown"]')).toHaveCount(0);
  await expect(page.locator('#tech').getByRole('link', { name: '回对局助手', exact: true })).toHaveCount(0);
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#521 @${width} ${theme} 情境入口、目录、对比及详情文明链接`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/civ/Jurchens');
      const nav = page.locator('#detail').getByRole('navigation', { name: '本页相关工具', exact: true });
      await expect(nav.getByRole('link')).toHaveCount(5);
      for (const link of await nav.getByRole('link').all()) {
        const box = await link.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      await capture(page, info, `civ-${width}-${theme}`);
      await nav.getByRole('link', { name: '职业选手视角', exact: true }).click();
      await expect(page.getByRole('heading', { name: '职业选手原始资料', exact: true })).toBeVisible();
      await healthy(page);
      await page.goto('./#/civs');
      await page.locator('#q').fill('Jurchens');
      await expect(page.locator('#grid a[data-civ="Jurchens"]')).toBeVisible();
      await capture(page, info, `directory-${width}-${theme}`);
      await page.goto('./#/compare?a=Jurchens');
      await expect(page.locator('#ca')).toHaveAttribute('data-value', 'Jurchens');
      await expect(page.locator('#ctab th').nth(1).getByRole('link')).toHaveAttribute('href', '#/civ/Jurchens');
      await capture(page, info, `compare-${width}-${theme}`);
      await page.goto('./#/unit/4?civ=Mongols');
      await expect(page.locator('#unit nav[aria-label="文明相关入口"] a[href="#/civ/Mongols"]')).toBeVisible();
      await capture(page, info, `unit-${width}-${theme}`);
      await page.goto('./#/tech/996?civ=Jurchens');
      await expect(page.locator('#tech nav[aria-label="文明相关入口"] a[href="#/civ/Jurchens"]')).toBeVisible();
      await capture(page, info, `tech-${width}-${theme}`);
    });
