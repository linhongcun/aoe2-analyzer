import { expect, test, type Page } from '@playwright/test';

const PANEL = 'team-plan-page';
const PRINT = 'team-plan-print';
const errors = new WeakMap<Page, string[]>();
const printText = async (page: Page) => {
  await page.emulateMedia({ media: 'print' });
  const text = await page.getByTestId(PRINT).innerText();
  await page.emulateMedia({ media: 'screen' });
  return text;
};

test.beforeEach(async ({ page }) => {
  const runtime: string[] = [];
  errors.set(page, runtime);
  page.on('pageerror', (error) => runtime.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtime.push(message.text());
  });
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('#769 全新计划未编辑时不把默认占位文明写进打印稿', async ({ page }) => {
  await page.goto('./#/team-plan');
  await expect(page.getByTestId(PANEL)).toBeVisible();
  // 默认是显式「未选择」，而不是替玩家选好的文明。
  await expect(page.getByRole('combobox', { name: 'P1 文明', exact: true })).toHaveValue('');
  await expect(page.getByRole('combobox', { name: 'P2 文明', exact: true })).toHaveValue('');
  const text = await printText(page);
  expect(text).not.toContain('法兰克');
  expect(text).toContain('P1 P1 · 未选择 · 未指定 · 位置补充未填写');
  expect(text).toContain('P2 P2 · 未选择 · 未指定 · 位置补充未填写');
});

test('#769 玩家选过文明后打印稿逐字显示实际文明，并可改回未选择', async ({ page }) => {
  await page.goto('./#/team-plan');
  const p1 = page.getByRole('combobox', { name: 'P1 文明', exact: true });
  await p1.selectOption('Franks');
  await page.getByRole('combobox', { name: 'P2 文明', exact: true }).selectOption('Berbers');
  let text = await printText(page);
  expect(text).toContain('P1 P1 · 法兰克 · 未指定 · 位置补充未填写');
  expect(text).toContain('P2 P2 · 柏柏尔 · 未指定 · 位置补充未填写');
  await p1.selectOption('');
  text = await printText(page);
  expect(text).not.toContain('法兰克');
  expect(text).toContain('P1 P1 · 未选择 · 未指定 · 位置补充未填写');
});

test('#769 载入开放陆地4v4范例后打印保留范例标识，不回归默认占位', async ({ page }) => {
  await page.goto('./#/team-plan');
  await page.getByRole('button', { name: '载入开放陆地4v4范例', exact: true }).click();
  await expect(page.getByTestId('team-plan-example-note')).toBeVisible();
  const text = await printText(page);
  expect(text).toContain('本站整理的范例；完成状态仅为可修改的示例假设。');
  expect(text).toContain('P2 P2 · 法兰克');
  expect(text).toContain('P4');
  expect(text).not.toContain('未选择 · 未指定');
});

test('#769 360 宽与打印媒体均无横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('./#/team-plan');
  await expect(page.getByRole('combobox', { name: 'P1 文明', exact: true })).toHaveValue('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.emulateMedia({ media: 'print' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.emulateMedia({ media: 'screen' });
});
