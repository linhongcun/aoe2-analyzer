import { expect, test } from '@playwright/test';

/**
 * #78 第 7 项（Jony #78#issuecomment-6114971407 验收）：分享卡预览「主要卡点」主值
 * 只在「原因」和「约 m:ss（起）」之间断行；7 个用例 × 360/375/390，每段各自只占一行，且拼起来与摘要逐字一致。
 */
const CASES = [
  'bo=archers-19',
  'bo=drush-fc',
  'bo=fast-castle-boom',
  'bo=feudal-drush-18',
  'bo=maa-archers-18',
  'bo=scouts-18',
  'bo=scouts-18&civ=Franks&house=0',
] as const;

for (const width of [360, 375, 390] as const) {
  test.describe(`#78 分享卡主值断行 ${width}`, () => {
    test.use({ viewport: { width, height: 844 } });
    for (const q of CASES) {
      test(q, async ({ page }) => {
        await page.goto(`#/builds?${q}`);
        await expect(page.getByRole('list', { name: /时间线/ })).toBeVisible();
        const main = (await page.locator('[data-t="sum-bottleneck"] b').textContent())!.trim();
        await page.locator('[data-t="share-card-btn"]').filter({ visible: true }).click();
        const v = page.getByRole('dialog', { name: '分享卡' }).locator('[data-t="card-cell-1"] .tl-v');
        await expect(v).toBeVisible();
        const parts = v.locator(':scope > span');
        await expect(parts).toHaveCount(2);
        const texts = (await parts.allTextContents()).map((t) => t.trim());
        expect(texts.join(' ')).toBe(main);
        expect(texts[1]).toMatch(/^约 \d+:\d\d( 起)?$/);
        const lines = await parts.evaluateAll((els) =>
          els.map((e) => {
            const r = document.createRange();
            r.selectNodeContents(e);
            return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size;
          }),
        );
        expect(lines, `${texts.join(' | ')} 每段应只占一行`).toEqual([1, 1]);
      });
    }
  });
}
