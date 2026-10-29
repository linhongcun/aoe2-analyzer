import { expect, test, type Page } from '@playwright/test';

const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const recorded: string[] = [];
  errors.set(page, recorded);
  page.on('pageerror', (error) => recorded.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') recorded.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('#488 first-red: direct directory URL loads the real player directory', async ({ page }) => {
  await page.goto('./#/players');
  await expect(page.locator('main').getByRole('heading', { level: 1, name: '职业选手资料', exact: true })).toBeVisible();
  for (const [id, name] of [
    ['hera', 'Hera'],
    ['liereyy', 'Liereyy'],
    ['theviper', 'TheViper'],
  ]) {
    await expect(page.locator('main').locator(`a[href="#/players/${id}"]`)).toContainText(name!);
  }
});

test('#488 first-red: a direct Hera URL loads Hera rather than a missing or substitute page', async ({ page }) => {
  await page.goto('./#/players/hera');
  await expect(page.locator('main').getByRole('heading', { level: 1, name: 'Hera', exact: true })).toBeVisible();
  await expect(page.locator('main')).toContainText('Hamzah El-Baher');
  await expect(page.locator('main')).toContainText('加拿大');
  await expect(page).toHaveTitle(/Hera/);
});

test('#488 first-red: Liereyy and TheViper each retain their own loaded identity on refresh', async ({ page }) => {
  for (const [id, name, fullName] of [
    ['liereyy', 'Liereyy', 'Kai Kallinger'],
    ['theviper', 'TheViper', 'Ørjan Larsen'],
  ]) {
    await page.goto(`./#/players/${id}`);
    await expect(page.locator('main').getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
    await expect(page.locator('main')).toContainText(fullName!);
    await page.reload();
    await expect(page.locator('main').getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
  }
});
