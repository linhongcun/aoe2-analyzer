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
        await expect(page.locator('#matchup .lhead .note')).toContainText('快攻指南、类型反制示意和相关入口');
        await expect(result).toContainText('推荐反制');
        await expect(result).toContainText('通用示意，非模型结论');
        for (const gone of ['对手强项', '相对弱项', '你的相对优势', '前期主动骚扰', '自动生成的建议']) await expect(result).not.toContainText(gone);
        await expect(result).not.toContainText(/骑兵\(\+\d/);
        await expect(result).not.toContainText(/缺骑兵|没有骑兵|不能造骑兵|你可以多用远程单位/);
        await expect(result.locator('.rating-foot')).toHaveCount(0);
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
