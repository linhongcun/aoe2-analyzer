import { expect, test } from '@playwright/test';

/** #107 草案：PK 结果卡显示双方损失资源与交换比（数值推导见 tests/unit/v080-107.test.ts） */
const trade = (p: import('@playwright/test').Page) => p.locator('#duel-res [data-t="pk-trade"]');

test('#107 N vs M 10v10 法兰克游侠 vs 日本长戟兵：A 损失 405，B 损失 600，交换比 1.48', async ({ page }) => {
  await page.goto('#/duel?a=569.Franks.4.f.&b=359.Japanese.4.f.&m=n&na=10&nb=10');
  await expect(trade(page)).toBeVisible();
  await expect(trade(page)).toContainText('405');
  await expect(trade(page)).toContainText('600');
  await expect(trade(page)).toContainText('1.48');
});
test('#107 等资源 3000 拜占庭长戟兵 vs 法兰克游侠：按折后价 A 损失 405，B 损失 2970，交换比 7.33', async ({ page }) => {
  await page.goto('#/duel?a=359.Byzantines.4.f.&b=569.Franks.4.f.&m=r&bud=3000');
  await expect(trade(page)).toContainText('405');
  await expect(trade(page)).toContainText('2970');
  await expect(trade(page)).toContainText('7.33');
  await expect(trade(page)).not.toContainText('406');
});
test('#107 一方零损失时不出 Infinity / NaN', async ({ page }) => {
  await page.goto('#/duel?a=6.Byzantines.4.f.&b=569.Franks.4.f.&m=n&na=10&nb=10');
  await expect(trade(page)).toContainText('450');
  await expect(trade(page)).not.toContainText(/Infinity|NaN/);
});
test('#107 有一方造不了（#124）时不出交换比', async ({ page }) => {
  await page.goto('#/duel?a=39.Franks.3.f.&b=39.Magyars.3.f.&m=r&bud=3000');
  await expect(page.locator('[data-t="pk-unavail-a"]')).toBeVisible();
  await expect(page.locator('[data-t="pk-trade"]')).toHaveCount(0);
});
