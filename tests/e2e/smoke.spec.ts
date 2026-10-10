import { expect, test } from '@playwright/test';

// 旧版 hash（无前导 /）与新版 hash 都必须可用
const ROUTES: [string, string][] = [
  ['', '#grid .card'],
  ['#list', '#grid .card'],
  ['#civ/Armenians', '#detail h2'],
  ['#/civ/Franks', '#detail h2'],
  ['#units', '#ugrid .card'],
  ['#unit/569', '#sim .simt'],
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
  await page.goto('./');
  await page.locator('#grid .card', { hasText: 'Armenians' }).click();
  await expect(page.locator('#detail h2')).toContainText('Armenians');
  await page.locator('#detail .uchips a').first().click();
  await expect(page.locator('#unit h2')).toBeVisible();
});

test('leaving a tech detail page does not crash (regression)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('./#tech/12');
  await expect(page.locator('#tech h2')).toBeVisible();
  await page.locator('nav button', { hasText: '单位' }).click();
  await expect(page.locator('#ugrid .card').first()).toBeVisible();
  expect(errors).toEqual([]);
});
