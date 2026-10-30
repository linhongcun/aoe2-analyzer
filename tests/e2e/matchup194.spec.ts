import { expect, test, type Page } from '@playwright/test';

async function pickCiv(page: Page, id: string, civ: string) {
  await page.locator(`#${id}`).click();
  await page.locator(`.cp-panel [data-civ="${civ}"]`).click();
  await expect(page.locator(`#${id}`)).toHaveAttribute('data-value', civ);
}

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#194 ${theme} @${width}：相对评分不声称缺兵种，反制保持可用`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/matchup');
      await expect(page.locator('#matchup .matchup-title')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await pickCiv(page, 'ma', 'Franks');
      const result = page.locator('#mres');
      for (const [opponent, name] of [
        ['Chinese', '中国'],
        ['Japanese', '日本'],
      ]) {
        await pickCiv(page, 'me', opponent!);
        await expect(page.locator('#matchup .matchup-title')).toContainText(name!);
        await expect(result.locator('p').first()).toContainText('相对弱项：');
        await expect(result.locator('p').first()).toContainText('骑兵');
        await expect(result).not.toContainText(/缺骑兵|没有骑兵|不能造骑兵|你可以多用远程单位/);
        await expect(result.locator('.rating-foot')).toContainText('评分仅描述相对强弱，不代表兵种是否可用。');
        await page.evaluate(() => document.fonts.ready);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (opponent === 'Chinese') await page.screenshot({ path: info.outputPath(`matchup-${width}-${theme}.png`), fullPage: true });
      }

      await pickCiv(page, 'ma', 'Mayans');
      await pickCiv(page, 'me', 'Franks');
      const counters = result.locator('.matchup-counter-link');
      expect(await counters.count()).toBeGreaterThan(0);
      await expect(result.locator('.matchup-counter-list')).not.toContainText(/骑士|骆驼/);
      await expect(counters.first()).toHaveAttribute('href', /^#\/unit\/\d+\?civ=Mayans&from=matchup&me=Mayans&opp=Franks$/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
