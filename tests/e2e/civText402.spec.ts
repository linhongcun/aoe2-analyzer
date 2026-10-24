import { expect, test, type Page } from '@playwright/test';

const messages = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  messages.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(messages.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

async function choose(page: Page, slot: 'A' | 'B', civ: string) {
  await page.getByRole('button', { name: new RegExp(`^文明 ${slot}：`) }).click();
  await page.locator(`[role="option"][data-civ="${civ}"]`).click();
}

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#402 @${width} ${theme} 比较与文明详情读取校正后的突袭说明`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/compare');
      await choose(page, 'A', 'Mapuche');
      await choose(page, 'B', 'Muisca');
      const castle = page.locator('#ctab tr').filter({ has: page.getByRole('cell', { name: '城堡科技', exact: true }) });
      await expect(castle.locator('td').nth(1)).toHaveText('突袭 (掷石绳骑兵、投石手和掷矛手可造成穿透伤害)｜Malon');
      await expect(castle.locator('td').nth(2)).toContainText('蔷琵战士');
      await expect(page.locator('#ctab')).not.toContainText(/可可|•/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`compare-${width}-${theme}.png`), fullPage: true });
      await choose(page, 'A', 'Franks');
      await expect(castle.locator('td').nth(1)).toHaveText('王家敕令骑兵 (骑马弩手花费的黄金 -40%)｜Ordonnance Companies');
      await page.goto('./#/civ/Mapuche');
      await page.getByRole('tab', { name: '科技', exact: true }).click();
      const tech = page.getByRole('link', { name: '突袭', exact: true });
      await expect(tech).toHaveAttribute('href', '#/tech/1379');
      await expect(page.locator('main')).toContainText('掷石绳骑兵、投石手和掷矛手可造成穿透伤害');
      await expect(page.locator('main')).not.toContainText(/可可|•/);
      await page.screenshot({ path: info.outputPath(`civ-${width}-${theme}.png`), fullPage: true });
    });
