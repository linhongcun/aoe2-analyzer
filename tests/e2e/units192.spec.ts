import { expect, test } from '@playwright/test';
import units from '../../src/data/units.json' with { type: 'json' };
import introductions from '../../src/data/catalog-introductions.json' with { type: 'json' };
import { DLCS } from '../../src/domain/dlc';

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
      await page.locator('#uq').fill('近卫军');
      await page.locator('#ua').selectOption('4');
      const card = page.locator('#ugrid .card');
      await expect(card).toHaveCount(1);
      await expect(card).toHaveAttribute('data-unit-id', String(elite.id));
      await expect(card).toHaveAttribute('href', `#/unit/${elite.id}`);
      await expect(card.locator('h3')).toHaveText(elite.zh);
      await expect(card.locator('small')).toHaveText(elite.en);
      for (const stat of ['hp', 'atk', 'rng'] as const) await expect(card.locator(`[data-stat="${stat}"] dd`)).toHaveText(String(elite[stat]));
      await expect(card.locator('.mini')).toContainText('帝王时代');
      await expect(card.locator('.uico')).toHaveAttribute('src', new RegExp(`/img/units/${elite.pic}\\.webp$`));
      const release = introductions.units[String(elite.id) as keyof typeof introductions.units];
      await expect(card.locator('.dlcb')).toHaveAttribute('title', new RegExp(DLCS[release]!.zh));
      await expect(card.locator('.dlcb img')).toHaveAttribute('src', new RegExp(`/img/dlc/${release}\\.webp$`));
      await expect(card.locator('.ebadge')).toHaveCount(0);
      await expect(page.locator('#ucnt')).toHaveText('1 / 163');
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`elite-${theme}-${width}.png`) });
      await card.click();
      await expect(page).toHaveURL(new RegExp(`#/unit/${elite.id}$`));
      await expect(page.locator('#unit .dhead h1')).toContainText(elite.zh);

      await page.goto('./#/units');
      await page.locator('#ua').selectOption('');
      await page.locator('#uq').fill('精锐近卫军');
      await expect(card).toHaveAttribute('data-unit-id', String(elite.id));
      await page.locator('#ua').selectOption('3');
      await expect(card).toHaveCount(0);
      await expect(page.locator('#ucnt')).toHaveText('0 / 163');
      await page.locator('#uq').fill('近卫军');
      await expect(card).toHaveAttribute('data-unit-id', String(base.id));
      await expect(card.locator('[data-stat="hp"] dd')).toHaveText(String(base.hp));
      await page.locator('#ua').selectOption('');
      await expect(card).toHaveAttribute('data-unit-id', String(base.id));
      await expect(card.locator('.ebadge')).toHaveCount(1);
      await expect(page.locator('#ucnt')).toHaveText('1 / 163');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
