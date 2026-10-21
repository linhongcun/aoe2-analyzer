import { expect, test, type Page } from '@playwright/test';
import { guardPage, WIDTHS, wrappedNums } from './v0290-helpers';

/**
 * v0.29.0 验收（#329）B 组 #326 部分：取自 Kent Beck test/v0290-acceptance @ fd1c718 tests/e2e/v0290-B.spec.ts，断言原样未改。
 */
guardPage();

// ---------- #326 ----------
/** 每张文明卡：DLC 小图标的矩形与卡片内任何文字（不含图标自身）的行矩形都不相交 */
async function overlaps(page: Page) {
  return page.locator('.card[data-civ]').evaluateAll((cards) => {
    const out: string[] = [];
    let badges = 0;
    for (const card of cards) {
      const icons = [...card.querySelectorAll('.cdl img, .cdl svg, [class*="dlc"] img, [class*="dlc"] svg')].filter((e) => e.getBoundingClientRect().width > 0);
      badges += icons.length;
      const texts: { r: DOMRect; t: string }[] = [];
      const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent?.trim()) continue;
        if (icons.some((i) => i.contains(n))) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) if (r.width > 0) texts.push({ r, t: n.textContent.trim() });
      }
      for (const icon of icons) {
        const a = icon.getBoundingClientRect();
        for (const { r, t } of texts)
          if (a.left < r.right - 0.5 && a.right > r.left + 0.5 && a.top < r.bottom - 0.5 && a.bottom > r.top + 0.5)
            out.push(`${card.getAttribute('data-civ')}：${t}`);
      }
    }
    return { out, badges };
  });
}
test.describe('#326 文明列表：DLC 图标不盖住文字', () => {
  for (const width of WIDTHS)
    test(`#/civs @${width}：DLC 图标与「边位 X · 口袋 Y」等文字不重叠，.num 不折行`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./#/civs');
      await expect(page.locator('.card[data-civ]').first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      const { out, badges } = await overlaps(page);
      expect(badges, '找到了 DLC 图标（防止空跑）').toBeGreaterThan(10);
      expect(out).toEqual([]);
      expect(await wrappedNums(page, 'main')).toEqual([]);
      await page.screenshot({ path: info.outputPath(`civs-${width}.png`), fullPage: false });
    });
});
