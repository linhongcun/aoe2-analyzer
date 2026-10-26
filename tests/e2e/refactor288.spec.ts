import { expect, test, type Page } from '@playwright/test';

const AB = 'a=569.Franks.4.f.&b=359.Japanese.4.f.';
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

for (const width of [360, 375, 390, 1280]) {
  for (const theme of ['light', 'dark']) {
    test(`#288 拆分后单位PK与开局交互 ${width} ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.goto(`./#/duel?${AB}&m=1`);
      await expect(page.locator('#duel-res .duel-tab')).toBeVisible();
      await expect(page.locator('#duel-a .duel-head .duel-side-title')).toContainText('游侠');
      await expect(page.locator('.duel-tl .tl-hit').first()).toBeAttached();
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath(`duel-${width}-${theme}.png`), fullPage: true });

      const modes = page.getByRole('radiogroup', { name: '模式', exact: true });
      await modes.getByRole('radio', { name: 'N vs M', exact: true }).click();
      await page.locator('#duel-na').fill('12');
      await expect(page).toHaveURL(/(?:[?&])na=12(?:&|$)/);
      await expect(page.locator('#duel-res .duel-tab')).toContainText('A 12');
      await expect(page.locator('.duel-chart path')).toHaveCount(2);
      await noOverflow(page);
      await modes.getByRole('radio', { name: '等资源', exact: true }).click();
      await expect(page.locator('#duel-bud')).toBeVisible();
      await page.getByRole('radiogroup', { name: '比法' }).getByRole('radio', { name: '等采集时间', exact: true }).click();
      await expect(page.locator('[data-t="rc-budget-text"]')).toBeVisible();
      await expect(page).toHaveURL(/(?:[?&])m=t(?:&|$)/);
      await noOverflow(page);

      await page.goto('./#/duel?a=39.Magyars.3.f.&b=39.Franks.3.f.&m=1');
      await expect(page.locator('#duel-b')).toHaveAttribute('data-unavailable', 'true');
      await expect(page.locator('#duel-res')).toHaveCount(0);
      await page.locator('#duel-b').getByRole('button', { name: '换成骑马弩兵', exact: true }).click();
      await expect(page.locator('#duel-res')).toBeVisible();
      await noOverflow(page);

      await page.goto('./#/builds?bo=scouts-18');
      await expect(page.locator('.tl-steps')).toBeVisible();
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath(`builds-${width}-${theme}.png`), fullPage: true });
      const historyLength = await page.evaluate(() => history.length);
      const settingsButton = page.locator('.tl-setbtn');
      if (width < 1280) await settingsButton.click();
      const settings = width < 1280 ? page.getByRole('dialog', { name: '设置', exact: true }) : page.locator('.tl-inline-settings');
      await settings.getByRole('radio', { name: '远', exact: true }).click();
      await expect(page).toHaveURL(/(?:[?&])dist=/);
      expect(await page.evaluate(() => history.length)).toBe(historyLength);
      if (width < 1280) {
        await page.keyboard.press('Escape');
        await expect(settings).toHaveCount(0);
        await expect(settingsButton).toBeFocused();
      }
      const firstStep = page.locator('[data-step="0"] .tl-step');
      await firstStep.click();
      await expect(firstStep).toHaveAttribute('aria-expanded', 'true');
      await firstStep.press('Escape');
      await expect(firstStep).toHaveAttribute('aria-expanded', 'false');
      await noOverflow(page);
      expect(errors).toEqual([]);
    });
  }
}
