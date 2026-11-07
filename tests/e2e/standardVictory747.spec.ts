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
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

const card = (page: Page) => page.getByTestId('standard-victory');

test('#747 @1280 入门页写清 Standard 不是天梯征服，秒数不写死', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/game-guide');
  const entry = card(page);
  await expect(entry).toBeVisible();
  await expect(entry).toContainText('不是本页六张卡使用的征服示例，也不是天梯默认');
  await expect(entry.locator('[data-standard="ranked"]')).toContainText('村民、军事单位和生产建筑都被消灭');
  await expect(entry.locator('[data-standard="base"]')).toHaveText('基础倒计时随地图尺寸变化。站内没有按地图尺寸导出的秒数，具体秒数待确认。');
  await expect(entry.locator('[data-standard="years"]')).toContainText('+100 年');
  await expect(entry.locator('[data-standard="official"]')).toContainText('只加给敌方和中立玩家');
  await expect(entry.locator('[data-standard="official"]')).toContainText('可以叠加');
  await expect(entry.locator('[data-standard="effects"]')).toContainText('没有规则，要加多少待确认');
  await expect(entry).toContainText('2026-09-22');
  await expect(entry).toContainText('Atheism now applies Wonder and Relic victory timer increase only to enemy and neutral players.');
  await expect(entry.getByRole('link', { name: '圣物收益（只算产金）', exact: true })).toHaveAttribute('href', '#/relic-income');
  await expect(entry.getByRole('link', { name: '无神论', exact: true })).toHaveAttribute('href', '#/tech/21');
  await expect(entry.getByRole('link', { name: '官方：Update 185872', exact: true })).toHaveAttribute(
    'href',
    'https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-185872/',
  );
  await expect(entry.locator('table')).toHaveCount(0);
  await expect(page.getByTestId('victory-modes')).not.toContainText('奇观');
  await expect(page.getByTestId('victory-modes')).toContainText('不能再建城镇中心');
  const visible = await entry.innerText();
  expect(visible).not.toMatch(/\d+\s*秒/);
  expect(visible).not.toMatch(/\d+:\d+/);
  expect(visible).not.toMatch(/奇观流|速奇观|开局推荐/);
  const wrapped = await entry.locator('.num').evaluateAll((nodes) => nodes.filter((node) => node.getClientRects().length > 1).map((node) => node.textContent));
  expect(wrapped).toEqual([]);
  const report = await new AxeBuilder({ page }).include('[data-testid="standard-victory"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(report.violations).toEqual([]);
});

test('#747 六张卡暂停时倒计时说明仍在，短链打开产金和无神论', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/game-guide');
  await page.getByRole('combobox', { name: '胜利设置', exact: true }).selectOption('other');
  await expect(page.getByTestId('game-guide-unsupported')).toBeVisible();
  await expect(page.locator('.gg-card')).toHaveCount(0);
  await expect(card(page)).toContainText('随地图尺寸变化');
  await card(page).getByRole('link', { name: '圣物收益（只算产金）', exact: true }).click();
  await expect(page).toHaveURL(/#\/relic-income\/?$/);
  await expect(page.getByRole('heading', { level: 1, name: '圣物收益', exact: true })).toBeVisible();
  await expect(page.locator('body')).toContainText('分资源收入');
  await page.goto('./#/game-guide');
  await card(page).getByRole('link', { name: '无神论', exact: true }).click();
  await expect(page).toHaveURL(/#\/tech\/21$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('无神论');
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'] as const) {
    test(`#747 ${width}px ${theme} 无横向滚动且链接够大`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/game-guide');
      const entry = card(page);
      await expect(entry).toBeVisible();
      await expect(entry.locator('[data-standard="base"]')).toContainText('待确认');
      await expect(entry.locator('[data-standard="years"]')).toContainText('+100 年');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const small = await entry.evaluate((el) =>
        [...el.querySelectorAll('a')]
          .filter((node) => node.getClientRects().length)
          .map((node) => ({ text: node.textContent, height: node.getBoundingClientRect().height }))
          .filter((node) => node.height < 43.9),
      );
      expect(small).toEqual([]);
      const wrapped = await entry
        .locator('.num')
        .evaluateAll((nodes) => nodes.filter((node) => node.getClientRects().length > 1).map((node) => node.textContent));
      expect(wrapped).toEqual([]);
      if (theme === 'light') {
        await entry.locator('h2').scrollIntoViewIfNeeded();
        await entry.screenshot({ path: `/opt/cursor/artifacts/standard-victory-747-${width}.png` });
      }
    });
  }
