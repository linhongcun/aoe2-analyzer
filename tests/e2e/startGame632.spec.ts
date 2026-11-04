import { expect, test, type Browser, type Page } from '@playwright/test';
import type { StartState } from '../../src/domain/startGame';

for (const width of [360, 375, 390, 1280]) {
  test(`#632 @${width} 空大厅不填示例，摘要保留跳过，可补选单挑`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('./#/');
    await page.getByTestId('start-lobby').click();
    const flow = page.getByTestId('start-game');
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
    await expect(flow).not.toContainText('已预填');
    await expect(flow).not.toContainText('阿拉伯半岛');
    await expect(flow).not.toContainText('4v4');
    await expect(flow).toContainText('暂无建议');
    const modify = page.getByRole('button', { name: '修改模式和地图', exact: true });
    await expect(modify).toBeVisible();
    await modify.focus();
    await expect(modify).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath(`lobby632-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: /法兰克/ }).click();
    await page.getByRole('button', { name: '完成本局', exact: true }).click();
    const summary = page.getByTestId('start-summary');
    await expect(summary.getByText('已跳过', { exact: true })).toHaveCount(2);
    await expect(summary).not.toContainText('阿拉伯半岛');
    await expect(summary).not.toContainText('4v4');
    await expect(summary).not.toContainText('中路适合');
    await page.screenshot({ path: testInfo.outputPath(`summary632-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: '修改模式', exact: true }).click();
    await page.getByRole('button', { name: /1v1 随机地图/ }).click();
    await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
    await page.getByRole('button', { name: /法兰克/ }).click();
    await page.getByRole('button', { name: '完成本局', exact: true }).click();
    await expect(summary).toContainText('1v1');
    await expect(summary).not.toContainText('中路适合');
    await expect(summary.locator('.start-sumkey').filter({ hasText: /^路位$/ })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.getByRole('button', { name: '再开一局', exact: true }).click();
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'mode');
  });
}

const KEY = 'aoe2-start-game-v1';
const CONFLICT = JSON.stringify({
  version: 1,
  state: {
    choice: { mode: '1v1', teamSize: null, mapId: null, lane: null, civ: null },
    skipped: {},
    prefilled: {},
    teamArmed: false,
    lobby: false,
    laneOpen: false,
    current: 'map',
  },
});
function stateFromUrl(url: string): StartState | null {
  try {
    const hash = new URL(url).hash.slice(1);
    const raw = new URLSearchParams(hash.slice(hash.indexOf('?'))).get('sg');
    return raw ? (JSON.parse(raw) as StartState) : null;
  } catch {
    return null;
  }
}
function collectErrors(page: Page, errors: string[]) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function receiver(browser: Browser, width: number, raw?: string) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  if (raw !== undefined) await context.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: KEY, value: raw });
  if (width === 375) await context.addInitScript(() => localStorage.setItem('aoe2-theme', 'light'));
  return context;
}

