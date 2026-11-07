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

const card = (page: Page) => page.getByTestId('housing-pop');
const rows = [
  ['房屋', '70', '5'],
  ['城镇中心', '109', '5'],
  ['大庄园', '1734', '5'],
  ['聚落', '2556', '5'],
  ['城堡', '82', '20'],
  ['营垒', '1251', '20'],
] as const;

test('#743 @1280 一览表与建筑页提供人口一致，并写明开房上限', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/game-guide');
  const housing = card(page);
  await expect(housing).toBeVisible();
  await expect(housing.locator('[data-housing="cap"]')).toHaveText('房间人口上限来自开房设置。本页不写天梯默认人口上限。');
  await expect(housing).toContainText('188329');
  await expect(housing).toContainText('2026-10-28');
  await expect(housing).toContainText('2026-11-05');
  await expect(housing).toContainText('2026-11-07');
  await expect(housing.locator('[data-housing="pending"]')).toContainText('待确认');
  await expect(housing.locator('[data-housing="ugc"]')).toContainText('表内数字不取这里');
  await expect(housing.getByRole('link', { name: 'UGC Resources', exact: true })).toHaveAttribute(
    'href',
    'https://ugc.aoe2.rocks/general/resources/resources/',
  );
  await expect(housing.getByRole('link', { name: '数据说明', exact: true })).toHaveAttribute('href', '#/about-data');
  await expect(housing).not.toContainText('该盖');
  await expect(housing).not.toContainText('世界奇观');
  for (const [name, id, pop] of rows) {
    await expect(housing.locator(`[data-housing-id="${id}"] .num`)).toHaveText(pop);
    await expect(housing.getByRole('link', { name, exact: true })).toHaveAttribute('href', `#/building/${id}#pop`);
  }
  const wrapped = await housing
    .locator('.num')
    .evaluateAll((nodes) => nodes.filter((node) => node.getClientRects().length > 1).map((node) => node.textContent));
  expect(wrapped).toEqual([]);
  const report = await new AxeBuilder({ page }).include('[data-testid="housing-pop"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(report.violations).toEqual([]);
});

test('#743 房屋和城堡的提供人口能打开，再回到一览', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/game-guide');
  await card(page).getByRole('link', { name: '房屋', exact: true }).click();
  await expect(page).toHaveURL(/#\/building\/70#pop$/);
  const house = page.locator('[data-stat="pop"]');
  await expect(house).toContainText('提供人口');
  await expect(house.locator('[data-t="stat-value"]')).toHaveText('5');
  await expect(house).toHaveId('pop');
  await page.getByTestId('building-housing-link').click();
  await expect(page).toHaveURL(/#\/game-guide#housing$/);
  await expect(card(page)).toBeVisible();

  await card(page).getByRole('link', { name: '城堡', exact: true }).click();
  await expect(page).toHaveURL(/#\/building\/82#pop$/);
  const castle = page.locator('[data-stat="pop"]');
  await expect(castle.locator('[data-t="stat-value"]')).toHaveText('20');
  await expect(page.getByTestId('building-housing-link')).toBeVisible();
});

test('#743 六张卡暂停时人口说明仍在；没有 pop 的建筑不回链', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/game-guide');
  await page.getByRole('combobox', { name: '胜利设置', exact: true }).selectOption('other');
  await expect(page.getByTestId('game-guide-unsupported')).toBeVisible();
  await expect(page.locator('.gg-card')).toHaveCount(0);
  await expect(card(page).locator('[data-housing-id="82"] .num')).toHaveText('20');
  await page.goto('./#/building/276');
  await expect(page.locator('#building h1')).toContainText('世界奇观');
  await expect(page.locator('[data-stat="pop"]')).toHaveCount(0);
  await expect(page.getByTestId('building-housing-link')).toHaveCount(0);
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'] as const) {
    test(`#743 ${width}px ${theme} 无横向滚动且链接够大`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/game-guide');
      const housing = card(page);
      await expect(housing).toBeVisible();
      await expect(housing.locator('[data-housing-id="70"] .num')).toHaveText('5');
      await expect(housing.locator('[data-housing-id="82"] .num')).toHaveText('20');
      await expect(housing.locator('[data-housing="cap"]')).toContainText('开房设置');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const small = await housing.evaluate((el) =>
        [...el.querySelectorAll('a')]
          .filter((node) => node.getClientRects().length)
          .map((node) => ({ text: node.textContent, height: node.getBoundingClientRect().height }))
          .filter((node) => node.height < 43.9),
      );
      expect(small).toEqual([]);
      const wrapped = await housing
        .locator('.num')
        .evaluateAll((nodes) => nodes.filter((node) => node.getClientRects().length > 1).map((node) => node.textContent));
      expect(wrapped).toEqual([]);
    });
  }
