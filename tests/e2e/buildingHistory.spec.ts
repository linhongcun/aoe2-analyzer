import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const history = (page: Page) => page.getByTestId('entity-history');
const records = (page: Page) => history(page).locator('[data-history-entry]');

function recordErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function openHistory(page: Page, id: number, query = '') {
  await page.goto(`./#/building/${id}?tab=history${query}`);
  await expect(records(page).first()).toBeVisible();
  await expect(page.getByRole('tab', { name: '更新历史', exact: true })).toHaveAttribute('aria-selected', 'true');
}

test('#437 建筑历史：城楼从概览切换可查真实机制改动及当时文明范围', async ({ page }) => {
  const errors = recordErrors(page);
  await page.goto('./#/building/1665?tab=ov');
  await expect(page.getByRole('tab', { name: '概览', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: '更新历史', exact: true }).click();
  await expect(page).toHaveURL(/tab=history/);
  await expect(records(page)).toHaveCount(3);
  for (const [id, text] of [
    ['81058-115', '城楼现在受到围墙科技的生命值加成影响'],
    ['81058-116', '城楼现在可以训练长矛兵系'],
    ['81058-117', '城楼现在可以作为建造靶场与马厩的前置建筑'],
  ]) {
    const record = history(page).locator(`[data-history-entry="${id}"]`);
    await expect(record).toContainText(text!);
    await expect(record).toContainText('直接改动');
    await expect(record).toContainText('适用文明：西西里');
    await expect(record.getByRole('link', { name: '查看官方来源', exact: true })).toHaveAttribute(
      'href',
      'https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-81058/',
    );
  }
  const original = history(page).locator('[data-history-entry="81058-115"] details');
  await original.locator('summary').click();
  await expect(original.locator('blockquote')).toHaveText('Donjon affected by Hoardings');
  await page.reload();
  await expect(records(page)).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('#437 建筑历史：市场直接与关联筛选取交集，筛选无结果与缺失档案分开', async ({ page }) => {
  const errors = recordErrors(page);
  await openHistory(page, 84);
  await expect(history(page)).toContainText('125283');
  await expect(history(page)).toContainText('66692');
  await page.getByRole('combobox', { name: '影响关系', exact: true }).selectOption('related');
  await expect(history(page).locator('[data-history-entry="125283-010-013"]')).toHaveCount(0);
  await expect(history(page).locator('[data-history-entry="66692-009-021"]')).toContainText('研究行会后；萨拉森不适用');
  await expect(history(page).locator('[data-history-entry="66692-029-045"]')).toContainText('适用文明：萨拉森');
  await page.getByLabel('搜索历史', { exact: true }).fill('行会');
  await expect(records(page)).toHaveCount(1);
  await expect(records(page).first()).toContainText('关联影响');
  await page.getByRole('combobox', { name: '影响关系', exact: true }).selectOption('direct');
  await expect(history(page)).toContainText('没有符合筛选条件的记录');
  await expect(history(page)).not.toContainText('尚未收录该对象的更新历史');
  await page.getByRole('button', { name: '清除历史筛选', exact: true }).click();
  await expect(records(page)).toHaveCount(3);
  await page.goto('./#/building/104?tab=history');
  await expect(page.getByRole('heading', { name: /修道院/ }).first()).toBeVisible();
  await expect(history(page)).toContainText('尚未收录该对象的更新历史');
  await expect(history(page)).not.toContainText('没有符合筛选条件的记录');
  expect(errors).toEqual([]);
});

test('#437 建筑历史：复制真实静态链接后新上下文打开与刷新保留日期和筛选', async ({ page, browser }) => {
  const errors = recordErrors(page);
  await openHistory(page, 84, '&histRelation=direct&histFrom=2024-10-15&histTo=2024-10-15');
  await expect(records(page)).toHaveCount(1);
  await expect(records(page).first()).toContainText('食物基础交易价');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as Window & { copiedBuildingHistory?: string }).copiedBuildingHistory = value;
        },
      },
    });
  });
  await page.locator('.dhead').getByRole('button', { name: '复制链接', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { copiedBuildingHistory?: string }).copiedBuildingHistory)).toBeTruthy();
  const copied = await page.evaluate(() => (window as Window & { copiedBuildingHistory?: string }).copiedBuildingHistory);
  const url = new URL(copied!);
  expect(url.pathname).toMatch(/\/building\/84\/$/);
  expect(url.hash).toBe('');
  expect(url.searchParams.get('tab')).toBe('history');
  expect(url.searchParams.get('histRelation')).toBe('direct');
  expect(url.searchParams.get('histFrom')).toBe('2024-10-15');
  expect(url.searchParams.get('histTo')).toBe('2024-10-15');
  const context = await browser.newContext();
  try {
    const fresh = await context.newPage();
    const freshErrors = recordErrors(fresh);
    await fresh.goto(copied!);
    await expect(fresh.getByRole('heading', { name: /市场/ }).first()).toBeVisible();
    await expect(records(fresh)).toHaveCount(1);
    await expect(records(fresh).first()).toContainText('食物基础交易价');
    await expect(fresh.getByRole('combobox', { name: '影响关系', exact: true })).toHaveValue('direct');
    await fresh.reload();
    await expect(records(fresh)).toHaveCount(1);
    await expect(fresh.getByLabel('开始日期', { exact: true })).toHaveValue('2024-10-15');
    await expect(fresh.getByLabel('结束日期', { exact: true })).toHaveValue('2024-10-15');
    await expect(fresh.getByRole('tab', { name: '更新历史', exact: true })).toHaveAttribute('aria-selected', 'true');
    expect(freshErrors).toEqual([]);
  } finally {
    await context.close();
  }
  expect(errors).toEqual([]);
});

