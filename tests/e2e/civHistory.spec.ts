import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const theme of ['light', 'dark']) {
  for (const width of [360, 375, 390, 1280]) {
    test(`文明历史 ${theme} ${width}：摘要、键盘展开、来源与布局`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./#/civ/Chinese');
      const history = page.getByRole('article', { name: '文明历史', exact: true });
      await expect(history).toBeVisible();
      await expect(history.getByRole('heading', { level: 2, name: '文明历史', exact: true })).toBeVisible();
      await expect(history).toContainText('根据官方资料整理的中文摘要');
      await expect(history).toContainText('2026-11-03');
      const details = history.locator('details');
      const summary = details.locator('summary');
      await expect(summary).toHaveText('展开历史背景');
      await expect(details).not.toHaveAttribute('open', '');
      const source = history.getByRole('link', { name: /官方原文/ });
      await expect(source).toHaveAttribute('href', 'https://www.forgottenempires.net/age-of-empires-ii-definitive-edition/civilizations/chinese');
      for (const control of [summary, source]) {
        const box = await control.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const url = page.url();
      await summary.focus();
      await page.keyboard.press('Enter');
      await expect(details).toHaveAttribute('open', '');
      await expect(details.locator('p').first()).toBeVisible();
      expect(page.url()).toBe(url);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const violations = (await new AxeBuilder({ page }).include('[data-testid="civ-history"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations;
      expect(violations).toEqual([]);
      await history.screenshot({ path: testInfo.outputPath(`history-${theme}-${width}.png`) });
      await summary.focus();
      await page.keyboard.press('Space');
      await expect(details).not.toHaveAttribute('open', '');
      await expect(source).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
}

test('切换文明与页签：背景不串页，更新历史保留补丁语义', async ({ page }) => {
  await page.goto('./#/civ/Franks');
  const history = page.getByTestId('civ-history');
  await expect(history).toContainText('法兰克');
  await history.locator('summary').click();
  await expect(history.locator('details')).toHaveAttribute('open', '');
  await page.getByRole('tab', { name: '数据', exact: true }).click();
  await expect(history).toHaveCount(0);
  await page.getByRole('tab', { name: '概览', exact: true }).click();
  await expect(history.locator('details')).not.toHaveAttribute('open', '');
  await history.locator('summary').click();
  await expect(history.locator('details')).toHaveAttribute('open', '');
  const originalSummary = await history.locator('.civ-history-lead').innerText();
  await page.evaluate(() => {
    window.location.hash = '/civ/Khitans';
  });
  await expect(history).toContainText('契丹');
  await expect(history.locator('.civ-history-lead')).not.toHaveText(originalSummary);
  await expect(history.locator('details')).not.toHaveAttribute('open', '');
  await expect(history.getByRole('link', { name: /官方原文/ })).toHaveAttribute('href', /ageofempires\.com/);
  await page.goto('./#/civ/Chinese?tab=history');
  await expect(page.getByRole('tab', { name: '更新历史', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(history).toHaveCount(0);
});

for (const width of [360, 375]) {
  test(`格鲁吉亚 ${width} 的中文世纪与单位不拆行`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./#/civ/Georgians');
    const history = page.getByTestId('civ-history');
    await history.locator('summary').click();
    for (const text of ['十一世纪', '十三世纪']) {
      const number = history.locator('.nw').filter({ hasText: new RegExp(`^${text}$`) });
      await expect(number).toBeVisible();
      expect(
        await number.evaluate((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          return range.getClientRects().length;
        }),
      ).toBe(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
