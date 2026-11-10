import { expect, test } from '@playwright/test';

test('首页、导航和搜索不再提供赛事公告或职业选手', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#home [data-testid="home-start"]')).toBeVisible();
  await expect(page.locator('a[href="#/events"], a[href="#/players"], a[href*="#/players/"]')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('赛事公告');
  await expect(page.locator('body')).not.toContainText('职业选手');
  await page.keyboard.press('Control+k');
  const search = page.getByRole('combobox', { name: '全局搜索', exact: true });
  for (const query of ['赛事公告', '职业选手资料', 'Hera']) {
    await search.fill(query);
    await expect(page.locator('.cmdk-list a[href*="#/events"], .cmdk-list a[href*="#/players"]')).toHaveCount(0);
    await expect(page.locator('.cmdk-list')).not.toContainText('赛事公告');
    await expect(page.locator('.cmdk-list')).not.toContainText('职业选手资料');
  }
});

test('旧赛事和选手地址回到首页', async ({ page }) => {
  for (const hash of ['#/events', '#/players', '#/players/hera']) {
    await page.goto(`./${hash}`);
    await expect(page).toHaveURL(/#\/(\?|$)/);
    await expect(page.locator('#home [data-testid="home-start"]')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: '赛事公告' })).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: '职业选手资料' })).toHaveCount(0);
  }
});

test('文明页不再展示职业资料，关于数据仍可打开', async ({ page }) => {
  await page.goto('./#/civ/Franks');
  await expect(page.locator('#detail h1')).toContainText('法兰克');
  await expect(page.locator('#detail')).not.toContainText('职业资料');
  await expect(page.locator('#detail')).not.toContainText('职业选手');
  await expect(page.locator('#detail a[href*="/players"], #detail a[href*="/events"]')).toHaveCount(0);
  await expect(page.locator('#detail')).toContainText('历史与更新');
  await page.goto('./#/about-data');
  await expect(page.getByRole('heading', { level: 1, name: '关于数据' })).toBeVisible();
});
