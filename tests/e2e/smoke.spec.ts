import { expect, test } from '@playwright/test';

// 旧版 hash（无前导 /）与新版 hash 都必须可用
const ROUTES: [string, string][] = [
  ['', '#home .hcard'],
  ['#civs', '#grid .card'],
  ['#simulator', '#simhub .card'],
  ['#buildings', '#bgrid .card'],
  ['#/building/82', '#building h2'],
  ['#building/1251', '#building h2'],
  ['#builds', '.planned-page'],
  ['#list', '#grid .card'],
  ['#civ/Armenians', '#detail h2'],
  ['#/civ/Franks', '#detail h2'],
  ['#units', '#ugrid .card'],
  ['#unit/569', '#unit .dtabs'],
  ['#unit/569?tab=sim', '#sim .simt'],
  ['#unit/569/Franks/4', '#sim .simtab'],
  ['#techs', '#tgrid .card'],
  ['#tech/12', '#tech h2'],
  ['#tree', '.tree .tcell'],
  ['#tree/Britons', '.tree .tcell'],
  ['#dlc', '.dlct tr'],
  ['#compare', '#ctab tr'],
  ['#matchup', '#mres h3'],
];

for (const [hash, sel] of ROUTES) {
  test(`route ${hash || '(home)'} renders without console errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(hash ? './' + hash : './');
    await expect(page.locator(sel).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });
}

test('Franks Paladin full tech = 192 HP', async ({ page }) => {
  await page.goto('./#unit/569/Franks');
  await page.getByRole('button', { name: '满科技' }).click();
  const hp = page.locator('.simtab tr').nth(1).locator('td');
  await expect(hp.nth(1)).toHaveText(/^160\s*\+32$/); // 基础列：基础值 + 绿色增量
  await expect(hp.nth(1).locator('.up')).toHaveText('+32');
  await expect(hp.nth(2)).toHaveText('192'); // 当前列：仅最终值
  await expect(page).toHaveURL(/unit\/569\/Franks\/4\/[\d,]+/);
});

test('civ card click opens detail, unique unit link opens unit page', async ({ page }) => {
  await page.goto('./#list');
  await page.locator('#grid .card', { hasText: 'Armenians' }).click();
  await expect(page.locator('#detail h2')).toContainText('Armenians');
  await page.locator('#detail .uchips a').first().click();
  await expect(page.locator('#unit h2')).toBeVisible();
});

test('unit tabs: overview -> simulator tab', async ({ page }) => {
  await page.goto('./#unit/569');
  await page.getByRole('tab', { name: '科技模拟器' }).click();
  await expect(page.locator('#sim .simt').first()).toBeVisible();
});

test('Ctrl+K command palette searches across civs/units/techs', async ({ page }) => {
  await page.goto('./');
  await page.locator('#home').waitFor();
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/搜索文明、单位、科技/).fill('paladin');
  await expect(page.locator('.cmdk-list li').first()).toContainText('Paladin');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/unit\/569/);
});

test('breadcrumbs on detail pages', async ({ page }) => {
  await page.goto('./#tech/12');
  await expect(page.locator('nav.crumbs')).toContainText('科技');
  await page.locator('nav.crumbs a', { hasText: '科技' }).click();
  await expect(page.locator('#tgrid .card').first()).toBeVisible();
});

test('mobile nav opens and navigates', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await expect(page.locator('nav.mainnav')).toBeHidden();
  await page.getByRole('button', { name: '菜单' }).click();
  await page.locator('nav.mainnav a', { hasText: '对局助手' }).click();
  await expect(page.locator('#mres h3')).toBeVisible();
  await expect(page.locator('nav.mainnav')).toBeHidden();
});

test('leaving a tech detail page does not crash (regression)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('./#tech/12');
  await expect(page.locator('#tech h2')).toBeVisible();
  await page.locator('nav.mainnav a[data-t="units"]').click();
  await expect(page.locator('#ugrid .card').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('building detail tabs + links from tree and unit page', async ({ page }) => {
  await page.goto('./#/building/82');
  await expect(page.locator('#building h2')).toContainText('Castle');
  await page.getByRole('tab', { name: /生产/ }).click();
  await expect(page.locator('#building .uqrow').first()).toBeVisible();
  await page.goto('./#tree/Franks');
  await page.locator('a.tbld').first().click();
  await expect(page.locator('#building h2')).toBeVisible();
  await page.goto('./#unit/569');
  await page.locator('#unit a.tagl').first().click();
  await expect(page.locator('#building h2')).toContainText('Stable');
});

test('buildings list filters by type', async ({ page }) => {
  await page.goto('./#buildings');
  await page.locator('#bt').selectOption('defense');
  await expect(page.locator('#bgrid .card', { hasText: 'Keep' })).toBeVisible();
  await expect(page.locator('#bgrid .card', { hasText: 'Barracks' })).toHaveCount(0);
});
