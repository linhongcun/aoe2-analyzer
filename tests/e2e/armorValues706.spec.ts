import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const units = JSON.parse(readFileSync(new URL('../../src/data/units.json', import.meta.url), 'utf8')) as {
  id: number;
  armc: [string, number][];
}[];
const armorBox = (page: Page, scope: Page | Locator = page) =>
  scope.locator('.bonusbox').filter({ has: page.getByRole('heading', { name: '护甲类别（防御）', exact: true }) });

async function values(box: Locator, id: number) {
  await expect(box).toHaveCount(1);
  await expect(box).toBeVisible();
  for (const [name, value] of units.find((unit) => unit.id === id)!.armc) {
    const tag = box.locator('.tag').filter({ hasText: new RegExp(`^${name}\\s`) });
    await expect(tag).toHaveText(`${name} ${value}`);
    const number = tag.locator('.num.nw');
    await expect(number).toHaveText(String(value));
    expect(await number.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe('nowrap');
  }
}

test('#706 PC1280 四个单位资料都显示各类别护甲值', async ({ page }) => {
  for (const id of [38, 8, 280, 331]) {
    await page.goto(`./#/unit/${id}`);
    await values(armorBox(page), id);
    await expect(page.locator('footer')).toContainText('DE 188329');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

for (const width of [360, 375, 390, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`#706 护甲值四宽明暗 ${width}-${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (event) => {
        if (event.type() === 'error') errors.push(event.text());
      });

      for (const context of ['unit', 'sim', 'pk'] as const) {
        const route = context === 'unit' ? 'unit/827' : context === 'sim' ? 'unit/751/Aztecs/2/?tab=sim' : 'duel?a=38.Franks.3..&b=8.Britons.3..&m=1';
        await page.goto(`./#/${route}`);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        if (context === 'pk') {
          await expect(page.locator('#duel-res')).toBeVisible();
          await expect(page.locator('#duel-a .duel-tech')).not.toHaveAttribute('open');
          await page.locator('#duel-a .duel-tech > summary').click();
        }
        const box = armorBox(page, context === 'pk' ? page.locator('#duel-a') : page);
        await values(box, context === 'unit' ? 827 : context === 'sim' ? 751 : 38);
        if (context === 'sim') await expect(box.locator('[aria-label="冲击步兵 0（旧称：鹰战士类）"]')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await box.evaluate((element) => element.setAttribute('data-armor-audit', '706'));
        expect((await new AxeBuilder({ page }).include('[data-armor-audit="706"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
        await box.screenshot({ path: info.outputPath(`armor-${context}-${width}-${theme}.png`) });
      }
      expect(errors).toEqual([]);
    });
  }
}
