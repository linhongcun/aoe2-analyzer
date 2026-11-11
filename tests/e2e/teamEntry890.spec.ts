import { expect, test } from '@playwright/test';

test('首页、工具菜单和搜索只有一个团队入口', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#home [data-testid="home-catalog"]')).toBeVisible();
  await expect(page.locator('#home a[href="#/team-fit"]')).toHaveCount(1);
  await expect(page.locator('#home a[href="#/team-bonuses"], #home a[href="#/team-plan"]')).toHaveCount(0);
  await page.getByRole('button', { name: '工具', exact: true }).click();
  const tools = page.locator('#tools-menu');
  await expect(tools.getByRole('link', { name: '团队', exact: true })).toHaveAttribute('href', '#/team-fit');
  await expect(tools.getByRole('link', { name: '文明搭配', exact: true })).toHaveCount(0);
  await expect(tools.getByRole('link', { name: '团队加成', exact: true })).toHaveCount(0);
  await expect(tools.getByRole('link', { name: '团战分工', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  const search = page.getByRole('combobox', { name: '全局搜索', exact: true });
  for (const query of ['文明搭配', '团队加成', '团战分工']) {
    await search.fill(query);
    const options = page.locator('.cmdk-list [role="option"]');
    await expect(options.first()).toContainText('团队');
    await expect(page.locator('.cmdk-list a, .cmdk-list [role="option"]')).not.toContainText('团战分工计划');
  }
});

test('团队分区可以打开搭配、加成汇总和可打印的分工', async ({ page }) => {
  await page.goto('./#/team-fit');
  const sections = page.getByTestId('team-sections');
  await expect(sections.getByRole('link', { name: '文明搭配', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { level: 1, name: '文明搭配', exact: true })).toBeVisible();
  await expect(page.getByText('完整科技树潜力')).toBeVisible();
  await sections.getByRole('link', { name: '团队加成', exact: true }).click();
  await expect(page).toHaveURL(/#\/team-bonuses$/);
  await expect(page.getByRole('heading', { level: 1, name: '团队加成一屏汇总', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: '常驻团队加成', exact: true })).toBeVisible();
  await sections.getByRole('link', { name: '团战分工', exact: true }).click();
  await expect(page).toHaveURL(/#\/team-plan$/);
  await expect(page.getByRole('heading', { level: 1, name: '团战分工计划', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '打印全部阶段', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '复制完整计划', exact: true })).toBeVisible();
});

test('旧地址和对比页深链仍打开对应能力', async ({ page }) => {
  await page.goto('./#/team-bonuses?tv=1&players=Franks%2CBritons&age=4&target=all&unit=&researched=');
  await expect(page.getByRole('heading', { level: 1, name: '团队加成一屏汇总', exact: true })).toBeVisible();
  await expect(page.getByTestId('team-sections').getByRole('link', { name: '团队加成', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.goto('./#/team-plan');
  await expect(page.getByRole('button', { name: '打印全部阶段', exact: true })).toBeVisible();
  await page.goto('./#/compare');
  await page.getByRole('link', { name: '查看这两个文明的团队加成来源', exact: true }).click();
  await expect(page).toHaveURL(/#\/team-bonuses\?/);
  await expect(page.getByRole('heading', { level: 1, name: '团队加成一屏汇总', exact: true })).toBeVisible();
});
