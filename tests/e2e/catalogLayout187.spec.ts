import { expect, test } from '@playwright/test';

const CATALOGS = [
  ['units', '#ugrid'],
  ['techs', '#tgrid'],
  ['buildings', '#bgrid'],
] as const;

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
      for (const [route, grid] of CATALOGS) {
        await page.goto(`./#/${route}`);
        await expect(page.locator(`${grid} .dlcb`).first()).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const columns = await page.locator(`${grid} > .card`).evaluateAll((cards) => {
          const firstTop = cards[0]!.getBoundingClientRect().top;
          return cards.filter((card) => Math.abs(card.getBoundingClientRect().top - firstTop) < 1).length;
        });
        expect(columns, `${route} 同行资料卡`).toBeGreaterThanOrEqual(2);
        const badges = await page.locator(`${grid} .ucard:has(.dlcb)`).evaluateAll((cards) =>
          cards.map((card) => {
            const bounds = card.getBoundingClientRect();
            const badge = card.querySelector('.dlcb')!.getBoundingClientRect();
            const content = card.querySelector('.mini')!.getBoundingClientRect();
            return {
              left: badge.left - bounds.left,
              bottom: bounds.bottom - badge.bottom,
              inside: badge.left >= bounds.left && badge.right <= bounds.right && badge.bottom <= bounds.bottom,
              clear: badge.top >= content.bottom + 4,
              contentFits: [...card.querySelectorAll('small, .res, .unit-card-stats')].every((element) =>
                [...element.getClientRects()].every((rect) => rect.left >= bounds.left && rect.right <= bounds.right),
              ),
            };
          }),
        );
        expect(badges.length).toBeGreaterThan(1);
        expect(
          badges.every((badge) => badge.inside && badge.clear),
          route,
        ).toBe(true);
        expect(
          badges.every((badge) => badge.contentFits),
          `${route} 文字和费用不超出卡片`,
        ).toBe(true);
        for (const side of ['left', 'bottom'] as const) {
          const offsets = badges.map((badge) => badge[side]);
          expect(Math.max(...offsets) - Math.min(...offsets), `${route} ${side}`).toBeLessThanOrEqual(1);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
        if (theme === 'light') await page.screenshot({ path: info.outputPath(`${route}-${width}.png`) });
      }
      expect(errors).toEqual([]);
    });
