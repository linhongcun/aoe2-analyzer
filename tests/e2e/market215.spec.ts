import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const width of [360, 375, 390, 1280]) {
  test(`#215 @${width} 市场方案、逐笔预算、分享与浅深主题`, async ({ page, context }, info) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./#/market');
    await expect(page.getByRole('heading', { name: '市场买卖预算', exact: true })).toBeVisible();
    await expect(page.getByTestId('market-summary-0')).toContainText('全部交易可执行');
    await expect(page.getByTestId('market-summary-0')).toContainText('31');
    await expect(page.getByLabel('预算口径')).toContainText('游戏内部可能保留小数余额');
    expect((await page.locator('.market-ledger caption').boundingBox())!.width).toBeGreaterThan(200);
    await page.screenshot({ path: info.outputPath(`market215-light-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const axe = await new AxeBuilder({ page }).include('.market-page').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target) }))).toEqual([]);
    await page.getByRole('button', { name: '上移第 2 项', exact: true }).click();
    await expect(page.getByTestId('market-failure')).toContainText('第 1 项的第 1 笔无法成交');
    await expect(page.getByTestId('market-failure')).toContainText('缺少');
    await page.getByRole('button', { name: '下移第 1 项', exact: true }).click();
    await expect(page.getByTestId('market-failure')).toHaveCount(0);
    await page.getByRole('button', { name: '复制当前方案到 B', exact: true }).click();
    await page.getByRole('button', { name: '编辑方案 B', exact: true }).click();
    await page.getByRole('combobox', { name: '文明', exact: true }).selectOption('Saracens');
    await expect(page.getByRole('checkbox', { name: /已研究行会/ })).toBeDisabled();
    await expect(page.getByTestId('market-summary-1')).toContainText('5%');
    await page.getByRole('spinbutton', { name: '黄金库存', exact: true }).fill('200');
    await page.getByRole('button', { name: '复制两份方案链接' }).click();
    await expect(page.getByRole('status')).toContainText('方案链接已复制');
    const url = await page.evaluate(() => navigator.clipboard.readText());
    await page.goto(url);
    await page.getByRole('button', { name: '编辑方案 B', exact: true }).click();
    await expect(page.getByRole('combobox', { name: '文明', exact: true })).toHaveValue('Saracens');
    await expect(page.getByRole('spinbutton', { name: '黄金库存', exact: true })).toHaveValue('200');
    await page.getByRole('button', { name: '编辑方案 A', exact: true }).click();
    await expect(page.getByRole('combobox', { name: '文明', exact: true })).toHaveValue('Britons');
    await expect(page.getByRole('spinbutton', { name: '黄金库存', exact: true })).toHaveValue('0');
    await page.getByRole('spinbutton', { name: '第 1 项笔数', exact: true }).fill('1.5');
    await expect(page.getByRole('alert')).toContainText('数量须为');
    await expect(page.getByTestId('market-result')).toHaveCount(0);
    await page.getByRole('spinbutton', { name: '第 1 项笔数', exact: true }).fill('2');
    await page.getByRole('button', { name: '删除第 2 项', exact: true }).click();
    await page.getByRole('button', { name: '删除第 1 项', exact: true }).click();
    await expect(page.getByTestId('market-summary-0')).toContainText('没有交易，库存不变');
    await page.getByRole('button', { name: '添加交易', exact: true }).click();
    await expect(page.getByTestId('market-order')).toHaveCount(1);
    await page.goto('./#/market?v=2&state=bad');
    await expect(page.getByRole('alert')).toContainText('方案链接无效');
    await expect(page.getByTestId('market-editor-A')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '复制两份方案链接' })).toBeDisabled();
    await page.getByRole('button', { name: '重置方案' }).click();
    await page.evaluate(() => localStorage.setItem('aoe2-theme', 'dark'));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByTestId('market-result')).toBeVisible();
    await page.screenshot({ path: info.outputPath(`market215-dark-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const darkAxe = await new AxeBuilder({ page }).include('.market-page').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(darkAxe.violations.map((violation) => violation.id)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('#215 持续生产入口、行会与大干道、自定义基价和明细分页', async ({ page }) => {
  await page.goto('./#/production');
  await page.getByRole('link', { name: '市场买卖预算', exact: true }).click();
  await page.getByRole('checkbox', { name: '已研究行会', exact: true }).check();
  await expect(page.getByTestId('market-summary-0')).toContainText('15%');
  await page.getByRole('combobox', { name: '文明', exact: true }).selectOption('Hindustanis');
  await page.getByRole('checkbox', { name: '已研究大干道', exact: true }).check();
  await expect(page.getByTestId('market-summary-0')).toContainText('10%');
  await page.getByRole('spinbutton', { name: '黄金库存', exact: true }).fill('1000000');
  await page.getByText('高级：手续费前市场基价', { exact: true }).click();
  await page.getByRole('spinbutton', { name: '食物手续费前基价', exact: true }).fill('100');
  await page.getByRole('spinbutton', { name: '第 2 项笔数', exact: true }).fill('30');
  await expect(page.getByRole('navigation', { name: '交易明细分页' })).toBeVisible();
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.getByRole('navigation', { name: '交易明细分页' })).toContainText('2 / 2 页');
  await page.getByRole('spinbutton', { name: '食物手续费前基价', exact: true }).fill('10000');
  await expect(page.getByRole('alert')).toContainText('手续费前基价须为');
});

test('#215 剪贴板失败仍提供完整手动复制链接', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } }),
  );
  await page.goto('./#/market');
  await page.getByRole('button', { name: '复制两份方案链接' }).click();
  await expect(page.getByRole('textbox', { name: '手动复制方案链接', exact: true })).toHaveValue(/#\/market\?v=1&state=/);
});

test('#215 静态直达页分享恢复到站点根路径', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./market/');
  await expect(page.getByRole('heading', { name: '市场买卖预算', exact: true })).toBeVisible();
  await page.getByRole('spinbutton', { name: '黄金库存', exact: true }).fill('500');
  await page.getByRole('button', { name: '复制两份方案链接' }).click();
  await expect(page.getByRole('status')).toContainText('方案链接已复制');
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(url).pathname).toBe(new URL(process.env.BASE_URL ?? 'http://localhost:4173/').pathname);
  await page.goto(url);
  await expect(page.getByRole('spinbutton', { name: '黄金库存', exact: true })).toHaveValue('500');
});

