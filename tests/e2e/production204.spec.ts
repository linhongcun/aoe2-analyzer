import { expect, test } from '@playwright/test';

for (const width of [360, 375, 390, 1280]) {
  test(`#204 @${width} 持续生产、分享还原、空和错误状态`, async ({ page, context }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./#/production');
    await expect(page.getByRole('heading', { name: '村民配置摘要' })).toBeVisible();
    await page.getByRole('button', { name: '添加需求' }).click();
    await expect(page.getByTestId('production-row')).toHaveCount(2);
    await page.getByRole('combobox', { name: '需求 2 单位', exact: true }).selectOption('38');
    await page.getByRole('textbox', { name: '需求 2 建筑数量', exact: true }).fill('2');
    await page.getByRole('checkbox', { name: '双刃斧', exact: true }).check();
    await expect(page.getByTestId('production-resource-Gold')).not.toContainText('开销 0 / 分钟');
    const before = await page.getByTestId('production-total').textContent();
    await page.getByRole('button', { name: '复制方案链接' }).click();
    await expect(page.getByRole('status')).toContainText('链接已复制');
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toContain('/production?');
    await page.goto(link);
    await expect(page.getByRole('textbox', { name: '需求 2 建筑数量', exact: true })).toHaveValue('2');
    await expect(page.getByRole('checkbox', { name: '双刃斧', exact: true })).toBeChecked();
    await expect(page.getByTestId('production-total')).toHaveText(before!);
    await expect(page.locator('body')).not.toContainText('NaN');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`production204-light-${width}.png`), fullPage: true });
    await page.getByRole('textbox', { name: '需求 2 建筑数量', exact: true }).fill('-1');
    await expect(page.getByRole('alert')).toContainText('建筑数量须为');
    await expect(page.getByTestId('production-total')).toHaveCount(0);
    await page.getByRole('textbox', { name: '需求 2 建筑数量', exact: true }).fill('0');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByTestId('production-row').nth(1)).toContainText('已暂停');
    await page.getByRole('button', { name: '删除需求 2', exact: true }).click();
    await page.getByRole('button', { name: '删除需求 1', exact: true }).click();
    await expect(page.getByTestId('production-empty')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('production-empty')).toBeVisible();
    await page.goto('./#/production?civ=not-real&age=NaN&rows=83:109:1');
    await expect(page.getByRole('alert')).toContainText('链接中的文明无效');
    await expect(page.getByRole('button', { name: '复制方案链接' })).toBeDisabled();
    await page.getByRole('button', { name: '重置方案' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.evaluate(() => {
      localStorage.setItem('aoe2-theme', 'dark');
    });
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByTestId('production-total')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`production204-dark-${width}.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('#204 站内入口和文明时代科技解锁', async ({ page }) => {
  await page.goto('./#/');
  await page.locator('#home .hcard[data-k="production"]').click();
  await expect(page.getByRole('heading', { level: 1, name: '持续生产' })).toBeVisible();
  await page.getByRole('combobox', { name: '生产文明', exact: true }).selectOption('Bohemians');
  await expect(page.getByRole('combobox', { name: '需求 1 单位', exact: true }).locator('option[value="5"]')).toHaveCount(0);
  await page.getByRole('checkbox', { name: '化学', exact: true }).check();
  await page.getByRole('combobox', { name: '需求 1 单位', exact: true }).selectOption('5');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('combobox', { name: '生产时代', exact: true }).selectOption('2');
  await expect(page.getByRole('alert')).toContainText('不可用');
  await page.getByRole('combobox', { name: '生产文明', exact: true }).selectOption('Vikings');
  await page.getByRole('button', { name: '重置方案' }).click();
  await page.getByRole('combobox', { name: '生产文明', exact: true }).selectOption('Vikings');
  await expect(page.getByRole('checkbox', { name: '独轮推车', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '独轮推车', exact: true })).toBeDisabled();
});

for (const width of [390, 1280])
  test(`#204 @${width} 分组工具菜单可进入持续生产与开局流程`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./#/');
    if (width < 600) await page.getByRole('button', { name: '菜单', exact: true }).click();
    await page.getByRole('button', { name: '工具', exact: true }).click();
    const menu = page.locator('#tools-menu');
    await expect(menu.getByRole('region', { name: '对局计划', exact: true }).getByRole('link').first()).toContainText('开局流程');
    await expect(menu.locator('.tools-group-title')).toHaveText(['新手入门', '对局计划', '经济计算', '资料']);
    await menu.getByRole('link', { name: /持续生产/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: '持续生产' })).toBeVisible();
    await expect(menu).toBeHidden();
  });
