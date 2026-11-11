import { expect, test, type Page } from '@playwright/test';
import units from '../../src/data/units.json' with { type: 'json' };

const militia = units.find((unit) => unit.id === 74)!;
const ram = units.find((unit) => unit.id === 1258)!;
const siegeRam = units.find((unit) => unit.id === 548)!;
const mangudai = units.find((unit) => unit.id === 11)!;
const elite = units.find((unit) => unit.id === 561)!;
const trebuchet = units.find((unit) => unit.id === 331)!;
const knight = units.find((unit) => unit.id === 38)!;
const BASIS = '生命、攻击、近战护甲、远程护甲、射程和造价是目录基础值，不是满科技或折后结果。';

async function chooseCiv(page: Page, en: string) {
  await page.locator('#uciv').click();
  const dialog = page.getByRole('dialog', { name: '可用文明', exact: true });
  await dialog.getByRole('combobox').fill(en);
  await dialog.locator(`[role="option"][data-civ="${en}"]`).click();
  await expect(dialog).toHaveCount(0);
}

async function noPageScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('#932 1280：护甲列、零值与目录口径', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('./#/units');
  await expect(page.locator('#ugrid .unit-row').first()).toBeVisible();
  await expect(page.getByText(BASIS)).toBeVisible();
  await expect(page.locator('.unit-head')).toBeVisible();
  await expect(page.locator('.unit-head svg')).toHaveCount(0);
  await expect(page.locator('.unit-head button')).toHaveCount(0);
  const heads = (await page.locator('.unit-head span').allTextContents()).map((text) => text.trim()).filter(Boolean);
  expect(heads).toEqual(['单位', '生产 / 时代', '造价', '生命', '攻击', '近战护甲', '远程护甲', '射程']);
  for (const label of ['近战护甲', '远程护甲']) {
    const span = page.locator('.unit-head').getByText(label, { exact: true });
    await expect(span).toBeVisible();
    expect(await span.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  }

  const first = page.locator('#ugrid .unit-row').first();
  const order = await first.evaluate((row) => {
    const x = (stat: string) => row.querySelector(`[data-stat="${stat}"]`)!.getBoundingClientRect().x;
    return { hp: x('hp'), atk: x('atk'), ma: x('ma'), pa: x('pa'), rng: x('rng') };
  });
  expect(order.hp).toBeLessThan(order.atk);
  expect(order.atk).toBeLessThan(order.ma);
  expect(order.ma).toBeLessThan(order.pa);
  expect(order.pa).toBeLessThan(order.rng);
  for (const part of ['.unit-zh', '.unit-meta', '.unit-cost']) {
    const box = await first.locator(part).boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(48);
  }
  expect(await first.evaluate((element) => element.getBoundingClientRect().right <= window.innerWidth + 1)).toBe(true);
  await noPageScroll(page);
  await page.locator('.unit-head').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('units-932-1280.png'), fullPage: false });

  await page.locator('#uq').fill('民兵');
  const militiaRow = page.locator('#ugrid .unit-row[data-unit-id="74"]');
  await expect(militiaRow.locator('[data-stat="ma"] dd')).toHaveText('0');
  await expect(militiaRow.locator('[data-stat="pa"] dd')).toHaveText(String(militia.pa));
  expect(militia.ma).toBe(0);

  await page.locator('#uq').fill('攻城锤');
  const ramRow = page.locator('#ugrid .unit-row[data-unit-id="1258"]');
  await expect(ramRow).toHaveCount(1);
  await expect(ramRow.locator('[data-stat="ma"] dd')).toHaveText(String(ram.ma));
  await expect(ramRow.locator('[data-stat="pa"] dd')).toHaveText(String(ram.pa));
  expect(ram.ma).toBeLessThan(0);

  await page.locator('#uq').fill('重型冲车');
  const siegeRow = page.locator('#ugrid .unit-row[data-unit-id="548"]');
  await expect(siegeRow).toHaveCount(1);
  await expect(siegeRow.locator('[data-stat="ma"] dd')).toHaveText(String(siegeRam.ma));
  await expect(siegeRow.locator('[data-stat="pa"] dd')).toHaveText(String(siegeRam.pa));
  expect(siegeRam.pa).toBeGreaterThanOrEqual(100);

  await page.locator('#uq').fill('蒙古突骑');
  const baseRow = page.locator('#ugrid .unit-row[data-unit-id="11"]');
  await expect(baseRow).toHaveCount(1);
  await expect(baseRow.locator('.elite-mark')).toHaveText('含精锐');
  await expect(baseRow.locator('[data-stat="ma"] dd')).toHaveText(String(mangudai.ma));
  await expect(baseRow.locator('[data-stat="pa"] dd')).toHaveText(String(mangudai.pa));
  await expect(baseRow.locator('[data-stat="hp"] dd')).toHaveText(String(mangudai.hp));

  await page.locator('#uq').fill('精锐蒙古突骑');
  const eliteRow = page.locator('#ugrid .unit-row[data-unit-id="561"]');
  await expect(eliteRow).toHaveCount(1);
  await expect(eliteRow.locator('.elite-mark')).toHaveCount(0);
  await expect(eliteRow.locator('[data-stat="ma"] dd')).toHaveText(String(elite.ma));
  await expect(eliteRow.locator('[data-stat="pa"] dd')).toHaveText(String(elite.pa));
  await expect(eliteRow.locator('[data-stat="atk"] dd')).toHaveText(String(elite.atk));

  await page.locator('#uq').fill('巨型投石机');
  const trebuchetRow = page.locator('#ugrid .unit-row[data-unit-id="331"]');
  await expect(trebuchetRow).toHaveCount(1);
  await expect(trebuchetRow).not.toContainText('打包');
  await expect(trebuchetRow).not.toContainText('展开');
  await expect(trebuchetRow.locator('[data-stat="ma"] dd')).toHaveText(String(trebuchet.ma));
  await expect(trebuchetRow.locator('[data-stat="pa"] dd')).toHaveText(String(trebuchet.pa));
  await expect(trebuchetRow.locator('[data-stat="atk"] dd')).toHaveText(String(trebuchet.atk));
  await expect(trebuchetRow.locator('[data-stat="rng"] dd')).toHaveText(String(trebuchet.rng));

  await page.getByRole('button', { name: '清空筛选', exact: true }).click();
  await chooseCiv(page, 'Teutons');
  await page.locator('#uq').fill('骑士');
  const knightRow = page.locator('#ugrid .unit-row[data-unit-id="38"]');
  await expect(knightRow.locator('[data-stat="ma"] dd')).toHaveText(String(knight.ma));
  await expect(knightRow.locator('[data-stat="pa"] dd')).toHaveText(String(knight.pa));
  expect(new URL(page.url()).hash).toBe('#/units');
  await expect(page.getByRole('button', { name: /护甲/ })).toHaveCount(0);

  await page.getByRole('button', { name: '清空筛选', exact: true }).click();
  await page.getByRole('group', { name: '时代快捷筛选' }).getByRole('button', { name: '城堡', exact: true }).click();
  const aged = page.locator('#ugrid .unit-row').first();
  await expect(aged).toBeVisible();
  const agedId = Number(await aged.getAttribute('data-unit-id'));
  const agedUnit = units.find((unit) => unit.id === agedId)!;
  await expect(aged.locator('[data-stat="ma"] dd')).toHaveText(String(agedUnit.ma));
  await expect(aged.locator('[data-stat="pa"] dd')).toHaveText(String(agedUnit.pa));
  expect(new URL(page.url()).hash).toBe('#/units');

  await page.getByRole('button', { name: '清空筛选', exact: true }).click();
  await page.locator('#uq').fill('民兵');
  await militiaRow.click();
  await expect(page).toHaveURL(/#\/unit\/74$/);
  await expect(page.locator('.ud-stat[data-stat="ma"] .ud-stat-lab')).toContainText('近战护甲');
  await expect(page.locator('.ud-stat[data-stat="pa"] .ud-stat-lab')).toContainText('穿刺护甲');
  await expect(page.locator('.ud-stat[data-stat="pa"] .ud-stat-lab')).not.toContainText('远程护甲');
  await expect(page.locator('.ud-stat[data-stat="ma"] .ud-stat-val')).toHaveText(String(militia.ma));
  await expect(page.locator('.ud-stat[data-stat="pa"] .ud-stat-val')).toHaveText(String(militia.pa));
  expect(errors).toEqual([]);
});

test('#932 390：行内护甲标签自然换行', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/units');
  await expect(page.locator('#ugrid .unit-row').first()).toBeVisible();
  await expect(page.locator('.unit-head')).toBeHidden();
  await page.locator('#uq').fill('民兵');
  const row = page.locator('#ugrid .unit-row[data-unit-id="74"]');
  await expect(row).toBeVisible();
  for (const label of ['生命', '攻击', '近战护甲', '远程护甲', '射程']) {
    const stat = row.locator('.stat-label', { hasText: label });
    await expect(stat).toBeVisible();
    await expect(stat).toHaveText(label);
    const style = await stat.evaluate((element) => getComputedStyle(element));
    expect(style.position).toBe('static');
    expect(style.fontSize).toBe('13px');
  }
  await expect(row.locator('[data-stat="ma"] dd')).toHaveText('0');
  await expect(row.locator('[data-stat="pa"] dd')).toHaveText(String(militia.pa));
  expect(await row.locator('.unit-stats').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect(await row.evaluate((element) => element.getBoundingClientRect().right <= window.innerWidth + 1)).toBe(true);
  await noPageScroll(page);
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('units-932-390.png'), fullPage: false });
});
