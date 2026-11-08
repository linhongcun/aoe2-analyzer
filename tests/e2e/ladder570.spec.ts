// #570 地图筛选。数字只从已提交的 Insights 快照读。拦截 aoe2insights，页面不得 live 取数。
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { InsightsSnapshot } from '../../src/domain/ladderInsights';

const rmArabia = JSON.parse(readFileSync('src/data/ladder-insights-rm1v1-arabia.json', 'utf8')) as InsightsSnapshot;
const arena = JSON.parse(readFileSync('src/data/ladder-insights-rm1v1-arena.json', 'utf8')) as InsightsSnapshot;
const WIDTHS = [360, 375, 390, 1280] as const;

function row(snapshot: InsightsSnapshot, name: string) {
  const found = snapshot.rows.find((item) => item.civilization === name);
  if (!found) throw new Error(`缺少 ${name}`);
  return found;
}

const arabiaFranks = row(rmArabia, 'Franks');
const arenaFranks = row(arena, 'Franks');
const india = row(rmArabia, 'Indians');

async function openLadder(page: Page, hash: string, width: number, theme: 'dark' | 'light') {
  const hits: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (/aoe2insights\.com/i.test(request.url())) hits.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`./#${hash}`);
  await expect(page.getByTestId('ladder-page')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  return { hits, errors };
}

test('#570 阿拉伯与竞技场切换来源，缺快照不显示别的胜率，刷新保留地图', async ({ page }) => {
  const { hits, errors } = await openLadder(page, '/ladder?mode=arabia1v1&map=rm-arabia', 1280, 'dark');
  const source = page.getByTestId('ladder-source');
  await expect(source).toHaveAttribute('data-slice-map', 'rm-arabia');
  await expect(source).toHaveAttribute('data-sha256', rmArabia.rawSha256);
  await expect(page.getByTestId('ladder-source-name')).toContainText('AoE2 Insights');
  await expect(page.getByTestId('ladder-source-mode')).toContainText('RM 1v1');
  await expect(page.getByTestId('ladder-source-map')).toHaveText('阿拉伯');
  await expect(page.getByTestId('ladder-source-elo')).toContainText('未筛选');
  await expect(page.getByTestId('ladder-source-patch')).toHaveText('未按补丁筛选');
  await expect(page.getByTestId('ladder-collected')).toContainText('采集于');
  await expect(page.getByTestId('ladder-collected')).not.toContainText('统计截止');
  await expect(page.getByTestId('ladder-query-url')).toHaveText(rmArabia.queryUrl);
  await expect(page.getByTestId('ladder-sample-note')).toContainText('玩家行');
  await expect(page.getByTestId('ladder-sample-note')).toContainText('不是独立对局');
  await expect(page.getByTestId('ladder-row-Franks')).toHaveAttribute('data-sample', String(arabiaFranks.aggNMatches));
  await page.getByTestId('ladder-hide-low').uncheck();
  await expect(page.getByTestId('ladder-row-Indians')).toHaveAttribute('data-low-sample', 'true');
  await expect(page.getByTestId('ladder-row-Indians')).toContainText('低样本');
  await expect(page.getByTestId('ladder-low-note')).toContainText('待确认');

  await page.getByTestId('ladder-map-arena').click();
  await expect(page).toHaveURL(/map=arena/);
  await expect(source).toHaveAttribute('data-slice-map', 'arena');
  await expect(source).toHaveAttribute('data-sha256', arena.rawSha256);
  await expect(page.getByTestId('ladder-source-map')).toHaveText('竞技场');
  await expect(page.getByTestId('ladder-query-url')).toHaveText(arena.queryUrl);
  await expect(page.getByTestId('ladder-row-Franks')).toHaveAttribute('data-sample', String(arenaFranks.aggNMatches));
  await expect(page.getByTestId('ladder-row-Indians')).toHaveCount(0);
  await expect(page.getByTestId('ladder-low-note')).toContainText('没有低于暂定阈值');

  await page.getByTestId('ladder-map-rm-arabia').click();
  await expect(source).toHaveAttribute('data-slice-map', 'rm-arabia');
  await expect(page.getByTestId('ladder-row-Franks')).toHaveAttribute('data-sample', String(arabiaFranks.aggNMatches));
  await expect(page.getByTestId('ladder-row-Indians')).toHaveAttribute('data-low-sample', 'true');

  await page.reload();
  await expect(page).toHaveURL(/map=rm-arabia/);
  await expect(page.getByTestId('ladder-source')).toHaveAttribute('data-slice-map', 'rm-arabia');
  await expect(page.getByTestId('ladder-row-Franks')).toHaveAttribute('data-sample', String(arabiaFranks.aggNMatches));

  await page.goto('./#/ladder?mode=4v4&map=arena');
  await expect(page.getByTestId('ladder-empty')).toContainText('暂无数据');
  await expect(page.getByTestId('ladder-insights-table')).toHaveCount(0);
  await expect(page.getByTestId('ladder-row-Franks')).toHaveCount(0);
  await expect(page.getByTestId('ladder-map-arena')).toBeDisabled();
  await expect(page.getByTestId('ladder-map-arena')).toContainText('暂无数据');

  expect(arabiaFranks.aggNMatches).not.toBe(arenaFranks.aggNMatches);
  expect(india.aggNMatches).toBeLessThan(100);
  expect(hits, '首载、切图和刷新都不应请求 AoE2 Insights').toEqual([]);
  expect(errors).toEqual([]);
});

for (const width of WIDTHS) {
  test(`#570 @${width} dark 地图筛选不撑出页面横向滚动`, async ({ page }, testInfo) => {
    const { hits, errors } = await openLadder(page, '/ladder?mode=arabia1v1&map=arena', width, 'dark');
    await expect(page.getByTestId('ladder-source-map')).toHaveText('竞技场');
    await page.getByTestId('ladder-map-rm-arabia').click();
    await expect(page.getByTestId('ladder-source-map')).toHaveText('阿拉伯');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`ladder570-${width}-dark.png`), fullPage: true });
    expect(hits).toEqual([]);
    expect(errors).toEqual([]);
  });
}
