// v0.30.0 #295 验收：页内「报错/反馈」「功能建议」点击热区在手机宽度不少于 44×44。Kent Beck 2026-10-22。
// 验收标准（#295 原文）：
//   - 360/375/390 下「报错/反馈」「功能建议」可点区域高度与宽度均不少于约 44px（可用透明 padding，视觉仍可保持紧凑）
//   - 1280 宽不出现错位或横向滚动
//   - 浅色/深色对比仍满足 WCAG AA；图标继续用 Lucide
// 入口（f856c9e）：非首页 main 顶部 .fbbar 里的 a.fbbtn（报错/反馈），页脚 a[data-t=feedback]「报错/反馈」与 a[data-t=feature]「功能建议」。
// 「可点区域」用 elementFromPoint 量：经过链接中心的横线 / 竖线上连续落在这个链接上的长度都要 ≥44，
// 这样透明 padding、::before 扩出的热区（含不对称扩展）都算，被相邻元素盖住的部分不算。
// [严格读法·待 Steve] 「约 44px」按 ≥44 判断（不留 1–2px 余量）；也测了 #/builds 列表里的非紧凑「报错/反馈」。
import { expect, test, type Locator, type Page } from '@playwright/test';

const NARROW = [360, 375, 390] as const;
const ROUTES = ['/market', '/civs', '/builds'];
const EMOJI = /\p{Extended_Pictographic}/u;
async function go(page: Page, route: string, w: number, theme: 'light' | 'dark' = 'light') {
  await page.addInitScript((t) => localStorage.setItem('aoe2-theme', t), theme);
  await page.setViewportSize({ width: w, height: 800 });
  await page.goto(`./#${route}`, { waitUntil: 'networkidle' });
  await expect(page.locator('main')).not.toBeEmpty();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}
const targets = (page: Page): [string, Locator][] => [
  ['顶部 .fbbar「报错/反馈」', page.locator('main .fbbar a[data-t="feedback"]').first()],
  ['页脚「报错/反馈」', page.locator('footer a[data-t="feedback"]').first()],
  ['页脚「功能建议」', page.locator('footer a[data-t="feature"]').first()],
];
/** 可点区域：沿经过链接中心的横线、竖线逐像素用 elementFromPoint 探测，取落在这个链接上的连续长度（允许 ::before 等不对称扩展） */
async function hitSize(loc: Locator) {
  await loc.scrollIntoViewIfNeeded();
  return loc.evaluate((a) => {
    const r = a.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const on = (x: number, y: number) => document.elementFromPoint(x, y)?.closest('a') === a;
    const run = (dx: number, dy: number) => {
      let n = 0;
      while (n < 120 && on(cx + dx * (n + 1), cy + dy * (n + 1))) n++;
      return n;
    };
    if (!on(cx, cy)) return { w: 0, h: 0 };
    return { w: run(-1, 0) + run(1, 0) + 1, h: run(0, -1) + run(0, 1) + 1 };
  });
}
const contrast = (loc: Locator) =>
  loc.evaluate((el) => {
    const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
    };
    // 从根往下把半透明背景逐层叠起来
    const chain: Element[] = [];
    for (let n: Element | null = el; n; n = n.parentElement) chain.unshift(n);
    // 元素及祖先的 opacity 会让文字变淡：乘进文字的 alpha
    const opacity = chain.reduce((p, n) => p * Number(getComputedStyle(n).opacity), 1);
    let bg = [255, 255, 255];
    for (const n of chain) {
      const [r, g, b, a = 1] = parse(getComputedStyle(n).backgroundColor);
      if (r === undefined || a === 0) continue;
      bg = [r, g!, b!].map((v, i) => v * a + bg[i]! * (1 - a));
    }
    const [r, g, b, a0 = 1] = parse(getComputedStyle(el).color);
    const a = a0 * opacity;
    const fg = [r!, g!, b!].map((v, i) => v * a + bg[i]! * (1 - a));
    const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  });

test.describe('#295 手机宽度热区 ≥44×44', () => {
  for (const theme of ['light', 'dark'] as const)
    for (const w of NARROW)
      for (const route of ROUTES)
        test(`#${route} @${w} ${theme}：报错/反馈、功能建议的可点区域 ≥44×44`, async ({ page }) => {
          await go(page, route, w, theme);
          const bad: string[] = [];
          for (const [name, loc] of targets(page)) {
            await expect(loc, name).toBeVisible();
            const z = await hitSize(loc);
            if (z.w < 44 || z.h < 44) bad.push(`${name} ${z.w}×${z.h}`);
          }
          expect(bad).toEqual([]);
        });
  for (const w of NARROW)
    test(`#/builds @${w}：列表里的「报错/反馈」（非紧凑样式）可点区域 ≥44×44 [严格读法·待 Steve]`, async ({ page }) => {
      await go(page, '/builds', w);
      const loc = page.locator('main a.fblink[data-t="feedback"]').first();
      await expect(loc).toBeVisible();
      const z = await hitSize(loc);
      expect(Math.min(z.w, z.h), `${z.w}×${z.h}`).toBeGreaterThanOrEqual(44);
    });
});

test.describe('#295 对照：1280 不错位、无横向滚动', () => {
  for (const route of ROUTES)
    test(`#${route} @1280：无横向滚动；三个入口都可见、中心点就是自己（没被盖住）；页脚两项在同一行；顶部入口仍在 main 顶部`, async ({ page }) => {
      await go(page, route, 1280);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
      for (const [name, loc] of targets(page)) {
        await expect(loc, name).toBeVisible();
        expect((await hitSize(loc)).w, `${name} 中心可点`).toBeGreaterThan(0);
      }
      const [, fb, ft] = targets(page);
      const a = (await fb[1].boundingBox())!;
      const b = (await ft[1].boundingBox())!;
      expect(Math.abs(a.y + a.height / 2 - (b.y + b.height / 2)), '页脚两项同一行').toBeLessThanOrEqual(4);
      expect(a.x + a.width <= b.x || b.x + b.width <= a.x, '页脚两项不重叠').toBe(true);
      const bar = (await page.locator('main .fbbar').boundingBox())!;
      const main = (await page.locator('main').boundingBox())!;
      expect(bar.y - main.y, '顶部入口在 main 顶部').toBeLessThan(80);
    });
  for (const w of NARROW)
    test(`@${w}：无横向滚动；页脚两项热区不重叠`, async ({ page }) => {
      await go(page, '/market', w);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
      const [, fb, ft] = targets(page);
      const a = (await fb[1].boundingBox())!;
      const b = (await ft[1].boundingBox())!;
      const overlap = !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
      expect(overlap).toBe(false);
    });
});

test.describe('#295 对照：浅色/深色对比 ≥4.5，图标仍是 Lucide、没有 emoji', () => {
  for (const theme of ['light', 'dark'] as const)
    for (const w of [390, 1280])
      test(`${theme} @${w}：三个入口文字对比 ≥4.5，图标是 svg.lucide，文字无 emoji`, async ({ page }) => {
        await go(page, '/market', w, theme);
        for (const [name, loc] of targets(page)) {
          expect(await contrast(loc), name).toBeGreaterThanOrEqual(4.5);
          await expect(loc.locator('svg').first(), name).toBeAttached();
          expect(await loc.locator('svg').first().getAttribute('class'), name).toMatch(/lucide/);
          expect(EMOJI.test(await loc.innerText()), name).toBe(false);
        }
      });
});
