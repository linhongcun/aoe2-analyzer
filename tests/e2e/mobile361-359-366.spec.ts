// #361 面包屑热区、#359 科技链接虚线、#366 评分说明与「反馈给我们」不重叠。
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const NARROW = [360, 375, 390] as const;

async function go(page: Page, route: string, width: number, theme: 'light' | 'dark' = 'light', height = 800) {
  await page.addInitScript((t) => localStorage.setItem('aoe2-theme', t), theme);
  await page.setViewportSize({ width, height });
  await page.goto(`./#${route}`, { waitUntil: 'networkidle' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function hitSize(loc: Locator) {
  await loc.scrollIntoViewIfNeeded();
  return loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const on = (x: number, y: number) => document.elementFromPoint(x, y)?.closest('a,button') === el;
    const run = (dx: number, dy: number) => {
      let n = 0;
      while (n < 160 && on(cx + dx * (n + 1), cy + dy * (n + 1))) n++;
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
    const chain: Element[] = [];
    for (let n: Element | null = el; n; n = n.parentElement) chain.unshift(n);
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

test.describe('#361 面包屑链接热区', () => {
  for (const theme of ['light', 'dark'] as const)
    for (const w of NARROW)
      test(`@${w} ${theme}：每个链接可点区域 ≥44×44，文字仍对齐，无横向滚动`, async ({ page }) => {
        await go(page, '/civ/Britons', w, theme);
        const links = page.locator('nav.crumbs a');
        await expect(links).toHaveCount(2);
        const tops: number[] = [];
        for (const link of await links.all()) {
          const z = await hitSize(link);
          expect(z.w, await link.innerText()).toBeGreaterThanOrEqual(44);
          expect(z.h, await link.innerText()).toBeGreaterThanOrEqual(44);
          tops.push(
            await link.evaluate((el) => {
              const r = document.createRange();
              r.selectNodeContents(el);
              return r.getBoundingClientRect().top;
            }),
          );
          expect(await contrast(link)).toBeGreaterThanOrEqual(4.5);
        }
        const spanTop = await page.locator('nav.crumbs span').evaluate((el) => {
          const r = document.createRange();
          r.selectNodeContents(el);
          return r.getBoundingClientRect().top;
        });
        expect(Math.max(...tops, spanTop) - Math.min(...tops, spanTop)).toBeLessThanOrEqual(1);
        const navH = (await page.locator('nav.crumbs').boundingBox())!.height;
        expect(navH).toBeLessThanOrEqual(40);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
      });

  test('@1280：不错位、不换行、无横向滚动', async ({ page }) => {
    await go(page, '/civ/Britons', 1280, 'light', 900);
    const tops = await page.locator('nav.crumbs').evaluate((nav) =>
      [...nav.querySelectorAll('a, span')].map((el) => {
        const r = document.createRange();
        r.selectNodeContents(el);
        return r.getBoundingClientRect().top;
      }),
    );
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
    expect((await page.locator('nav.crumbs').boundingBox())!.height).toBeLessThanOrEqual(40);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  });
});

test.describe('#359 科技链接虚线不再吃到时间轴留白', () => {
  for (const w of [...NARROW, 1280] as const)
    test(`@${w}：虚线贴在「独轮推车」文字下，不压「各工具计入情况」`, async ({ page }) => {
      await go(page, '/civ/Vikings/bonus/0', w, 'light', 900);
      const link = page.locator('p.bz a', { hasText: '独轮推车' });
      await expect(link).toHaveClass(/tlink/);
      await expect(link).not.toHaveClass(/\btl\b/);
      const gap = await link.evaluate((a) => {
        const box = a.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(a);
        const text = range.getBoundingClientRect();
        const usage = [...document.querySelectorAll('p')].find((p) => p.textContent?.includes('各工具计入情况'))!;
        const u = usage.getBoundingClientRect();
        const covers = box.top < u.bottom && box.bottom > u.top && box.left < u.right && box.right > u.left;
        return { gap: box.bottom - text.bottom, covers, pad: getComputedStyle(a).paddingBottom };
      });
      expect(gap.pad).toBe('0px');
      expect(gap.gap).toBeLessThanOrEqual(2);
      expect(gap.covers).toBe(false);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    });

  test('@360 时间轴容器仍留出底部分享条的 110px', async ({ page }) => {
    await go(page, '/builds?bo=scouts-18', 360);
    await expect(page.locator('section.pane.tl')).toHaveCSS('padding-bottom', '110px');
    await expect(page.locator('.tl-steps')).toBeVisible();
  });

  test('@1280 时间轴容器没有那段底边留白', async ({ page }) => {
    await go(page, '/builds?bo=scouts-18', 1280, 'light', 900);
    await expect(page.locator('section.pane.tl')).toHaveCSS('padding-bottom', '0px');
  });
});

test.describe('#366 评分说明不被「反馈给我们」盖住', () => {
  for (const theme of ['light', 'dark'] as const)
    for (const w of NARROW)
      test(`@${w} ${theme}：评分说明网格命中自己，「反馈给我们」仍 ≥44×44，axe target-size 0`, async ({ page }) => {
        await go(page, '/civ/Britons', w, theme);
        const btn = page.getByRole('button', { name: '评分说明' }).first();
        await btn.click();
        const pop = page.getByRole('dialog', { name: '评分是怎么来的' });
        await expect(pop).toBeVisible();
        const link = pop.getByRole('link', { name: /反馈给我们/ });
        const grid = await btn.evaluate((button) => {
          const r = button.getBoundingClientRect();
          const misses: string[] = [];
          for (const x of [0.1, 0.3, 0.5, 0.7, 0.9])
            for (const y of [0.15, 0.5, 0.85]) {
              const el = document.elementFromPoint(r.left + r.width * x, r.top + r.height * y);
              if (el?.closest('button') !== button) misses.push(`${x},${y}`);
            }
          const lr = document.querySelector('.rl-pop a')!.getBoundingClientRect();
          const overlap = lr.left < r.right && lr.right > r.left && lr.top < r.bottom && lr.bottom > r.top;
          return { misses, overlap };
        });
        expect(grid.misses).toEqual([]);
        expect(grid.overlap).toBe(false);
        const z = await hitSize(link);
        expect(z.w).toBeGreaterThanOrEqual(44);
        expect(z.h).toBeGreaterThanOrEqual(44);
        const axe = await new AxeBuilder({ page }).include('.detail-ratings-heading').withRules(['target-size']).analyze();
        expect(axe.violations).toEqual([]);
      });

  test('@1280：浮层不盖住评分说明', async ({ page }) => {
    await go(page, '/civ/Britons', 1280, 'light', 900);
    await page.getByRole('button', { name: '评分说明' }).first().click();
    const overlap = await page.evaluate(() => {
      const r = document.querySelector('button[aria-label="评分说明"]')!.getBoundingClientRect();
      const lr = document.querySelector('.rl-pop a')!.getBoundingClientRect();
      return lr.left < r.right && lr.right > r.left && lr.top < r.bottom && lr.bottom > r.top;
    });
    expect(overlap).toBe(false);
  });
});
