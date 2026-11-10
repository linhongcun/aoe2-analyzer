import { expect, test } from '@playwright/test';
import units from '../../src/data/units.json' with { type: 'json' };

const elite = units.find((unit) => unit.id === 761)!;
const base = units.find((unit) => unit.id === 759)!;

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#192 ${theme} @${width}：筛选卡片与实际命中形态一致`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.goto('./#/units');
      await expect(page.locator('#ucnt')).toHaveText('163 / 163');
      const ages = page.locator('#units').getByRole('group', { name: '时代快捷筛选', exact: true });
      if (width <= 600) await page.locator('#units .catalog-filter-toggle').click();
      await page.locator('#uq').fill('近卫军');
      await ages.locator('button[data-v="4"]').click();
      const card = page.locator('#ugrid .unit-row');
      await expect(card).toHaveCount(1);
      await expect(card).toHaveAttribute('data-unit-id', String(elite.id));
      await expect(card).toHaveAttribute('href', `#/unit/${elite.id}`);
      await expect(card.locator('.unit-zh')).toHaveText(elite.zh);
      await expect(card.locator('.unit-en')).toHaveText(elite.en);
      for (const stat of ['hp', 'atk', 'rng'] as const) await expect(card.locator(`[data-stat="${stat}"] dd`)).toHaveText(String(elite[stat]));
      await expect(card.locator('.mini')).toContainText('帝王时代');
      await expect(card.locator('.uico')).toHaveAttribute('src', new RegExp(`/img/units/${elite.pic}\\.webp$`));
      await expect(card.locator('.elite-mark')).toHaveCount(0);
      await expect(page.locator('#ucnt')).toHaveText('1 / 163');
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`elite-${theme}-${width}.png`) });
      await card.click();
      await expect(page).toHaveURL(new RegExp(`#/unit/${elite.id}$`));
      await expect(page.locator('#unit .dhead h1')).toContainText(elite.zh);

      await page.goto('./#/units');
      if (width <= 600) await page.locator('#units .catalog-filter-toggle').click();
      await ages.locator('button[data-v=""]').click();
      await page.locator('#uq').fill('精锐近卫军');
      await expect(card).toHaveAttribute('data-unit-id', String(elite.id));
      await ages.locator('button[data-v="3"]').click();
      await expect(card).toHaveCount(0);
      await expect(page.locator('#ucnt')).toHaveText('0 / 163');
      await page.locator('#uq').fill('近卫军');
      await expect(card).toHaveAttribute('data-unit-id', String(base.id));
      await expect(card.locator('[data-stat="hp"] dd')).toHaveText(String(base.hp));
      await ages.locator('button[data-v=""]').click();
      await expect(card).toHaveAttribute('data-unit-id', String(base.id));
      await expect(card.locator('.elite-mark')).toHaveText('含精锐');
      await expect(page.locator('#ucnt')).toHaveText('1 / 163');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