test('#437 建筑历史：版本条目与关联档案都直接进入建筑历史页签', async ({ page }) => {
  const errors = recordErrors(page);
  await page.goto('./#/patches/81058');
  const link = page.getByRole('link', { name: '查看城楼更新历史', exact: true }).first();
  await expect(link).toHaveAttribute('href', '#/building/1665?tab=history');
  await link.click();
  await expect(records(page)).toHaveCount(3);
  await page.goto('./#/tech/379?tab=history');
  const related = history(page).locator('[data-history-entry="81058-115"] .history-related').getByRole('link', { name: '围墙', exact: true });
  await expect(related).toHaveAttribute('href', '#/tech/379?tab=history');
  const building = history(page).locator('[data-history-entry="81058-115"] h4').getByRole('link', { name: '城楼', exact: true });
  await expect(building).toHaveAttribute('href', '#/building/1665?tab=history');
  await building.click();
  await expect(page).toHaveURL(/building\/1665\?tab=history/);
  await expect(records(page)).toHaveCount(3);
  const archeryRange = history(page).locator('[data-history-entry="81058-117"] .history-related').getByRole('link', { name: '靶场', exact: true });
  await expect(archeryRange).toHaveAttribute('href', '#/building/87?tab=history');
  await archeryRange.click();
  await expect(page).toHaveURL(/building\/87\?tab=history/);
  await expect(page.getByRole('tab', { name: '更新历史', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(history(page).locator('[data-history-entry="81058-117"]')).toContainText('满足前置条件');
  await expect(history(page).locator('[data-history-entry="81058-117"]')).toContainText('关联影响');
  expect(errors).toEqual([]);
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#437 建筑历史：四宽双主题 ${width} ${theme}`, async ({ page }, info) => {
      const errors = recordErrors(page);
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      for (const id of [1665, 84]) {
        await openHistory(page, id);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await history(page).locator('details').filter({ hasText: '查看官方原文摘录' }).first().locator('summary').click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        for (const control of await history(page).locator('input, select, button').all()) {
          const box = await control.boundingBox();
          expect(box!.height).toBeGreaterThanOrEqual(44);
        }
        for (const span of await history(page).locator('.num.nw').all()) {
          expect(await span.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe('nowrap');
        }
        const violations = (await new AxeBuilder({ page }).include('[data-testid="entity-history"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations;
        expect(violations).toEqual([]);
        await page.screenshot({ path: info.outputPath('building-history', `building-${id}-${width}-${theme}.png`), fullPage: true });
      }
      expect(errors).toEqual([]);
    });
