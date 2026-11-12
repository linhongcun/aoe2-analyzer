// #976 科技与建筑详情的页内章节导航与单位页左对齐。只核对这次对齐和直接相关的显隐、跳转，不是全站验收。
import { expect, test, type Page } from '@playwright/test';

const TECH_LABELS = ['研究', '作用对象', '说明', '文明', '更新历史'];
const TECH_WITHOUT_AFFECTS = ['研究', '说明', '文明', '目录关联', '更新历史'];
const BUILDING_LABELS = ['属性', '生产', '研究', '说明', '相关', '更新历史'];
const UNIT_LABELS = ['属性', '如何获得', '说明', '相关', '模拟器', '更新历史'];
const CIV_LABELS = ['身份', '加成', '兵种', '科技树', '其他'];

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((value) => localStorage.setItem('aoe2-theme', value), theme);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function openAt(page: Page, hash: string, ready: string) {
  await page.goto('./#' + hash);
  await expect(page.locator(ready)).toBeVisible();
}

async function jumpEdge(page: Page, selector: string) {
  const nav = page.locator(selector);
  await expect(nav).toBeVisible();
  const buttons = nav.getByRole('button');
  const count = await buttons.count();
  expect(count).toBeGreaterThan(1);
  const first = await buttons.first().boundingBox();
  const last = await buttons.nth(count - 1).boundingBox();
  const navBox = await nav.boundingBox();
  expect(first && last && navBox).toBeTruthy();
  const style = await nav.evaluate((el) => {
    const navStyle = getComputedStyle(el);
    const button = el.querySelector('button');
    return {
      justify: navStyle.justifyContent,
      paddingLeft: Number.parseFloat(navStyle.paddingLeft),
      gap: navStyle.columnGap,
      minHeight: button ? getComputedStyle(button).minHeight : '',
    };
  });
  expect(style.justify).toBe('flex-start');
  expect(style.paddingLeft).toBe(10);
  expect(style.gap).toBe('4px');
  expect(style.minHeight).toBe('44px');
  expect(first!.height).toBeGreaterThanOrEqual(44);
  expect(Math.abs(first!.x - (navBox!.x + style.paddingLeft))).toBeLessThanOrEqual(1);
  expect(Math.abs(first!.y - last!.y)).toBeLessThanOrEqual(2);
  const rowMid = (first!.x + last!.x + last!.width) / 2;
  expect(rowMid).toBeLessThan(navBox!.x + navBox!.width / 2 - 40);
  return first!.x;
}

test('1280 浅色和深色下科技、建筑与单位章节导航同一左缘', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const theme of ['light', 'dark'] as const) {
    await openAt(page, '/unit/1699', '#unit h1');
    await setTheme(page, theme);
    await expect(page.locator('#unit h1')).toContainText('弗拉芒民兵');
    await expect(page.locator('.ud-jump').getByRole('button')).toHaveText(UNIT_LABELS);
    const unit = await jumpEdge(page, '.ud-jump');

    await openAt(page, '/tech/3', '#tech h1');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('#tech h1')).toContainText('英皇侍卫');
    await expect(page.locator('.td-jump').getByRole('button')).toHaveText(TECH_LABELS);
    const tech = await jumpEdge(page, '.td-jump');

    await openAt(page, '/building/12', '#building h1');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('#building h1')).toContainText('兵营');
    await expect(page.locator('.bd-jump').getByRole('button')).toHaveText(BUILDING_LABELS);
    const building = await jumpEdge(page, '.bd-jump');

    expect(Math.abs(tech - unit)).toBeLessThanOrEqual(1);
    expect(Math.abs(building - unit)).toBeLessThanOrEqual(1);

    await openAt(page, '/civ/Franks', 'nav.civ-chapters');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.getByRole('heading', { level: 1, name: '法兰克' })).toBeVisible();
    const chapters = page.locator('nav.civ-chapters');
    await expect(chapters.getByRole('link')).toHaveText(CIV_LABELS);
    const link = await chapters.getByRole('link').first().boundingBox();
    const navBox = await chapters.boundingBox();
    const civStyle = await chapters.evaluate((el) => {
      const style = getComputedStyle(el);
      return { justify: style.justifyContent, paddingLeft: Number.parseFloat(style.paddingLeft) };
    });
    expect(civStyle.justify).toBe('flex-start');
    expect(civStyle.paddingLeft).toBe(0);
    expect(link && navBox).toBeTruthy();
    expect(Math.abs(link!.x - navBox!.x)).toBeLessThanOrEqual(1);
  }
});

