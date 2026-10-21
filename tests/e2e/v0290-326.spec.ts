import { expect, test, type Page } from '@playwright/test';
import { guardPage, WIDTHS, wrappedNums } from './v0290-helpers';

/**
 * v0.29.0 验收（#329）B 组 #326 部分：取自 Kent Beck test/v0290-acceptance @ d21a0de tests/e2e/v0290-B.spec.ts，断言原样未改。
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

/** 科技模拟器每张卡 .mini（「兵营 · 肉 35 金 25」）：计算的 padding-left，以及它排成了几行（按文字与图标的行矩形 top 聚类） */
async function simMinis(page: Page) {
  return page.locator('#simhub .ucard .mini').evaluateAll((els) =>
    els.map((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = [...range.getClientRects(), ...[...el.querySelectorAll('img, svg')].map((i) => i.getBoundingClientRect())].filter(
        (r) => r.width > 0 && r.height > 0,
      );
      const mids = rects.map((r) => (r.top + r.bottom) / 2).sort((a, b) => a - b);
      let lines = 0;
      let last = -Infinity;
      for (const m of mids) if (m - last > 6) (lines++, (last = m));
      return { pad: getComputedStyle(el).paddingLeft, lines };
    }),
  );
}
/** main 5c9326f 上各宽度费用行排成两行及以上的卡片数（同一测量方法，2026-10-22 00:30 北京时间实测），作为上限 */
const SIM_WRAP_MAX: Record<(typeof WIDTHS)[number], number> = { 360: 39, 375: 30, 390: 21, 1280: 156 };
test.describe('#326 守卫：科技模拟器卡片不受文明卡 DLC 图标留白影响（#339 复核补充）', () => {
  for (const width of WIDTHS)
    test(`#/simulator @${width}：.mini 左内边距 ${width <= 600 ? '0' : '与 main 相同（28px）'}，费用行折行的卡片不比 main 多`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./#/simulator');
      await expect(page.locator('#simhub .ucard').first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      const minis = await simMinis(page);
      expect(minis.length, '防空转：模拟器卡片').toBeGreaterThan(100);
      const pads = [...new Set(minis.map((m) => m.pad))];
      expect(pads, '没有 DLC 图标，手机宽度下不留 28px 空白').toEqual([width <= 600 ? '0px' : '28px']);
      const wrapped = minis.filter((m) => m.lines > 1).length;
      expect(wrapped, `费用行排成多行的卡片数（main 上限 ${SIM_WRAP_MAX[width]}）`).toBeLessThanOrEqual(SIM_WRAP_MAX[width]);
      await page.screenshot({ path: info.outputPath(`simulator-${width}.png`), fullPage: false });
    });
});
