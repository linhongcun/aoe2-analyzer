import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const block = (page: Page) => page.locator('.dside .sideblk').filter({ has: page.getByRole('heading', { name: '独特建筑', exact: true }) });
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

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#463 @${width} ${theme} 独特建筑紧凑模块`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/civ/Bulgarians');
      const unique = block(page);
      const link = unique.getByRole('link', { name: '营垒', exact: true });
      await expect(link).toHaveAttribute('href', '#/building/1251?civ=Bulgarians&age=3&ctxReturn=%2Fciv%2FBulgarians');
      await expect(unique.getByRole('link')).toHaveCount(1);
      for (const [index, name] of ['独特单位', '独特建筑', '快速入口'].entries())
        await expect(page.locator('.dside .sideblk > h4').nth(index)).toHaveText(name);
      await expect(page.locator('.dmain').getByRole('heading', { name: '独特建筑', exact: true })).toHaveCount(0);
      await expect(unique).not.toContainText(/训练建筑|城堡时代|点击建筑/);
      await expect(link.locator('img')).toBeVisible();
      const box = await link.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect((await new AxeBuilder({ page }).include('.civ-unique-buildings').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      await unique.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath(`Bulgarians-${width}-${theme}.png`), fullPage: true });
      await unique.screenshot({ path: info.outputPath(`unique-buildings-${width}-${theme}.png`) });
      await link.focus();
      await expect(link).toBeFocused();
      await page.getByRole('tab', { name: '数据', exact: true }).click();
      await expect(link).toBeVisible();
      await page.reload();
      await expect(link).toBeVisible();
    });

test('#463 五类独特建筑、区域不混入及营垒详情上下文', async ({ page }) => {
  for (const [civ, name] of [
    ['Sicilians', '城楼'],
    ['Poles', '大庄园'],
    ['Malay', '巨港'],
    ['Portuguese', '大商站'],
  ] as const) {
    await page.goto(`./#/civ/${civ}`);
    await expect(block(page).getByRole('link')).toHaveText([name]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  for (const civ of ['Khitans', 'Armenians', 'Persians', 'Incas', 'Chinese']) {
    await page.goto(`./#/civ/${civ}`);
    await expect(page.locator('.dside').getByRole('heading', { name: '独特单位', exact: true })).toBeVisible();
    await expect(block(page)).toHaveCount(0);
    await expect(block(page).getByRole('link')).toHaveCount(0);
  }
  await page.goto('./#/civ/Poles');
  await expect(block(page).getByRole('link')).toHaveText(['大庄园']);
  await page.evaluate(() => {
    location.hash = '/civ/Bulgarians';
  });
  await expect(block(page).getByRole('link')).toHaveText(['营垒']);
  await block(page).getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('营垒');
  await page.getByRole('tab', { name: '科技模拟器', exact: true }).click();
  await expect(page.locator('#simciv')).toHaveAttribute('data-value', 'Bulgarians');
  await expect(page.locator('#simage')).toHaveValue('3');
  await page.reload();
  await expect(page.locator('#simciv')).toHaveAttribute('data-value', 'Bulgarians');
  await expect(page.locator('#simage')).toHaveValue('3');
});

test('#463 加载期间不误报没有独特建筑', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/(?:assets\/techs-[^/]+\.js|src\/data\/techs\.json)(?:\?.*)?$/, async (route) => {
    await pending;
    await route.continue();
  });
  try {
    await page.goto('./#/civ/Bulgarians', { waitUntil: 'domcontentloaded' });
    await expect(block(page).getByRole('status')).toHaveText('正在加载独特建筑…');
    await expect(block(page)).not.toContainText('本文明没有独特建筑。');
    release();
    await expect(block(page).getByRole('link', { name: '营垒', exact: true })).toBeVisible();
  } finally {
    release();
  }
});
