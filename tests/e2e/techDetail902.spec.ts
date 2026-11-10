// #902 科技详情。只覆盖规格点名的行为和有限代表页，不是全站验收，也不证明未上传的结构图。
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import civs from '../../src/data/civs.json' with { type: 'json' };
import techs from '../../src/data/techs.json' with { type: 'json' };

const shots = '/opt/cursor/artifacts/tech-902';

async function open(page: Page, hash: string) {
  await page.goto('./#' + hash);
  await expect(page.locator('#tech h1')).toBeVisible();
}

async function setTheme(page: Page, value: 'light' | 'dark') {
  await page.evaluate((next) => localStorage.setItem('aoe2-theme', next), value);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', value);
  await expect(page.locator('#tech h1')).toBeVisible();
}

test.beforeAll(() => {
  mkdirSync(shots, { recursive: true });
});

test('血统默认概览先读到纯文字摘要，1280 浅色和深色', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, '/tech/435');
  await setTheme(page, 'light');
  const summary = page.locator('[data-t="effect-summary"]');
  await expect(summary).toHaveCount(1);
  await expect(summary).toHaveText('+20 生命值（作用于下方完整名单）');
  await expect(summary.locator('img, svg')).toHaveCount(0);
  const lists = await page.locator('[data-t="affect-objects"]').allInnerTexts();
  expect(lists.join('\n')).not.toContain('+20');
  await expect(page.locator('[data-t="catalog-cost"]')).toContainText('150');
  await expect(page.locator('[data-t="catalog-cost"]')).toContainText('100');
  await expect(page.locator('[data-t="catalog-time"]')).toContainText('50秒');
  await expect(page.locator('.td-jump')).toBeVisible();
  const summaryBox = await summary.boundingBox();
  const costBox = await page.locator('[data-t="catalog-cost"]').boundingBox();
  const listBox = await page.locator('[data-t="affect-objects"]').first().boundingBox();
  expect(costBox!.y).toBeLessThan(summaryBox!.y);
  expect(summaryBox!.y).toBeLessThan(listBox!.y);
  await page.screenshot({ path: `${shots}/bloodlines-1280-light.png` });
  await setTheme(page, 'dark');
  await expect(summary).toHaveText('+20 生命值（作用于下方完整名单）');
  await page.screenshot({ path: `${shots}/bloodlines-1280-dark.png` });
});

test('390 血统图标与标题并列，费用时间两列，完整名单不挤进首屏', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '/tech/435');
  await setTheme(page, 'light');
  await expect(page.locator('.td-jump')).toBeHidden();
  const icon = await page.locator('.td-icon').boundingBox();
  const title = await page.locator('#tech h1').boundingBox();
  expect(icon!.width).toBeGreaterThanOrEqual(54);
  expect(icon!.width).toBeLessThanOrEqual(58);
  expect(icon!.x + icon!.width).toBeLessThanOrEqual(title!.x + 4);
  expect(Math.abs(icon!.y - title!.y)).toBeLessThan(48);
  const cost = await page.locator('[data-t="catalog-cost"]').boundingBox();
  const time = await page.locator('[data-t="catalog-time"]').boundingBox();
  const place = await page.locator('[data-t="catalog-place"]').boundingBox();
  expect(Math.abs(cost!.y - time!.y)).toBeLessThan(16);
  expect(time!.x).toBeGreaterThan(cost!.x + cost!.width - 8);
  expect(place!.y).toBeGreaterThan(cost!.y + 20);
  const list = await page.locator('[data-t="affect-objects"]').first().boundingBox();
  expect(list!.y + list!.height).toBeGreaterThan(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: `${shots}/bloodlines-390-light.png` });
});

test('英皇侍卫两条分开，中型战船只有说明，1452 保留区域与视野', async ({ page }) => {
  await open(page, '/tech/3');
  const rows = page.locator('[data-t="effect-summary"]');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('+1 视野，+1 射程');
  await expect(rows.nth(0)).not.toContainText('攻击');
  await expect(rows.nth(1)).toContainText('+2 攻击');
  await expect(rows.nth(1)).not.toContainText('视野');
  await expect(page.locator('[data-t="tech-release"]')).toContainText('征服者');
  await expect(page.locator('[data-t="tech-release"]')).toContainText('2000');
  await expect(page.locator('#tech')).not.toContainText('1993');
  const buildings = page.locator('[data-t="affect-rule"][data-rule="building-0"]');
  await expect(buildings).toContainText('瞭望箭塔');
  await expect(buildings).toContainText('炮塔');
  await expect(buildings.locator('a[href*="building/"]')).toHaveCount(5);

  await open(page, '/tech/34');
  await expect(page.locator('[data-t="effect-summary"]')).toHaveCount(0);
  await expect(page.locator('#tech')).not.toContainText('无效果');
  await expect(page.getByRole('region', { name: '游戏说明', exact: true })).toContainText('战船');
  await expect(page.locator('[data-t="tech-release"]')).toContainText('2026');

  await open(page, '/tech/1452');
  await expect(page.locator('[data-t="catalog-type"]')).toHaveText('区域科技');
  await expect(page.locator('[data-t="effect-summary"]')).toContainText('+1 视野');
  await expect(page.locator('[data-t="tech-release"]')).toContainText('维京传奇');
  await expect(page.locator('[data-t="tech-release"]')).toContainText('2026');
  await expect(page.locator('#tech')).toContainText('又名：绞盘弩');
});

