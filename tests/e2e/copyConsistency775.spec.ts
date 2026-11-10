import { expect, test, type Page } from '@playwright/test';

const SITE = '帝国时代 II 分析器';
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') messages.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('#775 全站统一叫「团队加成」，旧叫法只保留为搜索别名', async ({ page }) => {
  // 工具菜单与入口文案
  await page.goto('./#/');
  await expect(page.locator('#home h1')).toBeVisible();
  await page.getByRole('button', { name: '工具', exact: true }).click();
  const tools = page.locator('#tools-menu');
  await expect(tools.getByRole('link', { name: '团队', exact: true })).toBeVisible();
  await expect(tools.getByRole('link', { name: '团队加成', exact: true })).toHaveCount(0);
  expect(await tools.innerText()).not.toContain('队伍加成');

  // #/bonuses 的说明与按钮
  await page.goto('./#/bonuses');
  await expect(page.getByRole('link', { name: '按玩家阵容汇总团队加成', exact: true })).toBeVisible();
  const bonuses = await page.locator('main').innerText();
  expect(bonuses).toContain('团队加成');
  expect(bonuses).not.toContain('队伍加成');

  // #/team-bonuses 页内三种层级与浏览器标题
  await page.goto('./#/team-bonuses');
  await expect(page.getByRole('heading', { level: 1, name: '团队加成一屏汇总', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: '常驻团队加成', exact: true })).toBeVisible();
  const teamBonuses = await page.locator('main').innerText();
  expect(teamBonuses).toContain('团队加成');
  expect(teamBonuses).not.toContain('队伍加成');
  await expect(page).toHaveTitle(`团队加成 | ${SITE}`);

  // 旧叫法仍能搜到同一页面（搜索别名兼容）
  await page.goto('./#/');
  await expect(page.locator('#home h1')).toBeVisible();
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: '全局搜索', exact: true });
  const input = dialog.getByRole('combobox', { name: '全局搜索', exact: true });
  await input.fill('队伍加成');
  const options = dialog.getByRole('listbox', { name: '搜索结果', exact: true }).getByRole('option');
  const hit = options.filter({ hasText: '团队' }).first();
  await expect(hit).toBeVisible();
  await hit.click();
  await expect(page).toHaveURL(/#\/team-fit$/);
});

test('#775 一局与观赛浏览器标题去掉「卡」，导航短名不变', async ({ page }) => {
  await page.goto('./#/game-guide');
  await expect(page.getByRole('heading', { level: 1, name: '一局与观赛入门', exact: true })).toBeVisible();
  await expect(page).toHaveTitle(`一局与观赛入门 | ${SITE}`);
  await page.goto('./#/');
  await page.getByRole('button', { name: '工具', exact: true }).click();
  await expect(page.locator('#tools-menu').getByRole('link', { name: '一局与观赛', exact: true })).toBeVisible();
});

test('#775 页脚评分免责只出现在含 1–10 评分的页面', async ({ page }) => {
  for (const route of ['/hotkeys', '/match-review', '/team-plan']) {
    await page.goto('./#' + route);
    await expect(page.locator('main')).not.toBeEmpty();
    const footer = page.locator('footer.editorial-footer');
    await expect(footer).not.toContainText('所有评分（1-10）');
  }
  for (const route of ['/civ/Franks', '/compare']) {
    await page.goto('./#' + route);
    await expect(page.locator('main')).not.toBeEmpty();
    await expect(page.locator('footer.editorial-footer')).toContainText('所有评分（1-10）');
  }
});

test('#775 首页标题与静态页 title 不再重复品牌，其它页面仍是「页名 | 站点」', async ({ page }) => {
  await page.goto('./#/');
  await expect(page.locator('#home h1')).toBeVisible();
  await expect(page).toHaveTitle(SITE);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', SITE);
  await page.goto('./#/civ/Franks');
  await expect(page).toHaveTitle(`法兰克 | ${SITE}`);
  const staticHome = await (await page.request.get('./')).text();
  expect(staticHome).toContain(`<title>${SITE}</title>`);
  expect(staticHome).not.toContain(`<title>${SITE} | ${SITE}</title>`);
});
