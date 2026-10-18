import { expect, test } from '@playwright/test';
import { DLCS } from '../../src/domain/dlc';

const DETAILS = [
  ['unit', 751, 2],
  ['unit', 753, 1],
  ['unit', 1747, 8],
  ['unit', 1813, 10],
  ['unit', 1302, 11],
  ['building', 792, 2],
  ['building', 2556, 12],
  ['building', 82, 0],
] as const;

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#190 ${theme} @${width}：具体单位和建筑显示首发版本，列表筛选一致`, async ({ page }, info) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      for (const [kind, id, release] of DETAILS) {
        await page.goto(`./#/${kind}/${id}`);
        const badge = page.locator(`#${kind} .dhead .dlcb.big`);
        await expect(badge).toContainText(DLCS[release]!.zh);
        await expect(badge.locator('img')).toHaveAttribute('src', new RegExp(`/img/dlc/${release}\\.webp$`));
        await page.evaluate(() => document.fonts.ready);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${kind}/${id}`).toBe(true);
        if (theme === 'light') await page.screenshot({ path: info.outputPath(`${kind}-${id}-${width}.png`) });
      }

      await page.goto('./#/units');
      await expect(page.locator('#ugrid .card').first()).toBeVisible();
      await page.locator('#uq').fill('Eagle');
      await page.locator('#udlc').selectOption('2');
      await expect(page.locator('#ugrid .card')).toHaveCount(1);
      await expect(page.locator('#ugrid .card')).toHaveAttribute('data-unit-id', '751');
      await expect(page.locator('#ugrid .card .dlcb img')).toHaveAttribute('src', /\/img\/dlc\/2\.webp$/);
      await page.locator('#udlc').selectOption('1');
      await expect(page.locator('#ugrid .card')).toHaveCount(1);
      await expect(page.locator('#ugrid .card')).toHaveAttribute('data-unit-id', '753');
      await page.locator('#uq').fill('战车');
      await page.locator('#udlc').selectOption('8');
      await expect(page.locator('#ugrid .card[data-unit-id="1759"]')).toBeVisible();
      await expect(page.locator('#ugrid .card[data-unit-id="1962"]')).toHaveCount(0);
      await page.locator('#udlc').selectOption('11');
      await expect(page.locator('#ugrid .card[data-unit-id="1962"]')).toBeVisible();
      await expect(page.locator('#ugrid .card[data-unit-id="1759"]')).toHaveCount(0);
      await page.locator('#uq').fill('');
      await page.locator('#udlc').selectOption('0');
      await expect(page.locator('#ugrid .card[data-unit-id="74"]')).toBeVisible();
      await page.locator('#udlc').selectOption('none');
      await expect(page.locator('#ugrid .card')).toHaveCount(0);
      await expect(page.locator('#ucnt')).toHaveText(/^0 \/ /);

      await page.goto('./#/buildings');
      await expect(page.locator('#bgrid .card').first()).toBeVisible();
      await page.locator('#bdlc').selectOption('2');
      await expect(page.locator('#bgrid .card[href="#/building/792"]')).toBeVisible();
      await expect(page.locator('#bgrid .card[href="#/building/82"]')).toHaveCount(0);
      await page.locator('#bdlc').selectOption('12');
      await expect(page.locator('#bgrid .card[href="#/building/2556"]')).toBeVisible();
      await page.locator('#bdlc').selectOption('0');
      await expect(page.locator('#bgrid .card[href="#/building/82"]')).toBeVisible();
      await page.locator('#bdlc').selectOption('none');
      await expect(page.locator('#bgrid .card')).toHaveCount(0);
      await expect(page.locator('#bcnt')).toHaveText('0 / 38');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