test('901 仍可见且左对齐，900 与 390 仍隐藏', async ({ page }) => {
  await page.setViewportSize({ width: 901, height: 900 });
  await openAt(page, '/unit/1699', '#unit h1');
  await setTheme(page, 'light');
  const unit = await jumpEdge(page, '.ud-jump');
  await openAt(page, '/tech/3', '#tech h1');
  const tech = await jumpEdge(page, '.td-jump');
  await openAt(page, '/building/12', '#building h1');
  const building = await jumpEdge(page, '.bd-jump');
  expect(Math.abs(tech - unit)).toBeLessThanOrEqual(1);
  expect(Math.abs(building - unit)).toBeLessThanOrEqual(1);

  for (const width of [900, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await openAt(page, '/tech/3', '#tech h1');
    await expect(page.locator('.td-jump')).toBeHidden();
    await openAt(page, '/building/12', '#building h1');
    await expect(page.locator('.bd-jump')).toBeHidden();
    await openAt(page, '/unit/1699', '#unit h1');
    await expect(page.locator('.ud-jump')).toBeHidden();
  }
});

test('缺项仍左对齐，点击跳转、更新历史和键盘焦点保持原样', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openAt(page, '/tech/34', '#tech h1');
  await setTheme(page, 'light');
  await expect(page.locator('#tech h1')).toContainText('中型战船');
  const sparse = page.locator('.td-jump');
  await expect(sparse.getByRole('button', { name: '作用对象', exact: true })).toHaveCount(0);
  await expect(sparse.getByRole('button')).toHaveText(TECH_WITHOUT_AFFECTS);
  await jumpEdge(page, '.td-jump');

  await openAt(page, '/tech/3', '#tech h1');
  const techNav = page.locator('.td-jump');
  const before = await jumpEdge(page, '.td-jump');
  await techNav.getByRole('button', { name: '研究', exact: true }).focus();
  await expect(techNav.getByRole('button', { name: '研究', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(techNav.getByRole('button', { name: '作用对象', exact: true })).toBeFocused();
  const focused = await jumpEdge(page, '.td-jump');
  expect(Math.abs(focused - before)).toBeLessThanOrEqual(1);

  await techNav.getByRole('button', { name: '研究', exact: true }).click();
  await expect(page).toHaveURL(/#\/tech\/3$/);
  const research = page.locator('#tech-research');
  await expect(research).toBeInViewport();
  const researchTop = await research.evaluate((el) => el.getBoundingClientRect().top);
  expect(researchTop).toBeGreaterThanOrEqual(0);
  expect(researchTop).toBeLessThan(160);

  await techNav.getByRole('button', { name: '更新历史', exact: true }).click();
  await expect(page).toHaveURL(/#\/tech\/3\?tab=history$/);
  await expect(page.locator('#tech-history')).toHaveJSProperty('open', true);
  await expect(page.getByTestId('entity-history')).toBeVisible();

  await openAt(page, '/building/12', '#building h1');
  const buildingNav = page.locator('.bd-jump');
  await buildingNav.getByRole('button', { name: '属性', exact: true }).focus();
  await expect(buildingNav.getByRole('button', { name: '属性', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(buildingNav.getByRole('button', { name: '生产', exact: true })).toBeFocused();
  await buildingNav.getByRole('button', { name: '属性', exact: true }).click();
  await expect(page).toHaveURL(/#\/building\/12$/);
  const core = page.locator('#building-core');
  await expect(core).toBeInViewport();
  const coreTop = await core.evaluate((el) => el.getBoundingClientRect().top);
  expect(coreTop).toBeGreaterThanOrEqual(0);
  expect(coreTop).toBeLessThan(160);
  await buildingNav.getByRole('button', { name: '更新历史', exact: true }).click();
  await expect(page).toHaveURL(/#\/building\/12\?tab=history$/);
  await expect(page.locator('#building-history')).toHaveJSProperty('open', true);
  await expect(page.getByTestId('entity-history')).toBeVisible();
});
