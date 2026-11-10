import { expect, test } from '@playwright/test';

// #883 起科技目录改为结果行，不再用资料片图标卡。这里只保留仍是卡片的建筑列表。
const CATALOGS = [['buildings', '#bgrid']] as const;

for (const width of [360, 375, 390, 1280, 1920])
  for (const theme of ['light', 'dark'])
    test(`#187 ${theme} @${width}：资料卡版本图标对齐且不遮挡文字`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.goto('./#/units');
      await expect(page.locator('#ugrid .unit-row').first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'units').toBe(true);
      for (const [route, grid] of CATALOGS) {
        await page.goto(`./#/${route}`);
        await expect(page.locator(`${grid} > .card`).first()).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const columns = await page.locator(`${grid} > .card`).evaluateAll((cards) => {
          const firstTop = cards[0]!.getBoundingClientRect().top;
          return cards.filter((card) => Math.abs(card.getBoundingClientRect().top - firstTop) < 1).length;
        });
        expect(columns, `${route} 同行资料卡`).toBeGreaterThanOrEqual(2);
        // #881：建筑卡用文字标记，不再把资料片图标钉在左下角。
        await expect(page.locator(`${grid} .b-card .b-cost`).first()).toBeVisible();
        const fits = await page.locator(`${grid} .b-card`).evaluateAll((cards) =>
          cards.every((card) => {
            const bounds = card.getBoundingClientRect();
            return [...card.querySelectorAll('.b-zh, .b-en, .b-meta, .b-cost, .b-flags')].every((element) =>
              [...element.getClientRects()].every((rect) => rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1),
            );
          }),
        );
        expect(fits, '建筑卡文字和造价不超出卡片').toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
        if (theme === 'light') {
          await page.locator(`${grid} > .card`).first().scrollIntoViewIfNeeded();
          await page.screenshot({ path: info.outputPath(`${route}-${width}.png`) });
        }
      }
      expect(errors).toEqual([]);
    });
