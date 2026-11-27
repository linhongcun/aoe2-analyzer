import { expect, test, type Page } from '@playwright/test';

async function pickCiv(page: Page, civ: string) {
  await page.locator('#production-civ').click();
  const dialog = page.getByRole('dialog', { name: '生产文明', exact: true });
  await dialog.locator(`[role="option"][data-civ="${civ}"]`).click();
}

async function pickUnit(page: Page, index: number, query: string, unitId: string) {
  await page.locator(`#production-unit-${index}`).click();
  const dialog = page.getByRole('dialog', { name: `需求 ${index + 1} 单位`, exact: true });
  await dialog.locator('.cp-q').fill(query);
  await dialog.locator(`[role="option"][data-unit="${unitId}"]`).click();
}

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
    await pickUnit(page, 1, '骑士', '38');
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
  await page.locator('#home a[href="#/production"]').click();
  await expect(page.getByRole('heading', { level: 1, name: '持续生产' })).toBeVisible();
  await pickCiv(page, 'Bohemians');
  await page.locator('#production-unit-0').click();
  const unitDialog = page.getByRole('dialog', { name: '需求 1 单位', exact: true });
  await unitDialog.locator('.cp-q').fill('火枪手');
  await expect(unitDialog.locator('[role="option"][data-unit="5"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('checkbox', { name: '化学', exact: true }).check();
  await pickUnit(page, 0, '火枪手', '5');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('combobox', { name: '生产时代', exact: true }).selectOption('2');
  await expect(page.getByRole('alert')).toContainText('不可用');
  await pickCiv(page, 'Vikings');
  await page.getByRole('button', { name: '重置方案' }).click();
  await pickCiv(page, 'Vikings');
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
    // #774 / Issue 1282：手机抽屉工具组默认折叠，分组顺序为对局计划(0) → 经济计算(1) → 资料(2) → 新手入门(3)。
    const planning = width < 600 ? menu.locator('details').nth(0) : menu.locator('section[aria-labelledby="tools-planning"]');
    if (width < 600) await planning.locator('summary').click();
    await expect(planning.getByRole('link').first()).toContainText('开局流程');
    await expect(menu.locator('.tools-group-title')).toHaveText(['对局计划', '经济计算', '资料', '新手入门']);
    if (width < 600) await menu.locator('details').nth(1).locator('summary').click();
    await menu.getByRole('link', { name: /持续生产/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: '持续生产' })).toBeVisible();
    await expect(menu).toBeHidden();
  });

test('#1463 持续生产 1404 静默放行、578/1380 估算放行与 army-supply 透传', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // 1. 葡萄牙 1404 环游世界：27 -> 20.25 秒，产量 11.85 / 分钟，无环游世界未计入告警（1280 浅色）
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/production?civ=Portuguese&age=4&walk=3&farm=1&techs=&rows=442:45:4');
  await expect(page.getByTestId('production-row')).toContainText('27 秒 / 个');
  await page.getByRole('checkbox', { name: '环游世界', exact: true }).check();
  await expect(page.getByTestId('production-row')).toContainText('20.25 秒 / 个');
  await expect(page.getByTestId('production-row')).toContainText('11.85 个 / 分钟');
  await expect(page.getByTestId('production-row')).toContainText('环游世界');
  await expect(page.locator('.production-warnings')).not.toContainText('环游世界');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // 2. 柏柏尔 578 土堡：360 浅色，征招 18.8 -> 15.04 秒，新估算告警文案
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('./#/production?civ=Berbers&age=4&walk=3&farm=1&techs=315&rows=1009:82:2');
  await expect(page.getByTestId('production-row')).toContainText('18.8 秒 / 个');
  await page.getByRole('checkbox', { name: '土堡', exact: true }).check();
  await expect(page.getByTestId('production-row')).toContainText('15.04 秒 / 个');
  await expect(page.locator('.production-warnings')).toContainText('土堡：已按可解码生产或费用效果计入；另含未解码资源或条件效果，结果仅为估算。');
  await expect(page.locator('.production-warnings')).not.toContainText('整项未计入');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // 3. 马普切 1380 布图马普：1280 深色，2571 单价重算为 42.5 木 47 金并输出估算告警
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/production?civ=Mapuche&age=4&walk=3&farm=1&techs=315&rows=2568:82:2,2571:87:4');
  await page.evaluate(() => {
    localStorage.setItem('aoe2-theme', 'dark');
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const beforeTotal = await page.getByTestId('production-total').textContent();
  await page.getByRole('checkbox', { name: '布图马普', exact: true }).check();
  await expect(page.getByTestId('production-row').nth(1)).toContainText('42.5');
  await expect(page.getByTestId('production-row').nth(1)).toContainText('47');
  await expect(page.getByTestId('production-total')).not.toHaveText(beforeTotal!);
  await expect(page.locator('.production-warnings')).toContainText('布图马普：已按可解码生产或费用效果计入；另含未解码资源或条件效果，结果仅为估算。');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // 4. army-supply 透传布图马普：390 浅色，从含 t:1380 的账本进入并选计划口径纳入布图马普
  await page.setViewportSize({ width: 390, height: 844 });
  const armyParams = new URLSearchParams({
    mode: 'army-cost',
    acv: '1',
    acdata: '188329',
    civ: 'Mapuche',
    age: '4',
    acunits: JSON.stringify([
      { unit: 2568, qty: '20' },
      { unit: 2571, qty: '20' },
    ]),
    acdone: '[]',
    actargets: JSON.stringify(['t:1380']),
  });
  await page.goto(`./#/production?${armyParams.toString()}`);
  await page.evaluate(() => {
    localStorage.setItem('aoe2-theme', 'light');
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('link', { name: '用这些兵种规划持续生产' }).click();
  await expect(page.getByTestId('army-supply-page')).toBeVisible();
  await page.getByRole('radio', { name: '按所选计划研究完成后估算' }).check();
  await page.getByRole('checkbox', { name: '纳入布图马普' }).check();
  await page.getByRole('checkbox', { name: '第 1 行 确认形态' }).check();
  await page.getByRole('combobox', { name: '第 1 行 专用生产建筑' }).selectOption('82');
  await page.getByRole('textbox', { name: '第 1 行 建筑座数' }).fill('2');
  await page.getByRole('checkbox', { name: '第 2 行 确认形态' }).check();
  await page.getByRole('combobox', { name: '第 2 行 专用生产建筑' }).selectOption('87');
  await page.getByRole('textbox', { name: '第 2 行 建筑座数' }).fill('4');
  await expect(page.getByTestId('production-total')).toBeVisible();
  await expect(page.locator('.production-warnings')).toContainText('布图马普：已按可解码生产或费用效果计入；另含未解码资源或条件效果，结果仅为估算。');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // 返回原账本仍完整保留估算态
  await page.getByRole('link', { name: '返回原阵容账本', exact: true }).click();
  await expect(page.getByTestId('army-cost-page')).toBeVisible();
  await expect(page.locator('[data-t="army-estimate-badge"]')).toHaveText('含估算项');
  expect(errors).toEqual([]);
});
