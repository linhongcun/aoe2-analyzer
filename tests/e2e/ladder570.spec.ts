// #570。正式页不把全时段快照当成 2026-05 至 2026-10。有数据和低样本用标明的测试夹具。
import { expect, test, type Page } from '@playwright/test';

const WIDTHS = [360, 375, 390, 1280] as const;

async function openLadder(page: Page, hash: string, width: number) {
  const hits: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (/aoe2insights\.com/i.test(request.url())) hits.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`./#${hash}`);
  await expect(page.getByTestId('ladder-page')).toBeVisible();
  return { hits, errors };
}

test('#570 夹具切图同步来源，299 不露胜率，300 可显示，全隐藏不是无快照', async ({ page }) => {
  const { hits, errors } = await openLadder(page, '/ladder?mode=arabia1v1&fixture=570-data', 1280);
  await expect(page.getByTestId('ladder-fixture-banner')).toBeVisible();
  await expect(page.getByTestId('ladder-source-map')).toHaveText('阿拉伯');
  await expect(page.getByTestId('ladder-source-elo')).toHaveText('Elo 未筛选');
  await expect(page.getByTestId('ladder-elo').getByText('未筛选')).toBeVisible();
  await expect(page.getByTestId('ladder-source-details')).not.toHaveAttribute('open', '');
  await expect(page.getByTestId('ladder-row-Franks')).toHaveAttribute('data-sample', '300');
  await expect(page.getByTestId('ladder-win-Franks')).toContainText('50.00%');
  await expect(page.getByTestId('ladder-row-Goths')).toHaveCount(0);

  await page.getByTestId('ladder-hide-low').uncheck();
  const goths = page.getByTestId('ladder-row-Goths');
  await expect(goths).toHaveAttribute('data-sample', '299');
  await expect(goths).toHaveAttribute('data-win-shown', 'false');
  await expect(goths).toContainText('样本不足');
  await expect(goths).not.toContainText('%');
  await expect(page.getByTestId('ladder-row-Celts')).toHaveAttribute('data-win-shown', 'false');

  await page.getByTestId('ladder-map-arena').click();
  await expect(page.getByTestId('ladder-map-arena')).toBeFocused();
  await expect(page.getByTestId('ladder-source-map')).toHaveText('竞技场');
  await expect(page.getByTestId('ladder-source')).toHaveAttribute('data-sha256', 'b'.repeat(64));
  await expect(page.getByTestId('ladder-row-Franks')).toHaveAttribute('data-sample', '480');
  await expect(page.getByTestId('ladder-win-Franks')).toContainText('25.00%');
  await page.getByTestId('ladder-source-details').locator('summary').click();
  await expect(page.getByTestId('ladder-query-url')).toContainText('map=arena');

  await page.goto('./#/ladder?mode=arabia1v1&fixture=570-low');
  await page.getByTestId('ladder-hide-low').check();
  await expect(page.getByTestId('ladder-low-hidden')).toContainText('当前结果均为低样本，已隐藏');
  await expect(page.getByTestId('ladder-low-hidden')).not.toContainText('暂无快照');
  await page.getByTestId('ladder-show-low').click();
  await expect(page.getByTestId('ladder-row-Franks')).toHaveAttribute('data-win-shown', 'false');
  await expect(page.getByTestId('ladder-win-Franks')).not.toContainText('%');

  expect(hits, '夹具流程不应请求 AoE2 Insights').toEqual([]);
  expect(errors).toEqual([]);
});

test('#570 正式地址缺 6 个月窗口时不回退全时段或旧图胜率', async ({ page }) => {
  const { hits, errors } = await openLadder(page, '/ladder?mode=arabia1v1&map=arena', 1280);
  await expect(page.getByTestId('ladder-empty')).toContainText('该地图与分段暂无快照，不推算、不补数。');
  await expect(page.getByTestId('ladder-insights-table')).toHaveCount(0);
  await expect(page.getByTestId('ladder-map-arena')).toBeDisabled();
  await expect(page.getByTestId('ladder-map-arena')).toContainText('暂无数据');
  await expect(page.getByTestId('ladder-elo').getByText('未筛选')).toBeVisible();
  await expect(page.getByTestId('ladder-row-Franks')).toHaveCount(0);
  await page.reload();
  await expect(page).toHaveURL(/map=arena/);
  await expect(page.getByTestId('ladder-empty')).toBeVisible();
  await page.getByRole('button', { name: '看现有阿拉伯快照' }).click();
  await expect(page.getByTestId('ladder-source')).toHaveAttribute('data-fetched-at', '2026-11-01');
  expect(hits).toEqual([]);
  expect(errors).toEqual([]);
});

for (const width of WIDTHS) {
  test(`#570 @${width} dark 三态不撑出横向滚动`, async ({ page }, testInfo) => {
    const { errors } = await openLadder(page, '/ladder?mode=arabia1v1&fixture=570-data', width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`data-${width}.png`), fullPage: true });
    await openLadder(page, '/ladder?mode=arabia1v1&map=arena', width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`missing-${width}.png`), fullPage: true });
    await openLadder(page, '/ladder?mode=arabia1v1&fixture=570-low', width);
    await page.getByTestId('ladder-show-low').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`low-${width}.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}
