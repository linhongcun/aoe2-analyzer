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
    await expect(res).toContainText('用时 6.5 秒');
    await expect(res).toContainText('剩余生命 10 / 70');
    const lines = page.locator('[data-t="pk-vg-line"]');
    await expect(lines).toHaveCount(2);
    await expect(lines.nth(0)).toHaveAttribute('data-status', 'counted');
    await expect(lines.nth(0)).toContainText('已计入：瓦兰吉人 攻击速度 +25%');
    await expect(lines.nth(0)).toContainText('已反映在攻击间隔 1.6s');
    await expect(lines.nth(1)).toHaveAttribute('data-status', 'counted');
    await expect(lines.nth(1)).toContainText('已计入：瓦兰吉人 产生的黄金 +50%');
    await expect(lines.nth(1)).toContainText('×1.33');
    await expect(page.locator('[data-t="pk-vg"]')).not.toContainText('哥瑟砍');
    await expect(page.locator('[data-t="pk-unmodeled"]')).toHaveCount(0);
    const gold = page.locator('[data-t="pk-vg-gold"]');
    await expect(gold).toHaveCount(1);
    await expect(gold).toHaveAttribute('data-mul', 'civ');
    await expect(gold).toContainText('本场产生黄金');
    await expect(gold).toContainText('约 6.4');
    await expect(page.locator('[data-t="pk-vg"]')).not.toContainText('每秒');
    const box = page.locator('[data-t="pk-vg"]');
    await box.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('#350 其他文明只列各自常驻加成；后勤学/哥瑟砍勾选后统一显示未建模提示', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  // 拜占庭 2704 默认 4.f. 不展示后勤学覆盖与「相关加成是否计入」小标题，仅留默认产金估算
  await page.goto('./#/duel?a=2704.Byzantines.4.f.&b=567.Teutons.4.f.&m=1');
  await expect(page.locator('[data-t="pk-vg-line"]')).toHaveCount(0);
  await expect(page.locator('[data-t="pk-vg"]')).not.toContainText('后勤学');
  await expect(page.locator('[data-t="pk-vg"]')).not.toContainText('相关加成是否计入');
  await expect(page.locator('[data-t="pk-vg"]')).not.toContainText('哥瑟砍');
  await expect(page.locator('[data-t="pk-vg"]')).not.toContainText('产生的黄金 +50%');
  await expect(page.locator('[data-t="pk-unmodeled"]')).toHaveCount(0);
  const byzGold = page.locator('[data-t="pk-vg-gold"]');
  await expect(byzGold).toHaveAttribute('data-mul', 'default');
  await expect(byzGold).toContainText('默认产金');
  await expect(byzGold).toContainText('不含瓦兰吉人');

  // 手动勾选后勤学（61）后在统一未建模卡出现一次，取消后消失
  const ensureTechOpen = async () => {
    const det = page.locator('#duel-a details.duel-tech');
    if (!(await det.evaluate((el) => el.hasAttribute('open')))) {
      await det.locator('> summary').click();
    }
  };
  await ensureTechOpen();
  const logBox = page.locator('#duel-a label.simt').filter({ has: page.getByRole('link', { name: '后勤学', exact: true }) });
  await logBox.locator('input').check();
  await expect(page.locator('[data-t="pk-unmodeled"]')).toContainText('践踏 / 溅射伤害 · 后勤学');
  await expect(page.locator('[data-t="pk-vg-line"]')).toHaveCount(0);
  await logBox.locator('input').uncheck();
  await expect(page.locator('[data-t="pk-unmodeled"]')).toHaveCount(0);

  // 瓦兰吉人 2704 手动勾选哥瑟砍（1474）后在统一未建模卡出现一次，取消后消失
  await page.goto('./#/duel?a=2704.Varangians.4.f.&b=567.Teutons.4.f.&m=1');
  await ensureTechOpen();
  const gothBox = page.locator('#duel-a label.simt').filter({ has: page.getByRole('link', { name: '哥瑟砍', exact: true }) });
  await gothBox.locator('input').check();
  await expect(page.locator('[data-t="pk-unmodeled"]')).toContainText('充能远程攻击 · 哥瑟砍');
  await expect(page.locator('[data-t="pk-unmodeled"]')).not.toContainText('额外弹矢 · 哥瑟砍');
  await expect(page.locator('[data-t="pk-vg-line"]')).toHaveCount(2);
  await gothBox.locator('input').uncheck();
  await expect(page.locator('[data-t="pk-unmodeled"]')).toHaveCount(0);

  // issue 1522：丹麦 2704 在满科技与 0 项无科技态均只保留移速 +10%，绝不无条件输出哈马思克
  for (const href of ['./#/duel?a=2704.Danes.4.f.&b=567.Teutons.4.f.&m=1', './#/duel?a=2704.Danes.4..&b=569.Franks.4..&m=r&bud=3000']) {
    await page.goto(href);
    await expect(page.locator('[data-t="pk-vg-line"]')).toHaveCount(1);
    await expect(page.locator('[data-id="danes-spd"]')).toContainText('已计入：丹麦人 移动速度 +10%');
    await expect(page.locator('[data-id="danes-hamask"]')).toHaveCount(0);
    await expect(page.locator('[data-t="pk-vg"]')).not.toContainText('哈马思克');
    await expect(page.locator('[data-t="pk-vg"]')).not.toContainText('产生的黄金');
  }

  // issue 1522：撒克逊 2704 在满科技与 0 项无科技态均仅留默认产金并隐藏「相关加成是否计入」小标题（对齐拜占庭），绝不输出盾墙
  for (const href of ['./#/duel?a=2704.Saxons.4.f.&b=567.Teutons.4.f.&m=1', './#/duel?a=2704.Saxons.4..&b=569.Franks.4..&m=r&bud=3000']) {
    await page.goto(href);
    await expect(page.locator('[data-t="pk-vg-line"]')).toHaveCount(0);
    await expect(page.locator('[data-id="sax-shield"]')).toHaveCount(0);
    await expect(page.locator('[data-t="pk-vg"]')).not.toContainText('盾墙');
    await expect(page.locator('[data-t="pk-vg"]')).not.toContainText('相关加成是否计入');
    await expect(page.locator('[data-t="pk-vg-gold"]')).toHaveAttribute('data-mul', 'default');
  }

  await page.goto('./#/duel?a=2704.Vikings.4.f.&b=567.Teutons.4.f.&m=1');
  await expect(page.locator('[data-id="vik-hp"]')).toHaveAttribute('data-status', 'counted');
  await expect(page.locator('[data-id="vik-hp"]')).toContainText('已计入：维京 步兵生命值 +20%');

  await page.goto('./#/duel?a=567.Teutons.4.f.&b=567.Japanese.4.f.&m=1');
  await expect(page.locator('#duel-res')).toBeVisible();
  await expect(page.locator('[data-t="pk-vg"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
