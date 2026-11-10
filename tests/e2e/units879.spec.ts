import { expect, test, type Page } from '@playwright/test';
import units from '../../src/data/units.json' with { type: 'json' };

const mangudai = units.find((unit) => unit.id === 11)!;
const elite = units.find((unit) => unit.id === 561)!;
const paladin = units.find((unit) => unit.id === 569)!;

async function chooseCiv(page: Page, en: string) {
  await page.locator('#uciv').click();
  const dialog = page.getByRole('dialog', { name: '可用文明', exact: true });
  await dialog.getByRole('combobox').fill(en);
  await dialog.locator(`[role="option"][data-civ="${en}"]`).click();
  await expect(dialog).toHaveCount(0);
}

test('#879 1280：搜索、系列、文明上下文与目录基础值', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('./#/units');
  await expect(page.locator('#ucnt')).toHaveText('163 / 163');
  await expect(page.getByText('生命、攻击、射程和造价是目录基础值，不是满科技或折后结果。')).toBeVisible();
  await expect(page.locator('#units .unit-help')).not.toHaveAttribute('open');
  await expect(page.locator('.unit-head')).toBeVisible();
  await expect(page.locator('#udlc')).toBeVisible();
  await expect(page.locator('#udlc option', { hasText: '国王时代' })).toHaveCount(1);

  await page.locator('#urole').selectOption('cavalry');
  await expect(page.locator('#ucnt')).toHaveText('57 / 163');
  await expect(page.locator('#ugrid .unit-row', { hasText: '战车' }).first()).toBeVisible();
  await page.getByRole('button', { name: '清空筛选', exact: true }).click();
  await expect(page.locator('#ucnt')).toHaveText('163 / 163');

  for (const query of ['蒙古突骑', 'menggutuqi', 'menggu tuqi', 'mgtq']) {
    await page.locator('#uq').fill(query);
    const row = page.locator('#ugrid .unit-row');
    await expect(row).toHaveCount(1);
    await expect(row).toHaveAttribute('data-unit-id', '11');
    await expect(row.locator('.elite-mark')).toHaveText('含精锐');
    await expect(row).toHaveAttribute('href', '#/unit/11');
  }
  await page.locator('#uq').fill('精锐蒙古突骑');
  await expect(page.locator('#ugrid .unit-row')).toHaveAttribute('data-unit-id', '561');
  await expect(page.locator('.elite-mark')).toHaveCount(0);
  await expect(page.locator('#ugrid .unit-row')).toHaveAttribute('href', '#/unit/561');
  await page.locator('#uq').fill('圣骑士');
  await expect(page.locator('#ugrid .unit-row')).toHaveCount(1);
  await expect(page.locator('#ugrid .unit-row')).toHaveAttribute('data-unit-id', '569');
  await expect(page.locator('.unit-zh')).toHaveText(paladin.zh);
  await page.locator('#uq').fill('tuqi');
  await expect(page.locator('#ucnt')).toHaveText('0 / 163');
  await expect(page.getByRole('heading', { name: '没有符合条件的单位', exact: true })).toBeVisible();
  await page.locator('.unit-filter-empty button').click();
  await expect(page.locator('#ucnt')).toHaveText('163 / 163');

  await chooseCiv(page, 'Mongols');
  await page.locator('#uq').fill('蒙古突骑');
  const row = page.locator('#ugrid .unit-row');
  await expect(row).toHaveAttribute('href', '#/unit/11?civ=Mongols');
  for (const stat of ['hp', 'atk', 'rng'] as const) await expect(row.locator(`[data-stat="${stat}"] dd`)).toHaveText(String(mangudai[stat]));
  await expect(row).toContainText(String(mangudai.cost.Wood));
  await expect(row).toContainText(String(mangudai.cost.Gold));
  await row.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(row).toBeFocused();
  expect(await row.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/unit\/11\?civ=Mongols$/);
  await expect(page.locator('.ctx-civ-link')).toContainText('蒙古');
  await expect(page.locator('#unit .dhead')).toContainText(mangudai.zh);
  await page.getByRole('link', { name: '单位', exact: true }).first().click();
  await expect(page.locator('#uciv')).toHaveAttribute('data-value', 'Mongols');
  await expect(page.locator('#uq')).toHaveValue('蒙古突骑');
  await expect(page.locator('#ugrid .unit-row')).toHaveAttribute('data-unit-id', '11');

  await page.getByRole('button', { name: '清空筛选', exact: true }).click();
  await page.locator('#uq').fill('蒙古突骑');
  await expect(page.locator('#ugrid .unit-row')).toHaveAttribute('href', '#/unit/11');
  await page.locator('#ugrid .unit-row').click();
  await expect(page).toHaveURL(/#\/unit\/11$/);
  await expect(page.locator('.ctx-civ-link')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(elite.id).toBe(561);
  expect(errors).toEqual([]);
});

test('#879 390：行内标签、资料片单选与收起的兵种说明', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/units');
  await expect(page.locator('#ugrid .unit-row').first()).toBeVisible();
  const label = page.locator('#ugrid .unit-row').first().locator('.stat-label').first();
  await expect(label).toBeVisible();
  await expect(label).toHaveText('生命');
  expect(await label.evaluate((element) => getComputedStyle(element).fontSize)).toBe('13px');
  await expect(page.locator('.unit-head')).toBeHidden();
  await expect(page.locator('#udlc')).toBeHidden();
  await expect(page.locator('#units .unit-help')).not.toHaveAttribute('open');
  await page.locator('.catalog-filter-toggle').click();
  await expect(page.locator('#udlc')).toBeVisible();
  await expect(page.locator('#udlc')).toHaveJSProperty('tagName', 'SELECT');
  await expect(page.locator('#udlc option', { hasText: '未标注' })).toHaveCount(1);
  await expect(page.locator('#units .unit-help')).not.toHaveAttribute('open');
  await page.locator('#units .unit-help summary').click();
  await expect(page.locator('#units .unit-help')).toHaveAttribute('open', '');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('#879 浅色与深色截图', async ({ page }, info) => {
  await page.goto('./#/units');
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => localStorage.setItem('aoe2-theme', value), theme);
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 });
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('#ugrid .unit-row').first()).toBeVisible();
      await expect(page.locator('.unit-zh').first()).toBeVisible();
      const color = await page
        .locator('.unit-zh')
        .first()
        .evaluate((element) => getComputedStyle(element).color);
      expect(color).not.toBe('rgba(0, 0, 0, 0)');
      await page.screenshot({ path: info.outputPath(`units-${width}-${theme}.png`), fullPage: false });
      if (width === 390) {
        await page.locator('.catalog-filter-toggle').click();
        await expect(page.locator('#udlc')).toBeVisible();
        await page.screenshot({ path: info.outputPath(`units-${width}-${theme}-filters.png`), fullPage: false });
      }
    }
  }
});
