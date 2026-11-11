// #895 单位详情信息架构。只覆盖 issue 点名的地址、折后价和有限代表单位，不是全单位验收。
import { expect, test } from '@playwright/test';

async function open(page: import('@playwright/test').Page, hash: string) {
  await page.goto('./#' + hash);
  await expect(page.locator('#unit h1')).toBeVisible();
}

test('无文明、查询文明和路径文明都停在概览，不写成 /4/', async ({ page }) => {
  await open(page, '/unit/38');
  await expect(page.locator('#unit')).toHaveAttribute('data-view', 'overview');
  await expect(page.locator('#sim')).toHaveCount(0);
  await expect(page.locator('[data-stat="hp"] .num')).toHaveText('100');
  await expect(page.locator('[data-t="catalog-cost"]')).toContainText('60');
  await expect(page.locator('[data-t="discount-price"], [data-t="discount-unapplied"]')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/unit\/38$/);

  await open(page, '/unit/38?civ=Franks');
  await expect(page.locator('#unit')).toHaveAttribute('data-view', 'overview');
  await expect(page.locator('#sim')).toHaveCount(0);
  await expect(page.locator('[data-stat="hp"] .num')).toHaveText('100');
  await expect(page).toHaveURL(/civ=Franks/);
  await expect(page).not.toHaveURL(/\/Franks\/4/);

  await open(page, '/unit/38/Franks');
  await expect(page.locator('#unit')).toHaveAttribute('data-view', 'overview');
  await expect(page.locator('#sim')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/unit\/38\/Franks$/);
  await expect(page.locator('[data-t="catalog-cost"]')).toContainText('75');
});

test('已编码时代和 tab=sim 打开工作区，tab=ov 留在概览且路径不变', async ({ page }) => {
  await open(page, '/unit/38/Franks/4/');
  await expect(page.locator('#sim .simtab')).toBeVisible();
  await expect(page.locator('.simtab th').nth(2)).toHaveText('当前设置下的近似模拟值');
  await expect(page.locator('#sim')).not.toContainText('暂未计算');
  await expect(page.locator('#unit')).not.toContainText('最终值');
  await expect(page.locator('#unit')).not.toContainText('最终属性');

  await open(page, '/unit/38/Franks?tab=sim');
  await expect(page.locator('#sim .simtab')).toBeVisible();
  await expect(page).toHaveURL(/\/unit\/38\/Franks\?tab=sim/);
  await expect(page).not.toHaveURL(/\/4\//);

  await open(page, '/unit/38/Franks/4/39/?tab=ov');
  await expect(page.locator('#sim')).toHaveCount(0);
  await expect(page).toHaveURL(/\/unit\/38\/Franks\/4\/39\/\?tab=ov/);
  await page.getByRole('button', { name: '打开科技模拟器' }).click();
  await expect(page.locator('#sim .simtab')).toBeVisible();
  await expect(page).toHaveURL(/\/unit\/38\/Franks\/4\/39\/\?/);
  await expect(page).toHaveURL(/tab=sim/);
  await page.getByRole('button', { name: '返回概览' }).click();
  await expect(page.locator('#sim')).toHaveCount(0);
  await expect(page).toHaveURL(/\/unit\/38\/Franks\/4\/39\//);
  await expect(page).toHaveURL(/tab=ov/);
});

test('精锐切换和旧相关地址保留文明与查询', async ({ page }) => {
  await open(page, '/unit/11?civ=Mongols&tab=sim&me=Mongols&opp=Britons');
  await expect(page.locator('#sim')).toBeVisible();
  await page.locator('.eseg a', { hasText: '精锐' }).click();
  await expect(page).toHaveURL(/\/unit\/561\?/);
  await expect(page).toHaveURL(/civ=Mongols/);
  await expect(page).toHaveURL(/tab=sim/);
  await expect(page).toHaveURL(/me=Mongols/);
  await expect(page).toHaveURL(/opp=Britons/);
  await expect(page.locator('#unit h1')).toContainText('精锐蒙古突骑');

  await open(page, '/unit/38?tab=rel');
  await expect(page.locator('#unit-related')).toBeInViewport();
  await expect(page.locator('[data-t="unit-related-techs"]')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: '鲜为人知' })).toHaveCount(0);
});

