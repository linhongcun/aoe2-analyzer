import { expect, test, type Page } from '@playwright/test';

const attachErrorCollectors = (page: Page) => {
  const errors: string[] = [];
  const dupKeys: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    const text = m.text();
    if (m.type() === 'error') errors.push(text);
    if (/same key|duplicate key/i.test(text)) dupKeys.push(text);
  });
  return { errors, dupKeys };
};

const assertNoOverflowOrNumWrap = async (page: Page, scopeSel: string) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const wrapped = await page.locator(`${scopeSel} .nw`).evaluateAll((els) => {
    const bad: string[] = [];
    for (const el of els) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const range = document.createRange();
      range.selectNodeContents(el);
      const tops = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0).map((r) => r.top);
      if (tops.length > 1 && Math.max(...tops) - Math.min(...tops) > 6) {
        bad.push((el.textContent ?? '').trim());
      }
    }
    return bad;
  });
  expect(wrapped, `${scopeSel} .nw 不得折行`).toEqual([]);
};

test.describe('Issue 1486 等采集时间按文明科技树禁用与勃艮第提前时代过滤', () => {
  for (const width of [1280, 390] as const) {
    test(`AC1–AC3 代表对局与波兰去重 @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const { errors, dupKeys } = attachErrorCollectors(page);

      // 1. 封建步弓手：勃艮第 2:36 / 38 只 vs 不列颠 3:13 / 30 只 → 勃艮第胜
      await page.goto('./#/duel?a=4.Burgundians.2.f.&b=4.Britons.2.f.&m=t');
      await expect(page.locator('[data-t="rc-a"] [data-t="rc-res-Wood"] [data-t="rc-time"]')).toHaveText('0:52');
      await expect(page.locator('[data-t="rc-a"] [data-t="rc-res-Gold"] [data-t="rc-time"]')).toHaveText('1:44');
      await expect(page.locator('[data-t="rc-a"] [data-t="rc-total"]')).toHaveText('2:36');
      await expect(page.locator('[data-t="rc-a"] [data-t="rc-count"] .rc-big')).toHaveText('38');
      await expect(page.locator('[data-t="rc-b"] [data-t="rc-total"]')).toHaveText('3:13');
      await expect(page.locator('[data-t="rc-b"] [data-t="rc-count"] .rc-big')).toHaveText('30');
      await expect(page.locator('#duel')).toContainText('勃艮第');
      await expect(page.locator('#duel')).not.toContainText('同归于尽');
      await assertNoOverflowOrNumWrap(page, '#duel');

      // 2. 城堡弩手：勃艮第 2:32 / 39 只 vs 法兰克 2:36 / 38 只 → 勃艮第胜
      await page.goto('./#/duel?a=24.Burgundians.3.f.&b=24.Franks.3.f.&m=t');
      await expect(page.locator('[data-t="rc-a"] [data-t="rc-res-Wood"] [data-t="rc-time"]')).toHaveText('0:48');
      await expect(page.locator('[data-t="rc-a"] [data-t="rc-res-Gold"] [data-t="rc-time"]')).toHaveText('1:44');
      await expect(page.locator('[data-t="rc-a"] [data-t="rc-total"]')).toHaveText('2:32');
      await expect(page.locator('[data-t="rc-a"] [data-t="rc-count"] .rc-big')).toHaveText('39');
      await expect(page.locator('[data-t="rc-b"] [data-t="rc-total"]')).toHaveText('2:36');
      await expect(page.locator('[data-t="rc-b"] [data-t="rc-count"] .rc-big')).toHaveText('38');
      await expect(page.locator('#duel')).not.toContainText('同归于尽');

      // 3. 帝王游侠（20 村 10 分）：条顿缺 182 为 5:09 / 38 只，勃艮第 4:46 / 41 只
      await page.goto('./#/duel?a=569.Burgundians.4.f.&b=569.Teutons.4.f.&m=t&vil=20');
      await expect(page.locator('[data-t="rc-a"] [data-t="rc-total"]')).toHaveText('4:46');
      await expect(page.locator('[data-t="rc-a"] [data-t="rc-count"] .rc-big')).toHaveText('41');
      await expect(page.locator('[data-t="rc-b"] [data-t="rc-res-Food"] [data-t="rc-time"]')).toHaveText('1:53');
      await expect(page.locator('[data-t="rc-b"] [data-t="rc-res-Gold"] [data-t="rc-time"]')).toHaveText('3:16');
      await expect(page.locator('[data-t="rc-b"] [data-t="rc-total"]')).toHaveText('5:09');
      await expect(page.locator('[data-t="rc-b"] [data-t="rc-count"] .rc-big')).toHaveText('38');

      // 4. 帝王火枪手：西班牙缺 182 为 3:35 / 27 只，勃艮第 3:20 / 29 只
      await page.goto('./#/duel?a=5.Burgundians.4.f.&b=5.Spanish.4.f.&m=t');
      await expect(page.locator('[data-t="rc-a"] [data-t="rc-total"]')).toHaveText('3:20');
      await expect(page.locator('[data-t="rc-a"] [data-t="rc-count"] .rc-big')).toHaveText('29');
      await expect(page.locator('[data-t="rc-b"] [data-t="rc-res-Gold"] [data-t="rc-time"]')).toHaveText('2:10');
      await expect(page.locator('[data-t="rc-b"] [data-t="rc-total"]')).toHaveText('3:35');
      await expect(page.locator('[data-t="rc-b"] [data-t="rc-count"] .rc-big')).toHaveText('27');

      // 5. 帝王劲弩手：波兰双缺 221+182 为 2:50 / 35 只，且大庄园未计入去重为 1 行
      await page.goto('./#/duel?a=492.Chinese.4.f.&b=492.Poles.4.f.&m=t');
      await expect(page.locator('[data-t="rc-a"] [data-t="rc-total"]')).toHaveText('2:32');
      await expect(page.locator('[data-t="rc-a"] [data-t="rc-count"] .rc-big')).toHaveText('39');
      await expect(page.locator('[data-t="rc-b"] [data-t="rc-res-Wood"] [data-t="rc-time"]')).toHaveText('0:52');
      await expect(page.locator('[data-t="rc-b"] [data-t="rc-res-Gold"] [data-t="rc-time"]')).toHaveText('1:57');
      await expect(page.locator('[data-t="rc-b"] [data-t="rc-total"]')).toHaveText('2:50');
      await expect(page.locator('[data-t="rc-b"] [data-t="rc-count"] .rc-big')).toHaveText('35');
      const polUnsupported = page.locator('[data-t="rc-b"] [data-t="rc-unsupported"]');
      await expect(polUnsupported).toHaveCount(2);
      await expect(polUnsupported.nth(0)).toContainText('未计入：波兰 波兰庄园农田加成（大庄园替代磨坊，未建模）');
      await expect(polUnsupported.nth(1)).toContainText('未计入：波兰 波兰采石换金（石矿工兼产黄金，未建模）');
      await assertNoOverflowOrNumWrap(page, '#duel');

      expect(dupKeys).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

  test('AC1–AC2 单位详情「采集时间估算」与等采集时间口径同步（1280 与 360 无折行）', async ({ page }) => {
    const { errors, dupKeys } = attachErrorCollectors(page);
    const cases: [string, string][] = [
      ['./#/unit/569?civ=Teutons', '5:09'],
      ['./#/unit/569?civ=Burgundians', '4:46'],
      ['./#/unit/492?civ=Poles', '2:50'],
      ['./#/unit/492?civ=Britons', '2:32'],
      ['./#/unit/4?civ=Burgundians', '2:32'],
      ['./#/unit/4?civ=Britons', '2:36'],
    ];

    for (const width of [1280, 360] as const) {
      await page.setViewportSize({ width, height: 900 });
      for (const [url, expectedClock] of cases) {
        await page.goto(url);
        const timeEl = page.locator('#unit-gather [data-t="rc-uline-time"]');
        await expect(timeEl, `${url}@${width}`).toHaveText(`≈ 1个村民 ${expectedClock}`);
        await assertNoOverflowOrNumWrap(page, '#unit-gather');
      }
    }

    expect(dupKeys).toEqual([]);
    expect(errors).toEqual([]);
  });
});