test('#215 分享方案中的不可用科技状态可以直接取消修正', async ({ page }) => {
  await page.goto('./#/market');
  await page.getByRole('combobox', { name: '文明', exact: true }).selectOption('Saracens');
  const url = new URL(page.url());
  const params = new URLSearchParams(url.hash.split('?')[1]);
  const config = JSON.parse(params.get('state')!);
  config.plans[0].guilds = true;
  params.set('state', JSON.stringify(config));
  url.hash = '/market?' + params;
  await page.goto(url.href);
  await expect(page.getByRole('alert')).toContainText('该文明没有行会');
  await expect(page.getByRole('checkbox', { name: /已研究行会/ })).toBeEnabled();
  await page.getByRole('checkbox', { name: /已研究行会/ }).uncheck();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /已研究行会/ })).toBeDisabled();
  await expect(page.getByTestId('market-summary-0')).toContainText('5%');
});

test('#215 全局搜索可用市场页面拼音进入子工具', async ({ page }) => {
  await page.goto('./#/production');
  await page.getByRole('button', { name: '全局搜索', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '全局搜索', exact: true });
  await dialog.getByPlaceholder(/搜索文明、单位、科技/).fill('shichangmaimai');
  await dialog.locator('.cmdk-list li').filter({ hasText: '市场买卖' }).click();
  await expect(page.getByRole('heading', { name: '市场买卖预算', exact: true })).toBeVisible();
});
