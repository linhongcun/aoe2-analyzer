import { expect, test, type Page } from '@playwright/test';

async function chooseCiv(page: Page, picker: string, label: string, civ: string) {
  await page.locator(picker).click();
  const dialog = page.getByRole('dialog', { name: label, exact: true });
  const search = dialog.getByRole('combobox');
  await search.fill(civ);
  await expect(dialog.locator(`[role="option"][data-civ="${civ}"]`)).toBeVisible();
  await search.press('Enter');
  await expect(dialog).toHaveCount(0);
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('#1230 僧侣无文明的例外、不列颠正反查和切换文明', async ({ page }) => {
  await page.goto('./#/units');
  await page.locator('#uq').fill('Monk');
  const row = page.locator('.unit-row[data-unit-id="125"]');
  await expect(row.locator('.unit-meta')).toContainText('通常：修道院');
  await expect(row.locator('.unit-training-condition')).toHaveText('亚美尼亚、格鲁吉亚：强化教堂');
  await expect(row).toHaveAttribute('href', '#/unit/125');
  await expect(row.locator('a')).toHaveCount(0);
  await row.press('Enter');
  const obtain = page.locator('#unit-obtain');
  await expect(obtain.getByRole('link', { name: '修道院', exact: true })).toHaveAttribute('href', '#/building/104');
  await expect(obtain.locator('a[href="#/building/1806?civ=Armenians"]')).toBeVisible();
  await expect(obtain.locator('a[href="#/building/1806?civ=Georgians"]')).toBeVisible();
  await chooseCiv(page, '#unitciv', '选择文明', 'Britons');
  await expect(page.locator('.ud-tags').getByRole('link', { name: '修道院', exact: true })).toHaveAttribute('href', '#/building/104?civ=Britons');
  await expect(obtain.locator('.ud-training-condition')).toHaveCount(0);
  await obtain.getByRole('link', { name: '修道院', exact: true }).click();
  await expect(page).toHaveURL(/#\/building\/104\?civ=Britons$/);
  const monk = page.locator('#building-prod').getByRole('link', { name: '僧侣', exact: true });
  await expect(monk).toHaveAttribute('href', '#/unit/125?civ=Britons');
  await expect(monk.locator('xpath=..').locator('xpath=..')).toContainText('目录含有');
  await monk.click();
  await chooseCiv(page, '#unitciv', '选择文明', 'Georgians');
  await expect(obtain.getByRole('link', { name: '强化教堂', exact: true })).toHaveAttribute('href', '#/building/1806?civ=Georgians');
  await expect(obtain.getByRole('link', { name: '修道院', exact: true })).toHaveCount(0);
  await expectNoOverflow(page);
});

test('#1230 390px 强化教堂的文明反查、牧师战士和无效文明', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));
  await page.goto('./#/building/1806?civ=Armenians');
  const products = page.locator('#building-prod');
  const monk = products.getByRole('link', { name: '僧侣', exact: true });
  const priest = products.getByRole('link', { name: '牧师战士', exact: true });
  await expect(monk).toHaveAttribute('href', '#/unit/125?civ=Armenians');
  await expect(priest).toHaveAttribute('href', '#/unit/1811?civ=Armenians');
  await expectNoOverflow(page);
  await priest.press('Enter');
  const obtain = page.locator('#unit-obtain');
  await expect(obtain.getByRole('link', { name: '强化教堂', exact: true })).toHaveAttribute('href', '#/building/1806?civ=Armenians');
  await expect(obtain.getByRole('link', { name: '修道院', exact: true })).toHaveCount(0);
  await chooseCiv(page, '#unitciv', '选择文明', 'Georgians');
  await expect(obtain).toContainText('当前文明无法训练这个单位');
  await expect(obtain.getByRole('link', { name: '强化教堂', exact: true })).toHaveCount(0);
  await page.goto('./#/building/1806?civ=Georgians');
  await expect(monk).toHaveAttribute('href', '#/unit/125?civ=Georgians');
  await expect(priest).toHaveCount(0);
  await page.goto('./#/building/1806?civ=Britons');
  await expect(products.getByRole('heading', { name: '生产', exact: true })).toBeVisible();
  await expect(page.locator('[data-t="civ-scope"]')).toContainText('不列颠没有这座建筑');
  await expect(monk).toHaveCount(0);
  await expect(priest).toHaveCount(0);
  await page.goto('./#/units');
  await page.locator('#uq').fill('Warrior Priest');
  await chooseCiv(page, '#uciv', '可用文明', 'Georgians');
  await expect(page.locator('.unit-row[data-unit-id="1811"]')).toHaveCount(0);
  await chooseCiv(page, '#uciv', '可用文明', 'Armenians');
  await expect(page.locator('.unit-row[data-unit-id="1811"] .unit-meta')).toContainText('强化教堂');
  await expectNoOverflow(page);
});

