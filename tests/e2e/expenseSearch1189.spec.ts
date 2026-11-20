import { expect, test, type Page } from '@playwright/test';

const dialogOf = (page: Page) => page.getByRole('dialog', { name: '全局搜索', exact: true });
const modesOf = (page: Page) => page.getByRole('navigation', { name: '生产模式' });
const comparison = '#/production?mode=train-compare&v=1&unit=38&age=3&n=10';

async function searchFor(page: Page, phrase: string) {
  const dialog = dialogOf(page);
  await page.getByRole('button', { name: '全局搜索', exact: true }).click();
  const input = dialog.getByRole('combobox', { name: '全局搜索', exact: true });
  await input.fill(phrase);
  return input;
}

async function expectMode(page: Page, title: string) {
  await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
  await expect(modesOf(page).locator('[aria-current="page"]')).toHaveText(title);
  await expect(page).toHaveTitle(`${title} | 帝国时代 II 分析器`);
}

test('全局搜索直达三个费用模式，保留对照方案的复制和校验', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./#/');

  await searchFor(page, '训练总价');
  const total = dialogOf(page).getByRole('option', { name: /训练总价/ });
  await expect(total).toContainText('合计这批单位的训练费用，不含研究费。');
  await total.click();
  expect(new URL(page.url()).hash).toBe('#/production?mode=train-total');
  await expectMode(page, '训练总价');
  await expect(page.getByText('添加兵种并填写训练数量后查看合计。', { exact: true })).toBeVisible();

  await searchFor(page, '阵容');
  const army = dialogOf(page).getByRole('option', { name: /阵容新增费用/ });
  await expect(army).toContainText('计算新增兵种和未完成研究还要花多少资源。');
  await army.click();
  expect(new URL(page.url()).hash).toBe('#/production?mode=army-cost');
  await expectMode(page, '阵容新增费用');
  await expect(page.getByText('添加兵种并核对研究状态后查看费用。', { exact: true })).toBeVisible();

  const search = await searchFor(page, '跨文明');
  const compare = dialogOf(page).getByRole('option', { name: /跨文明训练对照/ });
  await expect(compare).toContainText('比较不同文明在同一座马厩的训练间隔与费用。');
  await expect(compare).toHaveAttribute('aria-selected', 'true');
  await search.press('Enter');
  expect(new URL(page.url()).hash).toBe(comparison);
  await expectMode(page, '跨文明训练对照');
  const count = page.getByRole('textbox', { name: '目标数量' });
  await expect(count).toHaveValue('10');
  await expect(page.getByRole('combobox', { name: '对照单位' })).toHaveValue('38');
  await expect(page.getByRole('table').locator('caption').getByText('10 个', { exact: true })).toBeVisible();

  await count.fill('12');
  await page.getByRole('button', { name: '应用数量' }).click();
  const modified = new URL(page.url());
  await page.reload();
  await expect(count).toHaveValue('12');
  await expectMode(page, '跨文明训练对照');
  await page.getByRole('button', { name: '复制对照链接' }).click();
  await expect(page.getByText('对照链接已复制，包含当前全部选择。')).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(copied).hash).toBe(modified.hash);
  const newTab = await context.newPage();
  await newTab.goto(copied);
  await expectMode(newTab, '跨文明训练对照');
  await expect(newTab.getByRole('textbox', { name: '目标数量' })).toHaveValue('12');
  await newTab.close();

  await page.goto('./' + comparison.replace('&n=10', ''));
  await expectMode(page, '跨文明训练对照');
  await expect(page.getByRole('alert')).toContainText('对照链接无法完整恢复，未生成结果。');
  await expect(page.getByRole('alert')).toContainText('对照参数 n 缺失或重复。');
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '复制对照链接' })).toBeDisabled();
  await modesOf(page).getByRole('link', { name: '持续生产', exact: true }).click();
  await expectMode(page, '持续生产');
});

test('窄屏研究费用显示两个用途，原页面与实体仍可搜索', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('./#/');
  const input = await searchFor(page, '研究费用');
  const list = dialogOf(page).getByRole('listbox');
  await expect(list.getByRole('option')).toHaveCount(2);
  await expect(list.getByRole('option', { name: /阵容新增费用/ })).toContainText('计算新增兵种和未完成研究还要花多少资源。');
  const simulator = list.getByRole('option', { name: /科技模拟器/ });
  await expect(simulator).toContainText('选一个单位，查看所选科技的累计研究费用。');
  for (const row of await list.getByRole('option').all()) {
    await expect(row.locator('.tag')).toHaveText('页面');
    expect(await row.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  for (const [query, result, type] of [
    ['开局', '开局流程', '页面'],
    ['骑士', '骑士', '单位'],
    ['法兰克', '法兰克', '文明'],
  ] as const) {
    await input.fill(query);
    const option = list.getByRole('option').filter({ has: page.getByText(result, { exact: true }) });
    await expect(option.locator('.tag')).toHaveText(type);
  }
  await input.fill('研究费用');
  await simulator.click();
  expect(new URL(page.url()).hash).toBe('#/simulator');
  await expect(page).toHaveTitle('科技模拟器 | 帝国时代 II 分析器');
});
