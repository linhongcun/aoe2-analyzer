import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const block = (page: Page) => page.locator('.dside .sideblk').filter({ has: page.getByRole('heading', { name: '区域建筑', exact: true }) });
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
    test(`#456 @${width} ${theme} 紧凑区域建筑`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/civ/Armenians');
      const region = block(page);
      await expect(region).toBeVisible();
      await expect(page.locator('.dside .sideblk > h4').first()).toHaveText('独特单位');
      await expect(page.locator('.dside .sideblk > h4').nth(1)).toHaveText('区域单位');
      await expect(page.locator('.dside .sideblk > h4').nth(2)).toHaveText('区域建筑');
      await expect(page.locator('.dside .sideblk > h4').nth(3)).toHaveText('快速入口');
      await expect(region.getByRole('link')).toHaveText(['骡车', '强化教堂']);
      await expect(page.locator('.dmain').getByRole('heading', { name: '区域建筑', exact: true })).toHaveCount(0);
      await expect(region).not.toContainText(/训练建筑|黑暗时代|城堡时代|点击建筑|共享建筑/);
      for (const link of await region.getByRole('link').all()) {
        const box = await link.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
        await expect(link.locator('img')).toBeVisible();
      }
      await expect(region.getByRole('link', { name: '骡车', exact: true })).toHaveAttribute('href', '#/building/1808?civ=Armenians&age=1');
      await expect(region.getByRole('link', { name: '强化教堂', exact: true })).toHaveAttribute('href', '#/building/1806?civ=Armenians&age=3');
      expect((await new AxeBuilder({ page }).include('.civ-regional-buildings').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      await region.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath(`Armenians-${width}-${theme}.png`), fullPage: true });
      await region.screenshot({ path: info.outputPath(`regional-buildings-${width}-${theme}.png`) });
      await region.getByRole('link').first().focus();
      await expect(region.getByRole('link').first()).toBeFocused();
      await page.getByRole('tab', { name: '数据', exact: true }).click();
      await expect(region.getByRole('link')).toHaveText(['骡车', '强化教堂']);
      await page.reload();
      await expect(region.getByRole('link')).toHaveText(['骡车', '强化教堂']);
    });

test('#456 各文明区域归属与详情保留文明时代', async ({ page }) => {
  for (const [civ, names] of [
    ['Georgians', ['骡车', '强化教堂']],
    ['Hindustanis', ['商队旅馆']],
    ['Persians', ['商队旅馆']],
    ['Khitans', ['牧场']],
    ['Incas', ['聚落']],
    ['Mapuche', ['聚落']],
    ['Muisca', ['聚落']],
    ['Tupi', ['聚落']],
  ] as const) {
    await page.goto(`./#/civ/${civ}`);
    await expect(block(page).getByRole('link')).toHaveText([...names]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  for (const civ of ['Chinese', 'Japanese', 'Sicilians', 'Poles', 'Malay', 'Bulgarians', 'Portuguese']) {
    await page.goto(`./#/civ/${civ}`);
    await expect(block(page)).toContainText('本文明没有区域建筑。');
    await expect(block(page).getByRole('link')).toHaveCount(0);
  }
  // Use in-app navigation to catch state retained across a civilization change.
  await page.goto('./#/civ/Armenians');
  await expect(block(page).getByRole('link')).toHaveCount(2);
  await page.evaluate(() => {
    location.hash = '/civ/Persians';
  });
  await expect(block(page).getByRole('link')).toHaveText(['商队旅馆']);
  const link = block(page).getByRole('link', { name: '商队旅馆', exact: true });
  await expect(link).toHaveAttribute('href', '#/building/1754?civ=Persians&age=4');
  await link.click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('商队旅馆');
  await page.getByRole('tab', { name: '科技模拟器', exact: true }).click();
  await expect(page.locator('#simciv')).toHaveAttribute('data-value', 'Persians');
  await expect(page.locator('#simage')).toHaveValue('4');
  await page.reload();
  await expect(page.locator('#simciv')).toHaveAttribute('data-value', 'Persians');
  await expect(page.locator('#simage')).toHaveValue('4');
});

test('#456 加载期间不误报无区域建筑', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/(?:assets\/techs-[^/]+\.js|src\/data\/techs\.json)(?:\?.*)?$/, async (route) => {
    await pending;
    await route.continue();
  });
  try {
    await page.goto('./#/civ/Armenians', { waitUntil: 'domcontentloaded' });
    await expect(block(page).getByRole('status')).toHaveText('正在加载区域建筑…');
    await expect(block(page)).not.toContainText('本文明没有区域建筑。');
    release();
    await expect(block(page).getByRole('link')).toHaveText(['骡车', '强化教堂']);
  } finally {
    release();
  }
});
