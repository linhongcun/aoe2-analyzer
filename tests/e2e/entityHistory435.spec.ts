import { expect, test, type Page } from '@playwright/test';

const history = (page: Page) => page.getByTestId('entity-history');
const version = (page: Page, id: string) => history(page).locator(`[data-history-version="${id}"]`);

async function openHistory(page: Page, route: string) {
  await page.goto(`./#${route}`);
  await expect(history(page).locator('[data-history-entry]').first()).toBeVisible();
}

function recordErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('#435 已删除科技可直接打开历史档案，不回退到当前科技列表', async ({ page }) => {
  const errors = recordErrors(page);
  await openHistory(page, '/tech/716?tab=history');
  await expect(page.getByRole('heading', { name: /补给/ }).first()).toBeVisible();
  await expect(page.getByText('历史档案，当前数据目录未收录', { exact: true })).toBeVisible();
  await expect(version(page, '81058')).toContainText('35');
  await expect(version(page, '81058')).toContainText('20');
  await expect(history(page).getByRole('link', { name: /81058/ }).first()).toHaveAttribute('href', '#/patches/81058');
  await openHistory(page, '/tech/legacy-berserkergang?tab=history');
  await expect(page.getByRole('heading', { name: /Berserkergang/ }).first()).toBeVisible();
  await expect(page.getByText('历史档案，当前数据目录未收录', { exact: true })).toBeVisible();
  await expect(history(page)).toContainText('81058');
  expect(errors).toEqual([]);
});

test('#435 历史科技复制静态链接后新上下文打开和刷新仍保留档案与筛选', async ({ page, browser }) => {
  const errors = recordErrors(page);
  for (const [id, name] of [
    ['716', '补给'],
    ['legacy-berserkergang', 'Berserkergang'],
  ]) {
    await openHistory(page, `/tech/${id}?tab=history&histFrom=2023-04-11&histTo=2023-04-11`);
    await expect(page.getByRole('heading', { name: new RegExp(name!) }).first()).toBeVisible();
    // Like compare403, capture this page's Clipboard API output without sharing the OS clipboard between parallel tests.
    await page.evaluate(() => {
      delete (window as Window & { copiedHistory435?: string }).copiedHistory435;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            (window as Window & { copiedHistory435?: string }).copiedHistory435 = value;
          },
        },
      });
    });
    await page.locator('.dhead').getByRole('button', { name: '复制链接', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as Window & { copiedHistory435?: string }).copiedHistory435)).toBeTruthy();
    await expect(page.locator('.dhead [role="status"]')).toHaveText('链接已复制');
    const copied = await page.evaluate(() => (window as Window & { copiedHistory435?: string }).copiedHistory435);
    expect(copied).toBeTruthy();
    const url = new URL(copied!);
    expect(url.pathname).toMatch(new RegExp(`/tech/${id}/$`));
    expect(url.hash).toBe('');
    expect(url.searchParams.get('tab')).toBe('history');
    expect(url.searchParams.get('histFrom')).toBe('2023-04-11');
    expect(url.searchParams.get('histTo')).toBe('2023-04-11');
    const context = await browser.newContext();
    try {
      const fresh = await context.newPage();
      const freshErrors = recordErrors(fresh);
      await fresh.goto(copied!);
      await expect(fresh.getByRole('heading', { name: new RegExp(name!) }).first()).toBeVisible();
      await expect(version(fresh, '81058').locator('[data-history-entry]').first()).toBeVisible();
      await expect(fresh.getByLabel('开始日期', { exact: true })).toHaveValue('2023-04-11');
      await fresh.reload();
      await expect(version(fresh, '81058').locator('[data-history-entry]').first()).toBeVisible();
      await expect(fresh.getByLabel('结束日期', { exact: true })).toHaveValue('2023-04-11');
      await expect(fresh.getByRole('heading', { level: 2, name: '更新历史', exact: true })).toHaveCount(1);
      await expect(fresh.getByRole('tab', { name: '更新历史', exact: true })).toHaveCount(0);
      expect(freshErrors).toEqual([]);
    } finally {
      await context.close();
    }
  }
  expect(errors).toEqual([]);
});

test('#435 按版本浏览四份档案，旧版不混入后来热修和最新版说明', async ({ page }) => {
  const errors = recordErrors(page);
  await page.goto('./#/patches');
  await page.getByRole('button', { name: '按版本', exact: true }).click();
  for (const id of ['185872', '125283', '81058', '66692']) await expect(page.getByRole('link', { name: new RegExp(`DE Update ${id}`) })).toBeVisible();
  for (const id of ['66692', '81058', '125283', '185872']) {
    await page.goto(`./#/patches/${id}`);
    await expect(page.getByRole('heading', { name: `DE Update ${id}`, exact: true })).toBeVisible();
    await expect(page.locator('.patch-entry').first()).toBeVisible();
    await noOverflow(page);
    if (id !== '185872') await expect(page.locator('.patches')).not.toContainText('新增地图 Arabian Desert');
  }
  await page.goto('./#/patches/66692');
  await expect(page.locator('.patch-entry').filter({ hasText: '71094' })).toHaveCount(0);
  await page.goto('./#/patches/125283');
  await expect(page.locator('.patch-entry').filter({ hasText: '127161' })).toHaveCount(0);
  await page.goto('./#/patches/unknown-history435');
  await expect(page.getByRole('heading', { name: '找不到版本 unknown-history435' })).toBeVisible();
  expect(errors).toEqual([]);
});
