// #571：模式和 Elo 只切已有快照。空档停用。来源条同时留下模式、Elo、地图和截止。不接 live。
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { formatGames, formatPercent, snapshotCutoff, type LadderSnapshot } from '../../src/domain/ladder';

const arabia = JSON.parse(readFileSync('src/data/ladder-arabia-p185872.json', 'utf8')) as LadderSnapshot;
const team = JSON.parse(readFileSync('src/data/ladder-4v4-rm-e1200-1400-90d.json', 'utf8')) as LadderSnapshot;
const LIVE = /aoestats\.io|ageofnotes\.com|aoe2scout\.com|web\.archive\.org/i;

function franks(snapshot: LadderSnapshot) {
  for (const bracket of snapshot.brackets) {
    const civ = bracket.civs.find((item) => item.en === 'Franks');
    if (civ) return { bracketGames: bracket.games, winRate: civ.winRate, games: civ.games };
  }
  throw new Error('缺少 Franks');
}

const teamFranks = franks(team);
const arabiaFranks = franks(arabia);

async function openLadder(page: Page, width = 1280) {
  const errors: string[] = [];
  const hits: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => void (message.type() === 'error' && errors.push(message.text())));
  page.on('request', (request) => {
    if (LIVE.test(request.url())) hits.push(request.url());
  });
  await page.setViewportSize({ width, height: 900 });
  await page.goto('./#/ladder');
  await expect(page.getByTestId('ladder-page')).toBeVisible();
  await expect(page.getByTestId('ladder-table')).toBeVisible();
  return { errors, hits };
}

test('#571 切到另一份已有 Elo 后，表、样本和来源条一起换，地图字段还在', async ({ page }) => {
  const { errors, hits } = await openLadder(page);
  await expect(page.getByTestId('ladder-source-mode')).toContainText('4v4');
  await expect(page.getByTestId('ladder-source-elo')).toContainText('1200');
  await expect(page.getByTestId('ladder-source-elo')).toContainText('1400');
  await expect(page.getByTestId('ladder-source-map')).toHaveText('全图');
  await expect(page.getByTestId('ladder-cutoff')).toContainText(snapshotCutoff(team));
  await expect(page.getByTestId('ladder-map-static')).toContainText('全图');
  await expect(page.getByTestId('ladder-row-Franks')).toContainText(formatPercent(teamFranks.winRate));
  await expect(page.getByTestId('ladder-sample')).toContainText(formatGames(teamFranks.bracketGames));

  await page.locator('[data-testid="ladder-elo-option"][data-target-mode="arabia1v1"]').click();
  await expect(page.getByTestId('ladder-mode-arabia1v1')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('ladder-row-Franks')).toContainText(formatPercent(arabiaFranks.winRate));
  await expect(page.getByTestId('ladder-row-Franks')).not.toContainText(formatPercent(teamFranks.winRate));
  await expect(page.getByTestId('ladder-row-Franks')).toContainText(formatGames(arabiaFranks.games));
  await expect(page.getByTestId('ladder-sample')).toContainText(formatGames(arabiaFranks.bracketGames));
  await expect(page.getByTestId('ladder-source-mode')).toContainText('1v1');
  await expect(page.getByTestId('ladder-source-elo')).toContainText('全部');
  await expect(page.getByTestId('ladder-source-map')).toHaveText('阿拉伯');
  await expect(page.getByTestId('ladder-cutoff')).toContainText(snapshotCutoff(arabia));
  await expect(page.getByTestId('ladder-map-static')).toContainText('阿拉伯');
  await expect(page.getByTestId('ladder-source-facts')).toBeVisible();
  expect(hits, '切换快照不请求实时来源').toEqual([]);
  expect(errors).toEqual([]);
});

test('#571 没有快照的 Elo 停用，点了也不换成别的胜率', async ({ page }) => {
  const { errors, hits } = await openLadder(page);
  const blocked = page.locator('[data-testid="ladder-elo-disabled"][data-band="lt850"]');
  await expect(blocked).toBeDisabled();
  await expect(blocked).toContainText('暂无数据');
  await expect(blocked).not.toContainText('%');
  const rowText = async () => ((await page.getByTestId('ladder-row-Franks').innerText()) ?? '').replace(/\s+/g, '');
  const before = await rowText();
  await blocked.click({ force: true });
  await expect(page.getByTestId('ladder-mode-4v4')).toHaveAttribute('aria-checked', 'true');
  expect(await rowText()).toBe(before);
  await expect(page.getByTestId('ladder-source-elo')).toContainText('1200');
  expect(new URL(page.url()).hash).toBe('#/ladder');
  expect(hits).toEqual([]);
  expect(errors).toEqual([]);
});

test('#571 从阿拉伯再选 1200–1400，来源条四项还在', async ({ page }) => {
  await openLadder(page);
  await page.getByTestId('ladder-mode-arabia1v1').click();
  await expect(page.getByTestId('ladder-source-map')).toHaveText('阿拉伯');
  await page.locator('[data-testid="ladder-elo-option"][data-target-mode="4v4"]').click();
  await expect(page.getByTestId('ladder-mode-4v4')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('ladder-row-Franks')).toContainText(formatPercent(teamFranks.winRate));
  await expect(page.getByTestId('ladder-sample')).toContainText(formatGames(teamFranks.bracketGames));
  await expect(page.getByTestId('ladder-source-mode')).toContainText('4v4');
  await expect(page.getByTestId('ladder-source-elo')).toContainText('1400');
  await expect(page.getByTestId('ladder-source-map')).toHaveText('全图');
  await expect(page.getByTestId('ladder-cutoff')).toContainText(snapshotCutoff(team));
  await expect(page.getByTestId('ladder-map-static')).toContainText('全图');
});

test('#571 窄屏仍能切换已有切片', async ({ page }) => {
  const { errors } = await openLadder(page, 390);
  await page.locator('[data-testid="ladder-elo-option"][data-target-mode="arabia1v1"]').click();
  await expect(page.getByTestId('ladder-row-Franks')).toContainText(formatPercent(arabiaFranks.winRate));
  await expect(page.getByTestId('ladder-source-mode')).toBeVisible();
  await expect(page.getByTestId('ladder-source-elo')).toBeVisible();
  await expect(page.getByTestId('ladder-source-map')).toBeVisible();
  await expect(page.getByTestId('ladder-cutoff')).toBeVisible();
  expect(errors).toEqual([]);
});
