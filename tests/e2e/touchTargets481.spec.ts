import { expect, test, type Locator, type Page } from '@playwright/test';

const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') messages.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

async function touchTarget(link: Locator) {
  await link.scrollIntoViewIfNeeded();
  const box = await link.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(
    await link.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return hit?.closest('a') === element;
    }),
  ).toBe(true);
}

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'] as const)
    test(`#481 实际链接热区合格且市集复选框保持 ${width} ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/market');
      const market = page.getByTestId('market-page');
      await expect(market).toBeVisible();
      const guilds = market.getByRole('checkbox', { name: '已研究行会', exact: true });
      await expect(guilds).toHaveAccessibleName('已研究行会');
      const label = market.locator('label.market-check').filter({ has: page.getByRole('checkbox', { name: '已研究行会', exact: true }) });
      const labelBox = await label.boundingBox();
      expect(labelBox).not.toBeNull();
      expect(labelBox!.width).toBeGreaterThanOrEqual(44);
      expect(labelBox!.height).toBeGreaterThanOrEqual(44);
      await expect(guilds).not.toBeChecked();
      await label.click({ position: { x: labelBox!.width - 4, y: labelBox!.height / 2 } });
      await expect(guilds).toBeChecked();
      for (const button of await market.getByRole('button').all()) await expect(button).toHaveAccessibleName(/\S/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

      await page.goto('./#/builds');
      const glossary = page.getByRole('link', { name: '查看术语与缩写', exact: true });
      await expect(glossary).toHaveAttribute('href', '#/glossary');
      await touchTarget(glossary);
      const glossaryImage = info.outputPath(`glossary-target-${width}-${theme}.png`);
      await page.screenshot({ path: glossaryImage, fullPage: false });
      await info.attach('术语链接热区', { path: glossaryImage, contentType: 'image/png' });
      const footer = page.locator('footer.editorial-footer');
      await footer.locator('.footer-sources summary').click();
      await expect(footer.getByRole('link', { name: 'Lucide', exact: true })).toHaveAttribute('href', 'https://lucide.dev');
      await expect(footer.locator('[data-t="footer-version"]')).toHaveAttribute('href', '#/about-data');
      for (const link of await footer.locator('a:not(.fblink)').all()) await touchTarget(link);
      const footerImage = info.outputPath(`footer-targets-${width}-${theme}.png`);
      await page.screenshot({ path: footerImage, fullPage: false });
      await info.attach('页脚链接热区', { path: footerImage, contentType: 'image/png' });
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    });
