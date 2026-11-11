import { expect, test, type Page } from '@playwright/test';

// #771：6 个经济/资料页补齐「首页 / 页名」面包屑（复用现有 Breadcrumbs），/market 补回经济工具互链。
// 面包屑外观/高度以已在用的 /relic-income 为参照（同一组件、同一 CSS）。
const PAGES = [
  ['/maps', '地图'],
  ['/patches', '更新历史'],
  ['/production', '持续生产'],
  ['/market', '市场买卖'],
  ['/construction', '多人施工'],
  ['/garrison-healing', '驻军回血'],
] as const;
const EXISTING = [
  ['/relic-income', '圣物收益'],
  ['/trade-income', '商路供给'],
  ['/eco-payoff', '经济科技收益'],
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

const crumbs = (page: Page) => page.locator('nav.crumbs');
const measure = (page: Page) =>
  crumbs(page).evaluate((element) => {
    const computed = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return { height: rect.height, fontSize: computed.fontSize };
  });

async function expectBreadcrumb(page: Page, route: string, label: string) {
  await page.goto('./#' + route);
  const nav = crumbs(page);
  await expect(nav, `${route} 应渲染面包屑`).toHaveCount(1);
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link', { name: /首页/ })).toHaveAttribute('href', '#/');
  await expect(nav.locator('span')).toHaveText(label);
  // 与既有页面同构：只有「首页」一个链接，页名是当前层文本。
  await expect(nav.locator('a')).toHaveCount(1);
  await expect(nav.locator('span')).toHaveCount(1);
}

for (const width of [1280, 360])
  test(`#771 @${width} 六个页面都有与既有页一致的「首页 / 页名」面包屑`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./#/relic-income');
    const reference = await measure(page);
    expect(reference.fontSize).toBe('13px');
    for (const [route, label] of PAGES) {
      await expectBreadcrumb(page, route, label);
      const actual = await measure(page);
      expect(actual, `${route} 面包屑应与既有页面同高（360 下不换行挤压正文）`).toEqual(reference);
    }
  });

test('#771 既有三个经济页面包屑不回退', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const [route, label] of EXISTING) {
    await expectBreadcrumb(page, route, label);
  }
});

test('#771 /market 补回经济工具互链，与 /production 形成回路', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/market');
  const market = page.getByTestId('market-page');
  const toProduction = market.getByRole('link', { name: /持续生产/ });
  await expect(toProduction).toBeVisible();
  await expect(toProduction).toHaveAttribute('href', '#/production');
  const toPayoff = market.getByRole('link', { name: /经济科技收益/ });
  await expect(toPayoff).toBeVisible();
  await expect(toPayoff).toHaveAttribute('href', '#/eco-payoff');
  // 回路：/production 仍保留到 /market 的入口。
  await page.goto('./#/production');
  const production = page.getByTestId('production-page');
  await expect(production.getByRole('link', { name: '市场买卖预算', exact: true })).toHaveAttribute('href', '#/market');
});

for (const width of [360, 375, 390, 1280])
  test(`#771 ${width} 宽六个页面无横向滚动且面包屑不溢出`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const [route, label] of PAGES) {
      await page.goto('./#' + route);
      const nav = crumbs(page);
      await expect(nav, `${width} 宽 ${route} 应有面包屑`).toHaveCount(1);
      await expect(nav.locator('span')).toHaveText(label);
      expect(await nav.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), `${width} 宽 ${route} 面包屑自身不应横向溢出`).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width} 宽 ${route} 不应横向滚动`).toBe(true);
    }
  });
