import { expect, test, type Page } from '@playwright/test';

/** #24 PK 等资源 · 文明训练费用加成（Steve 终版口径 + Jony 勘误 6115003915） */
const open = async (page: Page, q: string) => {
  await page.goto(`#/duel?m=r&bud=3000&${q}`);
  await expect(page.locator('[data-t="pk-cost-a"]')).toBeVisible();
};
const A = (page: Page) => page.locator('[data-t="pk-cost-a"]');
const B = (page: Page) => page.locator('[data-t="pk-cost-b"]');

for (const w of [1280, 390]) {
  test.describe(`${w}px`, () => {
    test.use({ viewport: { width: w, height: 900 } });

    test('拜占庭长戟 vs 法兰克游侠：26/19 得 66 个，游侠 22 个；已计入点名加成', async ({ page }) => {
      await open(page, 'a=359.Byzantines.4.f.&b=569.Franks.4.f.');
      await expect(A(page).locator('[data-t="pk-res-Food"] .pk-now')).toHaveText('26');
      await expect(A(page).locator('[data-t="pk-res-Wood"] .pk-now')).toHaveText('19');
      await expect(A(page).locator('[data-t="pk-count"] b')).toHaveText('66');
      await expect(A(page).locator('[data-t="pk-applied"]')).toContainText('已计入：拜占庭');
      await expect(A(page).locator('[data-t="pk-applied"]')).toContainText('−25%');
      await expect(B(page).locator('[data-t="pk-count"] b')).toHaveText('22');
      await expect(B(page).locator('[data-t="pk-none"]')).toBeVisible();
      await expect(B(page).locator('[data-t="pk-applied"]')).toHaveCount(0);
      // 已选时代：不显示「按X时代价格」
      await expect(page.locator('[data-t="pk-basis"]')).toHaveCount(0);
      await expect(page.locator('.duel-note')).toContainText('等资源已计入已核实的常驻文明训练费用加成');
      // 页面级横向溢出是已知的 #64（另行修复）；这里只守本功能新增的块不越出视口、不互相遮挡
      for (const loc of [A(page), B(page)]) {
        const bb = (await loc.boundingBox())!;
        expect(bb.x + bb.width).toBeLessThanOrEqual(w);
        const line = (await loc.locator('.pk-line, .pk-none').first().boundingBox())!;
        expect(line.x + line.width).toBeLessThanOrEqual(bb.x + bb.width + 0.5);
      }
    });

    test('柏柏尔骆驼：未选时代按城堡价 30 个并注明；切到帝王 −20%', async ({ page }) => {
      await open(page, 'a=329.Berbers..f.&b=38.Franks..f.');
      await expect(A(page).locator('[data-t="pk-count"] b')).toHaveText('30');
      await expect(A(page).locator('[data-t="pk-applied"]')).toContainText('−15%');
      await expect(A(page).locator('[data-t="pk-basis"]')).toHaveText('· 按城堡时代价格');
      await page.goto('#/duel?m=r&bud=3000&a=329.Berbers.4.f.&b=38.Franks.3.f.');
      await expect(A(page).locator('[data-t="pk-applied"]')).toContainText('−20%');
      await expect(A(page).locator('[data-t="pk-count"] b')).toHaveText('32');
      await expect(A(page).locator('[data-t="pk-basis"]')).toHaveCount(0);
    });

    test('来源浮层：Esc 关闭，含「查看文明加成」', async ({ page }) => {
      await open(page, 'a=441.Magyars.4.f.&b=359.Japanese.4.f.');
      await A(page).locator('[data-t="pk-src-btn"]').click();
      const pop = A(page).locator('[data-t="pk-pop"]');
      await expect(pop).toBeVisible();
      await expect(pop.locator('[data-t="pk-nocost"]')).toContainText('近战攻击升级免费');
      await expect(pop.getByRole('link', { name: /查看文明加成/ })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(pop).toHaveCount(0);
    });
  });
}

test('1v1 模式不显示折后价', async ({ page }) => {
  await page.goto('#/duel?m=1&a=359.Byzantines.4.f.&b=569.Franks.4.f.');
  await expect(page.locator('#duel-res')).toBeVisible();
  await expect(page.locator('[data-t="pk-cost-a"]')).toHaveCount(0);
});
