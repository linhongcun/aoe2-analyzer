import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const block = (page: Page, title: string) => page.locator('.dside .sideblk').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const optional = ['区域单位', '独特建筑', '区域建筑'];
const errors = new WeakMap<Page, string[]>();
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

async function checkModules(page: Page, wanted: string[]) {
  // Unique units is rendered only after the shared core is ready: negative checks cannot pass on a loading shell.
  await expect(block(page, '独特单位').getByRole('link').first()).toBeVisible();
  for (const title of optional) await expect(block(page, title)).toHaveCount(wanted.includes(title) ? 1 : 0);
  await expect(page.locator('.dside')).not.toContainText(/本文明没有(?:区域单位|独特建筑|区域建筑)/);
  const titles = await page.locator('.dside .sideblk > h4').allTextContents();
  expect(titles.filter((title) => title !== '同资料片文明')).toEqual(['独特单位', ...wanted, '快速入口']);
  for (const card of await page.locator('.dside .sideblk').all()) expect(await card.getByRole('link').count()).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#465 @${width} ${theme} 无内容模块不占位`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      for (const [civ, wanted] of [
        ['Japanese', []],
        ['Bulgarians', ['独特建筑']],
        ['Armenians', ['区域单位', '区域建筑']],
        ['Poles', ['区域单位', '独特建筑']],
      ] as const) {
        await page.goto(`./#/civ/${civ}`);
        await checkModules(page, [...wanted]);
        if (civ === 'Bulgarians') await expect(block(page, '独特建筑').getByRole('link', { name: '营垒', exact: true })).toBeVisible();
        if (civ === 'Poles') await expect(block(page, '区域单位').getByRole('link', { name: '波兰翼骑兵', exact: true })).toBeVisible();
        if (civ === 'Japanese' || civ === 'Poles') {
          await page.locator('.dside').scrollIntoViewIfNeeded();
          await page.screenshot({ path: info.outputPath(`${civ}-${width}-${theme}.png`), fullPage: true });
          expect((await new AxeBuilder({ page }).include('.dside').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
        }
      }
      await page.getByRole('tab', { name: '数据', exact: true }).click();
      await checkModules(page, ['区域单位', '独特建筑']);
      await page.reload();
      await checkModules(page, ['区域单位', '独特建筑']);
      await page.evaluate(() => {
        location.hash = '/civ/Japanese';
      });
      await checkModules(page, []);
      await page.evaluate(() => {
        location.hash = '/civ/Armenians';
      });
      await checkModules(page, ['区域单位', '区域建筑']);
    });

test('#465 未就绪时保留加载提示，就绪后空模块整块移除', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/(?:assets\/techs-[^/]+\.js|src\/data\/techs\.json)(?:\?.*)?$/, async (route) => {
    await pending;
    await route.continue();
  });
  try {
    await page.goto('./#/civ/Japanese', { waitUntil: 'domcontentloaded' });
    for (const title of optional) await expect(block(page, title).getByRole('status')).toHaveText(`正在加载${title}…`);
    release();
    await checkModules(page, []);
  } finally {
    release();
  }
});
