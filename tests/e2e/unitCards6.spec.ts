import { expect, test } from '@playwright/test';
import units from '../../src/data/units.json' with { type: 'json' };

const unit = units.find((entry) => entry.id === 281)!;

for (const width of [360, 375, 390, 1280]) {
  test(`${width}px：单位列表卡片展示数据中的生命、攻击和射程`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./#/units');
    await page.locator('#uq').fill(unit.zh);
    const card = page.locator(`[data-unit-id="${unit.id}"]`);
    await expect(card).toBeVisible();
    await expect(card.locator('[data-stat="hp"] dd')).toHaveText(String(unit.hp));
    await expect(card.locator('[data-stat="atk"] dd')).toHaveText(String(unit.atk));
    await expect(card.locator('[data-stat="rng"] dd')).toHaveText(String(unit.rng));
    await expect(card).toContainText(unit.bz);
    await expect(card.locator('.mini')).not.toBeEmpty();
    expect(await card.locator('a').count()).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(
      await card.locator('.unit-card-stats dd').evaluateAll((values) =>
        values.every((value) => {
          const style = getComputedStyle(value);
          return style.whiteSpace === 'nowrap' && Number.parseFloat(style.fontSize) >= 12 && value.scrollWidth <= value.clientWidth;
        }),
      ),
    ).toBe(true);
  });
}
