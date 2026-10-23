import { expect, test } from '@playwright/test';

const REPRO = './#/duel?a=2704.Varangians.4.f.&b=567.Teutons.4.f.&m=1';

for (const width of [360, 375, 390, 1280]) {
  test(`#350 精锐瓦兰吉对条顿冠军 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (e) => {
      if (e.type() === 'error') errors.push(e.text());
    });
    await page.goto(REPRO);
    const res = page.locator('#duel-res');
    await expect(res).toContainText('冠军剑士 获胜');
    await expect(res).toContainText('用时 6s');
    await expect(res).toContainText('剩余生命 10 / 70');
    const lines = page.locator('[data-t="pk-vg-line"]');
    await expect(lines).toHaveCount(3);
    await expect(lines.nth(0)).toHaveAttribute('data-status', 'counted');
    await expect(lines.nth(0)).toContainText('已计入：瓦兰吉人 攻击速度 +25%');
    await expect(lines.nth(0)).toContainText('已反映在攻击间隔 1.6s');
    await expect(lines.nth(1)).toContainText('未计入：瓦兰吉人 产生的黄金 +50%');
    await expect(lines.nth(2)).toContainText('未计入：瓦兰吉人 哥瑟砍（定期投掷斧头）');
    await expect(page.locator('[data-t="pk-vg"]')).not.toContainText('每秒');
    const box = page.locator('[data-t="pk-vg"]');
    await box.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('#350 其他文明只列各自生效的加成', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await page.goto('./#/duel?a=2704.Byzantines.4.f.&b=567.Teutons.4.f.&m=1');
  await expect(page.locator('[data-t="pk-vg-line"]')).toHaveCount(1);
  await expect(page.locator('[data-t="pk-vg"]')).toContainText('未计入：拜占庭 后勤学（践踏伤害）');
  await expect(page.locator('[data-t="pk-vg"]')).not.toContainText('哥瑟砍');

  await page.goto('./#/duel?a=2704.Danes.4.f.&b=567.Teutons.4.f.&m=1');
  await expect(page.locator('[data-id="danes-spd"]')).toContainText('未计入：丹麦人 移动速度 +10%');
  await expect(page.locator('[data-id="danes-hamask"]')).toContainText('哈马思克');
  await expect(page.locator('[data-t="pk-vg"]')).not.toContainText('产生的黄金');

  await page.goto('./#/duel?a=2704.Saxons.4.f.&b=567.Teutons.4.f.&m=1');
  await expect(page.locator('[data-t="pk-vg-line"]')).toHaveCount(1);
  await expect(page.locator('[data-id="sax-shield"]')).toContainText('未计入：撒克逊人 盾墙（成群时额外护甲）');

  await page.goto('./#/duel?a=2704.Vikings.4.f.&b=567.Teutons.4.f.&m=1');
  await expect(page.locator('[data-id="vik-hp"]')).toHaveAttribute('data-status', 'counted');
  await expect(page.locator('[data-id="vik-hp"]')).toContainText('已计入：维京 步兵生命值 +20%');

  await page.goto('./#/duel?a=567.Teutons.4.f.&b=567.Japanese.4.f.&m=1');
  await expect(page.locator('#duel-res')).toBeVisible();
  await expect(page.locator('[data-t="pk-vg"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
