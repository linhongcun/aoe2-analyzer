// #899 建筑详情。只覆盖规格点名的行为和 82/84/87 有限代表页，不是 38 座建筑验收，也不证明静态结构图。
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const shots = '/opt/cursor/artifacts/building-899';

async function open(page: Page, hash: string) {
  await page.goto('./#' + hash);
  await expect(page.locator('#building h1')).toBeVisible();
}

async function setTheme(page: Page, value: 'light' | 'dark') {
  await page.evaluate((next) => localStorage.setItem('aoe2-theme', next), value);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', value);
}

test('默认未指定文明停在概览，无效文明不回退，仅文明不进模拟', async ({ page }) => {
  await open(page, '/building/82');
  await expect(page.locator('#building')).toHaveAttribute('data-view', 'overview');
  await expect(page.locator('#building-civ')).toHaveAttribute('data-value', '');
  await expect(page.locator('[data-t="civ-scope"]')).toContainText('全文明目录并集');
  await expect(page.locator('#sim')).toHaveCount(0);
  await expect(page.locator('[data-stat="hp"] [data-t="stat-value"]')).toHaveText('4800');
  await expect(page.locator('[data-t="catalog-cost"]')).toContainText('650');
  await expect(page.locator('[data-t="catalog-cost"] img[title="木材"]')).toHaveCount(0);
  await expect(page.locator('[data-t="panel-time"]')).toContainText('面板工期');
  await expect(page.locator('[data-t="panel-time"]')).toContainText('200秒');
  await expect(page.locator('[data-t="panel-time"]')).toContainText('不是多人施工里的村民工时');
  await expect(page.locator('[data-t="building-dlc"]')).toContainText('国王时代');
  await expect(page.locator('[data-t="building-dlc"]')).toContainText('1999');
  await expect(page.locator('[data-t="building-mark"]')).toHaveCount(0);
  await expect(page.locator('#building')).not.toContainText('文明独特');
  await expect(page.locator('#building')).not.toContainText('暂未计算');
  await expect(page.locator('#building')).not.toContainText('在现网打开');

  await open(page, '/building/82?civ=Britons');
  await expect(page.locator('#building')).toHaveAttribute('data-view', 'overview');
  await expect(page.locator('#sim')).toHaveCount(0);
  await expect(page.locator('[data-t="civ-scope"]')).toContainText('不是完整的科技树可用性');

  await open(page, '/building/1251?civ=Franks');
  await expect(page.locator('#building-civ')).toHaveAttribute('data-value', '');
  await expect(page.locator('#building h1')).toContainText('营垒');
  await expect(page.locator('[data-t="building-mark"]')).toHaveText('独特建筑');
  await expect(page.locator('#sim')).toHaveCount(0);

  await open(page, '/building/1251?civ=Franks&tab=sim');
  await expect(page.locator('[data-t="sim-needs-civ"]')).toBeVisible();
  await expect(page.locator('#sim .simtab')).toHaveCount(0);
  await expect(page).toHaveURL(/civ=Franks/);
  await expect(page.locator('#building')).not.toContainText('暂未计算');
});

test('生产研究使用动态并集，只看目录含有默认关闭', async ({ page }) => {
  await open(page, '/building/82');
  const count = page.locator('#building-prod [data-t="catalog-count"]');
  await expect(count).toContainText('并集');
  await expect(count).toContainText('当前显示');
  const union = await count.locator('.num').first().innerText();
  expect(Number(union)).toBeGreaterThan(0);
  expect(Number(union)).not.toBe(118);
  await expect(page.locator('#building-prod input[type="checkbox"]')).not.toBeChecked();
  await expect(page.locator('#building-prod [data-t="catalog-unknown"]')).toHaveCount(0);

  await open(page, '/building/87?civ=Franks');
  const range = page.locator('#building-prod [data-t="catalog-count"] .num').first();
  const rangeUnion = Number(await range.innerText());
  expect(rangeUnion).not.toBe(20);
  const genitour = page.locator('#building-prod a.ulink', { hasText: '标枪骑兵' });
  await expect(page.locator('#building-prod').getByRole('link', { name: '步弓手', exact: true })).toBeVisible();
  await expect(genitour).toBeVisible();
  await page.locator('#building-prod').getByRole('checkbox', { name: '只看目录含有' }).check();
  await expect(page.locator('#building-prod').getByRole('link', { name: '步弓手', exact: true })).toBeVisible();
  await expect(genitour).toHaveCount(0);
  await expect(page.locator('#building-prod [data-t="catalog-row"][data-membership="out"]')).toHaveCount(0);
  await expect(page.locator('#building-prod [data-t="catalog-row"][data-membership="unknown"]')).toHaveCount(0);
  const shown = Number(await page.locator('#building-prod [data-t="catalog-count"] .num').nth(1).innerText());
  expect(shown).toBeLessThan(rangeUnion);
  await page.locator('#building-prod').getByRole('checkbox', { name: '只看目录含有' }).uncheck();
  await page.locator('#building-prod input[type="search"]').fill('qishe');
  await expect(page.locator('#building-prod').getByRole('link', { name: '骑射手', exact: true })).toBeVisible();
  await expect(page.locator('#building-prod').getByRole('link', { name: '步弓手', exact: true })).toHaveCount(0);

  await page.locator('#building-civ').click();
  await expect.poll(async () => page.locator('.cp-panel [role="option"]').count()).toBeGreaterThan(40);
  await page.keyboard.press('Escape');
});

