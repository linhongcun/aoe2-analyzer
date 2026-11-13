import { expect, test, type Page } from '@playwright/test';

const VIEW = { width: 1280, height: 844 };

async function open(page: Page, path: string) {
  await page.goto('./#' + path);
  await expect(page.locator('header.tool-head h1')).toBeVisible();
}

test('#978 空方案默认帝王且不预填科技或兵种', async ({ page }) => {
  await page.setViewportSize(VIEW);
  await open(page, '/production?mode=train-total');
  await expect(page.getByRole('heading', { level: 1, name: '训练总价' })).toBeVisible();
  await expect(page.locator('header.tool-head')).toContainText('计算同一文明、同一时代下，多种单位形态的训练总价。不含研究费用。');
  await expect(page.getByRole('navigation', { name: '生产模式' }).getByRole('link', { name: '训练总价', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByLabel('训练总价文明')).toHaveValue('Franks');
  await expect(page.getByLabel('训练总价时代')).toHaveValue('4');
  await expect(page.getByTestId('train-total-row')).toHaveCount(0);
  await expect(page.getByTestId('train-total-empty')).toHaveText('添加兵种并填写训练数量后查看合计。');
  await expect(page.getByTestId('train-total-result')).not.toContainText('下列总价');
  await expect(page.getByTestId('train-total-result')).not.toContainText('已计入行小计');
  await expect(page.getByTestId('train-total-result')).not.toContainText('部分训练费用');
  await expect(page.getByTestId('train-total-resource-Food')).toHaveCount(0);
  const copy = page.getByRole('button', { name: '复制方案链接', exact: true });
  await expect(copy).toBeEnabled();
  expect((await copy.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await copy.evaluate((element) => getComputedStyle(element, '::after').content)).toBe('none');
  await expect(page.getByRole('button', { name: '跳到结果', exact: true })).toBeHidden();
  await expect(page.locator('.tool-foot')).toContainText('计算口径。');
  await expect(page.locator('.tool-foot')).toContainText('不含研究费用。');
  await expect(page.locator('.tool-foot')).toContainText('已选科技不等于全部计入。');
});

test('#978 显式时代不被改成帝王，坏链和误带参数留在本模式', async ({ page }) => {
  await page.setViewportSize(VIEW);
  await open(page, '/production?mode=train-total&civ=Britons&age=3&rows=83:109:4&walk=2&farm=1&units=83:0');
  await expect(page.getByLabel('训练总价时代')).toHaveValue('3');
  await expect(page.getByLabel('兵种 1 训练数量')).toHaveValue('0');
  await expect(page.getByTestId('train-total-result')).toContainText('没有当成训练数量');
  await expect(page.getByTestId('train-total-none')).toContainText('当前没有已计入的训练行。');
  await expect(page.getByTestId('train-total-result')).not.toContainText('已计入行小计');
  await expect(page.getByTestId('train-total-result')).not.toContainText('部分训练费用');
  await expect(page.getByTestId('train-total-resource-Food')).toHaveCount(0);

  await open(page, '/production?mode=train-total&civ=Franks&age=4&units=83:2,83:abc');
  await expect(page.getByLabel('兵种 2 训练数量')).toHaveValue('abc');
  await expect(page.getByTestId('train-total-result')).toContainText('已计入行小计');
  await expect(page.getByTestId('train-total-result')).toContainText('部分训练费用');
  await expect(page.getByTestId('train-total-result')).toContainText('已计入 1 / 2 行');
  await expect(page.getByTestId('train-total-result')).toContainText('第 2 行训练数量须为 1–1000 的整数，未计入下面的小计。');

  await open(page, '/production?mode=train-total&civ=Nope');
  await expect(page.getByRole('alert')).toContainText('文明无效');
  await expect(page.getByRole('button', { name: '复制方案链接', exact: true })).toBeDisabled();

  await open(page, '/production?mode=train-total&mode=train-total');
  await expect(page.getByTestId('train-total-error')).toContainText('训练总价模式重复或不支持。');
  await expect(page.getByRole('button', { name: '复制方案链接', exact: true })).toBeDisabled();
  await page.getByRole('link', { name: '回到训练总价入口', exact: true }).click();
  await expect(page.getByTestId('train-total-empty')).toBeVisible();
});

test('#978 数量按训练价相加，化学只解锁，切换和返回各自保留方案', async ({ page, context }) => {
  await page.setViewportSize(VIEW);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page, '/production');
  await expect(page.getByLabel('生产时代')).toHaveValue('3');
  await page.getByRole('navigation', { name: '生产模式' }).getByRole('link', { name: '训练总价', exact: true }).click();
  await expect(page).toHaveURL(/mode=train-total/);
  await expect(page).toHaveURL(/age=4/);
  await expect(page).not.toHaveURL(/units=/);
  await expect(page.getByTestId('train-total-empty')).toBeVisible();

  await page.getByRole('button', { name: '添加兵种', exact: true }).click();
  await expect(page.getByTestId('train-total-row')).toHaveCount(1);
  await expect(page.getByLabel('兵种 1 训练数量')).toHaveValue('1');
  const food = page.getByTestId('train-total-resource-Food');
  await expect(food).toBeVisible();
  const once = (await food.innerText()).replace(/\s/g, '');
  await page.getByLabel('兵种 1 训练数量').fill('2');
  await expect.poll(() => decodeURIComponent(new URL(page.url()).hash)).toContain(':2');
  await expect.poll(async () => (await food.innerText()).replace(/\s/g, '')).not.toBe(once);
  await page.getByRole('button', { name: '复制方案链接', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('链接已复制');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(decodeURIComponent(copied)).toContain('mode=train-total');
  expect(decodeURIComponent(copied)).toContain(':2');

  const kept = page.url();
  await page.getByRole('navigation', { name: '生产模式' }).getByRole('link', { name: '训练总价', exact: true }).click();
  await expect(page).toHaveURL(kept);
  await page.getByRole('navigation', { name: '生产模式' }).getByRole('link', { name: '持续生产', exact: true }).click();
  await expect(page).not.toHaveURL(/units=/);
  await expect(page.getByLabel('生产文明')).toHaveValue('Franks');
  await page.goBack();
  await expect(page).toHaveURL(kept);
  await expect(page.getByLabel('兵种 1 训练数量')).toHaveValue('2');

  await open(page, '/production?mode=train-total&civ=Hindustanis&age=4&units=5:1');
  await expect(page.getByTestId('train-total-row')).toContainText('需要已研究');
  await page.getByRole('button', { name: /^勾选/ }).click();
  await expect(page).toHaveURL(/techs=47/);
  await expect(page.getByTestId('train-total-result')).toContainText('训练总价');
  await expect(page.getByTestId('train-total-resource-Food')).toBeVisible();
  await expect(page.locator('.tool-foot')).toContainText('不含研究费用');
});

test('#978 相关工具、390 和深色页头可点且不横溢', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), 'dark');
  await open(page, '/production?mode=train-total&civ=Hindustanis&age=4');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const home = page.getByRole('navigation', { name: '面包屑' }).getByRole('link', { name: '首页' });
  const copy = page.getByRole('button', { name: '复制方案链接', exact: true });
  const jump = page.getByRole('button', { name: '跳到结果', exact: true });
  const homeBox = (await home.boundingBox())!;
  const copyBox = (await copy.boundingBox())!;
  const jumpBox = (await jump.boundingBox())!;
  expect(homeBox.width).toBeGreaterThanOrEqual(44);
  expect(homeBox.height).toBeGreaterThanOrEqual(44);
  expect(copyBox.height).toBeGreaterThanOrEqual(44);
  expect(jumpBox.height).toBeGreaterThanOrEqual(44);
  expect(jumpBox.x).toBeGreaterThanOrEqual(copyBox.x + copyBox.width + 7);
  expect(await copy.evaluate((element) => getComputedStyle(element, '::after').content)).toBe('none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const related = page.getByRole('navigation', { name: '相关工具' });
  await expect(related.getByRole('link', { name: '持续生产', exact: true })).toHaveAttribute('href', /#\/production\?civ=Hindustanis&age=4/);
  await expect(related.getByRole('link', { name: '市场买卖预算', exact: true })).toHaveAttribute('href', '#/market');
  await expect(related.getByRole('link', { name: /详情$/ })).toHaveAttribute('href', '#/civ/Hindustanis');
  await jump.click();
  await expect(page.locator('#train-total-result-title')).toBeFocused();
  await home.click();
  await expect(page).toHaveURL(/#\/$/);
});
