import { expect, test, type Page } from '@playwright/test';

/**
 * #64 横向溢出守卫（Jony 设计 #64#issuecomment-6114971212 末尾验收）：
 * /duel、/about-data、6 条开局 × 四档宽度，scrollWidth 不超过视口宽度；开局时间线的时代标记互不重叠。
 */

const WIDTHS = [360, 375, 390, 1280] as const;
const BUILDS = ['archers-19', 'drush-fc', 'fast-castle-boom', 'feudal-drush-18', 'maa-archers-18', 'scouts-18'] as const;

/** 逐个元素检查右缘不超出视口（跳过自身可横向滚动容器里的内容） */
async function eachInViewport(page: Page, root: string) {
  const bad = await page.evaluate((sel) => {
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    for (const el of document.querySelectorAll(`${sel}, ${sel} *`)) {
      let p = el.parentElement,
        scrolled = false;
      while (p && !scrolled) {
        const ox = getComputedStyle(p).overflowX;
        scrolled = (ox === 'auto' || ox === 'scroll' || ox === 'hidden') && p !== document.body && p !== document.documentElement;
        p = p.parentElement;
      }
      if (scrolled) continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.right > vw + 0.5) out.push(`${el.tagName.toLowerCase()}.${el.className} right=${Math.round(r.right)}`);
    }
    return { vw, out };
  }, root);
  expect(bad.out, `视口 ${bad.vw} 内越界元素`).toEqual([]);
}

async function noHScroll(page: Page) {
  const { sw, vw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: window.innerWidth }));
  expect(sw, `scrollWidth ${sw} > 视口 ${vw}`).toBeLessThanOrEqual(vw);
}

for (const width of WIDTHS) {
  test.describe(`#64 宽度 ${width}`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('/duel 无横向溢出，刻度贴齐轨道两端', async ({ page }) => {
      await page.goto('./#/duel');
      await expect(page.locator('#duel-res .duel-win')).toBeVisible();
      await noHScroll(page);
      const box = await page.evaluate(() => {
        const tl = document.querySelector('.duel-tl')!;
        const track = tl.querySelector('.tl-track')!.getBoundingClientRect();
        const s = tl.querySelectorAll('.tl-axis span');
        const a = s[0]!.getBoundingClientRect();
        const b = s[s.length - 1]!.getBoundingClientRect();
        return { tl: track.left, tr: track.right, al: a.left, br: b.right };
      });
      expect(Math.abs(box.al - box.tl)).toBeLessThanOrEqual(1);
      expect(Math.abs(box.br - box.tr)).toBeLessThanOrEqual(1);
      await eachInViewport(page, '#duel-res');
    });

    test('/duel N vs M 群战：无横向溢出，刻度在图表内且贴齐两端，逐元素不越界', async ({ page }) => {
      await page.goto('./#/duel?m=n');
      await expect(page.locator('#duel-res .duel-chart')).toBeVisible();
      await noHScroll(page);
      const box = await page.evaluate(() => {
        const chartEl = document.querySelector('#duel-res .duel-chart')!;
        const chart = chartEl.getBoundingClientRect();
        const start = Math.min(...[...chartEl.querySelectorAll('path')].map((p) => p.getBoundingClientRect().left));
        const axis = document.querySelector('#duel-res .duel-chart + .tl-axis')!;
        const s = axis.querySelectorAll('span');
        const a = s[0]!.getBoundingClientRect();
        const b = s[s.length - 1]!.getBoundingClientRect();
        const ax = axis.getBoundingClientRect();
        return { start, cl: chart.left, cr: chart.right, al: a.left, br: b.right, xl: ax.left, xr: ax.right };
      });
      expect(box.xl).toBeGreaterThanOrEqual(box.cl - 1);
      expect(box.xr).toBeLessThanOrEqual(box.cr + 1);
      // 「0s」左缘 = 曲线起点（群战图没有标签列）±1px；末尾刻度贴齐图表右缘
      expect(Math.abs(box.al - box.start)).toBeLessThanOrEqual(1);
      expect(Math.abs(box.br - box.cr)).toBeLessThanOrEqual(1);
      await eachInViewport(page, '#duel-res');
    });

    test('/about-data 无横向溢出', async ({ page }) => {
      await page.goto('./#/about-data');
      await expect(page.locator('#about-data table.stat')).toBeVisible();
      await noHScroll(page);
    });

    for (const bo of BUILDS) {
      test(`开局 ${bo}：无横向溢出，时代标记不重叠`, async ({ page }) => {
        await page.goto(`./#/builds?bo=${bo}`);
        await expect(page.getByRole('list', { name: /时间线/ })).toBeVisible();
        await noHScroll(page);
        const rects = await page.evaluate(() =>
          [...document.querySelectorAll('.tl-row[data-row="age"] .tl-age')].map((e) => {
            const r = e.getBoundingClientRect();
            return { l: r.left, r: r.right, t: r.top, b: r.bottom };
          }),
        );
        expect(rects.length).toBeGreaterThan(0);
        for (let i = 0; i < rects.length; i++)
          for (let j = i + 1; j < rects.length; j++) {
            const A = rects[i]!,
              B = rects[j]!;
            const overlap = A.l < B.r && B.l < A.r && A.t < B.b && B.t < A.b;
            expect(overlap, `时代标记 ${i} 与 ${j} 重叠`).toBe(false);
          }
      });
    }
  });
}