for (const width of [360, 375, 390, 1280]) {
  test(`#669 @${width} 完整URL在独立context恢复当前局`, async ({ page, browser }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    if (width === 375) await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'light'));
    const errors: string[] = [];
    collectErrors(page, errors);
    await page.goto('./#/');
    const historyBefore = await page.evaluate(() => history.length);
    await page.getByRole('button', { name: /组队随机地图/ }).click();
    await page.getByRole('button', { name: '4v4', exact: true }).click();
    await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
    await page.getByRole('button', { name: /^中路/ }).click();
    await page.getByRole('button', { name: /法兰克/ }).click();
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'opponent');
    await expect
      .poll(() => stateFromUrl(page.url()))
      .toMatchObject({ current: 'opponent', choice: { mode: 'team', teamSize: '4v4', mapId: 'arabia', lane: 'pocket', civ: 'Franks' } });
    expect(await page.evaluate(() => history.length)).toBe(historyBefore);
    const url = page.url();
    console.log(
      JSON.stringify({
        sourceVersion: await page.locator('[data-t="footer-app-version"]').innerText(),
        sourceBuild: await page.locator('[data-t="footer-build"]').innerText(),
        hashLength: new URL(url).hash.length,
      }),
    );
    await noOverflow(page);
    const freshContext = await receiver(browser, width);
    try {
      const fresh = await freshContext.newPage();
      collectErrors(fresh, errors);
      await fresh.goto(url);
      await expect(fresh.getByTestId('start-step')).toHaveAttribute('data-step', 'opponent');
      await expect(fresh.locator('.start-picked')).toContainText('4v4');
      await expect(fresh.locator('.start-picked')).toContainText('阿拉伯半岛');
      await expect(fresh.locator('.start-picked')).toContainText('中路');
      expect(stateFromUrl(fresh.url())).toEqual(stateFromUrl(url));
      await noOverflow(fresh);
      await fresh
        .locator('#home')
        .screenshot({ path: testInfo.outputPath(`url669-opponent-${width}.png`), style: 'header.topbar, .skip-link { visibility: hidden !important; }' });
      await fresh.getByRole('button', { name: '完成本局', exact: true }).click();
      await expect(fresh.getByTestId('start-summary')).toContainText('法兰克');
      await fresh.reload();
      await expect(fresh.getByTestId('start-summary')).toContainText('法兰克');
      await noOverflow(fresh);
      await fresh
        .locator('#home')
        .screenshot({ path: testInfo.outputPath(`url669-summary-${width}.png`), style: 'header.topbar, .skip-link { visibility: hidden !important; }' });
    } finally {
      await freshContext.close();
    }

    const conflictContext = await receiver(browser, width, CONFLICT);
    try {
      const conflict = await conflictContext.newPage();
      collectErrors(conflict, errors);
      await conflict.goto(url);
      await expect(conflict.getByTestId('start-step')).toHaveAttribute('data-step', 'opponent');
      await conflict.getByRole('button', { name: '完成本局', exact: true }).click();
      await expect(conflict.getByTestId('start-summary')).toContainText('法兰克');
      await expect(conflict.getByTestId('start-summary')).toContainText('4v4');
      await expect(conflict.getByTestId('start-summary')).toContainText('中路');
      await noOverflow(conflict);
    } finally {
      await conflictContext.close();
    }

    const invalidContext = await receiver(browser, width, CONFLICT);
    try {
      const invalid = await invalidContext.newPage();
      collectErrors(invalid, errors);
      const bad = new URL(url);
      bad.hash = '/?sgv=99&sg=bad';
      await invalid.goto(bad.toString());
      await expect(invalid.getByRole('alert')).toContainText('链接中的本局进度无法恢复');
      await expect(invalid.getByTestId('start-step')).toHaveAttribute('data-step', 'mode');
      await expect(invalid.getByRole('button', { name: '4v4', exact: true })).toBeDisabled();
      await expect(invalid.getByTestId('start-game')).not.toContainText('阿拉伯半岛');
      expect(invalid.url()).toBe(bad.toString());
      expect(await invalid.evaluate((key) => localStorage.getItem(key), KEY)).toBe(CONFLICT);
      await invalid.getByRole('button', { name: /1v1 随机地图/ }).click();
      await expect.poll(() => stateFromUrl(invalid.url())?.choice.mode).toBe('1v1');
      expect(invalid.url()).not.toBe(bad.toString());
      expect(await invalid.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state.choice.mode, KEY)).toBe('1v1');
      await noOverflow(invalid);
    } finally {
      await invalidContext.close();
    }
    expect(errors).toEqual([]);
  });

  test(`#669 @${width} 大厅刷新显式reset与真实back恢复旧URL`, async ({ page, browser }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    collectErrors(page, errors);
    await page.goto('./?cache=sg669#/');
    const historyBefore = await page.evaluate(() => history.length);
    await page.getByTestId('start-lobby').click();
    await page.getByRole('button', { name: /法兰克/ }).click();
    await page.getByTestId('start-steps').getByRole('button', { name: '文明', exact: true }).click();
    await expect.poll(() => stateFromUrl(page.url())?.current).toBe('civ');
    const a = page.url();
    await page.reload();
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
    await expect(page.getByTestId('start-game')).toContainText('没有连上游戏大厅');
    await expect(page.getByTestId('start-game')).toContainText('已选文明保留');
    await page.getByRole('button', { name: '修改模式和地图', exact: true }).click();
    await page.getByRole('button', { name: /组队随机地图/ }).click();
    await page.getByRole('button', { name: '4v4', exact: true }).click();
    await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
    await page.getByRole('button', { name: /^中路/ }).click();
    await page.getByRole('button', { name: '保留此文明继续', exact: true }).click();
    await page.getByRole('button', { name: '完成本局', exact: true }).click();
    await expect.poll(() => stateFromUrl(page.url())?.current).toBeNull();
    const b = page.url();
    await page.reload();
    await expect(page.getByTestId('start-summary')).toContainText('法兰克');
    await expect(page.getByTestId('start-game')).toContainText('没有连上游戏大厅');
    expect(await page.evaluate(() => history.length)).toBe(historyBefore);
    expect(new URL(page.url()).search).toBe('?cache=sg669');
    await page.evaluate((url) => {
      location.hash = new URL(url).hash;
    }, a);
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
    await expect(page.getByTestId('start-game')).not.toContainText('阿拉伯半岛');
    await page.goBack();
    await expect(page.getByTestId('start-summary')).toContainText('4v4');
    expect(page.url()).toBe(b);
    await page.goForward();
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
    expect(page.url()).toBe(a);
    await page.getByRole('button', { name: '保留此文明继续', exact: true }).click();
    await page.getByRole('button', { name: '完成本局', exact: true }).click();
    await page.getByRole('button', { name: '再开一局', exact: true }).click();
    await expect.poll(() => stateFromUrl(page.url())?.current).toBe('mode');
    const resetUrl = page.url();
    expect(stateFromUrl(resetUrl)?.choice).toEqual({ mode: null, teamSize: null, mapId: null, lane: null, civ: null });
    await page.reload();
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'mode');
    const resetContext = await receiver(browser, width, CONFLICT);
    try {
      const resetPage = await resetContext.newPage();
      collectErrors(resetPage, errors);
      await resetPage.goto(resetUrl);
      await expect(resetPage.getByTestId('start-step')).toHaveAttribute('data-step', 'mode');
      await expect(resetPage.getByRole('button', { name: '4v4', exact: true })).toBeDisabled();
      expect(new URL(resetPage.url()).search).toBe('?cache=sg669');
      await noOverflow(resetPage);
    } finally {
      await resetContext.close();
    }
    await noOverflow(page);
    expect(errors).toEqual([]);
  });
}
