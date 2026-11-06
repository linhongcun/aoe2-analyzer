import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const failures = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  failures.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(failures.get(page)).toEqual([]);
});

const card = (page: Page) => page.getByTestId('victory-modes');

test('#729 @1280 入门页能看见猝死规则和官方更新日期', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/game-guide');
  const modes = card(page);
  await expect(modes).toBeVisible();
  await expect(modes).toContainText('不能再建城镇中心');
  await expect(modes).toContainText('主城（home Town Center）被毁就会输掉');
  await expect(modes).toContainText('最后一座城镇中心被毁就会立刻输掉');
  await expect(modes).toContainText('通过军事与战略击败所有敌方，或让对方投降结束比赛');
  await expect(modes).toContainText('不能用征服示例代替');
  await expect(modes).toContainText('失去国王即负');
  await expect(modes).toContainText('更新于 2026-01-16');
  await expect(modes.getByRole('link', { name: '官方 Support：如何创建多人游戏', exact: true })).toHaveAttribute(
    'href',
    'https://support.ageofempires.com/hc/en-us/articles/360047306372-How-do-I-create-a-multiplayer-match-in-Age-of-Empires-II-Definitive-Edition',
  );
  await expect(modes).not.toContainText('奇观');
  await expect(modes).not.toContainText('圣物');
  await expect(modes.locator('table')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const report = await new AxeBuilder({ page }).include('[data-testid="victory-modes"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(report.violations).toEqual([]);
});

test('#729 非征服时六张卡仍暂停，短卡继续说明不能拿征服示例代替', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/game-guide');
  await page.getByRole('combobox', { name: '胜利设置', exact: true }).selectOption('other');
  await expect(page.getByTestId('game-guide-unsupported')).toBeVisible();
  await expect(page.locator('.gg-card')).toHaveCount(0);
  await expect(card(page)).toBeVisible();
  await expect(card(page)).toContainText('不能用征服示例代替');
  await expect(card(page)).toContainText('主城（home Town Center）被毁就会输掉');
});

test('#729 SD3 合集短链打开胜利条件卡，不出现赛程', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/maps');
  const collection = page.getByTestId('sd3-collection');
  await collection.locator('summary').click();
  await expect(collection).not.toContainText('$20,000');
  await expect(collection).not.toContainText('半决赛');
  await expect(collection).not.toContainText('比分');
  await collection.getByTestId('sd3-victory-link').click();
  await expect(page).toHaveURL(/#\/game-guide$/);
  await expect(card(page)).toBeVisible();
  await expect(card(page)).toContainText('不能再建城镇中心');
  await expect(card(page).getByRole('link', { name: '官方 Support：如何创建多人游戏', exact: true })).toBeVisible();
});
