// #952 单位、建筑、科技展开更新历史后只留一枚真实标题。
import { expect, test, type Page } from '@playwright/test';

const PAGES = [
  ['/unit/873?tab=history', '#unit-history', '基础食物费用增加，黄金费用不变。'],
  ['/building/84?tab=history', '#building-history', '食物基础交易价'],
  ['/tech/875?tab=history', '#tech-history', '护甲'],
] as const;

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function lightDesktop(page: Page) {
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'light'));
}

async function visibleTitles(page: Page, selector: string) {
  return page.locator(selector).evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let count = 0;
    let node = walker.nextNode();
    while (node) {
      if (node.textContent?.trim() === '更新历史') {
        const range = document.createRange();
        range.selectNodeContents(node);
        if ([...range.getClientRects()].some((rect) => rect.width > 0 && rect.height > 0)) count += 1;
      }
      node = walker.nextNode();
    }
    return count;
  });
}

test('#952 单位、建筑、科技展开后只有一枚更新历史标题', async ({ page }) => {
  const errors = watch(page);
  await lightDesktop(page);
  for (const [route, root, copy] of PAGES) {
    await page.goto(`./#${route}`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const block = page.locator(root);
    await expect(block).toHaveAttribute('open', '');
    const heading = block.getByRole('heading', { level: 2, name: '更新历史', exact: true });
    await expect(heading).toHaveCount(1);
    await expect(heading).toBeVisible();
    await expect(block.locator('> summary').getByRole('heading', { level: 2, name: '更新历史', exact: true })).toHaveCount(1);
    await expect(block.getByTestId('entity-history').getByRole('heading', { name: '更新历史', exact: true })).toHaveCount(0);
    await expect(block.getByRole('region', { name: '更新历史', exact: true })).toHaveCount(0);
    expect(await visibleTitles(page, root)).toBe(1);
    const box = await block.locator('> summary').boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
    await expect(block.getByTestId('entity-history')).toContainText(copy);
    await expect(block.locator('.history-count')).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('#952 折叠、键盘、深链和返回仍只保留这一枚标题', async ({ page }) => {
  const errors = watch(page);
  await lightDesktop(page);
  await page.goto('./#/unit/873');
  const block = page.locator('#unit-history');
  await expect(block).not.toHaveAttribute('open', '');
  expect(await visibleTitles(page, '#unit-history')).toBe(1);
  const summary = block.locator('> summary');
  await summary.focus();
  await expect(summary).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(block).toHaveAttribute('open', '');
  await expect(page).toHaveURL(/tab=history/);
  await expect(block.getByRole('heading', { level: 2, name: '更新历史', exact: true })).toHaveCount(1);
  expect(await visibleTitles(page, '#unit-history')).toBe(1);
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(block).not.toHaveAttribute('open', '');
  await expect(page).not.toHaveURL(/tab=history/);
  await page.goto('./#/building/84?tab=history');
  await expect(page.locator('#building-history')).toHaveAttribute('open', '');
  await page.goBack();
  await expect(page).toHaveURL(/#\/unit\/873\/?$/);
  await expect(block).not.toHaveAttribute('open', '');
  expect(await visibleTitles(page, '#unit-history')).toBe(1);
  expect(errors).toEqual([]);
});

test('#952 文明页历史与更新标题不变', async ({ page }) => {
  const errors = watch(page);
  await lightDesktop(page);
  await page.goto('./#/civ/Burgundians?tab=history');
  await expect(page.getByRole('heading', { level: 2, name: '历史与更新', exact: true })).toBeVisible();
  const fold = page.getByTestId('civ-patches');
  await expect(fold).toHaveAttribute('open', '');
  await expect(fold.locator('> summary')).toHaveText('更新历史');
  await expect(fold.locator('> summary').getByRole('heading')).toHaveCount(0);
  await expect(fold.getByTestId('entity-history').getByRole('heading', { name: '更新历史', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '更新历史', exact: true })).toHaveCount(0);
  await expect(fold.getByRole('region', { name: '更新历史', exact: true })).toHaveCount(1);
  await expect(fold.locator('.history-count')).toBeVisible();
  expect(errors).toEqual([]);
});

test('#952 目录缺失回退只留一枚更新历史标题', async ({ page }) => {
  const errors = watch(page);
  await lightDesktop(page);
  await page.goto('./#/tech/716?tab=history');
  const pageRoot = page.locator('#historical-entity');
  await expect(pageRoot).toBeVisible();
  await expect(page.getByText('历史档案，当前数据目录未收录', { exact: true })).toBeVisible();
  await expect(page.getByText('此处保留旧内容的历史身份与当时记录。', { exact: true })).toBeVisible();
  await expect(pageRoot.locator('summary').filter({ hasText: '更新历史' })).toHaveCount(0);
  const heading = page.getByRole('heading', { level: 2, name: '更新历史', exact: true });
  await expect(heading).toHaveCount(1);
  await expect(heading).toBeVisible();
  await expect(page.getByRole('tab', { name: '更新历史', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: '更新历史', exact: true })).toHaveCount(0);
  expect(await visibleTitles(page, '#historical-entity')).toBe(1);
  await expect(page).toHaveURL(/tab=history/);
  expect(errors).toEqual([]);
});
