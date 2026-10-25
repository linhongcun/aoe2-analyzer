import { expect, test, type Page } from '@playwright/test';
import civs from '../../src/data/civs.json' with { type: 'json' };
import { DLCS } from '../../src/domain/dlc';
import { guardPage, WIDTHS, wrappedNums } from './v0290-helpers';

/**
 * v0.29.0 验收（#329）B 组 #326 部分：取自 Kent Beck test/v0290-acceptance @ d21a0de tests/e2e/v0290-B.spec.ts。
 * #425：按维护者明确要求移除文明卡 DLC 图标，文明列表改验收图标无残留、盾徽保留及位置文字无旧缩进。
 * 数字不换行断言和下方科技模拟器的全部守卫保持原样。
 */
guardPage();

// ---------- #326 ----------
test.describe('#425 文明列表：卡片仅保留文明盾徽，DLC 图标保留在顶部筛选栏', () => {
  for (const width of WIDTHS)
    test(`#/civs @${width}：卡片无 DLC 图标和旧缩进，文明盾徽及数字不折行保持可用`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./#/civs');
      const cards = page.locator('#grid .card[data-civ]');
      await expect(cards).toHaveCount(civs.length);
      await page.waitForLoadState('networkidle');
      await expect(cards.locator('img.ico[src*="/img/civs/"]')).toHaveCount(civs.length);
      await expect(cards.locator('.cdl, .dlcb, img[src*="/img/dlc/"]')).toHaveCount(0);
      const positions = cards.locator('.mini');
      await expect(positions).toHaveCount(civs.length);
      const pads = await positions.evaluateAll((elements) => [...new Set(elements.map((element) => getComputedStyle(element).paddingLeft))]);
      expect(pads, '文明卡位置文字不保留旧 DLC 图标的左缩进').toEqual(['0px']);
      const bar = page.getByRole('group', { name: 'DLC 快捷筛选', exact: true });
      await expect(bar).toBeVisible();
      await expect(bar.getByRole('img')).toHaveCount(DLCS.length);
      await expect(bar.getByRole('button', { name: '全部', exact: true })).toHaveAttribute('aria-pressed', 'true');
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
