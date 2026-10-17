import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const units = JSON.parse(readFileSync('src/data/units.json', 'utf8')) as { id: number; civs: string[] }[];
const cases = [
  ['Armenians', '需研究科技，未建模'],
  ['Bohemians', '需研究科技，未建模'],
  ['Mayans', '资源多持续 15%，不是采集变快，暂不计入'],
  ['Malians', '存放黄金加成，未建模'],
  ['Poles', '石矿工兼产黄金，未建模'],
  ['Portuguese', '采果兼产木材，未建模'],
  ['Shu', '伐木兼产食物，未建模'],
  ['Sicilians', '农田升级加成，未建模'],
  ['Khmer', '免磨坊存放食物，未建模'],
  ['Aztecs', '携带量加成，未建模'],
] as const;

for (const width of [360, 375, 390]) {
  test(`未计入行 @${width}：加成与数值完整同行，长原因才省略`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const [civ, reason] of cases) {
      const unit = units.find((u) => u.civs.includes(civ))!;
      await page.goto(`#/duel?a=${unit.id}.${civ}.4.f.&b=${unit.id}.${civ}.4.f.&m=t`);
      await page.reload();
      const rows = page.locator('[data-t="rc-unsupported"] > span');
      await expect(rows.first()).toContainText(`（${reason}）`);
      await page.evaluate(() => document.fonts.ready);
      for (const row of await rows.all()) {
        const text = (await row.textContent())!;
        expect(text, civ).toContain(`（${reason}）`);
        await expect(row).toHaveAttribute('title', text);
        const layout = await row.evaluate((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
          range.setEnd(el.firstChild!, el.textContent!.indexOf('（'));
          const key = range.getBoundingClientRect();
          const box = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          // Leave space for the ellipsis so it cannot cover the percentage.
          const reserve = el.scrollWidth > el.clientWidth ? parseFloat(style.fontSize) : 0;
          return { lines, keyFits: key.right <= box.right - reserve, fontSize: parseFloat(style.fontSize) };
        });
        expect(layout.lines, text).toBe(1);
        expect(layout.keyFits, text).toBe(true);
        expect(layout.fontSize).toBeGreaterThanOrEqual(12);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}
