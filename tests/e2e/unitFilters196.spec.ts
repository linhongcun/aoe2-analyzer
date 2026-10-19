import { expect, test, type Page } from '@playwright/test';
import units from '../../src/data/units.json' with { type: 'json' };

async function chooseCiv(page: Page, en: string) {
  await page.locator('#uciv').click();
  const dialog = page.getByRole('dialog', { name: '可用文明', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox').fill(en);
  await dialog.locator(`[role="option"][data-civ="${en}"]`).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#uciv')).toBeFocused();
}

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#196 ${theme} @${width}：文明与兵种可组合筛选、清空与键盘操作`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.goto('./#/units');
      await expect(page.locator('#ucnt')).toHaveText('163 / 163');
      await chooseCiv(page, 'Franks');
      await page.getByRole('combobox', { name: '兵种', exact: true }).selectOption('cavalry');
      await page.locator('#uq').fill('Knight');
      await page.locator('#ut').selectOption('Unit');
      await page.locator('#ua').selectOption('3');
      await page.locator('#udlc').selectOption('0');
      const knight = units.find((u) => u.id === 38)!;
      const card = page.locator('#ugrid .card');
      await expect(card).toHaveCount(1);
      await expect(card).toHaveAttribute('data-unit-id', String(knight.id));
      await expect(card).toHaveAttribute('href', `#/unit/${knight.id}`);
      await expect(card.locator('h3')).toHaveText(knight.zh);
      await expect(card.locator('[data-stat="hp"] dd')).toHaveText(String(knight.hp));
      await expect(page.locator('#ucnt')).toHaveText('1 / 163');
      for (const id of ['uciv', 'urole', 'ut', 'ua', 'udlc']) {
        const box = await page.locator(`#${id}`).boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      await page.evaluate(() => document.fonts.ready);
      await expect.poll(() => card.locator('.uico').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`filters-${theme}-${width}.png`), fullPage: true });
      await card.click();
      await expect(page).toHaveURL(/#\/unit\/38$/);
      await page.getByRole('link', { name: '单位', exact: true }).first().click();
      await expect(page.locator('#uciv')).toHaveAttribute('data-value', 'Franks');
      await expect(page.locator('#urole')).toHaveValue('cavalry');
      await expect(card).toHaveAttribute('data-unit-id', '38');

      await page.locator('#urole').selectOption('infantry');
      await expect(page.locator('#ucnt')).toHaveText('0 / 163');
      await expect(page.getByText('没有符合条件的单位', { exact: true })).toBeVisible();
      await expect(card).toHaveCount(0);
      await page.locator('.unit-filter-empty button').click();
      await expect(page.locator('#ucnt')).toHaveText('163 / 163');
      await expect(page.locator('#uciv')).toHaveAttribute('data-value', '');
      for (const id of ['urole', 'ut', 'ua', 'udlc', 'uq']) await expect(page.locator(`#${id}`)).toHaveValue('');
      await expect(page.locator('.unit-filter-empty')).toHaveCount(0);

      await page.locator('#uciv').click();
      await page.getByRole('dialog', { name: '可用文明', exact: true }).getByRole('combobox').fill('蒙古');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: '可用文明', exact: true })).toHaveCount(0);
      await expect(page.locator('#uciv')).toBeFocused();
      await expect(page.locator('#uciv')).toHaveAttribute('data-value', '');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });

test('#196 不可用精锐不出现在文明结果或含精锐标记中', async ({ page }) => {
  await page.goto('./#/units');
  await chooseCiv(page, 'Turks');
  await page.locator('#urole').selectOption('archer');
  await page.locator('#uq').fill('Skirmisher');
  const card = page.locator('#ugrid .card');
  await expect(card).toHaveCount(1);
  await expect(card).toHaveAttribute('data-unit-id', '7');
  await expect(card.locator('.ebadge')).toHaveCount(0);
  await page.locator('#ua').selectOption('3');
  await expect(page.locator('#ucnt')).toHaveText('0 / 163');
  await chooseCiv(page, 'Franks');
  await expect(card).toHaveAttribute('data-unit-id', '6');
  await expect(card).toHaveAttribute('href', '#/unit/6');
  await expect(page.locator('#ucnt')).toHaveText('1 / 163');
});

test('#196 骑射交叉分类及同名战车按文明隔离', async ({ page }) => {
  await page.goto('./#/units');
  await chooseCiv(page, 'Mongols');
  await page.locator('#uq').fill('Mangudai');
  const card = page.locator('#ugrid .card');
  for (const role of ['cavalry', 'archer']) {
    await page.locator('#urole').selectOption(role);
    await expect(card).toHaveCount(1);
    await expect(card).toHaveAttribute('data-unit-id', '11');
  }
  await page.locator('#urole').selectOption('');
  await page.locator('#uq').fill('战车');
  await chooseCiv(page, 'Bengalis');
  await expect(card).toHaveAttribute('data-unit-id', '1759');
  await chooseCiv(page, 'Shu');
  await expect(card).toHaveAttribute('data-unit-id', '1962');
});
