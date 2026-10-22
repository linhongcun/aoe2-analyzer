// 「报错/反馈」「功能建议」手机触控区补足后的回归：视觉仍紧凑、不压到页脚其他链接、桌面宽度保持原样。
import { expect, test, type Page } from '@playwright/test';

const LINKS = ['footer a[data-t="feedback"]', 'footer a[data-t="feature"]'];

async function open(page: Page, route: string, width: number) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(`./#${route}`, { waitUntil: 'networkidle' });
  await expect(page.locator('main')).not.toBeEmpty();
}

for (const width of [360, 375, 390]) {
  test(`@${width}：反馈入口没有新增底色或边框，图标仍是 14px`, async ({ page }) => {
    await open(page, '/builds', width);
    for (const sel of [...LINKS, 'main a.fblink[data-t="feedback"]']) {
      const a = page.locator(sel).first();
      await a.scrollIntoViewIfNeeded();
      const s = await a.evaluate((el) => {
        const cs = getComputedStyle(el);
        const ic = el.querySelector('svg')!.getBoundingClientRect();
        return { bg: cs.backgroundColor, bw: cs.borderTopWidth, h: el.getBoundingClientRect().height, ic: [ic.width, ic.height] };
      });
      expect(s.bg, sel).toBe('rgba(0, 0, 0, 0)');
      expect(s.bw, sel).toBe('0px');
      expect(s.ic, sel).toEqual([14, 14]);
      expect(s.h, sel).toBeGreaterThanOrEqual(44);
    }
  });

  test(`@${width}：页脚两个入口的触控区不压到页脚里的其他链接`, async ({ page }) => {
    await open(page, '/market', width);
    await page.locator('footer').scrollIntoViewIfNeeded();
    const overlaps = await page.evaluate((sels) => {
      const mine = sels.map((s) => document.querySelector(s)!);
      const others = [...document.querySelectorAll('footer a, footer summary')].filter((el) => !mine.includes(el));
      const hit = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const out: string[] = [];
      for (const m of mine) for (const o of others) {
        for (const r of o.getClientRects()) if (hit(m.getBoundingClientRect(), r)) out.push(`${m.textContent} × ${o.textContent}`);
      }
      return out;
    }, LINKS);
    expect(overlaps).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  });
}

test('@1280：桌面宽度保持原来的紧凑高度', async ({ page }) => {
  await open(page, '/builds', 1280);
  for (const sel of [...LINKS, 'main a.fblink[data-t="feedback"]']) {
    const box = await page.locator(sel).first().boundingBox();
    expect(box!.height, sel).toBeLessThan(30);
  }
});

for (const width of [360, 375, 390, 414, 480]) {
  test(`@${width}：页脚入口的点击区只向上借用页脚留白，不压到页脚上方内容，说明文字行距均匀`, async ({ page }) => {
    await open(page, '/market', width);
    await page.locator('footer').scrollIntoViewIfNeeded();
    const r = await page.evaluate((sels) => {
      const f = document.querySelector('footer')!;
      const top = f.getBoundingClientRect().top;
      const links = sels.map((s) => document.querySelector(s)!.getBoundingClientRect());
      // 只看真正画在屏幕上的元素（收起的 <details> 内容不算）
      const above = [...document.body.querySelectorAll('*')].filter((el) => !f.contains(el) && !el.contains(f) && el.checkVisibility({ visibilityProperty: true, opacityProperty: true }));
      const hit = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const overlaps = above.filter((el) => { const q = el.getBoundingClientRect(); return q.width > 0 && q.height > 0 && links.some((l) => hit(l, q)); }).map((el) => el.tagName + '.' + el.className);
      const tn = [...f.querySelector('.fbfoot')!.childNodes].find((n) => n.nodeType === 3 && n.textContent!.includes('发现错误'))!;
      const rg = document.createRange();
      rg.selectNodeContents(tn);
      const bottoms = [...new Set([...rg.getClientRects()].map((q) => Math.round(q.bottom)))];
      return { minTop: Math.min(...links.map((l) => l.top)) - top, overlaps, bottoms };
    }, LINKS);
    expect(r.minTop).toBeGreaterThanOrEqual(0);
    expect(r.overlaps).toEqual([]);
    expect(r.bottoms.length).toBeGreaterThanOrEqual(2);
    // 说明文字第 1、2 行之间不被 44px 点击区撑出段落似的空隙
    expect(r.bottoms[1] - r.bottoms[0]).toBeLessThanOrEqual(22);
  });
}
