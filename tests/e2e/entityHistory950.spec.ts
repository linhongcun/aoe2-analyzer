import { expect, test, type Page } from '@playwright/test';

const history = (page: Page) => page.getByTestId('entity-history');

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function completeEntries(page: Page) {
  return history(page).evaluate((element) => {
    element.scrollIntoView({ block: 'start' });
    const height = window.innerHeight;
    return [...element.querySelectorAll('[data-history-entry]')].filter((node) => {
      const box = node.getBoundingClientRect();
      return box.height > 0 && box.top >= -1 && box.bottom <= height + 1;
    }).length;
  });
}

test('#950 直接改动不再用大卡片重复对象名，来源和前后值仍在', async ({ page }) => {
  const errors = watch(page);
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto('./#/unit/873?tab=history');
  await expect(page.locator('#unit-history')).toHaveAttribute('open', '');
  const root = history(page);
  await expect(page.locator('#unit-history > summary').getByRole('heading', { level: 2, name: '更新历史', exact: true })).toBeVisible();
  await expect(root.getByRole('heading', { name: '更新历史', exact: true })).toHaveCount(0);
  await expect(root).toContainText('分批收录 DE 正式版');
  await expect(root).toContainText('没有出现在这里不代表从未改动');
  await expect(root).toContainText('档案标记不按数值重新判定，也不能直接证明整体对局强弱');
  await expect(root.locator('[data-history-entry]')).toHaveCount(6);
  await expect(root.getByRole('link', { name: '骑象射手', exact: true })).toHaveCount(0);
  await expect(root.locator('h4')).toHaveCount(0);
  const food = root.locator('[data-history-entry="188329-1"]');
  await expect(food).toContainText('基础食物费用增加，黄金费用不变。');
  await expect(food).toContainText('前');
  await expect(food).toContainText('60');
  await expect(food).toContainText('后');
  await expect(food).toContainText('70');
  await expect(food.getByRole('link', { name: '查看官方来源', exact: true })).toBeVisible();
  await expect(food).toContainText('档案标记 削弱');
  await expect(food).toContainText('已核对当时官方记录');
  await expect(root.locator('details').filter({ hasText: '查看收录范围' })).not.toHaveAttribute('open');
  await expect(root.locator('details').filter({ hasText: '筛选本页记录' })).not.toHaveAttribute('open');
  const box = await food.boundingBox();
  expect(box!.height).toBeGreaterThan(40);
  expect(box!.height).toBeLessThan(220);
  expect(await completeEntries(page)).toBeGreaterThanOrEqual(3);

  await page.goto('./#/tech/875?tab=history');
  await expect(page.locator('#tech-history > summary').getByRole('heading', { level: 2, name: '更新历史', exact: true })).toBeVisible();
  await expect(history(page).getByRole('heading', { name: '更新历史', exact: true })).toHaveCount(0);
  await expect(history(page).getByRole('link', { name: '软甲', exact: true })).toHaveCount(0);
  await expect(history(page).locator('[data-history-entry]').first()).toContainText('前');
  await expect(history(page).locator('[data-history-entry]').first()).toContainText('后');
  expect(await completeEntries(page)).toBeGreaterThanOrEqual(4);
  expect(errors).toEqual([]);
});

test('#950 文明页沿用宿主标题，关联身份不并进适用名单', async ({ page }) => {
  const errors = watch(page);
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto('./#/civ/Burgundians?tab=history');
  await expect(page.getByRole('heading', { level: 2, name: '历史与更新', exact: true })).toBeVisible();
  const root = history(page);
  await expect(root.getByRole('heading', { name: '更新历史', exact: true })).toHaveCount(0);
  await expect(root.locator('.history-count')).toBeVisible();
  const link = root.getByRole('link', { name: '查看本版本的文明分组改动（含未写明适用文明的记录）' }).first();
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', /#\/patches\/\d+\?civ=Burgundians$/);
  const related = root.locator('[data-history-relation="related"]').first();
  await expect(related).toContainText('关联 ·');
  await expect(related).toContainText('适用：');
  expect(errors).toEqual([]);
});

test('#950 冲突、空态和历史身份使用已审说明', async ({ page }) => {
  const errors = watch(page);
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto('./#/unit/2628?tab=history');
  const conflict = history(page).locator('[data-history-entry="185872-17"]');
  await expect(conflict).toContainText('来源冲突，尚未确认');
  await expect(conflict).toContainText('不按数值改写档案标记。');
  await expect(conflict.locator('.history-values')).toHaveCount(0);
  await expect(history(page).locator('[data-history-version="185872"]')).toContainText('档案日期');
  await expect(history(page).locator('[data-history-version="185872"]')).toContainText('不是已核对的官方发行日');

  await page.goto('./#/unit/38?tab=history');
  await expect(history(page)).toContainText('尚未收录该对象的更新历史。这不代表它从未改动。');
  await expect(history(page).locator('.history-count')).toContainText('0');
  await expect(history(page).locator('[data-history-entry]')).toHaveCount(0);
  await expect(page.locator('#unit-history > summary').getByRole('heading', { level: 2, name: '更新历史', exact: true })).toBeVisible();
  await expect(history(page).getByRole('heading', { name: '更新历史', exact: true })).toHaveCount(0);

  await page.goto('./#/tech/716?tab=history');
  await expect(page.getByText('历史档案，当前数据目录未收录', { exact: true })).toBeVisible();
  await expect(page.getByText('此处保留旧内容的历史身份与当时记录。', { exact: true })).toBeVisible();
  await expect(page.getByText('这不是详情整页重做')).toHaveCount(0);
  await expect(history(page).getByRole('heading', { level: 2, name: '更新历史', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('#950 筛选和官方原文可展开，深色 390 不横向溢出', async ({ page }) => {
  const errors = watch(page);
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto('./#/unit/873?tab=history');
  const original = history(page).locator('[data-history-entry="81058-21"] details');
  await expect(original).not.toHaveAttribute('open');
  await original.locator('summary').click();
  await expect(original.locator('blockquote')).toContainText('Elephant Archer');
  await history(page).locator('summary').filter({ hasText: '筛选本页记录' }).click();
  await page.getByRole('combobox', { name: '改动类型', exact: true }).selectOption('buff');
  await expect(history(page).locator('[data-history-entry="188329-1"]')).toHaveCount(0);
  await expect(history(page).locator('[data-history-entry="81058-21"]')).toBeVisible();
  await page.getByRole('button', { name: '清除历史筛选', exact: true }).click();
  await expect(history(page).locator('[data-history-entry="188329-1"]')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => localStorage.setItem('aoe2-theme', 'dark'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#unit-history > summary').getByRole('heading', { level: 2, name: '更新历史', exact: true })).toBeVisible();
  await expect(history(page).getByRole('heading', { name: '更新历史', exact: true })).toHaveCount(0);
  await expect(history(page).locator('[data-history-version="188329"] .history-version-date')).toBeVisible();
  expect(await completeEntries(page)).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const source = history(page).getByRole('link', { name: '查看官方来源', exact: true }).first();
  await source.focus();
  await expect(source).toBeFocused();
  const box = await source.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(errors).toEqual([]);
});
