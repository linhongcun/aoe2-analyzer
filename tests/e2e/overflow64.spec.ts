import { expect, test, type Page } from '@playwright/test';

/**
 * #64 横向溢出守卫（Jony 设计 #64#issuecomment-6114971212 末尾验收）：
 * /duel、/about-data、6 条开局 × 四档宽度，scrollWidth 不超过视口宽度；开局时间线的时代标记互不重叠。
 */

const WIDTHS = [360, 375, 390, 1280] as const;
const BUILDS = ['archers-19', 'drush-fc', 'fast-castle-boom', 'feudal-drush-18', 'maa-archers-18', 'scouts-18'] as const;

async function noHScroll(page: Page) {
  const { sw, vw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: window.innerWidth }));
  expect(sw, `scrollWidth ${sw} > 视口 ${vw}`).toBeLessThanOrEqual(vw);
}

for (const width of WIDTHS) {
  test.describe(`#64 宽度 ${width}`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('/duel 无横向溢出，刻度贴齐轨道两端', async ({ page }) => {
      await page.goto('./#/duel');
      await expect(page.locator('#duel-res h3')).toBeVisible();
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
