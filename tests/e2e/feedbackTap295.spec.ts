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
