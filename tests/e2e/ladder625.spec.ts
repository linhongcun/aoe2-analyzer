import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const width of [360, 375, 390, 1280]) {
  for (const theme of ['light', 'dark']) {
    test(`#625 @${width} ${theme} Elo 不跳模式，缺档禁用，明确切模式更新来源`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/ladder?view=meta');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const group = page.getByTestId('ladder-elo');
      await expect(group.locator('[data-elo="all"]')).toHaveCount(0);
      await expect(group.locator('[data-elo="1200-1400"]')).toHaveAttribute('aria-checked', 'true');
      await expect(group.locator('[data-elo="1200-1400"]')).toBeEnabled();
      await expect(page.getByTestId('ladder-elo-gap')).toContainText('其他 Elo 分段暂无本模式快照，不估算。');
      await expect(page.getByTestId('ladder-source')).toHaveAttribute('data-slice-mode', '4v4');
      await expect(page).toHaveURL(/#\/ladder\?view=meta$/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`ladder625-${width}-${theme}-team.png`), fullPage: true });

      await page.getByTestId('ladder-mode-arabia1v1').click();
      await expect(group.locator('[data-elo="all"]')).toBeEnabled();
      await expect(group.locator('[data-elo="all"]')).toHaveAttribute('aria-checked', 'true');
      await expect(group.locator('[data-elo="1200-1400"]')).toHaveCount(0);
      await expect(page.getByTestId('ladder-source')).toHaveAttribute('data-slice-mode', 'arabia1v1');
      await expect(page.getByTestId('ladder-source')).toHaveAttribute('data-slice-elo', 'all');
      await expect(page.getByTestId('ladder-source')).toContainText('阿拉伯');
      await expect(page).toHaveURL(/#\/ladder\?mode=arabia1v1&view=meta$/);
      await page.screenshot({ path: testInfo.outputPath(`ladder625-${width}-${theme}-arabia.png`), fullPage: true });
      if (width === 1280) expect((await new AxeBuilder({ page }).include('[data-testid="ladder-page"]').analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
  }
}

test('#625 缺快照深链可用键盘恢复，Elo 不改变原模式', async ({ page }) => {
  for (const mode of ['4v4', 'arabia1v1']) {
    await page.goto(`./#/ladder?mode=${mode}&elo=${mode === '4v4' ? 'lt850' : '1200-1400'}`);
    await expect(page.getByTestId('ladder-empty')).toBeVisible();
    await expect(page.getByTestId('ladder-table')).toHaveCount(0);
    const missing = page.getByTestId('ladder-elo-disabled');
    await expect(missing).toHaveAttribute('aria-checked', 'true');
    await missing.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('ladder-empty')).toHaveCount(0);
    await expect(page.getByTestId('ladder-elo-option')).toBeFocused();
    await expect(page.getByTestId('ladder-source')).toHaveAttribute('data-slice-mode', mode);
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('ladder-source')).toHaveAttribute('data-slice-mode', mode);
  }
});
