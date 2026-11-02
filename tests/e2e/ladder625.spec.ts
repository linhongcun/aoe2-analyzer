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
      const keys = await group.locator('[data-elo]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-elo')));
      const all = group.locator('[data-elo="all"]');
      await expect(all).toBeDisabled();
      await expect(all).toContainText('暂无数据');
      await expect(group.locator('[data-elo="1200-1400"]')).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId('ladder-source')).toHaveAttribute('data-slice-mode', '4v4');
      await expect(page).toHaveURL(/#\/ladder\?view=meta$/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`ladder625-${width}-${theme}-team.png`), fullPage: true });

      await page.getByTestId('ladder-mode-arabia1v1').click();
      await expect(all).toBeEnabled();
      await expect(all).toHaveAttribute('aria-checked', 'true');
      await expect(group.locator('[data-elo="1200-1400"]')).toBeDisabled();
      await expect(group.locator('[data-elo="1200-1400"]')).toContainText('暂无数据');
      expect(await group.locator('[data-elo]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-elo')))).toEqual(keys);
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
    for (let i = 0; i < 60; i++) {
      if (await page.evaluate(() => document.activeElement?.matches('[data-testid="ladder-elo-option"]'))) break;
      await page.keyboard.press('Tab');
    }
    await expect(page.getByTestId('ladder-elo-option')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('ladder-empty')).toHaveCount(0);
    await expect(page.getByTestId('ladder-elo-option')).toBeFocused();
    await expect(page.getByTestId('ladder-source')).toHaveAttribute('data-slice-mode', mode);
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('ladder-elo-option')).toBeFocused();
    await expect(page.getByTestId('ladder-source')).toHaveAttribute('data-slice-mode', mode);
  }
});
