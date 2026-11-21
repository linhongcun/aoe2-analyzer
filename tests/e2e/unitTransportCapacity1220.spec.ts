import { expect, test } from '@playwright/test';

const capacity = '[data-t="unit-capacity"]';

for (const width of [360, 1280]) {
  test(`#1220 ${width}px 运输船基础容量和萨拉森加成分别显示`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./#/unit/545');
    const card = page.locator(`#unit-core .ud-stats ${capacity}`);
    const value = card.locator('.ud-capacity-row').first().locator('dd');
    const bonus = card.locator('.ud-capacity-bonus');
    await expect(card.getByText('基础容量', { exact: true })).toBeVisible();
    await expect(value).toHaveText('20');
    await expect(value).toHaveCSS('white-space', 'nowrap');
    await expect(card).toContainText('本单位的基础载量，不含文明加成。');
    await expect(bonus).toHaveCount(0);

    const gridBox = (await page.locator('#unit-core .ud-stat-grid').boundingBox())!;
    const cardBox = (await card.boundingBox())!;
    const costBox = (await page.locator('#unit-core .ud-cost-col').boundingBox())!;
    expect(cardBox.y).toBeGreaterThanOrEqual(gridBox.y + gridBox.height);
    if (width === 360) expect(costBox.y).toBeGreaterThanOrEqual(cardBox.y + cardBox.height);
    else expect(costBox.x).toBeGreaterThanOrEqual(cardBox.x + cardBox.width);

    for (const civ of ['Britons', 'Saracens', '__none']) {
      await page.locator('#unitciv').click();
      await page.getByRole('dialog', { name: '选择文明' }).locator(`[role="option"][data-civ="${civ}"]`).click();
      await expect(value).toHaveText('20');
      if (civ === 'Saracens') {
        await expect(bonus).toContainText('萨拉森文明加成');
        await expect(bonus.locator('dd')).toHaveText('运载量 +20');
        await expect(bonus.locator('.num.nw')).toHaveCSS('white-space', 'nowrap');
      } else {
        await expect(bonus).toHaveCount(0);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('#1220 攻城载具按形态显示容量，建筑驻军独立，非载具不展示', async ({ page }) => {
  await page.goto('./#/unit/1258?civ=Britons');
  await expect(page.locator(capacity).locator('dd')).toHaveText('6');
  const garrison = page.getByRole('region', { name: '驻军' });
  await expect(garrison).toContainText('攻城锤在不列颠没有可从外部进入的驻军建筑。');
  await expect(garrison.locator(capacity)).toHaveCount(0);

  const obtain = page.getByRole('region', { name: '如何获得与升级' });
  for (const { id, name } of [
    { id: 422, name: '中型冲车' },
    { id: 548, name: '重型冲车' },
  ]) {
    await obtain.getByRole('link', { name: new RegExp(name) }).click();
    await expect(page).toHaveURL(new RegExp(`#/unit/${id}$`));
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.locator(capacity).locator('dd')).toHaveText('6');
  }

  await page.goto('./#/unit/1105?civ=Saracens');
  await expect(page.locator(capacity).locator('dd')).toHaveText('10');
  for (const id of [207, 329, 330, 1755, 74]) {
    await page.goto(`./#/unit/${id}`);
    await expect(page.locator('#unit-core')).toBeVisible();
    await expect(page.locator(capacity)).toHaveCount(0);
  }
});