test('施工入口、攻击组和官方区域标记', async ({ page }) => {
  await open(page, '/building/82');
  await expect(page.locator('[data-t="construction-note"]')).toHaveCount(0);
  await expect(page.locator('[data-t="construction-needs-civ"]')).toHaveText('先选择文明。');
  await expect(page.locator('[data-t="panel-time"]')).not.toContainText('预填目录时代');
  await expect(page.locator('[data-t="construction-entry"]')).toHaveCount(0);
  await expect(page.locator('[data-stat="atk"]')).toContainText('11');
  await expect(page.locator('[data-stat="rng"]')).toContainText('最小射程');
  await expect(page.locator('[data-stat="rng"]')).toContainText('1');
  await expect(page.getByTestId('building-siege-entry')).toBeVisible();

  await page.locator('#building-civ').click();
  await page.locator('.cp-panel .cp-q').fill('Franks');
  await page.locator('.cp-panel [data-civ="Franks"]').click();
  await expect(page.locator('[data-t="construction-entry-block"] [data-t="construction-note"]')).toHaveText('预填目录时代，非解锁条件。');
  const href = await page.locator('[data-t="construction-entry"]').getAttribute('href');
  expect(href).toContain('cv=1');
  expect(href).toContain('civ=Franks');
  expect(href).toContain('building=82');
  expect(href).toContain('age=3');
  expect(href).toContain('builders=4');
  expect(href).not.toContain('civ=Armenians');

  await open(page, '/building/84');
  await expect(page.locator('[data-stat="atk"]')).toHaveCount(0);
  await expect(page.locator('[data-stat="ma"]')).toContainText('1');
  await expect(page.locator('[data-stat="pa"]')).toContainText('8');
  await expect(page.locator('[data-t="market-fees"]')).toBeVisible();
  await expect(page.getByTestId('building-siege-entry')).toHaveCount(0);
  await expect(page.locator('[data-t="building-mark"]')).toHaveCount(0);

  await open(page, '/building/12');
  await expect(page.locator('[data-stat="atk"]')).toHaveCount(0);
  await expect(page.locator('[data-stat="ma"]')).toContainText('0');
  await expect(page.locator('[data-stat="hp"] [data-t="stat-value"]')).toHaveText('1200');

  await open(page, '/building/109');
  await expect(page.locator('[data-stat="atk"]')).toBeVisible();
  await expect(page.locator('[data-stat="rng"]')).toContainText('最小射程');
  await expect(page.locator('[data-stat="rng"]')).toContainText('0');

  await open(page, '/building/1665');
  await expect(page.locator('[data-stat="atk"]')).toContainText('0');
  await expect(page.locator('[data-stat="rng"]')).toBeVisible();
  await expect(page.locator('[data-stat="rof"]')).toBeVisible();

  await open(page, '/building/1754');
  await expect(page.locator('[data-t="building-mark"]')).toHaveText('区域建筑');
});

