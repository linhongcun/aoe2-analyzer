import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const failures = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  failures.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(failures.get(page)).toEqual([]);
});

const EVENT = 'https://www.twestaoe.net/events/suddendessaster3';

async function freeze(page: Page, iso: string) {
  await page.clock.install({ time: iso });
  await page.clock.setFixedTime(iso);
}

test('#702 @1280 开放窗口列出半决赛和决赛的上海时间与 UTC', async ({ page }) => {
  await freeze(page, '2026-11-06T12:00:00.000Z');
  await page.setViewportSize({ width: 1280, height: 900 });
  const external: string[] = [];
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (!url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1')) {
      external.push(url);
      return route.abort();
    }
    return route.continue();
  });
  await page.goto('./#/maps');
  await page.getByTestId('map-sd3').locator('summary').first().click();
  const watch = page.getByTestId('sd3-watch');
  await expect(watch).toHaveAttribute('data-state', 'open');
  await expect(watch.getByRole('heading', { name: 'SD3 观赛窗口', exact: true })).toBeVisible();
  const semifinal = watch.locator('[data-round="semifinal"]');
  const finalRound = watch.locator('[data-round="final"]');
  await expect(semifinal).toContainText('半决赛');
  await expect(semifinal).toContainText('Asia/Shanghai');
  await expect(semifinal).toContainText('2026-11-07 23:00');
  await expect(semifinal).toContainText('UTC');
  await expect(semifinal).toContainText('2026-11-07 15:00');
  await expect(finalRound).toContainText('决赛');
  await expect(finalRound).toContainText('Asia/Shanghai');
  await expect(finalRound).toContainText('2026-11-09 01:00');
  await expect(finalRound).toContainText('UTC');
  await expect(finalRound).toContainText('2026-11-08 17:00');
  await expect(watch).not.toContainText('必胜');
  await expect(watch).not.toContainText('本届已结束');
  await expect(watch).not.toContainText('直播中');
  await expect(watch.getByRole('link', { name: 'Sudden Dessaster 3 赛事页', exact: true })).toHaveAttribute('href', EVENT);
  await expect(watch.locator('a')).toHaveCount(1);
  await expect(page.getByTestId('sd3-collection')).not.toContainText('半决赛');
  const times = watch.locator('time');
  await expect(times).toHaveCount(5);
  for (const time of await times.all()) expect(await time.evaluate((node) => node.getClientRects().length)).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const report = await new AxeBuilder({ page }).include('[data-testid="sd3-watch"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(report.violations).toEqual([]);
  expect(external).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('sd3-watch-open-1280.png'), fullPage: false });
});

test('#702 决赛开打时刻仍显示时间，不写成已结束', async ({ page }) => {
  await freeze(page, '2026-11-08T17:00:00.000Z');
  await page.goto('./#/maps');
  await page.getByTestId('map-sd3').locator('summary').first().click();
  const watch = page.getByTestId('sd3-watch');
  await expect(watch).toHaveAttribute('data-state', 'open');
  await expect(watch.locator('[data-round="final"]')).toBeVisible();
  await expect(watch).not.toContainText('本届已结束');
  await expect(watch.locator('a')).toHaveCount(1);
});

test('#702 窗口到期后收起并标明本届已结束', async ({ page }) => {
  await freeze(page, '2026-11-09T00:00:00.000Z');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/maps');
  await page.getByTestId('map-sd3').locator('summary').first().click();
  const watch = page.getByTestId('sd3-watch');
  await expect(watch).toHaveAttribute('data-state', 'ended');
  const summary = watch.locator('summary');
  await expect(summary).toContainText('本届已结束');
  await expect(watch.locator('details')).not.toHaveAttribute('open');
  await expect(watch.getByText('半决赛', { exact: true })).toHaveCount(1);
  await expect(watch.getByText('半决赛', { exact: true })).not.toBeVisible();
  await expect(watch).not.toContainText('直播中');
  await expect(watch).not.toContainText('必胜');
  const collapsed = await new AxeBuilder({ page }).include('[data-testid="sd3-watch"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(collapsed.violations).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('sd3-watch-ended-1280.png'), fullPage: false });
  await summary.click();
  await expect(watch.locator('[data-round="semifinal"]')).toBeVisible();
  await expect(watch.locator('[data-round="final"]')).toContainText('2026-11-08 17:00');
  await expect(watch.getByRole('link', { name: 'Sudden Dessaster 3 赛事页', exact: true })).toHaveAttribute('href', EVENT);
  await expect(watch.locator('a')).toHaveCount(1);
});

for (const width of [360, 375, 390, 1280]) {
  test(`#702 @${width} 开放窗口不横向溢出`, async ({ page }) => {
    await freeze(page, '2026-11-06T12:00:00.000Z');
    await page.setViewportSize({ width, height: 900 });
    if (width === 390) await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));
    await page.goto('./#/maps');
    await page.getByTestId('map-sd3').locator('summary').first().click();
    const watch = page.getByTestId('sd3-watch');
    await expect(watch).toHaveAttribute('data-state', 'open');
    await expect(watch.locator('[data-round="semifinal"]')).toBeVisible();
    await expect(watch.locator('[data-round="final"]')).toBeVisible();
    for (const time of await watch.locator('time').all()) expect(await time.evaluate((node) => node.getClientRects().length)).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const link = watch.getByRole('link', { name: 'Sudden Dessaster 3 赛事页', exact: true });
    const box = await link.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: test.info().outputPath(`sd3-watch-open-${width}.png`) });
  });
}
