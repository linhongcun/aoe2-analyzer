import { expect, test } from '@playwright/test';

test('#1326 验收 1 & 2：亚美尼亚/格鲁吉亚强化教堂预填与不列颠修道院对照均正常计算且可选', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.setViewportSize({ width: 1280, height: 900 });

  // 1a. 亚美尼亚强化教堂两行预填方案（僧侣 125 + 牧师战士 1811）
  await page.goto('./#/production?civ=Armenians&age=3&rows=125%3A1806%3A1%2C1811%3A1806%3A1');
  await expect(page.getByRole('heading', { level: 1, name: '持续生产' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('当前不可用');
  await expect(page.locator('#production-civ')).toHaveAttribute('data-value', 'Armenians');
  await expect(page.getByRole('combobox', { name: '生产时代', exact: true })).toHaveValue('3');

  const armRows = page.getByTestId('production-row');
  await expect(armRows).toHaveCount(2);
  await expect(page.locator('#production-unit-0')).toHaveAttribute('data-value', '125');
  await expect(page.getByRole('combobox', { name: '需求 1 建筑', exact: true })).toHaveValue('1806');
  await expect(armRows.nth(0)).toContainText('51 秒 / 个');

  await expect(page.locator('#production-unit-1')).toHaveAttribute('data-value', '1811');
  await expect(page.getByRole('combobox', { name: '需求 2 建筑', exact: true })).toHaveValue('1806');
  await expect(armRows.nth(1)).toContainText('30 秒 / 个');

  const armTotal = await page.getByTestId('production-total').innerText();
  expect(armTotal).toMatch(/合计 \d+ 人/);
  expect(armTotal).not.toContain('合计 0 人');
  await expect(page.locator('body')).not.toContainText('NaN');

  // 单位选择器中可找到僧侣（125）与牧师战士（1811）
  await page.locator('#production-unit-0').click();
  const armDialog = page.getByRole('dialog', { name: '需求 1 单位', exact: true });
  await armDialog.locator('.cp-q').fill('僧侣');
  await expect(armDialog.locator('[role="option"][data-unit="125"]')).toBeVisible();
  await armDialog.locator('.cp-q').fill('牧师战士');
  await expect(armDialog.locator('[role="option"][data-unit="1811"]')).toBeVisible();
  await page.keyboard.press('Escape');

  // 1b. 格鲁吉亚强化教堂预填方案（僧侣 125）
  await page.goto('./#/production?civ=Georgians&age=3&rows=125%3A1806%3A1');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('当前不可用');
  await expect(page.locator('#production-civ')).toHaveAttribute('data-value', 'Georgians');
  await expect(page.locator('#production-unit-0')).toHaveAttribute('data-value', '125');
  await expect(page.getByRole('combobox', { name: '需求 1 建筑', exact: true })).toHaveValue('1806');
  await expect(page.getByTestId('production-row').first()).toContainText('51 秒 / 个');
  const geoTotal = await page.getByTestId('production-total').innerText();
  expect(geoTotal).toMatch(/合计 \d+ 人/);
  expect(geoTotal).not.toContain('合计 0 人');

  // 格鲁吉亚单位选择器包含僧侣，不包含牧师战士
  await page.locator('#production-unit-0').click();
  const geoDialog = page.getByRole('dialog', { name: '需求 1 单位', exact: true });
  await geoDialog.locator('.cp-q').fill('僧侣');
  await expect(geoDialog.locator('[role="option"][data-unit="125"]')).toBeVisible();
  await geoDialog.locator('.cp-q').fill('牧师战士');
  await expect(geoDialog.locator('[role="option"][data-unit="1811"]')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // 2. 不列颠修道院僧侣对照方案（结果不变，与格鲁吉亚单座强化教堂僧侣一致）
  await page.goto('./#/production?civ=Britons&age=3&rows=125%3A104%3A1');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('当前不可用');
  await expect(page.locator('#production-civ')).toHaveAttribute('data-value', 'Britons');
  await expect(page.locator('#production-unit-0')).toHaveAttribute('data-value', '125');
  await expect(page.getByRole('combobox', { name: '需求 1 建筑', exact: true })).toHaveValue('104');
  await expect(page.getByTestId('production-row').first()).toContainText('51 秒 / 个');
  await expect(page.getByTestId('production-total')).toHaveText(geoTotal);

  expect(errors).toEqual([]);
});

test('#1326 验收 3 & 4：非法强化教堂/修道院组合仍被拒绝，训练总价与阵容新增费用同步放行', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.setViewportSize({ width: 1280, height: 900 });

  // 验收 3：拒绝未达时代、他文明选强化教堂、亚美尼亚/格鲁吉亚选修道院、格鲁吉亚选牧师战士
  for (const path of [
    '/production?civ=Armenians&age=2&rows=125%3A1806%3A1',
    '/production?civ=Britons&age=3&rows=125%3A1806%3A1',
    '/production?civ=Armenians&age=3&rows=125%3A104%3A1',
    '/production?civ=Georgians&age=3&rows=125%3A104%3A1',
    '/production?civ=Georgians&age=3&rows=1811%3A1806%3A1',
  ]) {
    await page.goto('./#' + path);
    await expect(page.getByRole('alert'), path).toContainText('当前方案无法计算');
    await expect(page.getByTestId('production-total'), path).toHaveCount(0);
  }

  // 验收 4a：训练总价里亚美尼亚城堡时代牧师战士与僧侣正常计入总价
  await page.goto('./#/production?mode=train-total&civ=Armenians&age=3&units=1811:5,125:2');
  await expect(page.getByRole('heading', { level: 1, name: '训练总价' })).toBeVisible();
  await expect(page.getByTestId('train-total-result')).toContainText('训练总价');
  await expect(page.getByTestId('train-total-result')).not.toContainText('当前条件下不可训练');
  await expect(page.getByTestId('train-total-result')).not.toContainText('部分训练费用');
  await expect(page.getByTestId('train-total-resource-Food')).toContainText('200');
  await expect(page.getByTestId('train-total-resource-Gold')).toContainText('450');

  // 验收 4b：阵容新增费用里亚美尼亚城堡时代牧师战士可用并产出正确训练费用
  const armyQuery = new URLSearchParams({
    mode: 'army-cost',
    acv: '1',
    acdata: '188329',
    civ: 'Armenians',
    age: '3',
    acunits: JSON.stringify([{ unit: 1811, qty: '5' }]),
    acdone: '[]',
    actargets: '[]',
  }).toString();
  await page.goto('./#/production?' + armyQuery);
  await expect(page.getByTestId('army-cost-page')).toBeVisible();
  await expect(page.locator('main')).not.toContainText('当前文明、时代或必要解锁条件下不可训练');
  await expect(page.locator('main')).toContainText('200');
  await expect(page.locator('main')).toContainText('250');

  expect(errors).toEqual([]);
});