test('旧查询定位到概览，工作区保留参数，非宿主驻军回到概览', async ({ page }) => {
  await open(page, '/building/87?tab=prod&age=2&techs=437&cmp=Britons');
  const header = await page.locator('header.topbar').boundingBox();
  const title = await page.locator('#building-prod h2').boundingBox();
  expect(title!.y).toBeGreaterThanOrEqual(header!.y + header!.height - 1);
  await expect(page.locator('#building')).toHaveAttribute('data-view', 'overview');

  await page.getByRole('button', { name: '打开科技模拟器', exact: true }).click();
  await expect(page).toHaveURL(/tab=sim/);
  await expect(page).toHaveURL(/age=2/);
  await expect(page).toHaveURL(/techs=437/);
  await expect(page).toHaveURL(/cmp=Britons/);
  await expect(page.locator('[data-t="sim-needs-civ"]')).toBeVisible();
  await page.getByRole('button', { name: '返回概览', exact: true }).click();
  await expect(page).toHaveURL(/tab=ov/);
  await expect(page).toHaveURL(/techs=437/);
  await expect(page).toHaveURL(/cmp=Britons/);

  await open(page, '/building/87?tab=tech&civ=Britons&age=2&techs=437&cmp=Franks');
  await expect(page.locator('#building-tech h2')).toBeInViewport();
  await page.getByRole('button', { name: '打开科技模拟器', exact: true }).click();
  await expect(page.locator('#simciv')).toHaveAttribute('data-value', 'Britons');
  await expect(page.locator('#simage')).toHaveValue('2');
  await expect(page.locator('[data-t="sim-headings"]')).toContainText('当前设置下的近似模拟值');
  await expect(page.locator('.simtab th').nth(1)).toHaveText('目录基础');
  await expect(page.locator('.simtab th').nth(2)).toHaveText('当前设置下的近似模拟值');

  await open(page, '/building/82?tab=history');
  await expect(page.locator('#building')).toHaveAttribute('data-view', 'overview');
  await expect(page.locator('#building-history')).toHaveJSProperty('open', true);
  await expect(page.getByRole('tab', { name: '更新历史' })).toHaveCount(0);
  const history = await page.locator('#building-history').boundingBox();
  const bar = await page.locator('header.topbar').boundingBox();
  expect(history!.y).toBeGreaterThanOrEqual(bar!.y + bar!.height - 1);

  await open(page, '/building/103?tab=garrison&age=2&techs=1&cmp=Britons');
  await expect(page).toHaveURL(/tab=ov/);
  await expect(page).toHaveURL(/age=2/);
  await expect(page).toHaveURL(/techs=1/);
  await expect(page).toHaveURL(/cmp=Britons/);
  await expect(page.locator('#building-garrison')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '配置驻军预览', exact: true })).toHaveCount(0);
});

test('已选文明时模拟器给出引擎结果，驻军不是空页', async ({ page }) => {
  await open(page, '/building/82?tab=sim&civ=Britons');
  await expect(page.locator('#sim .simtab')).toBeVisible();
  await expect(page.locator('#building')).not.toContainText('暂未计算');
  await page.getByRole('button', { name: '满科技' }).click();
  await expect(page.locator('.simtab tr').nth(1).locator('td').nth(2)).toHaveText('7027.68');
  await expect(page).toHaveURL(/civ=Britons/);
  await expect(page).toHaveURL(/techs=\d/);

  await open(page, '/building/109?tab=garrison&civ=Britons&age=4');
  await expect(page.getByTestId('garrison-result')).toBeVisible();
  await expect(page.locator('#building')).not.toContainText('暂未计算');
});

test('1280 浅色深色和 390 只看城堡市场靶场的代表页', async ({ page }) => {
  mkdirSync(shots, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const mode of ['light', 'dark'] as const) {
    for (const id of [82, 84, 87]) {
      await open(page, `/building/${id}`);
      await setTheme(page, mode);
      const hp = await page.locator('[data-stat="hp"]').boundingBox();
      const cost = await page.locator('[data-t="catalog-cost"]').boundingBox();
      expect(hp!.y).toBeLessThan(900);
      expect(cost!.y).toBeLessThan(900);
      await page.screenshot({ path: `${shots}/${id}-1280-${mode}.png`, fullPage: false });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of [82, 84, 87]) {
    await open(page, `/building/${id}`);
    await setTheme(page, 'light');
    const hp = await page.locator('[data-stat="hp"]').boundingBox();
    expect(hp!.y).toBeLessThan(844);
    await expect(page.locator('.bd-jump')).toBeHidden();
    await page.screenshot({ path: `${shots}/${id}-390-light.png`, fullPage: false });
  }
});
