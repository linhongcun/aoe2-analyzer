import { expect, test } from '@playwright/test';

/** #107：PK 结果卡显示双方损失资源与交换比（Steve 决定 issuecomment-6205718308；数值推导见 tests/unit/v080-107.test.ts） */
const trade = (p: import('@playwright/test').Page) => p.locator('#duel-res [data-t="pk-trade"]');

test('#107 N vs M 10v10 法兰克游侠 vs 日本长戟兵：交换比（A : B）1 : 1.48，合计 405 / 600 加分项', async ({ page }) => {
  await page.goto('#/duel?a=569.Franks.4.f.&b=359.Japanese.4.f.&m=n&na=10&nb=10');
  const t = trade(page);
  await expect(t).toBeVisible();
  await expect(t).toContainText('交换比（A : B）');
  await expect(t).toContainText('1 : 1.48');
  await expect(t).toContainText('A 每损失 1 资源，B 损失 1.48');
  for (const n of ['405', '600', '180', '225', '350', '250']) await expect(t).toContainText(n);
  await expect(t).toContainText('只计阵亡单位');
  await expect(t).toContainText('金按 1:1 计入');
});
test('#107 等资源 3000 拜占庭长戟兵 vs 法兰克游侠：按折后取整价 A 损失 405（食 234），交换比 1 : 7.33', async ({ page }) => {
  await page.goto('#/duel?a=359.Byzantines.4.f.&b=569.Franks.4.f.&m=r&bud=3000');
  const t = trade(page);
  for (const n of ['405', '234', '171', '2970', '1 : 7.33']) await expect(t).toContainText(n);
  await expect(t).not.toContainText('236.25');
});
test('#107 B 方零损失显示「B 无阵亡」，不出「每损失」小字，两条注明照常显示', async ({ page }) => {
  await page.goto('#/duel?a=6.Byzantines.4.f.&b=569.Franks.4.f.&m=n&na=10&nb=10');
  const t = trade(page);
  await expect(t).toContainText('450');
  await expect(t).toContainText('B 无阵亡');
  await expect(t).not.toContainText(/每损失|Infinity|NaN|—|1 : /);
  await expect(t).toContainText('只计阵亡单位');
  await expect(t).toContainText('金按 1:1 计入');
});
test('#107 A 方零损失显示「A 无阵亡」（对调两方），不出「每损失」小字，两条注明照常显示', async ({ page }) => {
  await page.goto('#/duel?a=569.Franks.4.f.&b=6.Byzantines.4.f.&m=n&na=10&nb=10');
  const t = trade(page);
  await expect(t).toContainText('450');
  await expect(t).toContainText('A 无阵亡');
  await expect(t).not.toContainText(/每损失|Infinity|NaN|—|1 : /);
  await expect(t).toContainText('只计阵亡单位');
  await expect(t).toContainText('金按 1:1 计入');
});
test('#107 1v1 模式整行不出', async ({ page }) => {
  await page.goto('#/duel?a=569.Franks.4.f.&b=359.Japanese.4.f.&m=1');
  await expect(page.locator('#duel-res')).toBeVisible();
  await expect(trade(page)).toHaveCount(0);
});
test('#107 有一方造不了（#124）时交换比整行不出', async ({ page }) => {
  await page.goto('#/duel?a=39.Franks.3.f.&b=39.Magyars.3.f.&m=r&bud=3000');
  await expect(page.locator('[data-t="pk-unavail-a"]')).toBeVisible();
  await expect(page.locator('[data-t="pk-trade"]')).toHaveCount(0);
});
test('#107 交换比数字在 360 宽下不换行', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('#/duel?a=569.Franks.4.f.&b=359.Japanese.4.f.&m=n&na=10&nb=10');
  const v = trade(page).locator('[data-t="pk-trade-value"]');
  await expect(v).toHaveText('1 : 1.48');
  const lh = await v.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight) || el.getBoundingClientRect().height);
  expect((await v.boundingBox())!.height).toBeLessThanOrEqual(lh * 1.5);
});
