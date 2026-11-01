// #569 首屏相对新鲜度 + 样本量。不改 #547 截止句，不接 live。
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { freshnessText, formatGames, relativeFreshness, type LadderSnapshot } from '../../src/domain/ladder';

const NOW = new Date('2026-11-15T12:00:00Z');
const arabia = JSON.parse(readFileSync('src/data/ladder-arabia-p185872.json', 'utf8')) as LadderSnapshot;
const team = JSON.parse(readFileSync('src/data/ladder-4v4-rm-e1200-1400-90d.json', 'utf8')) as LadderSnapshot;
const WIDTHS = [360, 375, 390, 1280] as const;

function expectedFreshness(fetchedAt: string): string {
  return freshnessText(relativeFreshness(fetchedAt, NOW)).replace(/\s+/g, '');
}

async function openLadder(page: Page, path: string, width: number) {
  await page.clock.install({ time: NOW });
  await page.setViewportSize({ width, height: 800 });
  const hits: string[] = [];
  page.on('request', (request) => {
    if (/aoestats\.io|ageofnotes\.com|aoe2scout\.com|web\.archive\.org/i.test(request.url())) hits.push(request.url());
  });
  await page.goto(path);
  await expect(page.getByTestId('ladder-page')).toBeVisible();
  return hits;
}

async function expectFresh(page: Page, fetchedAt: string, sample: RegExp) {
  const fresh = page.getByTestId('ladder-freshness');
  await expect(fresh).toBeVisible();
  const relative = ((await page.getByTestId('ladder-relative').innerText()) ?? '').replace(/\s+/g, '');
  expect(relative).toBe(expectedFreshness(fetchedAt));
  expect(relative).toMatch(/更新于(\d+天前|今天|不到1小时|\d+小时前)/);
  expect(relative).not.toMatch(/实时|秒|分钟|刚刚|自动更新/);
  await expect(page.getByTestId('ladder-sample')).toContainText(sample);
  await expect(page.getByTestId('ladder-cutoff')).toContainText('统计截止');
  const box = await page.evaluate(() => {
    const node = document.querySelector('[data-testid="ladder-freshness"]');
    const yellow = document.querySelector('[data-testid="ladder-patch-note"]');
    const rect = node instanceof HTMLElement ? node.getBoundingClientRect() : null;
    return {
      scrollY: window.scrollY,
      viewHeight: window.innerHeight,
      top: rect?.top ?? null,
      bottom: rect?.bottom ?? null,
      insideYellow: Boolean(node?.closest('[data-testid="ladder-patch-note"]')),
      yellowTop: yellow instanceof HTMLElement ? yellow.getBoundingClientRect().top : null,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  expect(box.scrollY).toBe(0);
  expect(box.insideYellow).toBe(false);
  expect(box.overflow).toBe(false);
  expect(box.top).not.toBeNull();
  expect(box.bottom).not.toBeNull();
  if (box.top == null || box.bottom == null) return;
  expect(box.top).toBeGreaterThanOrEqual(0);
  expect(box.bottom).toBeLessThanOrEqual(box.viewHeight);
  if (box.yellowTop != null) expect(box.yellowTop).toBeGreaterThanOrEqual(box.bottom - 1);
}

test('#569 默认 4v4 首屏能看到更新多久前和样本量', async ({ page }) => {
  const games = team.brackets[0]?.games;
  expect(games).toBeTruthy();
  const hits = await openLadder(page, './#/ladder', 1280);
  await expectFresh(page, team.fetchedAt, new RegExp(`本切片样本[\\s\\S]*${formatGames(games ?? 0)}[\\s\\S]*人次`));
  await expect(page.getByTestId('ladder-sample')).not.toContainText('样本未收录');
  await expect(page.getByTestId('ladder-cutoff')).toContainText('非当前平衡');
  expect(hits).toEqual([]);
});

test('#569 分层、分布和阿拉伯 1v1 也显示同一条新鲜度', async ({ page }) => {
  await openLadder(page, './#/ladder?view=tiers', 1280);
  await expectFresh(page, team.fetchedAt, /本切片样本/);
  await page.goto('./#/ladder?view=meta');
  await expectFresh(page, team.fetchedAt, /本切片样本/);
  await page.goto('./#/ladder?mode=arabia1v1');
  const all = arabia.brackets.find((bracket) => bracket.key === 'all');
  await expectFresh(page, arabia.fetchedAt, new RegExp(`本分段样本[\\s\\S]*${formatGames(all?.games ?? 0)}[\\s\\S]*人次`));
  await expect(page.getByTestId('ladder-source')).not.toContainText('样本未收录');
  await expect(page.getByTestId('ladder-source')).not.toContainText('局');
});

for (const width of WIDTHS) {
  test(`#569 首屏 ${width} 无横向滚动`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await openLadder(page, './#/ladder', width);
    await expect(page.getByTestId('ladder-freshness')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
