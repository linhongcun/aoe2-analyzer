import { expect, test } from '@playwright/test';
/** #78 第 7 项「（」分支（Kent 复验补）：合成卡点「等城镇中心（在造村民） 约 9:03」，按 BuildTimelineView 的 JSX 结构注入，
 *  只允许在「（」前和「约」前断行；括号内、时间内不断。另压窄单元格强制原因本身换行。 */
for (const width of [360, 375, 390] as const)
  test(`#78「（」只在括号前断 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('#/builds?bo=scouts-18');
    await page.locator('[data-t="share-card-btn"]').filter({ visible: true }).click();
    const v = page.getByRole('dialog', { name: '分享卡' }).locator('[data-t="card-cell-1"] .tl-v');
    await expect(v).toBeVisible();
    for (const cellW of [null, 90, 60] as const) {
      const r = await v.evaluate((b, cw) => {
        b.innerHTML = '<span class="is-wrap"><span>等城镇中心</span><span>（在造村民）</span></span> <span>约 9:03</span>';
        if (cw) b.style.width = cw + 'px';
        const lines = (e: Element) => { const g = document.createRange(); g.selectNodeContents(e); return new Set([...g.getClientRects()].map((x) => Math.round(x.top))).size; };
        const [a, p] = [...b.querySelectorAll('.is-wrap > span')];
        const t = b.children[1]!;
        const top = (e: Element) => Math.round(e.getBoundingClientRect().top);
        return { a: lines(a!), p: lines(p!), t: lines(t), wrapReason: top(p!) > top(a!), timeOwn: top(t) > top(p!) || top(t) === top(a!) };
      }, cellW);
      expect([r.a, r.p, r.t], `cell ${cellW}`).toEqual([1, 1, 1]);
      expect(r.timeOwn).toBe(true);
      if (cellW === 60) expect(r.wrapReason).toBe(true);
    }
  });
