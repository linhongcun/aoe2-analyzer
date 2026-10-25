import { expect, test, type Locator } from '@playwright/test';
import { DLCS } from '../../src/domain/dlc';

async function expectSelected(bar: Locator, value: string) {
  await expect(bar.locator(`button[data-v="${value}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(bar.locator('button[aria-pressed="true"]')).toHaveCount(1);
  await expect(bar.locator('button[aria-pressed="false"]')).toHaveCount(DLCS.length + 2);
}

for (const width of [360, 375, 390, 1280]) {
  for (const theme of ['light', 'dark']) {
    test(`科技首发筛选与详情 ${width} ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.addInitScript((value) => {
        localStorage.setItem('aoe2-theme', value);
      }, theme);
      await page.goto('./#/techs');
      await expect(page.locator('#tgrid .card').first()).toBeVisible();
      const bar = page.getByRole('group', { name: '科技首发版本快捷筛选', exact: true });
      await expect(bar).toBeVisible();
      await expect(page.locator('#tdlc')).toHaveCount(0);
      await expect(bar.getByRole('button')).toHaveCount(DLCS.length + 3);
      await expect(bar.getByRole('img')).toHaveCount(DLCS.length);
      await expectSelected(bar, '');
      const panel = page.locator('#techs .catalog-filter-panel');
      await expect(panel.locator('.dbar')).toHaveCount(0);
      const toggle = page.locator('#techs .catalog-filter-toggle');
      if (width <= 600) {
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await expect(panel).toBeHidden();
      }
      for (const button of await bar.getByRole('button').all()) {
        const box = await button.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      await page.locator('#tq').fill('Chivalry');
      await bar.locator('button[data-v="2"]').click();
      await expectSelected(bar, '2');
      await expect(page.locator('#tcnt')).toHaveText('1 / 199');
      await expect(page.locator('#tgrid .card .dlci')).toHaveAttribute('alt', /失落帝国/);
      await bar.locator('button[data-v="0"]').click();
      await expectSelected(bar, '0');
      await expect(page.locator('#tcnt')).toHaveText('0 / 199');
      await page.locator('#tq').fill('Fletching');
      await expect(page.locator('#tcnt')).toHaveText('1 / 199');
      await expect(page.locator('#tgrid .card .dlci')).toHaveAttribute('alt', /国王时代/);
      await page.locator('#tq').fill('Gambesons');
      await bar.getByRole('button', { name: '免费更新', exact: true }).click();
      await expectSelected(bar, 'update');
      await expect(page.locator('#tcnt')).toHaveText('1 / 199');
      await expect(page.locator('#tgrid [data-tech-release="update"]')).toHaveText('免费更新 · 81058');
      if (width <= 600) await expect(panel).toBeHidden();
      await page.evaluate(() => document.fonts.ready);
      await expect
        .poll(() =>
          bar
            .getByRole('img')
            .evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)),
        )
        .toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`tech-filter-${width}-${theme}.png`), fullPage: true });
      await bar.getByRole('button', { name: '未标注', exact: true }).click();
      await expectSelected(bar, 'none');
      await expect(page.locator('#tcnt')).toHaveText('0 / 199');
      await bar.getByRole('button', { name: '全部', exact: true }).click();
      await expectSelected(bar, '');
      await expect(page.locator('#tcnt')).toHaveText('1 / 199');
      await page.locator('#tq').fill('');
      await expect(page.locator('#tcnt')).toHaveText('199 / 199');
      await page.goto('./#/tech/875');
      await expect(page.locator('#tech [data-tech-release="update"]')).toHaveText('免费更新 · 81058');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`tech-update-${width}-${theme}.png`), fullPage: true });
      await page.goto('./#/tech/493');
      await expect(page.locator('#tech .dlcb.big')).toContainText('失落帝国');
      await expect(page.locator('#tech [data-tech-release="update"]')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
  }
}
