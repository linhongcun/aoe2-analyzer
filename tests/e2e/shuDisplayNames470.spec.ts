import { expect, test } from '@playwright/test';
import units from '../../src/data/units.json' with { type: 'json' };
import techs from '../../src/data/techs.json' with { type: 'json' };

const guard = units.find((unit) => unit.id === 1959)!;
const magazine = techs.find((tech) => tech.id === 1069)!;

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#470 蜀的中文名称统一 ${width} ${theme}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/civ/Shu');
      // The unique-unit sidebar confirms the asynchronous core data has arrived.
      await expect(page.locator('aside a[href="#/unit/1959"]').first()).toBeVisible();
      const opening = page.getByRole('region', { name: '推荐开局', exact: true });
      await expect(opening).toContainText(magazine.zh);
      await expect(opening).not.toContainText(magazine.en);
      await expect(opening.getByRole('link', { name: magazine.zh, exact: true })).toHaveAttribute('href', `#/tech/${magazine.id}`);
      const unique = page.locator('p').filter({ has: page.getByText('特色兵种：', { exact: true }) });
      await expect(unique).toContainText(guard.zh);
      await expect(unique).not.toContainText('白毦卫');
      await expect(unique).toContainText(guard.en);
      await expect(unique.getByRole('link', { name: guard.zh, exact: true })).toHaveAttribute('href', `#/unit/${guard.id}`);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`shu-overview-${width}-${theme}.png`), fullPage: true });

      await page.getByRole('tab', { name: '科技', exact: true }).click();
      const castle = page.locator('p').filter({ has: page.getByText('城堡时代独特科技：', { exact: true }) });
      await expect(castle).toContainText(guard.zh);
      await expect(castle).not.toContainText('白毦卫');
      await expect(castle).toContainText('Coiled Serpent Array');
      await expect(castle.getByRole('link', { name: guard.zh, exact: true })).toHaveAttribute('href', `#/unit/${guard.id}`);
      await expect(page.getByRole('link', { name: magazine.zh, exact: true })).toHaveAttribute('href', `#/tech/${magazine.id}`);
      await expect(page.locator('main')).toContainText(magazine.en);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
      await page.screenshot({ path: info.outputPath(`shu-tech-${width}-${theme}.png`), fullPage: true });
    });
