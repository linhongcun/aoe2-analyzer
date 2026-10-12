import { expect, test, type Page } from '@playwright/test';
/**
 * #25 盈亏平衡点：场景 1（拜占庭长戟兵 vs 法兰克游侠，满科技）。
 * N 与三档必须和逐档在「N vs M」里手动设置数量的结果一致；四档宽度无横向溢出。
 */
const WIDTHS = [360, 375, 390, 1280] as const;
const AB = 'a=359.Byzantines.4.f.&b=569.Franks.4.f.';

const noHScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

/** 读取设计令牌的计算值（rgb 字符串） */
const tokenRgb = (page: Page, name: string) =>
  page.evaluate((n) => {
    const d = document.createElement('i');
    d.style.color = `var(${n})`;
    document.body.appendChild(d);
    const c = getComputedStyle(d).color;
    d.remove();
    return c;
  }, name);

/** 元素文字对白色卡片底的有效对比度：文字色按祖先 opacity 连乘与底色混合 */
const effContrast = (page: Page, sel: string) =>
  page.evaluate((q) => {
    const el = document.querySelector(q)!;
    let op = 1;
    for (let e: Element | null = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
    const [r, g, b] = getComputedStyle(el)
      .color.match(/\d+(\.\d+)?/g)!
      .map(Number);
    const mix = [r!, g!, b!].map((c) => c * op + 255 * (1 - op));
    const lum = (cs: number[]) =>
      cs
        .map((c) => c / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i]!, 0);
    return (1 + 0.05) / (lum(mix) + 0.05);
  }, sel);

for (const w of WIDTHS) {
  test.describe(`盈亏平衡 @${w}`, () => {
    test.use({ viewport: { width: w, height: 900 } });

    test('N vs M：点「算盈亏平衡」得出 16，三档 15 负 / 16 胜 / 17 胜，无横向溢出', async ({ page }) => {
      await page.goto(`./#/duel?${AB}&m=n&na=10&nb=10`);
      await page.getByRole('button', { name: '算盈亏平衡' }).click();
      await expect(page.locator('[data-t=be-n]')).toHaveText('16');
      await expect(page.locator('#duel-be')).toContainText('个长戟兵，才能打赢 10 个游侠');
      const rows = page.locator('.be-tab tbody tr');
      await expect(rows).toHaveCount(3);
      await expect(rows.nth(0)).toContainText('A 负（含平局）');
      await expect(rows.nth(1)).toContainText('A 胜');
      await expect(rows.nth(2)).toContainText('A 胜');
      await expect(page).toHaveURL(/be=1/);
      await expect(page.locator('[data-t=be-sub]')).toHaveText('16 个及以上都能赢');
      await noHScroll(page);
      // 「在 N vs M 中打开」后，主 PK 结果与第 N 档一致
      await page.getByRole('button', { name: /在 N vs M 中打开 16 vs 10/ }).click();
      await expect(page.locator('#duel-res h3')).toContainText('A · 长戟兵 获胜');
    });

    test('N−1 档与手动 N vs M 一致：15 vs 10 游侠获胜', async ({ page }) => {
      await page.goto(`./#/duel?${AB}&m=n&na=15&nb=10`);
      await expect(page.locator('#duel-res h3')).toContainText('B · 游侠 获胜');
    });

    test('1v1 入口：2 个长戟兵才能打赢 1 个游侠；改参数后旧结果变灰', async ({ page }) => {
      await page.goto(`./#/duel?${AB}&m=1`);
      await page.getByRole('button', { name: '算盈亏平衡' }).click();
      await expect(page.locator('[data-t=be-n]')).toHaveText('2');
      await expect(page.locator('#duel-be')).toContainText('才能打赢 1 个游侠');
      await page.getByRole('radio', { name: '无科技' }).first().click();
      await expect(page.locator('[data-t=be-stale]')).toContainText('参数已变，请重新计算');
      await expect(page.locator('.be-card')).toHaveClass(/is-stale/);
      // 变灰时参数摘要仍是计算当时的（满科技）
      await expect(page.locator('.be-sum')).toContainText('拜占庭 长戟兵 · 满科技');
      await noHScroll(page);
      await page.getByRole('button', { name: '重新计算' }).click();
      await expect(page.locator('[data-t=be-stale]')).toHaveCount(0);
    });

    test('分享链接 be=1 打开即显示结果', async ({ page }) => {
      await page.goto(`./#/duel?${AB}&m=n&na=10&nb=10&be=1`);
      await expect(page.locator('[data-t=be-n]')).toHaveText('16');
    });

    test('上限：200 个无科技村民打不赢 200 个满科技游侠，显示「200 个以内都打不赢」', async ({ page }) => {
      await page.goto('./#/duel?a=83.Franks.4..&b=569.Franks.4.f.&m=n&na=10&nb=200&be=1');
      await expect(page.locator('[data-t=be-cap] b')).toHaveText('200 个以内都打不赢');
      await expect(page.locator('[data-t=be-n]')).toHaveCount(0);
      await expect(page.locator('.be-tab tbody tr')).toHaveCount(1);
      await expect(page.locator('.be-tab tbody tr')).toContainText('A 负（含平局）');
      await noHScroll(page);
    });

    test('切换模式：结果清空，URL 去掉 be=1', async ({ page }) => {
      await page.goto(`./#/duel?${AB}&m=n&na=10&nb=10&be=1`);
      await expect(page.locator('[data-t=be-n]')).toHaveText('16');
      await page.getByRole('radio', { name: '1v1' }).click();
      await expect(page.locator('[data-t=be-n]')).toHaveCount(0);
      await expect(page.locator('[data-t=be-entry]')).toBeVisible();
      await expect(page).not.toHaveURL(/be=1/);
    });

    test('设计复验：副标题与上限文案用 muted；变灰时参数摘要不淡化（AA ≥ 4.5:1）', async ({ page }) => {
      await page.goto(`./#/duel?${AB}&m=n&na=10&nb=10&be=1`);
      const mutedRgb = await tokenRgb(page, '--color-muted');
      await expect(page.locator('[data-t=be-sub]')).toHaveCSS('color', mutedRgb);
      // 变灰：摘要不淡化、对比度达标；其余部分仍淡化
      await page.getByRole('radio', { name: '无科技' }).first().click();
      await expect(page.locator('[data-t=be-stale]')).toBeVisible();
      expect(await effContrast(page, '.be-sum')).toBeGreaterThanOrEqual(4.5);
      await expect(page.locator('.be-hero')).toHaveCSS('opacity', '0.45');
      await expect(page.locator('.be-tw')).toHaveCSS('opacity', '0.45');
      await expect(page.locator('.be-sum')).toHaveCSS('opacity', '1');
      // 上限文案：muted、非红色、非 16px
      await page.goto('./#/duel?a=83.Franks.4..&b=569.Franks.4.f.&m=n&na=10&nb=200&be=1');
      const cap = page.locator('[data-t=be-cap] b');
      await expect(cap).toHaveText('200 个以内都打不赢');
      await expect(cap).toHaveCSS('color', mutedRgb);
      expect(await cap.evaluate((e) => getComputedStyle(e).color)).not.toBe(await tokenRgb(page, '--color-bad'));
      expect(await cap.evaluate((e) => getComputedStyle(e).fontSize)).not.toBe('16px');
    });
  });
}
