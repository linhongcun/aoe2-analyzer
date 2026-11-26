import { expect, test, type Locator, type Page } from '@playwright/test';

const EXPECTED_DESC = '斥候骑兵系、草原枪兵和骑射手近战护甲 +1/远程护甲 +1';

async function assertNumNoWrap(container: Locator) {
  const nums = container.locator('.num.nw');
  const count = await nums.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    const tops = await nums.nth(i).evaluate((el) => Array.from(el.getClientRects()).map((rect) => Math.round(rect.top)));
    expect(tops.length).toBeGreaterThan(0);
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(2);
  }
}

async function assertNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test.describe('#1440 鞑靼城堡科技「丝护甲」对比表与详情页一致', () => {
  for (const width of [1280, 390]) {
    test(`@${width} 对比表 A/B 两侧、文明详情与科技 687 均展示含骑射手的丝护甲说明`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });

      await page.setViewportSize({ width, height: 900 });

      for (const { url, cellClass } of [
        { url: './#/compare?a=Tatars&b=Mongols', cellClass: 'td.compare-side-a' },
        { url: './#/compare?a=Mongols&b=Tatars', cellClass: 'td.compare-side-b' },
      ]) {
        await page.goto(url);
        const castleRow = page.locator('#compare-facts tr').filter({
          has: page.getByRole('cell', { name: '城堡科技', exact: true }),
        });
        const tatarsCell = castleRow.locator(cellClass);
        await expect(tatarsCell.locator('.compare-fact-main')).toHaveText('丝护甲');
        await expect(tatarsCell.locator('.compare-fact-en')).toHaveText('Silk Armor');
        await expect(tatarsCell.locator('.compare-fact-desc')).toHaveText(EXPECTED_DESC);
        await assertNumNoWrap(tatarsCell);
        await assertNoOverflow(page);
      }

      await page.goto('./#/civ/Tatars');
      const uniqueTechs = page.getByTestId('civ-unique-techs');
      await expect(uniqueTechs.locator('a[href="#/tech/687"]')).toContainText('丝护甲');
      await expect(uniqueTechs).toContainText(EXPECTED_DESC);
      await assertNoOverflow(page);

      await page.goto('./#/tech/687');
      await expect(page.locator('main h1')).toContainText('丝护甲');
      await expect(page.locator('main')).toContainText('Silk Armor');
      await expect(page.locator('main')).toContainText(EXPECTED_DESC);
      await assertNoOverflow(page);

      expect(errors).toEqual([]);
    });
  }
});