test('筛选只改名单，无法研究不退回全量，地址里的文明不筛选', async ({ page }) => {
  await open(page, '/tech/435');
  const objects = page.locator('#affects [data-t="affect-objects"] a');
  const all = await objects.count();
  expect(all).toBeGreaterThan(0);
  const cost = () => page.locator('[data-t="catalog-cost"]').innerText();
  const costText = await cost();
  await page.locator('#affciv').click();
  await page.locator('.cp-panel .cp-q').fill('Mongols');
  await page.locator('.cp-panel [role="option"][data-civ="Mongols"]').click();
  await expect(page.locator('#affciv')).toHaveAttribute('data-value', 'Mongols');
  await expect.poll(() => objects.count()).toBeLessThan(all);
  await expect(page.locator('[data-t="filter-status"]')).toContainText('研究费用和时间不变');
  expect(await cost()).toBe(costText);
  await expect(page).toHaveURL(/#\/tech\/435$/);
  await expect(page.locator('[data-t="effect-summary"]')).toHaveText('+20 生命值（作用于下方完整名单）');

  const blocked = civs.find((civ) => !techs.find((tech) => tech.id === 435)!.civs.includes(civ.en))!;
  await page.locator('#affciv').click();
  await page.locator('.cp-panel .cp-q').fill(blocked.en);
  await page.locator(`.cp-panel [role="option"][data-civ="${blocked.en}"]`).click();
  await expect(page.locator('#affciv')).toHaveAttribute('data-value', blocked.en);
  await expect(page.locator('[data-t="filter-status"]')).toContainText('无法研究');
  await expect(objects).toHaveCount(0);
  expect(await cost()).toBe(costText);

  await page.locator('#affciv').click();
  await page.locator('.cp-panel [data-civ="__none"]').click();
  await expect(page.locator('#affciv')).toHaveAttribute('data-value', '');
  await expect(objects).toHaveCount(all);
  await expect(page.locator('[data-t="filter-quiet"]')).toBeVisible();

  await open(page, '/tech/435?civ=Britons&me=Britons&opp=Franks');
  await expect(page.locator('#affciv')).toHaveAttribute('data-value', '');
  expect(await cost()).toBe(costText);
  await expect(page.locator('#tech nav[aria-label="文明相关入口"] a[href*="civ/Britons"]')).toBeVisible();
  await expect(objects).toHaveCount(all);
});

test('旧 tab 定位标题且避开顶栏，驯化术保持通用，目录关联不写必须', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const [tab, target] of [
    ['affects', '#affects'],
    ['civs', '#tech-civs'],
    ['history', '#tech-history'],
  ] as const) {
    await open(page, `/tech/22?tab=${tab}`);
    await expect(page).toHaveURL(new RegExp(`tab=${tab}`));
    const top = await page.locator(target).evaluate((el) => el.getBoundingClientRect().top);
    const nav = await page.locator('header.topbar').evaluate((el) => el.getBoundingClientRect().bottom);
    expect(top).toBeGreaterThanOrEqual(nav - 2);
  }
  await open(page, '/tech/1014');
  await expect(page.locator('[data-t="catalog-type"]')).toHaveText('通用科技');
  await expect(page.locator('[data-t="effect-summary"]')).toHaveCount(0);
  await expect(page.locator('#tech')).not.toContainText('独特科技');
  await expect(page.locator('#tech')).not.toContainText('牧场线');
  await open(page, '/tech/199');
  await expect(page.locator('#tech-links')).toContainText('钓线');
  await expect(page.locator('#tech-links')).not.toContainText('必须');
  await expect(page.locator('#tech').getByRole('button', { name: '复制链接', exact: true })).toBeVisible();
});
