import { expect, test, type Page } from '@playwright/test';

const messages = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  messages.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(messages.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

const orderIds = ['feudal-drush-18', 'hybrid-fish-18', 'maa-archers-18', 'scouts-18', 'archers-19', 'fast-castle-boom', 'fast-castle-knights', 'drush-fc'];

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'] as const)
    test(`#479 全部开局均可快速定位 ${width} ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/builds');
      const panel = page.locator('#builds');
      await expect(panel).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(panel.locator('.lhead')).toContainText('8 个主流开局');
      const groups = panel.locator('details.bo');
      await expect(groups).toHaveCount(orderIds.length);
      const quick = panel.locator('.tl-empty-btns button');
      await expect(quick).toHaveCount(orderIds.length);
      expect(await quick.evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-controls')))).toEqual(orderIds.map((id) => `bo-${id}`));
      expect(await groups.evaluateAll((elements) => elements.map((element) => element.id))).toEqual(orderIds.map((id) => `bo-${id}`));
      for (const button of await quick.all()) {
        const box = await button.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      const screenshot = info.outputPath(`quick-links-${width}-${theme}.png`);
      await page.screenshot({ path: screenshot, fullPage: false });
      await info.attach('全部开局快速定位', { path: screenshot, contentType: 'image/png' });

      for (const [id, keyboard] of [
        ['fast-castle-knights', false],
        ['drush-fc', true],
      ] as const) {
        const button = panel.locator(`.tl-empty-btns button[aria-controls="bo-${id}"]`);
        if (keyboard) {
          await button.focus();
          await button.press('Enter');
        } else await button.click();
        const group = panel.locator(`#bo-${id}`);
        await expect(group).toHaveAttribute('open', '');
        const summary = group.locator('summary');
        await expect(summary).toBeFocused();
        await expect(summary).toBeInViewport();
        await expect(group.getByRole('link', { name: '看时间线', exact: true })).toHaveAttribute('href', `#/builds?bo=${id}`);
      }
    });
