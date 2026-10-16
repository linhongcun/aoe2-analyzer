// v0.7.0 #88 等采集时间（Kent 草稿 #120 issuecomment-6157773161；设计稿 docs/design/mockups/issue88-real-cost）
// 手算值来自 Kent 草稿，#127（0.5 取整）合并后 Kent 复核不变。
import { expect, test, type Page } from '@playwright/test';

const CLOCK = /^\d+:\d{2}$/;
const KNIGHT_CAMEL = '#/duel?a=38.Franks.3.f.&b=329.Berbers.3.f.&m=t';

async function open(page: Page, hash: string) {
  await page.goto(hash);
  await expect(page.locator('[data-t="rc-a"]')).toBeVisible();
}
const count = async (page: Page, k: 'a' | 'b') => Number(await page.locator(`[data-t="rc-${k}"] [data-t="rc-count"] b`).innerText());

for (const w of [1280, 390]) {
  test.describe(`#88 PK 等采集时间 @${w}`, () => {
    test.use({ viewport: { width: w, height: 900 } });
    test('4 骑士 vs 骆驼兵：默认预算不进 URL；两侧时间、派出；折后价才出时间', async ({ page }) => {
      await open(page, KNIGHT_CAMEL);
      expect(page.url()).not.toMatch(/[?&](vil|min)=/);
      await expect(page.locator('[data-t="rc-toggle"] [aria-checked="true"]')).toHaveText('等采集时间');
      await expect(page.locator('[data-t="rc-budget-text"]')).toHaveText('10 个村民 × 10:00');
      const A = page.locator('[data-t="rc-a"]'),
        B = page.locator('[data-t="rc-b"]');
      for (const s of [A, B]) {
        await expect(s.locator('[data-t="rc-time"]')).toHaveCount(2);
        for (const t of await s.locator('[data-t="rc-time"], [data-t="rc-total"]').allInnerTexts()) expect(t).toMatch(CLOCK);
      }
      await expect(A.locator('[data-t="rc-res-Food"] td').first()).toContainText('食物 60');
      // B 侧有折扣：原价划掉、只出一个时间（实际价的）
      await expect(B.locator('[data-t="rc-res-Food"] .pk-was')).toHaveText('55');
      await expect(B.locator('[data-t="rc-res-Food"] [data-t="rc-time"]')).toHaveCount(1);
      await expect(B.locator('[data-t="rc-disc"]')).toContainText('时间按实际价换算');
      await expect(B.locator('[data-t="rc-applied"]')).toContainText('已计入：柏柏尔 村民移速 +10%');
      // Kent 手算（#127 后复核不变）
      await expect(A.locator('[data-t="rc-res-Food"] [data-t="rc-time"]')).toHaveText('1:53');
      await expect(A.locator('[data-t="rc-res-Gold"] [data-t="rc-time"]')).toHaveText('2:54');
      await expect(A.locator('[data-t="rc-total"]')).toHaveText('4:47');
      await expect(B.locator('[data-t="rc-res-Food"] [data-t="rc-time"]')).toHaveText('1:29');
      await expect(B.locator('[data-t="rc-res-Gold"] [data-t="rc-time"]')).toHaveText('1:57');
      await expect(B.locator('[data-t="rc-total"]')).toHaveText('3:25');
      await expect(B.locator('[data-t="rc-res-Food"] .pk-now')).toHaveText('47');
      expect(await count(page, 'a')).toBe(20);
      expect(await count(page, 'b')).toBe(29);
      expect(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth)).toBe(true);
    });
  });
}

