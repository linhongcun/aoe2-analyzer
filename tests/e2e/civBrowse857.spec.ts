import { expect, test, type Page } from '@playwright/test';
import civs from '../../src/data/civs.json' with { type: 'json' };

const errors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') messages.push(message.text());
  });
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

async function fontSize(page: Page, selector: string) {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
}

test('名称、版本和骑士一起筛选，速览使用真实加成', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./#/civs');
  await expect(page.locator('#grid .card')).toHaveCount(civs.length);
  await expect(page.locator('#filter-panel')).toBeHidden();
  expect(await fontSize(page, '.civ-uu')).toBe(14);
  expect(await fontSize(page, '.civ-en')).toBeGreaterThanOrEqual(12);

  await page.getByRole('button', { name: '按条件筛选', exact: true }).click();
  expect(await fontSize(page, '.civ-field-label')).toBeGreaterThanOrEqual(12);
  expect(await fontSize(page, '.civ-help')).toBeGreaterThanOrEqual(12);
  await page.locator('#dlc').selectOption({ label: '西方霸主' });
  await page.locator('#option-search').fill('骑士');
  await expect(page.locator('#option-search')).toHaveValue('骑士');
  await page.getByRole('checkbox', { name: '添加单位 骑士', exact: true }).check();
  await expect.poll(() => page.locator('#grid .card').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-civ')).sort())).toEqual([
    'Burgundians',
    'Sicilians',
  ]);
  await page.getByRole('button', { name: '移除 DLC 西方霸主', exact: true }).click();
  await expect(page.locator('#option-search')).toHaveValue('骑士');
  await expect(page.locator('#dlc')).toHaveValue('');

  await page.getByRole('button', { name: '重置全部', exact: true }).click();
  await expect(page.locator('#option-search')).toHaveValue('');
  await expect(page.locator('#cnt')).toHaveText(`${civs.length} / ${civs.length}`);
  await expect(page.getByTestId('requirement-chip')).toHaveCount(0);

  const franks = civs.find((civ) => civ.en === 'Franks');
  await page.locator('#grid .card[data-civ="Franks"]').click();
  const preview = page.getByRole('complementary', { name: '文明速览' });
  await expect(preview).toContainText(franks?.bon[0] ?? '');
  await expect(preview).not.toContainText('边位');
  await expect(preview).not.toContainText('口袋');
  await preview.getByRole('link', { name: '打开完整文明资料' }).click();
  await expect(page.locator('#detail h1')).toContainText('法兰克');
});

test('360 宽条件栏盖住结果时仍可收起，文字不低于交接字号', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('./#/civs');
  await expect(page.locator('#grid .card').first()).toBeVisible();
  expect(await fontSize(page, '.civ-uu')).toBe(14);
  expect(await fontSize(page, '.civ-en')).toBeGreaterThanOrEqual(12);
  await page.getByRole('button', { name: '按条件筛选', exact: true }).click();
  await expect(page.locator('#filter-panel')).toBeVisible();
  expect(await fontSize(page, '.civ-help')).toBeGreaterThanOrEqual(12);
  await page.keyboard.press('Escape');
  await expect(page.locator('#filter-panel')).toBeHidden();
  await expect(page.locator('#grid .card').first()).toBeVisible();
});