test('拜占庭长戟兵给出真实折后价，未选文明没有折后价卡', async ({ page }) => {
  await open(page, '/unit/359?civ=Byzantines');
  await expect(page.locator('[data-t="catalog-cost"]')).toContainText('35');
  await expect(page.locator('[data-t="catalog-cost"]')).toContainText('25');
  const discount = page.locator('[data-t="discount-price"]');
  await expect(discount).toContainText('26');
  await expect(discount).toContainText('19');
  await expect(discount).toContainText('已计入');
  await expect(page.locator('#unit')).not.toContainText('暂未计算');

  await open(page, '/unit/359');
  await expect(page.locator('[data-t="discount-price"], [data-t="discount-unapplied"]')).toHaveCount(0);
});

test('代表单位与特殊边界只按已核口径出现', async ({ page }) => {
  await open(page, '/unit/11');
  await expect(page.locator('#unit h1')).toContainText('蒙古突骑');
  await expect(page.locator('[data-stat="hp"] .num')).toHaveText('60');
  await expect(page.locator('[data-stat="atk"]')).toContainText('6');
  await expect(page.locator('[data-t="unit-type"]')).toHaveText('独特单位');

  await open(page, '/unit/561');
  await expect(page.locator('[data-stat="atk"]')).toContainText('8');
  await expect(page.locator('#ediff')).toBeVisible();

  await open(page, '/unit/38');
  await expect(page.locator('#unit-obtain')).toContainText('游侠');
  await expect(page.locator('[data-t="upgrade-note"]')).toContainText('另有独特升级：萨瓦尔');

  await open(page, '/unit/38/Persians');
  await expect(page.locator('#unit-obtain')).toContainText('萨瓦尔');
  await expect(page.locator('[data-t="upgrade-note"]')).toContainText('该文明没有游侠这一升级形态');
  await expect(page.locator('#unit-obtain')).not.toContainText('没有本单位');

  await open(page, '/unit/2700/Portuguese');
  await expect(page.locator('#unit h1')).toContainText('骑马弩兵');
  await expect(page.locator('[data-t="upgrade-note"]')).toContainText('该文明没有重装骑马弩兵这一升级形态');
  await expect(page.locator('#unit')).not.toContainText('没有本单位');

  await open(page, '/unit/691');
  await expect(page.locator('#unit h1')).toContainText('精锐炮舰');
  await expect(page.locator('[data-t="unit-type"]')).toHaveCount(0);

  await open(page, '/unit/93');
  await expect(page.locator('[data-t="display-age"]')).toContainText('封建时代');
  await expect(page.locator('[data-t="spear-age"]')).toContainText('亚美尼亚可在黑暗时代训练长矛兵');
  await expect(page.locator('#unit-obtain')).not.toContainText('封建时代');
  await expect(page.locator('#unit-obtain')).not.toContainText('黑暗时代');

  await open(page, '/unit/38?civ=Aztecs');
  await expect(page.locator('[data-t="cannot-train"]')).toHaveText('该文明无法训练本单位');
  await expect(page.locator('[data-stat="hp"] .num')).toHaveText('100');
  await expect(page.locator('[data-t="discount-price"]')).toHaveCount(0);

  await page.locator('#unitciv').click();
  await expect.poll(async () => page.locator('.cp-panel [role="option"]').count()).toBeGreaterThan(40);
  await page.keyboard.press('Escape');
  await expect(page.locator('#unit').getByRole('link', { name: '单位 PK' })).toHaveCount(0);
  await expect(page.locator('#unit')).not.toContainText('在现网打开');
});

test('1280 第一屏能看到身份、生命和目录造价，390 能看到生命攻击护甲', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, '/unit/11');
  const hp = await page.locator('[data-stat="hp"]').boundingBox();
  const cost = await page.locator('[data-t="catalog-cost"]').boundingBox();
  expect(hp!.y).toBeLessThan(900);
  expect(cost!.y).toBeLessThan(900);

  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '/unit/11');
  for (const stat of ['hp', 'atk', 'ma', 'pa']) {
    const box = await page.locator(`[data-stat="${stat}"]`).boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  }
});

test('工作区给出引擎算出的近似模拟值', async ({ page }) => {
  await open(page, '/unit/569/Franks/4/');
  await page.getByRole('button', { name: '满科技' }).click();
  await expect(page.locator('.simtab tr').nth(1).locator('td').nth(2)).toHaveText('192');
  await expect(page.locator('#sim')).toContainText('当前设置下的近似模拟值');
  await expect(page.locator('#sim')).toContainText('不计入');
  await expect(page.locator('#unit')).not.toContainText('暂未计算');
});