for (const spec of [
  {
    civ: 'Goths',
    normal: 41,
    elite: 555,
    alternate: 759,
    altElite: 761,
    building: 12,
    technology: 16,
    zh: '近卫军',
    en: 'Huskarl',
    place: '兵营',
    research: '无政府',
    width: 1280,
  },
  {
    civ: 'Huns',
    normal: 755,
    elite: 757,
    alternate: 886,
    altElite: 887,
    building: 101,
    technology: 483,
    zh: '答刺罕骑兵',
    en: 'Tarkan',
    place: '马厩',
    research: '掠夺者',
    width: 390,
  },
]) {
  test(`#1230 ${spec.civ} 目录、科技门槛和两条普通精锐训练分支`, async ({ page }) => {
    const { civ, normal, elite, alternate, altElite, building, technology, zh, en, place, research, width } = spec;
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./#/units');
    await page.locator('#uq').fill(en);
    const row = page.locator('#ugrid .unit-row');
    await expect(row).toHaveCount(1);
    await expect(row).toHaveAttribute('href', `#/unit/${normal}`);
    await expect(row.locator('.unit-meta')).toContainText('城堡');
    await expect(row.locator('.unit-training-condition')).toHaveText(`研究${research}后：${place}`);
    await chooseCiv(page, '#uciv', '可用文明', civ);
    await page.locator('#uq').fill(`Elite ${en}`);
    await expect(row).toHaveAttribute('href', `#/unit/${elite}?civ=${civ}`);
    await row.press('Enter');
    const obtain = page.locator('#unit-obtain');
    await expect(obtain.getByRole('link', { name: '城堡', exact: true })).toHaveAttribute('href', `#/building/82?civ=${civ}`);
    const condition = obtain.locator('.ud-training-condition');
    await expect(condition).toContainText(`研究${research}后：`);
    await expect(condition.getByRole('link', { name: research, exact: true })).toHaveAttribute('href', `#/tech/${technology}?civ=${civ}`);
    await expectNoOverflow(page);
    await condition.getByRole('link', { name: place, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`#/building/${building}\\?civ=${civ}$`));
    const products = page.locator('#building-prod');
    const search = products.getByRole('searchbox', { name: '查找生产的名称或拼音' });
    await search.fill(en);
    const ordinary = products.getByRole('link', { name: zh, exact: true });
    const upgraded = products.getByRole('link', { name: `精锐${zh}`, exact: true });
    await expect(ordinary).toHaveAttribute('href', `#/unit/${alternate}?civ=${civ}`);
    await expect(upgraded).toHaveAttribute('href', `#/unit/${altElite}?civ=${civ}`);
    await expect(products.locator('.bd-training-condition')).toContainText(research);
    await expectNoOverflow(page);
    await ordinary.press('Enter');
    await page.getByRole('radio', { name: '精锐' }).click();
    await expect(page).toHaveURL(new RegExp(`#/unit/${altElite}\\?civ=${civ}$`));
    await expect(obtain.locator('.ud-training-condition')).toContainText(research);
    await obtain.getByRole('link', { name: '城堡', exact: true }).click();
    await expect(ordinary).toHaveAttribute('href', `#/unit/${normal}?civ=${civ}`);
    await expect(upgraded).toHaveAttribute('href', `#/unit/${elite}?civ=${civ}`);
    await expect(ordinary.locator('xpath=..').locator('xpath=..')).not.toContainText(research);
  });
}
