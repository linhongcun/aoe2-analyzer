import { expect, test, type Page } from '@playwright/test';
/** v0.11.0 验收（#162）。A 未计入原因（360/375/390 一行）、B 加成/页面拼音搜索（四个宽度）。C 无界面。 */

const UNSUPPORTED = '.pk-line[data-t="rc-unsupported"]';
const FALLBACK = '数据读不准，按通用速度算';
const A_CIVS = [
  ['Malians', '马里'],
  ['Poles', '波兰'],
  ['Portuguese', '葡萄牙'],
  ['Shu', '蜀'],
  ['Sicilians', '西西里'],
  ['Khmer', '高棉'],
  ['Aztecs', '阿兹特克'],
] as const;

async function openTime(page: Page, civ: string) {
  // 民兵（74）7 个文明都有；m=t 直接进等采集时间
  await page.goto(`./#/duel?a=74.${civ}.3.f.&b=74.Magyars.3.f.&m=t`);
  await expect(page.locator('[data-t="rc-toggle"] [aria-checked="true"]')).toHaveText('等采集时间');
  await expect(page.locator('[data-t="rc-a"]')).toBeVisible();
}

for (const width of [360, 375, 390]) {
  test.describe(`A #162 未计入原因 @${width}`, () => {
    test.use({ viewport: { width, height: 900 } });
    for (const [en, zh] of A_CIVS)
      test(`A ${zh}：原因写到具体文明（以「未建模」收尾），每行一行不溢出`, async ({ page }) => {
        await openTime(page, en);
        const rows = page.locator('[data-t="rc-a"]').locator(UNSUPPORTED);
        expect(await rows.count()).toBeGreaterThan(0);
        for (const row of await rows.all()) {
          await expect(row).toContainText(`未计入：${zh}`);
          await expect(row).not.toContainText(FALLBACK);
          await expect(row).toContainText(/未建模）/);
          const span = row.locator('> span').first();
          const layout = await ((await span.count()) ? span : row).evaluate((el) => {
            const r = document.createRange();
            r.selectNodeContents(el);
            const lines = new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size;
            // 「未计入：文明 加成」部分必须完整可见（与 realCostUncounted 一致，长原因允许省略号）
            r.setEnd(el.firstChild!, el.textContent!.indexOf('（'));
            const reserve = el.scrollWidth > el.clientWidth ? parseFloat(getComputedStyle(el).fontSize) : 0;
            return { lines, keyFits: r.getBoundingClientRect().right <= el.getBoundingClientRect().right - reserve };
          });
          expect(layout.lines).toBe(1);
          expect(layout.keyFits).toBe(true);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      });
  });
}

async function palette(page: Page, q: string) {
  await page.goto('./');
  await page.getByRole('button', { name: '全局搜索' }).click();
  await page.getByPlaceholder(/搜索文明、单位、科技/).fill(q);
  return page.locator('.cmdk-list li');
}

const B_HITS: [string, string][] = [
  ['kejishu', '科技树'],
  ['wenmingjiacheng', '文明加成'],
  ['cunminxiedailiang', '村民携带量 +3'],
  ['cmxdl', '村民携带量 +3'],
];

for (const width of [360, 375, 390, 1280]) {
  test.describe(`B #162 加成/页面拼音搜索 @${width}`, () => {
    test.use({ viewport: { width, height: width < 900 ? 740 : 800 } });
    for (const [q, zh] of B_HITS)
      test(`B 全局搜索「${q}」出现「${zh}」，结果行不横向超出`, async ({ page }) => {
        const li = await palette(page, q);
        await expect(li.filter({ has: page.getByText(zh, { exact: true }) }).first()).toBeVisible();
        const over = await li.evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length);
        expect(over).toBe(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      });
  });
}

test('自检：夹具页面能打开（民兵 · 马里 等采集时间、搜索框）', async ({ page }) => {
  await openTime(page, 'Malians');
  const li = await palette(page, '科技树');
  await expect(li.filter({ hasText: '科技树' }).first()).toBeVisible();
});
