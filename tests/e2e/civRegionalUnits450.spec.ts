import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const errors = new WeakMap<Page, string[]>();
const regionalBlock = (page: Page) => page.locator('.dside .sideblk').filter({ has: page.getByRole('heading', { name: '区域单位', exact: true }) });
test.beforeEach(({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (e) => messages.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') messages.push(e.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#450 @${width} ${theme} 区域单位与文明上下文`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/civ/Franks');
      const region = regionalBlock(page);
      await expect(page.locator('.dside .sideblk > h4').first()).toHaveText('独特单位');
      await expect(page.locator('.dside .sideblk > h4').nth(1)).toHaveText('区域单位');
      await expect(page.locator('.dside .sideblk > h4').nth(2)).toHaveText('独特建筑');
      await expect(page.locator('.dside .sideblk > h4').nth(3)).toHaveText('区域建筑');
      await expect(page.locator('.dside .sideblk > h4').nth(4)).toHaveText('快速入口');
      await expect(page.locator('.dmain').getByRole('heading', { name: '区域单位', exact: true })).toHaveCount(0);
      const base = region.getByRole('link', { name: '骑马弩兵', exact: true });
      await expect(base).toHaveAttribute('href', '#/unit/2700/Franks/3/');
      await expect(region.getByRole('link', { name: '重装骑马弩兵', exact: true })).toHaveAttribute('href', '#/unit/2701/Franks/4/');
      await expect(region).not.toContainText(/训练建筑|城堡时代|帝王时代|点击单位|区域兵种/);
      for (const link of await region.getByRole('link').all()) {
        const box = await link.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
      }
      expect((await new AxeBuilder({ page }).include('.civ-regional-units').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      await region.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath(`regional-${width}-${theme}.png`), fullPage: true });
      await base.focus();
      await expect(base).toBeFocused();
      await base.click();
      await expect(page).toHaveURL(/#\/unit\/2700\/Franks\/3\/$/);
      await page.getByRole('tab', { name: '科技模拟器', exact: true }).click();
      await expect(page.locator('#simciv')).toHaveAttribute('data-value', 'Franks');
      await page.reload();
      await expect(page).toHaveURL(/Franks/);
      await expect(page.locator('#simciv')).toHaveAttribute('data-value', 'Franks');
      await expect(page.locator('#simage')).toHaveValue('3');
      await page.goto('./#/civ/Dravidians');
      const elephants = regionalBlock(page);
      await expect(elephants.getByRole('link', { name: '象兵', exact: true })).toBeVisible();
      await expect(elephants.getByRole('link', { name: '象兵', exact: true }).locator('.ebadge')).toHaveCount(0);
      await expect(elephants.getByRole('link', { name: '精锐象兵', exact: true })).toHaveCount(0);
      await expect(elephants).not.toContainText('骑马弩兵');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const civ of ['Chinese', 'Muisca']) {
        await page.goto(`./#/civ/${civ}`);
        const units = regionalBlock(page);
        await expect(units.getByRole('link').first()).toBeVisible();
        if (civ === 'Chinese') {
          await expect(units.getByRole('link', { name: /^火矛兵/ })).toContainText('精锐');
          await expect(units.getByRole('link', { name: '精锐火矛兵', exact: true })).toHaveCount(0);
          await expect(units.getByRole('link', { name: '火箭推车', exact: true })).toBeVisible();
          await expect(units.getByRole('link', { name: '重型火箭推车', exact: true })).toBeVisible();
          await expect(units.getByRole('link', { name: '诸葛弩', exact: true })).toHaveCount(0);
          await page.getByRole('tab', { name: '数据', exact: true }).click();
          await expect(units).toBeVisible();
          await page.getByRole('tab', { name: '概览', exact: true }).click();
        } else {
          await expect(units.getByRole('link', { name: /^.*蔷琵.*$/ })).toHaveCount(3);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await units.scrollIntoViewIfNeeded();
        await page.screenshot({ path: info.outputPath(`${civ}-${width}-${theme}.png`), fullPage: true });
      }
      await page.goto('./#/civ/Japanese');
      await expect(regionalBlock(page)).toContainText('本文明没有区域单位。');
    });

test('#450 核心数据加载期间不显示无区域单位', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  // Units also belongs to the existing page's static imports; hold its asynchronous core companion.
  await page.route(/\/(?:assets\/techs-[^/]+\.js|src\/data\/techs\.json)(?:\?.*)?$/, async (route) => {
    await pending;
    await route.continue();
  });
  try {
    await page.goto('./#/civ/Franks', { waitUntil: 'domcontentloaded' });
    const region = regionalBlock(page);
    await expect(region.getByRole('status')).toHaveText('正在加载区域单位…');
    await expect(region).not.toContainText('本文明没有区域单位。');
    release();
    await expect(region.getByRole('link', { name: '骑马弩兵', exact: true })).toBeVisible();
  } finally {
    release();
  }
});
