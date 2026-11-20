import { expect, test, type Page } from '@playwright/test';

const rows = [
  { unit: 761, qty: '1' },
  { unit: 359, qty: '1' },
  { unit: 36, qty: '1' },
];
const ledger =
  '/production?' +
  new URLSearchParams({
    mode: 'army-cost',
    acv: '1',
    acdata: '188329',
    civ: 'Goths',
    age: '4',
    acunits: JSON.stringify(rows),
    acdone: '[]',
    actargets: '[]',
  });
const selector = (index: number, control: string) => `第 ${index} 行 ${control}`;

async function confirmProductionRow(page: Page, index: number, building: string, count: string) {
  await page.getByRole('checkbox', { name: selector(index, '确认形态') }).check();
  await page.getByRole('combobox', { name: selector(index, '专用生产建筑') }).selectOption(building);
  await page.getByRole('textbox', { name: selector(index, '建筑座数') }).fill(count);
}

for (const width of [1120, 360]) {
  test(`#1195 ${width}px 原阵容继续规划、显式研究和独立回程`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('./#' + ledger);
    const start = page.getByRole('link', { name: '用这些兵种规划持续生产' });
    const tab = page.getByRole('navigation', { name: '生产模式' }).getByRole('link', { name: '持续生产', exact: true });
    await expect(tab).toHaveAttribute('href', '#/production?civ=Goths&age=4');
    await expect(start).toBeVisible();
    await start.focus();
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('army-supply-page')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('持续生产');
    await expect(tab).toHaveAttribute('aria-current', 'page');
    const source = page.getByTestId('army-supply-row');
    await expect(source.getByRole('heading', { level: 3 })).toHaveText(['第 1 行 · 精锐近卫军', '第 2 行 · 长戟兵', '第 3 行 · 手推炮']);
    await expect(source.getByText('来源 1 名')).toHaveCount(3);
    await expect(page.getByRole('textbox', { name: selector(2, '建筑座数') })).toHaveValue('');
    await expect(page.getByRole('combobox', { name: selector(2, '专用生产建筑') })).toHaveValue('');
    await expect(page.getByRole('radio', { name: '仅按当前已完成研究' })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: '纳入化学' })).not.toBeChecked();
    await expect(page.getByText('暂不显示完整供给', { exact: false })).toBeVisible();
    await expect(page.getByTestId('production-total')).toHaveCount(0);

    await page.getByRole('radio', { name: '仅按当前已完成研究' }).check();
    await confirmProductionRow(page, 2, '12', '3');
    await expect(source.nth(0)).toContainText('无政府');
    await expect(source.nth(2)).toContainText('化学');
    await expect(page.getByRole('textbox', { name: selector(1, '建筑座数') })).toBeDisabled();
    await expect(page.getByTestId('production-total')).toHaveCount(0);

    await page.getByRole('radio', { name: '按所选计划研究完成后估算' }).check();
    await page.getByRole('checkbox', { name: '纳入无政府' }).check();
    await page.getByRole('checkbox', { name: '纳入化学' }).check();
    await expect(page.getByRole('combobox', { name: selector(1, '专用生产建筑') }).locator('option')).toHaveText(['请选择建筑', '兵营']);
    await confirmProductionRow(page, 1, '12', '2');
    await confirmProductionRow(page, 3, '49', '1');
    await expect(page.getByText('计划情景 · 按所选研究完成后估算')).toBeVisible();
    await expect(page.getByTestId('production-total')).toHaveText('合计 76 人');
    await expect(page.getByTestId('army-supply-rate')).toHaveText(['9 名 / 分钟', '9.82 名 / 分钟', '1.07 名 / 分钟']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: '复制方案链接', exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
    const copied = await page.evaluate(() => navigator.clipboard.readText());

    const fresh = await context.newPage();
    await fresh.goto(copied);
    await fresh.reload();
    await expect(fresh.getByText('计划情景 · 按所选研究完成后估算')).toBeVisible();
    await expect(fresh.getByTestId('production-total')).toHaveText('合计 76 人');
    await fresh.getByRole('checkbox', { name: '纳入化学' }).uncheck();
    await expect(fresh.getByTestId('production-total')).toHaveCount(0);
    await fresh.getByRole('checkbox', { name: '纳入化学' }).check();
    await expect(fresh.getByRole('textbox', { name: selector(3, '建筑座数') })).toHaveValue('');
    await expect(fresh.getByRole('checkbox', { name: selector(3, '确认形态') })).not.toBeChecked();
    await fresh.getByRole('link', { name: '返回原阵容账本', exact: true }).click();
    await expect(fresh).toHaveURL(new URL('./#' + ledger, copied).href);
    await expect(fresh.getByText('原兵种、数量和研究状态未更改。')).toBeVisible();
    for (const index of [1, 2, 3]) await expect(fresh.getByRole('textbox', { name: `兵种 ${index} 数量` })).toHaveValue('1');

    await page.goBack();
    await expect(page.getByTestId('army-cost-page')).toBeVisible();
    expect(new URL(page.url()).hash).toBe('#' + ledger);
  });
}

test('#1195 损坏的交接链接无默认汇总，普通模式仍打开原界面', async ({ page }) => {
  await page.goto('./#/production?mode=army-supply&asv=1');
  await expect(page.getByRole('alert')).toContainText('无法打开这个供给方案');
  await expect(page.getByTestId('production-total')).toHaveCount(0);
  await expect(page.getByTestId('production-row')).toHaveCount(0);
  await page.goto('./#' + ledger);
  await page.getByRole('navigation', { name: '生产模式' }).getByRole('link', { name: '持续生产', exact: true }).click();
  await expect(page).toHaveURL(/#\/production\?civ=Goths&age=4$/);
  await expect(page.getByLabel('需求 1 单位')).toHaveValue('83');
});
