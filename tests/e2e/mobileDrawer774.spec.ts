import { expect, test, type Page } from '@playwright/test';

// #774：360 移动抽屉不再平铺全站 38 项、外观沉底：
// 工具组只默认展开当前页所在组（其余可折叠），工具面板不再重复上方「百科」5 项，外观段移到抽屉首屏。
const DRAWER_WIDTHS = [360, 375, 390] as const;
const WIKI_NAV = [
  ['文明', '#/civs'],
  ['单位', '#/units'],
  ['建筑', '#/buildings'],
  ['科技', '#/techs'],
] as const;

const failures = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  failures.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(failures.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

const drawer = (page: Page) => page.getByRole('dialog', { name: '主导航', exact: true });
const toolsGroups = (page: Page) => page.locator('#tools-menu > details');

async function openDrawer(page: Page, route: string) {
  await page.goto('./#' + route);
  await page.getByRole('button', { name: '菜单', exact: true }).click();
  await expect(drawer(page)).toBeVisible();
}

test('#774 @360 抽屉变短、外观在首屏、工具只展开当前组', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await openDrawer(page, '/hotkeys');
  const nav = drawer(page);
  expect(await nav.evaluate((element) => element.scrollHeight), '抽屉 scrollHeight 应 < 1500').toBeLessThan(1500);
  await expect(page.getByRole('button', { name: '工具', exact: true })).toHaveAttribute('aria-expanded', 'true');

  // 只展开当前页所在组：/hotkeys → 新手入门。
  const groups = toolsGroups(page);
  await expect(groups).toHaveCount(4);
  await expect(groups.nth(0)).toHaveJSProperty('open', true);
  for (const index of [1, 2, 3]) await expect(groups.nth(index)).toHaveJSProperty('open', false);
  await expect(groups.nth(0).locator('summary')).toContainText('新手入门');
  await expect(groups.nth(0).locator('a[href="#/hotkeys"]')).toBeVisible();

  // 外观段在首屏内可见（不必滚动），并且能立即切换主题。
  const appearance = page.getByRole('radiogroup', { name: '外观', exact: true });
  await expect(appearance).toBeInViewport();
  await appearance.getByRole('radio', { name: '深色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.keyboard.press('Escape');
  await expect(drawer(page)).toBeHidden();
  await expect(page.getByRole('button', { name: '菜单', exact: true })).toBeFocused();
});

test('#774 @360 其余工具组可折叠、键盘可操作', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await openDrawer(page, '/hotkeys');
  const groups = toolsGroups(page);
  const other = groups.nth(1);
  await expect(other).toHaveJSProperty('open', false);
  await other.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(other).toHaveJSProperty('open', true);
  await expect(other.getByRole('link', { name: '开局流程', exact: true })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(other).toHaveJSProperty('open', false);
  // 当前组不受影响。
  await expect(groups.nth(0)).toHaveJSProperty('open', true);
});

test('#774 @360 /market 只默认展开经济计算组', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await openDrawer(page, '/market');
  const groups = toolsGroups(page);
  await expect(groups.nth(2)).toHaveJSProperty('open', true);
  await expect(groups.nth(2)).toContainText('经济计算');
  await expect(groups.nth(2).getByRole('link', { name: '市场买卖', exact: true })).toHaveAttribute('aria-current', 'page');
  for (const index of [0, 1, 3]) await expect(groups.nth(index)).toHaveJSProperty('open', false);
});

test('#774 @360 工具面板不再重复上方「百科」的 4 项', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await openDrawer(page, '/hotkeys');
  // 百科组里的 4 项仍在抽屉上方。
  for (const [label, href] of WIKI_NAV) await expect(page.locator('nav.mainnav a', { hasText: label }).first()).toHaveAttribute('href', href);
  // 展开「资料」组后，工具面板内不应再出现这 4 项。
  await toolsGroups(page).nth(3).locator('summary').click();
  await expect(toolsGroups(page).nth(3)).toHaveJSProperty('open', true);
  for (const [, href] of WIKI_NAV) await expect(page.locator(`#tools-menu a[href="${href}"]`), `${href} 不应在工具面板重复`).toHaveCount(0);
  await expect(page.locator('nav.mainnav a[href="#/civs"]')).toHaveCount(1);
});

test('#774 @1280 桌面工具下拉保持原结构（4 组 37 项、平铺无折叠、含百科重复项）', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/hotkeys');
  await page.getByRole('button', { name: '工具', exact: true }).click();
  const panel = page.locator('#tools-menu');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.tools-group-title')).toHaveText(['新手入门', '对局计划', '经济计算', '资料']);
  await expect(panel.locator('details')).toHaveCount(0);
  await expect(panel.getByRole('link')).toHaveCount(37);
  await expect(panel.locator('a[href="#/civs"]')).toHaveCount(1);
  // 桌面不渲染抽屉里的外观段（外观仍在页头主题按钮）。
  await expect(page.locator('#tools-menu .drawer-appearance')).toHaveCount(0);
});

for (const width of DRAWER_WIDTHS)
  test(`#774 @${width} 抽屉变短、无横向滚动、关闭后焦点归还`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openDrawer(page, '/hotkeys');
    expect(await drawer(page).evaluate((element) => element.scrollHeight)).toBeLessThan(1500);
    await expect(page.getByRole('radiogroup', { name: '外观', exact: true })).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(drawer(page)).toBeHidden();
    await expect(page.getByRole('button', { name: '菜单', exact: true })).toBeFocused();
  });
