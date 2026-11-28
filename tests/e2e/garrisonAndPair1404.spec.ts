import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';

const DATA_BUILD = String(JSON.parse(readFileSync(new URL('../../data/sources/data_sources.json', import.meta.url), 'utf8')).patch.build);

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const list: string[] = [];
  pageErrors.set(page, list);
  page.on('pageerror', (e) => list.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') list.push(m.text());
  });
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function assertNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function assertAllNwSingleLine(container: Locator, expectedCount: number) {
  const nw = container.locator('.nw');
  await expect(nw).toHaveCount(expectedCount);
  for (let i = 0; i < expectedCount; i++) {
    const tops = await nw.nth(i).evaluate((el) => [...el.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
    expect(tops.length).toBeGreaterThan(0);
    expect(new Set(tops).size).toBe(1);
  }
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((value) => {
    localStorage.setItem('aoe2-theme', value);
    document.documentElement.dataset.theme = value;
    document.documentElement.dataset.themePreference = value;
  }, theme);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

test('Issue 1404 驻军科技列表过滤、正例保留与旧链接移除恢复', async ({ page }) => {
  // 日本大型箭塔：去掉弹射器(59)与启发(233)，一键全选生成纯净 gtechs
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/building/235?tab=garrison&civ=Japanese&age=4');
  const preview = page.getByTestId('garrison-preview');
  await expect(preview.getByRole('checkbox', { name: '弹射器', exact: true })).toHaveCount(0);
  await expect(preview.getByRole('checkbox', { name: '启发', exact: true })).toHaveCount(0);
  await expect(preview.getByRole('checkbox', { name: '射箭孔', exact: true })).toBeVisible();
  await preview.getByRole('button', { name: '全选当前时代可用相关科技' }).click();
  const jpnTechs = new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('gtechs')?.split(',').sort();
  expect(jpnTechs).toEqual(['199', '200', '201', '437', '47', '484', '608']);

  // 图皮城堡：保留卡西克(1392)，去掉启发(233)
  await page.goto('./#/building/82?tab=garrison&civ=Tupi&age=4');
  await expect(preview.getByRole('checkbox', { name: '卡西克', exact: true })).toBeVisible();
  await expect(preview.getByRole('checkbox', { name: '启发', exact: true })).toHaveCount(0);

  // 马来巨港：去掉启发(233)与扳指(437)
  await page.goto('./#/building/1189?tab=garrison&civ=Malay&age=4');
  await expect(preview.getByRole('checkbox', { name: '启发', exact: true })).toHaveCount(0);
  await expect(preview.getByRole('checkbox', { name: '扳指', exact: true })).toHaveCount(0);
  await preview.getByRole('button', { name: '全选当前时代可用相关科技' }).click();
  const malayTechs = new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('gtechs')?.split(',').sort();
  expect(malayTechs).toEqual(['199', '200', '201', '47']);

  // 旧链接含已过滤科技：沿用既有「暂不能计算」与「移除」恢复路径
  await page.goto('./#/building/235?tab=garrison&gv=2&civ=Japanese&age=4&gtechs=59,233,199&army=83:5:e');
  await expect(preview.getByRole('alert')).toContainText('暂不能计算');
  await expect(preview.getByRole('alert')).toContainText('弹射器不可用或不影响驻军预览');
  await expect(preview.getByRole('alert')).toContainText('启发不可用或不影响驻军预览');
  await preview.getByRole('button', { name: '移除 弹射器' }).click();
  await preview.getByRole('button', { name: '移除 启发' }).click();
  await expect(preview.getByRole('alert')).toHaveCount(0);
  await expect(preview.getByTestId('garrison-total')).toBeVisible();
});

test('Issue 1404 混编编辑器成对提示（偶数/奇数/空/普通单位，1280 浅色 + 360 深色）', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/duel?m=n&a=2581.Tupi.4..&b=492.Britons.4..&na=20&nb=15');
  await page.getByRole('radio', { name: '混编', exact: true }).click();
  await expect(page.getByTestId('mixed-duel')).toBeVisible();
  await page.locator('#mix-a-add').click();
  await page.locator('#mix-a-unit-1').click();
  const picker = page.getByRole('dialog', { name: 'A 方第 2 行单位', exact: true });
  await picker.getByRole('combobox').fill('劲弩手');
  await picker.locator('[data-unit="492"]').click();

  const hint0 = page.locator('[data-t="mix-a-pair-hint-0"]');
  await expect(hint0).toHaveText('成对训练每次训练 2 只；计算训练费用时 20 只按 10 对计费。');
  await expect(page.locator('[data-t="mix-a-pair-hint-1"]')).toHaveCount(0);
  await assertNoOverflow(page);

  // 360px 浅色：奇数 21 -> 11 对，徽章 + 正文 3 处 .num.nw 均单行不折行
  await setTheme(page, 'light');
  await page.setViewportSize({ width: 360, height: 800 });
  await page.locator('#mix-a-qty-0').fill('21');
  await expect(hint0).toHaveText('成对训练每次训练 2 只；计算训练费用时 21 只按 11 对计费。');
  await assertAllNwSingleLine(hint0, 4);
  await assertNoOverflow(page);

  // 360px 深色：空数量与超上限回退文案（徽章 + 1 处 .num.nw）
  await setTheme(page, 'dark');
  await page.locator('#mix-a-qty-0').fill('');
  await expect(hint0).toHaveText('成对训练每次训练 2 只；计算训练费用时按整对向上计费。');
  await assertAllNwSingleLine(hint0, 2);
  await page.locator('#mix-a-qty-0').fill('201');
  await expect(hint0).toHaveText('成对训练每次训练 2 只；计算训练费用时按整对向上计费。');
  await assertAllNwSingleLine(hint0, 2);
  await assertNoOverflow(page);
});

test('Issue 1404 军队补给页成对产出说明（未确认/正常/暂停 0 座/普通单位，1280 浅色 + 360 深色）', async ({ page }) => {
  const sourceQuery = new URLSearchParams({
    mode: 'army-cost',
    acv: '1',
    acdata: DATA_BUILD,
    civ: 'Tupi',
    age: '4',
    acunits: JSON.stringify([
      { unit: 2581, qty: '20' },
      { unit: 492, qty: '10' },
    ]),
    acdone: '[]',
    actargets: '[]',
  }).toString();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`./#/production?${sourceQuery}`);
  await page.getByRole('link', { name: '用这些兵种规划持续生产' }).click();
  await expect(page.getByTestId('army-supply-page')).toBeVisible();

  const rows = page.getByTestId('army-supply-row');
  // 条件未完成时不显示成对说明
  await expect(rows.nth(0).locator('[data-t="army-supply-pair-hint"]')).toHaveCount(0);

  await page.getByRole('radio', { name: '仅按当前已完成研究' }).check();
  await page.getByRole('checkbox', { name: '第 1 行 确认形态' }).check();
  await page.getByRole('combobox', { name: '第 1 行 专用生产建筑' }).selectOption('82');
  await page.getByRole('textbox', { name: '第 1 行 建筑座数' }).fill('2');
  await page.getByRole('checkbox', { name: '第 2 行 确认形态' }).check();
  await page.getByRole('combobox', { name: '第 2 行 专用生产建筑' }).selectOption('87');
  await page.getByRole('textbox', { name: '第 2 行 建筑座数' }).fill('2');

  const pairHint = rows.nth(0).locator('[data-t="army-supply-pair-hint"]');
  await expect(rows.nth(0).getByTestId('army-supply-rate')).toHaveText('17.14 名 / 分钟');
  await expect(pairHint).toHaveText('成对训练每次训练 2 只，合 8.57 对 / 分钟。');
  await expect(rows.nth(1).locator('[data-t="army-supply-pair-hint"]')).toHaveCount(0);
  await assertNoOverflow(page);

  // 0 座暂停照常显示「合 0 对 / 分钟」
  await page.getByRole('textbox', { name: '第 1 行 建筑座数' }).fill('0');
  await expect(rows.nth(0).getByTestId('army-supply-rate')).toHaveText('0 名 / 分钟');
  await expect(pairHint).toHaveText('成对训练每次训练 2 只，合 0 对 / 分钟。');

  // 360px 浅色与深色：徽章 + 正文 2 处 .num.nw 均单行不折行且零横向溢出
  await page.getByRole('textbox', { name: '第 1 行 建筑座数' }).fill('2');
  await page.setViewportSize({ width: 360, height: 800 });
  await setTheme(page, 'light');
  await assertAllNwSingleLine(pairHint, 3);
  await assertNoOverflow(page);
  await setTheme(page, 'dark');
  await assertAllNwSingleLine(pairHint, 3);
  await assertNoOverflow(page);
});

test('Issue 1505 建筑驻军预览免费自动生效科技状态栏裁剪（1280 与 390 正反例）', async ({ page }) => {
  const networkErrors: string[] = [];
  page.on('requestfailed', (req) => networkErrors.push(`${req.url()} (${req.failure()?.errorText ?? 'failed'})`));
  page.on('response', (res) => {
    if (res.status() >= 400) networkErrors.push(`${res.status()} ${res.url()}`);
  });
  const preview = page.getByTestId('garrison-preview');
  const statusBar = preview.locator('.garrison-tech-status');
  const selectAll = preview.getByRole('button', { name: '全选当前时代可用相关科技' });
  const clearAll = preview.getByRole('button', { name: '清空自选科技' });

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });

    // 1. 斯拉夫城堡 82 与兵营 12：不再误显纵火、软甲
    await page.goto('./#/building/82?tab=garrison&gv=2&civ=Slavs&age=4&gtechs=&army=');
    await expect(preview.getByRole('alert')).toHaveCount(0);
    await expect(statusBar).toContainText('无免费自动科技');
    await expect(statusBar).not.toContainText(/免费自动生效|纵火|软甲/);
    await assertAllNwSingleLine(statusBar, 1);
    await assertNoOverflow(page);

    await page.goto('./#/building/12?tab=garrison&gv=2&civ=Slavs&age=4&gtechs=&army=');
    await expect(preview.getByRole('alert')).toHaveCount(0);
    await expect(statusBar).toContainText('当前时代无影响驻军的可选科技');
    await expect(statusBar).not.toContainText(/免费自动生效|纵火|软甲/);
    await assertNoOverflow(page);

    // 2. 土耳其兵营 12（负例隐藏化学）、靶场 87（仅免费正例）、城堡 82（射击正例）
    await page.goto('./#/building/12?tab=garrison&gv=2&civ=Turks&age=4&gtechs=&army=');
    await expect(preview.getByRole('alert')).toHaveCount(0);
    await expect(statusBar).toContainText('当前时代无影响驻军的可选科技');
    await expect(statusBar).not.toContainText(/免费自动生效|化学/);
    await assertNoOverflow(page);

    await page.goto('./#/building/87?tab=garrison&gv=2&civ=Turks&age=4&gtechs=&army=');
    await expect(preview.getByRole('alert')).toHaveCount(0);
    await expect(statusBar).toContainText('当前时代无影响驻军的可选科技');
    await expect(statusBar).toContainText('免费自动生效 1 项（化学）');
    await expect(preview.getByRole('checkbox', { name: '化学（免费）', exact: true })).toBeChecked();
    await expect(preview.getByRole('checkbox', { name: '化学（免费）', exact: true })).toBeDisabled();
    await assertAllNwSingleLine(statusBar, 1);
    await assertNoOverflow(page);

    await page.goto('./#/building/82?tab=garrison&gv=2&civ=Turks&age=4&gtechs=&army=83%3A5%3Ae');
    await expect(preview.getByRole('alert')).toHaveCount(0);
    await expect(statusBar).toContainText('免费自动生效 1 项（化学）');
    await expect(preview.getByRole('checkbox', { name: '化学（免费）', exact: true })).toBeChecked();
    await expect(preview.getByRole('checkbox', { name: '化学（免费）', exact: true })).toBeDisabled();
    await expect(preview.getByTestId('garrison-total')).toHaveText('7');
    await assertAllNwSingleLine(statusBar, 2);
    await assertNoOverflow(page);

    // 3. 高丽城镇中心 109：空自选无免费项；全选解锁免费「炮塔」；清空恢复未勾选手动项
    await page.goto('./#/building/109?tab=garrison&gv=2&civ=Koreans&age=4&gtechs=&army=83%3A0%3Ae');
    await expect(preview.getByRole('alert')).toHaveCount(0);
    await expect(statusBar).toContainText('无免费自动科技');
    await expect(statusBar).not.toContainText(/免费自动生效|炮塔/);
    await expect(preview.getByRole('checkbox', { name: '炮塔', exact: true })).not.toBeChecked();
    await selectAll.click();
    await expect(statusBar).toContainText('免费自动生效 1 项（炮塔）');
    await expect(preview.getByRole('checkbox', { name: '炮塔（免费）', exact: true })).toBeChecked();
    await expect(preview.getByRole('checkbox', { name: '炮塔（免费）', exact: true })).toBeDisabled();
    const korTcTechs = new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('gtechs')?.split(',') ?? [];
    expect(korTcTechs).not.toContain('64');
    await assertAllNwSingleLine(statusBar, 2);
    await assertNoOverflow(page);
    await clearAll.click();
    await expect(statusBar).toContainText('无免费自动科技');
    await expect(statusBar).not.toContainText(/免费自动生效|炮塔/);
    await expect(preview.getByRole('checkbox', { name: '炮塔', exact: true })).not.toBeChecked();
    await expect(preview.getByRole('checkbox', { name: '炮塔', exact: true })).toBeEnabled();

    // 4. 高丽大型箭塔 235：空自选与全选均不泄漏形态前提「大型箭塔 / 警戒箭塔」及无关「炮塔」
    await page.goto('./#/building/235?tab=garrison&gv=2&civ=Koreans&age=4&gtechs=&army=83%3A0%3Ae');
    await expect(preview.getByRole('alert')).toHaveCount(0);
    await expect(statusBar).toContainText('无免费自动科技');
    await expect(statusBar).not.toContainText(/免费自动生效|大型箭塔|警戒箭塔|炮塔/);
    await selectAll.click();
    await expect(statusBar).toContainText('无免费自动科技');
    await expect(statusBar).not.toContainText(/免费自动生效|大型箭塔|警戒箭塔|炮塔/);
    await assertAllNwSingleLine(statusBar, 1);
    await assertNoOverflow(page);
    await clearAll.click();
    await expect(statusBar).toContainText('无免费自动科技');
    await expect(statusBar).not.toContainText(/免费自动生效|大型箭塔|警戒箭塔|炮塔/);
  }
  expect(networkErrors).toEqual([]);
});
