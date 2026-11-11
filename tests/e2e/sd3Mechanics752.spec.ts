import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const failures = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  failures.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(failures.get(page)).toEqual([]);
});

const HANDBOOK = 'https://www.twestaoe.net/events/suddendessaster3';
const banned = /推荐文明|打法|必胜|胜率|开一局|速攻|速封|大型战舰|冰上单位|直播中|比分/;

const mechanicsOf = (page: Page) => page.getByTestId('sd3-mechanics');

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function numbersStayOneLine(scope: ReturnType<Page['locator']>) {
  for (const node of await scope.locator('.num, time').all()) {
    const tops = await node.evaluate((el) => [...el.getClientRects()].map((rect) => Math.round(rect.top)));
    expect(tops.length, await node.innerText()).toBeGreaterThan(0);
    expect(new Set(tops).size, await node.innerText()).toBe(1);
  }
}

test('#752 @1280 合集旁能看到三张机制短卡并链到手册', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/maps');
  await page.getByTestId('map-sd3').locator('summary').first().click();
  const watch = page.getByTestId('sd3-watch');
  const collection = page.getByTestId('sd3-collection');
  const mechanics = mechanicsOf(page);
  await expect(watch).toBeVisible();
  await expect(collection).toBeVisible();
  await expect(mechanics).toBeVisible();
  await expect(collection.getByTestId('sd3-mechanics')).toHaveCount(0);
  const watchBox = await watch.boundingBox();
  const collectionBox = await collection.boundingBox();
  const mechanicsBox = await mechanics.boundingBox();
  expect(watchBox!.y).toBeLessThan(collectionBox!.y);
  expect(collectionBox!.y).toBeLessThan(mechanicsBox!.y);

  await expect(mechanics.locator('summary')).toContainText('猝死赛图特殊机制');
  await expect(mechanics.locator('summary')).toContainText('3 张');
  await expect(mechanics).toHaveAttribute('open', '');
  await expect(mechanics.getByRole('heading', { level: 4 })).toHaveText([
    '薄冰 Thin Ice · TheMadCADer',
    '猴岛 Monkey Island · Jasouki',
    '圣谷 Holy Hollow · DeathCounter',
  ]);
  await expect(mechanics.locator('[data-sd3-mechanic="thin-ice"]')).toContainText('冰上的一切');
  await expect(mechanics.locator('[data-sd3-mechanic="thin-ice"]')).toContainText('large warships');
  await expect(mechanics.locator('[data-sd3-mechanic="monkey-island"]')).toContainText('1,800');
  await expect(mechanics.locator('[data-sd3-mechanic="monkey-island"]')).toContainText('65 秒');
  await expect(mechanics.locator('[data-sd3-mechanic="monkey-island"]')).toContainText('Army Tents');
  await expect(mechanics.locator('[data-sd3-mechanic="holy-hollow"]')).toContainText('Gunpowder Kegs');
  await expect(mechanics.locator('[data-kind="pending"]')).toHaveCount(7);
  await expect(mechanics).toContainText('待确认：');
  expect(await mechanics.innerText()).not.toMatch(banned);
  await expect(mechanics.locator('table')).toHaveCount(0);
  await expect(page.locator('.map-guide table')).toHaveCount(0);

  const link = mechanics.getByRole('link', { name: 'Sudden Dessaster 3 手册', exact: true });
  await expect(link).toHaveAttribute('href', HANDBOOK);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);
  const box = await link.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await numbersStayOneLine(mechanics);

  await collection.locator('summary').click();
  await expect(collection.locator('[data-sd3-id="sd3-thin-ice"] .sd3-tip')).toHaveText('码头被毁会使整片冰面及其上的东西坠水，护城也要护码头。');
  await expect(collection.locator('[data-sd3-id="sd3-monkey-island"] .sd3-tip')).toHaveText('占领帐篷可训练爆破兵，主城要防多方向偷袭。');
  await expect(collection.locator('[data-sd3-id="sd3-holy-hollow"] .sd3-tip')).toHaveText('火药桶会连锁炸开林地，护主城时要盯住新通道。');
  await expect(collection.locator('.sd3-card')).toHaveCount(11);
  await expect(collection).not.toContainText('1,800');
  await expect(collection.getByTestId('sd3-victory-link')).toHaveAttribute('href', /\/game-guide$/);

  await page.goto('./#/game-guide');
  const modes = page.getByTestId('victory-modes');
  await expect(modes).toContainText('不能再建城镇中心');
  await expect(modes).toContainText('最后一座城镇中心被毁就会立刻输掉');
  await expect(modes).not.toContainText('火药桶');
  await expect(modes).not.toContainText('薄冰');
  await expect(modes.locator('table')).toHaveCount(0);
  await noOverflow(page);

  await page.goto('./#/maps');
  await page.getByTestId('map-sd3').locator('summary').first().click();
  await page.addStyleTag({ content: 'header.topbar, .skip-link, a[href*="issues/new"] { visibility: hidden !important; }' });
  await mechanicsOf(page).scrollIntoViewIfNeeded();
  await noOverflow(page);
  const report = await new AxeBuilder({ page }).include('[data-testid="sd3-mechanics"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(report.violations).toEqual([]);
  await mechanicsOf(page).screenshot({ path: test.info().outputPath('sd3-mechanics-1280.png') });
});

for (const width of [360, 375, 390, 1280]) {
  test(`#752 @${width} 机制短卡不横向溢出`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    if (width === 390) await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));
    await page.goto('./#/maps');
    await page.getByTestId('map-sd3').locator('summary').first().click();
    await page.addStyleTag({ content: 'header.topbar, .skip-link, a[href*="issues/new"] { visibility: hidden !important; }' });
    const mechanics = mechanicsOf(page);
    await expect(mechanics).toHaveAttribute('open', '');
    await mechanics.scrollIntoViewIfNeeded();
    await expect(mechanics.locator('[data-sd3-mechanic="thin-ice"]')).toBeVisible();
    await expect(mechanics.locator('[data-sd3-mechanic="holy-hollow"]')).toBeVisible();
    await numbersStayOneLine(mechanics);
    const link = mechanics.getByRole('link', { name: 'Sudden Dessaster 3 手册', exact: true });
    const box = await link.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await noOverflow(page);
    if (width === 390) {
      const report = await new AxeBuilder({ page }).include('[data-testid="sd3-mechanics"]').withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(report.violations).toEqual([]);
    }
    await mechanics.screenshot({ path: test.info().outputPath(`sd3-mechanics-${width}.png`) });
  });
}
