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

const card = (page: Page) => page.getByTestId('elevation-bonus');

test('#734 @1280 入门页能看见高地乘子、出处，以及未计入地形', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/game-guide');
  const hill = card(page);
  await expect(hill).toBeVisible();
  await expect(hill.locator('[data-elevation="default"]')).toContainText('×1.25');
  await expect(hill.locator('[data-elevation="default"]')).toContainText('×0.75');
  await expect(hill.locator('[data-elevation="tatars"]')).toContainText('×1.50');
  await expect(hill.locator('[data-elevation="tatars"]')).toContainText('×0.75');
  await expect(hill.locator('[data-elevation="aligned"]')).toContainText('在高海拔战斗时，单位造成的伤害 +25%');
  await expect(hill.locator('[data-elevation="terrain"]')).toContainText('未计入地形高低差');
  await expect(hill.locator('[data-elevation="cliff"]')).toHaveText('悬崖是否与山体同一套乘子：待确认。站内经济数据没有悬崖专用字段，本页不补写。');
  await expect(hill).toContainText('2026-11-05');
  await expect(hill).toContainText('188329');
  await expect(hill).toContainText('2026-10-28');
  await expect(hill).toContainText('2023-04-27');
  await expect(hill).toContainText('Organ Guns would largely ignore hill bonuses/penalties');
  await expect(hill.getByRole('link', { name: 'UGC Resources', exact: true })).toHaveAttribute('href', 'https://ugc.aoe2.rocks/general/resources/resources/');
  await expect(hill.getByRole('link', { name: '官方 Hotfix 82587', exact: true })).toHaveAttribute(
    'href',
    'https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-hotfix-82587/',
  );
  await expect(hill.getByRole('link', { name: '鞑靼文明', exact: true })).toHaveAttribute('href', '#/civ/Tatars');
  await expect(hill.getByRole('link', { name: '这条高地加成', exact: true })).toHaveAttribute('href', '#/civ/Tatars/bonus/1');
  await expect(hill.getByRole('link', { name: '单位 PK', exact: true })).toHaveAttribute('href', '#/duel');
  await expect(hill.getByRole('link', { name: '对局助手', exact: true })).toHaveAttribute('href', '#/matchup');
  const wrapped = await hill.locator('.num').evaluateAll((nodes) => nodes.filter((node) => node.getClientRects().length > 1).map((node) => node.textContent));
  expect(wrapped).toEqual([]);
  const report = await new AxeBuilder({ page }).include('[data-testid="elevation-bonus"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(report.violations).toEqual([]);
});

test('#734 六张卡暂停时高地说明仍在，短链打开鞑靼文明', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/game-guide');
  await page.getByRole('combobox', { name: '胜利设置', exact: true }).selectOption('other');
  await expect(page.getByTestId('game-guide-unsupported')).toBeVisible();
  await expect(page.locator('.gg-card')).toHaveCount(0);
  await expect(card(page)).toContainText('×1.50');
  await card(page).getByRole('link', { name: '鞑靼文明', exact: true }).click();
  await expect(page).toHaveURL(/#\/civ\/Tatars$/);
  await expect(page.locator('body')).toContainText('在高海拔战斗时，单位造成的伤害 +25%');
});

test('#734 单位 PK 与对局助手入口打开对应页面', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/game-guide');
  await card(page).getByRole('link', { name: '单位 PK', exact: true }).click();
  await expect(page).toHaveURL(/#\/duel\/?$/);
  await page.goto('./#/game-guide');
  await card(page).getByRole('link', { name: '对局助手', exact: true }).click();
  await expect(page).toHaveURL(/#\/matchup\/?$/);
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'] as const) {
    test(`#734 ${width}px ${theme} 无横向滚动且链接够大`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/game-guide');
      const hill = card(page);
      await expect(hill).toBeVisible();
      await expect(hill.locator('[data-elevation="default"]')).toContainText('×1.25');
      await expect(hill.locator('[data-elevation="tatars"]')).toContainText('×1.50');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const small = await hill.evaluate((el) =>
        [...el.querySelectorAll('a')]
          .filter((node) => node.getClientRects().length)
          .map((node) => ({ text: node.textContent, height: node.getBoundingClientRect().height }))
          .filter((node) => node.height < 43.9),
      );
      expect(small).toEqual([]);
      const wrapped = await hill
        .locator('.num')
        .evaluateAll((nodes) => nodes.filter((node) => node.getClientRects().length > 1).map((node) => node.textContent));
      expect(wrapped).toEqual([]);
      if (width === 1280) {
        await hill.locator('h2').scrollIntoViewIfNeeded();
        await hill.screenshot({ path: `/opt/cursor/artifacts/elevation-734-1280-${theme}.png` });
      }
    });
  }
