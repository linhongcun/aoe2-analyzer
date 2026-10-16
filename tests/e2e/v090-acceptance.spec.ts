import { expect, test, type Page } from '@playwright/test';

/** v0.9.0 验收（#145）C #140、D #141。C 取自 kent/v090-acceptance @ 57fb3f1，D 取自 @ fae2fc8；不含尚未实现的 E/F。 */
const WIDTHS = [360, 375, 390, 1280];

for (const width of WIDTHS)
  test(`C #140 @${width}：「数量」表每格一行，数字不断行`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./#/duel?a=39.Romans.3.f.&b=2700.Franks.3.f.&m=r&bud=3000');
    await page.locator('table.duel-tab td').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    const cells = await page.locator('table.duel-tab td').evaluateAll((els) =>
      els.map((e) => {
        const lh = parseFloat(getComputedStyle(e).lineHeight) || 20;
        const r = document.createRange();
        r.selectNodeContents(e);
        return { t: e.textContent?.trim(), lines: r.getClientRects().length ? Math.round(r.getBoundingClientRect().height / lh) : 0 };
      }),
    );
    expect(cells.length).toBe(3);
    for (const c of cells) expect(c.lines, c.t).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });

/** #140 设计复核（Steve）：最坏情况——名字最长的文明（中文 埃塞俄比亚、英文 Lithuanians）+ 四位数数量（预算拉到 100000）。
 * 掷矛手 vs 步弓手：「A 1666，剩 1448」——两边都是四位数且胜方剩余也是四位数，是该格能出现的最长文字。 */
const WORST = './#/duel?a=7.Ethiopians.3.f.&b=4.Lithuanians.3.f.&m=r&bud=100000';
async function countCells(page: import('@playwright/test').Page) {
  await page.locator('table.duel-tab td').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  return page.locator('table.duel-tab td').evaluateAll((els) =>
    els.map((e) => {
      const lh = parseFloat(getComputedStyle(e).lineHeight) || 20;
      const r = document.createRange();
      r.selectNodeContents(e);
      return { t: e.textContent?.trim() ?? '', lines: Math.round(r.getBoundingClientRect().height / lh), clipped: e.scrollWidth > e.clientWidth + 1 };
    }),
  );
}
for (const width of [360, 375, 390])
  test(`C #140 最坏情况 @${width}：四位数数量不断行、数字不被截断，页面不横向滚动`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(WORST);
    const cells = await countCells(page);
    expect(cells.length).toBe(3);
    for (const c of cells.slice(1)) expect(c.t, '应是四位数').toMatch(/\d{4}/);
    expect(cells[1]!.t, '胜方剩余也是四位数').toMatch(/剩 \d{4}/);
    for (const c of cells) expect(c.lines, c.t).toBe(1);
    for (const c of cells.slice(1)) expect(c.clipped, `数字格不得被截断：${c.t}`).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (width === 360 && process.env.PR149_SHOT) await page.locator('#duel-res').screenshot({ path: process.env.PR149_SHOT });
  });

test('C #140 不支持 :has() 时（删掉该规则模拟）回退为原样换行，页面不横向滚动 @360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto(WORST);
  await page.locator('table.duel-tab td').first().waitFor();
  const removed = await page.evaluate(() => {
    let n = 0;
    for (const s of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = s.cssRules;
      } catch {
        continue;
      }
      for (let i = rules.length - 1; i >= 0; i--)
        if ((rules[i] as CSSStyleRule).selectorText?.includes(':has(thead)')) {
          s.deleteRule(i);
          n++;
        }
    }
    return n;
  });
  expect(removed, '应删掉 #140 的 :has() 规则').toBeGreaterThan(0);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

// ── D #141（kent/v090-acceptance @ fae2fc8 原样）──
async function landed(page: Page, hash: string) {
  await page.goto('./#/');
  await page.locator('#home').waitFor();
  const before = await page.evaluate(() => history.length);
  await page.evaluate((h) => (location.hash = h), hash);
  await page.locator('table.duel-tab').waitFor();
  return before;
}
const CASES: [string, string, RegExp, string][] = [
  ['A 空', '#/duel?a=39..3.f.&b=39.Magyars.3.f.&m=r&bud=3000', /a=39\.Armenians\.3\.f\./, 'b=39.Magyars.3.f.'],
  ['A 未知', '#/duel?a=39.Foo.3.f.&b=39.Magyars.3.f.&m=r&bud=3000', /a=39\.Armenians\.3\.f\./, 'b=39.Magyars.3.f.'],
  ['B 空', '#/duel?a=39.Magyars.3.f.&b=39..3.f.&m=r&bud=3000', /b=39\.Armenians\.3\.f\./, 'a=39.Magyars.3.f.'],
  ['B 未知', '#/duel?a=39.Magyars.3.f.&b=39.Foo.3.f.&m=r&bud=3000', /b=39\.Armenians\.3\.f\./, 'a=39.Magyars.3.f.'],
];
for (const [name, hash, want, other] of CASES)
  test(`D #141 ${name}文明：URL 用 replace 规范成页面实际文明`, async ({ page }) => {
    const before = await landed(page, hash);
    await expect.poll(() => page.evaluate(() => decodeURIComponent(location.hash))).toMatch(want);
    const h = await page.evaluate(() => decodeURIComponent(location.hash));
    expect(h).toContain(other);
    expect(h).not.toContain('Foo');
    // 进入 duel 本身 +1 条；规范化必须用 replace，不再多加
    expect(await page.evaluate(() => history.length)).toBe(before + 1);
    // 刷新后状态一致
    await page.reload();
    await page.locator('table.duel-tab').waitFor();
    expect(await page.evaluate(() => decodeURIComponent(location.hash))).toBe(h);
  });

test('D #141 合法文明：URL 一字不改', async ({ page }) => {
  const hash = '#/duel?a=39.Romans.3.f.&b=39.Magyars.3.f.&m=r&bud=3000';
  await landed(page, hash);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => location.hash)).toBe(hash);
});
