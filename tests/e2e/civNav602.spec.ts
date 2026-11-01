import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const TOOLS = [
  ['开局流程', '#/builds?civ=Armenians', 'civ-tool-builds'],
  ['生产对照', '#/production?civ=Armenians', 'civ-tool-production'],
  ['对局助手', '#/matchup?me=Armenians', 'civ-tool-matchup'],
  ['文明对比', '#/compare?a=Armenians', 'civ-tool-compare'],
  ['科技树', '#/tree/Armenians', 'civ-tool-tree'],
] as const;
const TABS = ['概览', '数据', '科技', '更新历史', '职业选手视角'];
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

async function ready(page: Page, route = '/civ/Armenians') {
  await page.goto(`./#${route}`);
  await expect(page.locator('#detail h1')).toContainText('亚美尼亚');
  await expect(page.locator('#detail .dside').getByRole('link', { name: '牧师战士', exact: true })).toBeVisible();
}

test('#602 页内 Tab 在上，相关工具在下，职业选手视角不进情境条', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await ready(page);
  const tabs = page.getByTestId('civ-tabs');
  const tools = page.getByTestId('civ-related-tools');
  await expect(tabs).toHaveAttribute('aria-label', '亚美尼亚内容');
  await expect(tabs.getByRole('tab')).toHaveText(TABS);
  await expect(tabs.getByRole('tab', { name: '概览', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.getByRole('tab', { name: '概览', exact: true })).toHaveClass(/on/);
  await expect(page.locator('#detail nav')).toHaveCount(2);
  await expect(tools).toHaveAttribute('aria-label', '相关工具');
  await expect(tools.locator('.community-tool-entry, .ctx-bar')).toHaveCount(0);
  for (const [name, href, id] of TOOLS) {
    const link = tools.getByTestId(id);
    await expect(link).toHaveAttribute('href', href);
    await expect(link).toHaveText(name);
    await expect(page.locator('#detail').getByRole('link', { name, exact: true })).toHaveCount(1);
  }
  await expect(tools.getByRole('link', { name: '职业选手视角', exact: true })).toHaveCount(0);
  await expect(page.locator('#detail .dside')).not.toContainText(/快速入口|科技树|文明对比|对局助手|职业选手视角/);
  await expect(page.locator('#detail .dside').getByRole('link', { name: /复合弓箭手/ })).toBeVisible();
  await expect(page.locator('#detail .dside').getByRole('link', { name: '牧师战士', exact: true })).toBeVisible();
  const order = await page.evaluate(() => {
    const tablist = document.querySelector('[data-testid="civ-tabs"]');
    const bar = document.querySelector('[data-testid="civ-related-tools"]');
    const body = document.querySelector('#detail .dbody');
    const following = Node.DOCUMENT_POSITION_FOLLOWING;
    return {
      tabsBeforeTools: !!(tablist && bar && tablist.compareDocumentPosition(bar) & following),
      toolsBeforeBody: !!(bar && body && bar.compareDocumentPosition(body) & following),
    };
  });
  expect(order).toEqual({ tabsBeforeTools: true, toolsBeforeBody: true });
  const boxes = {
    tabs: (await tabs.boundingBox())!,
    tools: (await tools.boundingBox())!,
    body: (await page.locator('#detail .dbody').boundingBox())!,
  };
  expect(boxes.tools.y).toBeGreaterThan(boxes.tabs.y + boxes.tabs.height - 1);
  expect(boxes.body.y).toBeGreaterThan(boxes.tools.y + boxes.tools.height - 1);
  const chrome = await tools.evaluate((bar) => {
    const link = bar.querySelector('a');
    const barStyle = getComputedStyle(bar);
    const linkStyle = getComputedStyle(link!);
    return {
      barBorderTop: barStyle.borderTopWidth,
      linkBorder: linkStyle.borderTopWidth,
      linkBackground: linkStyle.backgroundColor,
    };
  });
  expect(chrome.barBorderTop).toBe('1px');
  expect(chrome.linkBorder).toBe('0px');
  expect(chrome.linkBackground).toBe('rgba(0, 0, 0, 0)');
  await page.getByRole('tab', { name: '科技', exact: true }).click();
  await expect(tools.getByTestId('civ-tool-tree')).toHaveAttribute('href', '#/tree/Armenians');
  const tech = page.getByRole('tabpanel', { name: '科技', exact: true });
  await expect(tech).toContainText('城堡时代独特科技');
  await expect(tech).toContainText('帝王时代独特科技');
  await expect(tech).not.toContainText('查看完整科技树');
  await expect(tech).not.toContainText('职业选手视角');
  await page.getByRole('tab', { name: '职业选手视角', exact: true }).click();
  await expect(page.getByRole('tab', { name: '职业选手视角', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: '职业选手原始资料', exact: true })).toBeVisible();
  await expect(tools.getByRole('link')).toHaveCount(5);
  await expect(tools).not.toContainText('职业选手视角');
  expect((await new AxeBuilder({ page }).include('#detail').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
});

for (const width of [360, 375, 390, 1280])
  test(`#602 @${width} 相关工具可点且页面不横溢`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await ready(page);
    const tools = page.getByTestId('civ-related-tools');
    for (const link of await tools.getByRole('link').all()) {
      const box = await link.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    for (const tab of await page.getByTestId('civ-tabs').getByRole('tab').all()) {
      const box = await tab.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

test('#602 深色 1280 仍能分出本页内容与相关工具', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), 'dark');
  await ready(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const tabs = page.getByTestId('civ-tabs');
  const tools = page.getByTestId('civ-related-tools');
  const tabBox = (await tabs.boundingBox())!;
  const toolBox = (await tools.boundingBox())!;
  expect(toolBox.y).toBeGreaterThan(tabBox.y + tabBox.height - 1);
  await expect(tools.getByRole('link')).toHaveCount(5);
  await expect(tools).not.toContainText('职业选手视角');
});
