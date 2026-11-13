import { expect, test, type Page } from '@playwright/test';

async function openHome(page: Page, search = '') {
  await page.addInitScript(() => localStorage.removeItem('aoe2-start-game-v1'));
  await page.goto('./#/' + search);
  await expect(page.locator('#home')).toBeVisible();
}

test('#876 1280 首屏能看到开一局标题和配置按钮', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openHome(page);
  await expect(page.locator('#home a[href="#/start"]')).toHaveCount(1);
  await expect(page.locator('#home [data-testid="start-game"]')).toHaveCount(0);
  const unitIconsAligned = await page
    .locator('.home-ref-card[data-k="units"]')
    .locator('.home-examples img')
    .evaluateAll((images) => {
      const top = images[0]?.getBoundingClientRect().top ?? 0;
      return images.length >= 5 && images.every((image) => Math.abs(image.getBoundingClientRect().top - top) < 2);
    });
  expect(unitIconsAligned).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('#876 390 顺读且目录标题不挤成多列', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);
  const home = page.locator('#home');
  const order = await home.evaluate((root) => {
    const ids = ['site-title', 'home-ref-title', 'home-catalog-title'];
    return ids.map((id) => root.querySelector('#' + id)?.getBoundingClientRect().top ?? -1);
  });
  expect(order.every((top, index) => index === 0 || top > order[index - 1]!)).toBe(true);
  const catalogTitle = page.getByRole('heading', { name: '工具与资料', exact: true });
  await catalogTitle.scrollIntoViewIfNeeded();
  const lines = await catalogTitle.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
  });
  expect(lines).toBeLessThanOrEqual(2);
  const groupLines = await page.locator('[data-testid="home-catalog"] h3').evaluateAll((nodes) =>
    nodes.map((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
    }),
  );
  expect(groupLines.length).toBe(4);
  expect(groupLines.every((count) => count >= 1 && count <= 2)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('header.topbar .searchbtn')).toHaveCount(0);
  await expect(page.getByTestId('home-search')).toHaveCount(1);
});

test('#876 唯一搜索打开现有全局搜索', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('home-search').click();
  const dialog = page.getByRole('dialog', { name: '全局搜索' });
  await dialog.getByRole('combobox').fill('paladin');
  await expect(dialog.locator('.cmdk-list li').first()).toContainText('Paladin');
  await expect(dialog).not.toContainText('演示范围');
});

test('#876 已在大厅进入文明步，原链接可恢复', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('aoe2-start-game-v1'));
  await page.goto('./#/start');
  await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'mode');
  await page.getByTestId('start-lobby').click();
  await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
  await expect(page.getByTestId('start-game')).toContainText('没有连上游戏大厅');
  const saved = page.url();
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await page.goto('about:blank');
  await page.goto(saved);
  await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
  await expect(page.getByTestId('start-game')).toContainText('没有连上游戏大厅');
});

test('#876 配置本局后仍可跳过并返回', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('aoe2-start-game-v1'));
  await page.goto('./#/start');
  await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'mode');
  await page.getByTestId('start-skip').click();
  await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'map');
  await page.getByTestId('start-back').click();
  await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'mode');
});

test('#876 记录浅色与深色的 1280 和 390 首屏', async ({ page }) => {
  await openHome(page);
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => localStorage.setItem('aoe2-theme', value), theme);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (const [width, height] of [
      [1280, 900],
      [390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `/opt/cursor/artifacts/home-${width}-${theme}.png` });
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => localStorage.setItem('aoe2-theme', 'light'));
  await page.reload();
  await page.getByTestId('home-search').click();
  await expect(page.getByRole('dialog', { name: '全局搜索' })).toBeVisible();
  await page.screenshot({ path: '/opt/cursor/artifacts/home-1280-light-search.png' });
  await page.keyboard.press('Escape');
  await page.goto('./#/start');
  await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'mode');
  await page.screenshot({ path: '/opt/cursor/artifacts/home-1280-light-flow.png' });
  await page.goto('./#/');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => localStorage.setItem('aoe2-theme', 'dark'));
  await page.reload();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.screenshot({ path: '/opt/cursor/artifacts/home-390-dark-catalog.png' });
});

test('#876 浅色与深色都使用主题前景，不是固定深色字', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openHome(page);
  await page.getByRole('button', { name: /主题/ }).click();
  await expect(page.getByRole('menuitemradio', { name: '跟随系统', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => localStorage.setItem('aoe2-theme', value), theme);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const colors = await page.locator('#site-title').evaluate((node) => {
      const style = getComputedStyle(node);
      const body = getComputedStyle(document.body);
      return { text: style.color, background: body.backgroundColor };
    });
    const [tr, tg, tb] = colors.text.match(/\d+/g)!.map(Number);
    const [br, bg, bb] = colors.background.match(/\d+/g)!.map(Number);
    const textLum = tr! * 0.2126 + tg! * 0.7152 + tb! * 0.0722;
    const bgLum = br! * 0.2126 + bg! * 0.7152 + bb! * 0.0722;
    expect(theme === 'light' ? textLum < bgLum : textLum > bgLum).toBe(true);
  }
});
