import { expect, test, type Page } from '@playwright/test';

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('#946 版本阅读首屏、筛选边界与前进后退', async ({ page }) => {
  const errors = watch(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./#/patches/185872');
  await expect(page.locator('.patch-filters')).not.toHaveAttribute('open', '');
  await expect(page.locator('.patch-tree-summary')).not.toHaveAttribute('open', '');
  const scope = page.getByText('收录范围：', { exact: false }).first();
  const entry = page.locator('.patch-entry').first();
  await expect(scope).toBeVisible();
  await expect(entry.getByRole('heading', { name: '武士' })).toBeVisible();
  await expect(entry).toContainText('对冲击步兵的额外伤害增加');
  await expect(entry).toContainText('改动前');
  await expect(entry).toContainText('改动后');
  await expect(page.getByText('本档案尚未完成逐条原文核对。来源冲突的条目会单独标明，不会按数值改写档案标记。')).toBeVisible();
  const values = await entry.locator('.patch-values').boundingBox();
  const scopeBox = await scope.boundingBox();
  expect(scopeBox!.y).toBeGreaterThanOrEqual(0);
  expect(scopeBox!.y + scopeBox!.height).toBeLessThanOrEqual(800);
  expect(values!.y + values!.height).toBeLessThanOrEqual(800);
  await page.screenshot({ path: '/opt/cursor/artifacts/patches-946-1280.png', fullPage: false });

  await page.goto('./#/patches');
  await page.getByRole('link', { name: /DE Update 185872/ }).click();
  await page.locator('.patch-filters summary').click();
  await page.locator('.patch-filters').getByRole('button', { name: '削弱', exact: true }).click();
  await expect(page).toHaveURL(/kind=nerf/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/patches$/);
  await page.goForward();
  await expect(page).toHaveURL(/patches\/185872/);
  await expect(page).toHaveURL(/kind=nerf/);

  await page.goto('./#/patches/81058?civ=Franks');
  await expect(page.getByTestId('patch-stated').locator('[data-entry="81058-1"]')).toBeVisible();
  await expect(page.getByTestId('patch-unstated').locator('[data-entry="81058-1"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /写明适用于法兰克/ })).toBeVisible();
  await page.goto('./#/patches/81058?civ=Chinese');
  await expect(page.locator('[data-entry="81058-1"]')).toHaveCount(0);
  await page.goto('./#/patches/81058?civ=NotACiv');
  await expect(page.getByText('找不到这些文明，不能当作查看全部改动。')).toBeVisible();
  await expect(page.locator('.patch-entry')).toHaveCount(0);
  await page.goto('./#/patches/81058?civ=Franks,NotACiv');
  await expect(page.getByText('无法识别文明 NotACiv，已从本次筛选中忽略。')).toBeVisible();
  await expect(page.getByTestId('patch-stated').locator('[data-entry="81058-1"]')).toBeVisible();

  await page.goto('./#/patches/81058?ctype=fix');
  const fix = page.locator('[data-entry="81058-40"]');
  await expect(fix).toContainText('游戏修复');
  await expect(fix).toContainText('调整');
  await expect(fix).toContainText('查看官方来源');
  await page.goto('./#/patches/81058?kind=fix');
  await expect(page.locator('[data-entry="81058-40"]')).toHaveCount(0);

  await page.locator('.patch-tree-summary summary').click();
  await expect(page.locator('.patch-tree-summary')).toContainText('当前筛选下没有科技树开放或移除项。');
  await page.goto('./#/patches/185872');
  await page.locator('.patch-tree-summary summary').click();
  await expect(page.locator('.patch-tree-summary')).toContainText(`未开放 ${String.fromCodePoint(0x2192)} 已开放`);
  await page.goto('./#/patches/185872?q=无此内容');
  await page.locator('.patch-tree-summary summary').click();
  await expect(page.locator('.patch-tree-summary')).toContainText('当前筛选下没有科技树开放或移除项。');
  await expect(page.getByRole('heading', { name: '没有符合筛选条件的改动' })).toBeVisible();

  await page.goto('./#/patches?obj=unit:74&kind=nerf&q=foo');
  await expect(page).toHaveURL(/kind=nerf/);
  await expect(page).toHaveURL(/q=foo/);
  await expect(page.getByRole('heading', { level: 1, name: '民兵' })).toBeVisible();
  await expect(page.getByText('尚未收录该对象的更新历史。这不代表它从未改动。')).toHaveCount(0);
  await page.reload();
  await expect(page).toHaveURL(/kind=nerf/);
  await expect(page).toHaveURL(/q=foo/);

  await page.goto('./#/patches/81058?obj=unit:74&kind=new');
  await expect(page.getByRole('heading', { name: /DE Update 81058/ })).toBeVisible();
  await expect(page).toHaveURL(/obj=unit/);
  await expect(page).toHaveURL(/kind=new/);
  await page.goto('./#/patches/missing-version?obj=unit:74');
  await expect(page.getByRole('heading', { name: '找不到版本 missing-version' })).toBeVisible();
  await expect(page.getByTestId('patch-object')).toHaveCount(0);

  await page.goto('./#/patches?obj=tech:22');
  await expect(page.getByText('尚未收录该对象的更新历史。这不代表它从未改动。')).toBeVisible();
  await page.goto('./#/patches?obj=nope:1');
  await expect(page.getByRole('heading', { name: '找不到对象', exact: true })).toBeVisible();
  await page.goto('./#/patches?obj=unit:999999999');
  await expect(page.getByRole('heading', { name: '找不到对象', exact: true })).toBeVisible();
  await page.goto('./#/patches');
  await page.getByRole('combobox', { name: '查找对象' }).fill('旧狂战士');
  await page.getByRole('option', { name: /旧狂战士科技/ }).click();
  await expect(page).toHaveURL(/obj=tech:legacy-berserkergang$/);
  await expect(page.getByRole('heading', { level: 1, name: '旧狂战士科技' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/patches$/);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('#946 四类历史深链、科技折叠、身份回退与文明链接', async ({ page }) => {
  const errors = watch(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./#/unit/24');
  await expect(page.locator('#unit-history')).not.toHaveAttribute('open', '');
  await page.goto('./#/unit/24?tab=history');
  await expect(page.locator('#unit-history')).toHaveAttribute('open', '');
  await expect(page.locator('#unit-history [data-history-entry]').first()).toBeVisible();
  const unitBox = await page.locator('#unit-history').boundingBox();
  expect(unitBox!.y).toBeLessThan(800);

  await page.goto('./#/tech/22');
  await expect(page.locator('#tech-history')).not.toHaveAttribute('open', '');
  await page.goto('./#/tech/22?tab=history');
  await expect(page.locator('#tech-history')).toHaveAttribute('open', '');
  await expect(page.locator('#tech-history')).toContainText('尚未收录该对象的更新历史');

  await page.goto('./#/building/84?tab=history');
  await expect(page.locator('#building-history')).toHaveAttribute('open', '');
  await expect(page.locator('#building-history [data-history-entry]').first()).toBeVisible();
  await page.goto('./#/building/999999999');
  await expect(page.getByRole('heading', { name: '尚未收录该对象的更新历史' })).toBeVisible();
  await expect(page.locator('#bgrid')).toHaveCount(0);

  await page.goto('./#/tech/716?tab=history');
  await expect(page.getByRole('heading', { name: /补给/ }).first()).toBeVisible();
  await expect(page.getByText('历史档案，当前数据目录未收录')).toBeVisible();

  await page.goto('./#/civ/Tartars');
  await expect(page.getByRole('heading', { name: '尚未收录该对象的更新历史' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '没找到这个文明' })).toHaveCount(0);

  await page.goto('./#/civ/Franks?tab=history');
  const link = page.getByRole('link', { name: '查看本版本的文明分组改动（含未写明适用文明的记录）' }).first();
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', /#\/patches\/\d+\?civ=Franks$/);
  expect(errors).toEqual([]);
});

test('#946 390 深色版本页可筛选且不横向溢出', async ({ page }) => {
  const errors = watch(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));
  await page.goto('./#/patches/188329');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByText('当前数据版本')).toBeVisible();
  const entry = page.locator('.patch-entry').first();
  await expect(entry).toBeVisible();
  await page.locator('.patch-filters summary').click();
  await page.locator('.patch-filters').getByRole('button', { name: '游戏修复', exact: true }).click();
  await expect(page).toHaveURL(/ctype=fix/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/opt/cursor/artifacts/patches-946-390-dark.png', fullPage: false });
  expect(errors).toEqual([]);
});
