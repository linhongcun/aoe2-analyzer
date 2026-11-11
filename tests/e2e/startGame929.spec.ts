import { expect, test, type Page } from '@playwright/test';

const KEY = 'aoe2-start-game-v1';
const lobbyState = {
  choice: { mode: null, teamSize: null, mapId: null, lane: null, civ: null, opponent: null, mates: [] },
  sceneConfig: null,
  routeConfig: null,
  skipped: { mode: true, map: true },
  prefilled: {},
  teamArmed: false,
  lobby: true,
  laneOpen: false,
  current: 'civ',
};
const lobbyLocal = JSON.stringify({ version: 1, state: lobbyState });
const lobbySearch = `?${new URLSearchParams({ sgv: '1', sg: JSON.stringify(lobbyState) })}`;

async function clearProgress(page: Page) {
  await page.addInitScript((key) => localStorage.removeItem(key), KEY);
}

async function seedLocal(page: Page, raw: string) {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [KEY, raw] as const);
}

test('#929 @1280 首页只有一条普通开一局，工具菜单同一条', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await clearProgress(page);
  await page.goto('./#/');
  await expect(page.locator('#home [data-testid="start-game"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '配置本局', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '已在大厅', exact: true })).toHaveCount(0);
  const planning = page.locator('section[aria-labelledby="home-planning"]');
  await expect(planning.locator('a[href="#/start"]')).toHaveCount(1);
  await expect(planning.locator('a[href="#/builds"]')).toHaveCount(1);
  await expect(page.locator('#home a[href="#/start"]')).toHaveCount(1);
  await page.getByRole('button', { name: '工具', exact: true }).click();
  await expect(page.locator('#tools-menu a[href="#/start"]')).toHaveCount(1);
  await expect(page).toHaveURL(/#\/$/);
});

test('#929 @390 首页目录入口唯一且不横溢', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await clearProgress(page);
  await page.goto('./#/');
  await expect(page.locator('#home a[href="#/start"]')).toHaveCount(1);
  await expect(page.locator('#home [data-testid="start-game"]')).toHaveCount(0);
  const planning = page.locator('section[aria-labelledby="home-planning"]');
  await planning.locator('a[href="#/start"]').scrollIntoViewIfNeeded();
  await expect(planning.locator('a[href="#/start"]')).toBeVisible();
  await expect(planning.locator('a[href="#/builds"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '菜单', exact: true }).click();
  await page.getByRole('button', { name: '工具', exact: true }).click();
  await page.locator('#tools-menu details', { hasText: '对局计划' }).locator('summary').click();
  await expect(page.locator('#tools-menu a[href="#/start"]')).toHaveCount(1);
});

async function openMenu(page: Page) {
  await page.getByTestId('start-feature-menu').locator('summary').click();
}

test('#929 @1280 /start 可跳过回退、进入大厅，并带出三个既有工具', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await clearProgress(page);
  await page.goto('./#/start');
  await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'mode');
  await page.getByTestId('start-skip').click();
  await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'map');
  await page.getByTestId('start-back').click();
  await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'mode');
  await page.getByTestId('start-lobby').click();
  await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
  await expect(page.getByTestId('start-game')).toContainText('没有连上游戏大厅');
  await expect(page).toHaveURL(/#\/start\?sgv=1&sg=/);
  await openMenu(page);
  const menu = page.getByTestId('start-feature-menu');
  await expect(menu.getByRole('link', { name: '打开对局助手', exact: true })).toHaveAttribute('href', /#\/matchup\?/);
  await expect(menu.getByRole('link', { name: '打开文明搭配', exact: true })).toHaveAttribute('href', /#\/team-fit\?/);
  await expect(menu.getByRole('link', { name: '打开开局流程', exact: true })).toHaveAttribute('href', /#\/builds/);
});

test('#929 @390 /start 已在大厅和三个工具链接可用', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await clearProgress(page);
  await page.goto('./#/start');
  await page.getByTestId('start-lobby').click();
  await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
  await expect(page.getByTestId('start-game')).toContainText('没有连上游戏大厅');
  await openMenu(page);
  const menu = page.getByTestId('start-feature-menu');
  for (const name of ['打开对局助手', '打开文明搭配', '打开开局流程']) {
    const link = menu.getByRole('link', { name, exact: true });
    await expect(link).toBeVisible();
    const box = await link.boundingBox();
    expect(box && box.width >= 44 && box.height >= 44).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('#929 旧首页有效链接只替换一次到 /start', async ({ page }) => {
  await clearProgress(page);
  await page.goto('./#/' + lobbySearch);
  await expect(page).toHaveURL(/#\/start\?sgv=1&sg=/);
  const landed = JSON.parse(new URLSearchParams(new URL(page.url()).hash.slice('#/start'.length)).get('sg') ?? 'null') as { current?: string; lobby?: boolean };
  expect(landed.current).toBe('civ');
  expect(landed.lobby).toBe(true);
  await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
  await expect(page.getByTestId('start-game')).toContainText('没有连上游戏大厅');
  await page.goBack();
  await page.waitForTimeout(400);
  await expect(page).not.toHaveURL(/#\/start/);
});

test('#929 无效和残缺查询优先于本地另一局', async ({ page }) => {
  const local = lobbyLocal;
  await seedLocal(page, local);
  for (const search of ['?sgv=1&sg=not-json', '?sgv=1', '?sg=']) {
    await page.goto('./#/' + search);
    await expect(page).toHaveURL(/#\/start\?/);
    expect(new URL(page.url()).hash.slice('#/start'.length)).toBe(search);
    await expect(page.getByRole('alert')).toContainText('链接中的本局进度无法恢复');
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'mode');
    await expect(page.getByTestId('start-game')).not.toContainText('没有连上游戏大厅');
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(local);
  }
});

test('#929 普通首页不因本地进度跳转，返回也不会循环', async ({ page }) => {
  await seedLocal(page, lobbyLocal);
  await page.goto('./#/');
  await expect(page.locator('#home')).toBeVisible();
  await expect(page.locator('#home [data-testid="start-game"]')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/$/);
  await page.locator('#home a[href="#/start"]').click();
  await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
  await page.goto('./#/');
  await expect(page).toHaveURL(/#\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/start\?/);
  await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/#\/start\?/);
});

test('#929 无 URL 的 /start 恢复本地局，分享地址停在 /start', async ({ page }) => {
  await seedLocal(page, lobbyLocal);
  await page.goto('./#/start');
  await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
  await expect(page.getByTestId('start-game')).toContainText('没有连上游戏大厅');
  await expect(page).toHaveURL(/#\/start\?sgv=1&sg=/);
  await expect(page).not.toHaveURL(/#\/\?/);
});

test('#929 /builds 仍是开局流程', async ({ page }) => {
  await page.goto('./#/builds');
  await expect(page.locator('#builds [data-t="build-order"]').first()).toBeVisible();
  await expect(page.locator('[data-testid="start-game"]')).toHaveCount(0);
});