test.describe('#88 不含播种 / 口径', () => {
  test('5 有食物：食物行、单个用时都有「不含播种」；口径浮层写播种耗时未核实；页面没有播种秒数', async ({ page }) => {
    await open(page, KNIGHT_CAMEL);
    const A = page.locator('[data-t="rc-a"]');
    await expect(A.locator('[data-t="rc-res-Food"] [data-t="rc-noseed"]')).toHaveText('不含播种');
    await expect(A.locator('[data-t="rc-sum"] [data-t="rc-noseed"]')).toHaveText('不含播种');
    await expect(A.locator('[data-t="rc-res-Gold"] [data-t="rc-noseed"]')).toHaveCount(0);
    await expect(A.locator('[data-t="rc-basis"]').first()).toContainText('城堡时代 · 经济科技全研究 · 按农田计');
    await A.locator('[data-t="rc-basis-btn"]').click();
    const li = A.locator('[data-t="rc-pop"] li');
    await expect(li).toHaveCount(4);
    await expect(li.nth(1)).toHaveText('食物按农田算，播种耗时未核实，不计入。');
    await expect(page.locator('body')).not.toContainText(/播种[^\n]{0,6}\d+(\.\d+)?\s*(s|秒)/);
  });
  test('6 僧侣：没有「按农田计」「不含播种」；合计 3:52、派出 25', async ({ page }) => {
    await open(page, '#/duel?a=38.Franks.3.f.&b=125..3.f.&m=t');
    const B = page.locator('[data-t="rc-b"]');
    await expect(B).not.toContainText('按农田计');
    await expect(B).not.toContainText('不含播种');
    await expect(B.locator('[data-t="rc-sum"]')).toBeVisible();
    await expect(B.locator('[data-t="rc-total"]')).toHaveText('3:52');
    expect(await count(page, 'b')).toBe(25);
  });
  test('7 土耳其（Kent 稿写作突厥）已计入一次百分比；骑士 4:17 / 23；马里未计入且与通用法兰克同用时', async ({ page }) => {
    await open(page, '#/duel?a=38.Turks.3.f.&b=38.Malians.3.f.&m=t');
    const A = page.locator('[data-t="rc-a"]'),
      B = page.locator('[data-t="rc-b"]');
    await expect(A.locator('[data-t="rc-applied"]')).toContainText('已计入：土耳其 采金 +25%');
    expect(((await A.innerText()).match(/25%/g) ?? []).length).toBe(1);
    await expect(A.locator('[data-t="rc-total"]')).toHaveText('4:17');
    expect(await count(page, 'a')).toBe(23);
    await expect(B.locator('[data-t="rc-unsupported"]')).toHaveText('未计入：马里 采金加成（数据读不准，按通用速度算）');
    const mali = await B.locator('[data-t="rc-total"]').innerText();
    await open(page, KNIGHT_CAMEL);
    await expect(page.locator('[data-t="rc-a"] [data-t="rc-total"]')).toHaveText(mali);
  });
  test('帝王重弩手：单个用时 2:33、派出 39', async ({ page }) => {
    await open(page, '#/duel?a=492..4.f.&b=38.Franks.3.f.&m=t');
    const A = page.locator('[data-t="rc-a"]');
    await expect(A.locator('[data-t="rc-total"]')).toHaveText('2:33');
    expect(await count(page, 'a')).toBe(39);
  });
  test('9 vil=5 / min=5 预算减半；改回 10 后 URL 去掉 vil', async ({ page }) => {
    await open(page, KNIGHT_CAMEL);
    const full = await count(page, 'a');
    await open(page, KNIGHT_CAMEL + '&vil=5');
    await expect(page.locator('[data-t="rc-budget-text"]')).toHaveText('5 个村民 × 10:00');
    const half = await count(page, 'a');
    expect(full).toBe(20);
    expect(half).toBe(10);
    await page.locator('#duel-vil').fill('10');
    await expect.poll(() => page.url()).not.toMatch(/[?&]vil=/);
    await open(page, KNIGHT_CAMEL + '&min=5');
    expect(await count(page, 'a')).toBe(half);
  });
  test('切回等资源：URL m=r，采集时间块消失', async ({ page }) => {
    await open(page, KNIGHT_CAMEL + '&vil=5');
    await page.locator('[data-t="rc-toggle"] button', { hasText: '等资源' }).click();
    await expect.poll(() => page.url()).toMatch(/[?&]m=r/);
    expect(page.url()).not.toMatch(/[?&]vil=/);
    await expect(page.locator('[data-t="rc-a"]')).toHaveCount(0);
    await expect(page.locator('[data-t="pk-cost-a"]')).toBeVisible();
  });
});

test.describe('#88 单位页', () => {
  test('8 骑士详情不选时代：采集时间 ≈ 1 个村民 m:ss，口径城堡时代，不含播种', async ({ page }) => {
    await page.goto('#/unit/38');
    const l = page.locator('[data-t="rc-uline"]');
    await expect(l.locator('[data-t="rc-uline-time"]')).toHaveText('≈ 1 个村民 4:47');
    await expect(l).toContainText('城堡时代 · 按农田计');
    await expect(l.locator('[data-t="rc-noseed"]')).toHaveText('不含播种');
    // 与 PK 法兰克（无采集加成）同一口径
    const t = (await l.locator('[data-t="rc-uline-time"]').innerText()).replace('≈ 1 个村民 ', '');
    await open(page, KNIGHT_CAMEL);
    await expect(page.locator('[data-t="rc-a"] [data-t="rc-total"]')).toHaveText(t);
  });
});

for (const w of [360, 375, 390]) {
  test(`10 键盘弹出（视口高 −300）@${w}：口径浮层不出底、不横向溢出`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    await open(page, KNIGHT_CAMEL);
    await page.setViewportSize({ width: w, height: 500 });
    const btn = page.locator('[data-t="rc-a"] [data-t="rc-basis-btn"]');
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    const pop = page.locator('[data-t="rc-pop"]');
    await pop.scrollIntoViewIfNeeded();
    const bb = (await pop.boundingBox())!;
    expect(bb.y + bb.height).toBeLessThanOrEqual(500 + 0.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth)).toBe(true);
    await page.locator('#duel-vil').focus();
    expect(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth)).toBe(true);
  });
}
