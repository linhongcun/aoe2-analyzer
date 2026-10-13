// v0.6.0 用例（e2e）— Kent。#97 + #103（PR #114）：PK 折扣行、原价/实际标签、负号 U+2212
import { expect, test, type Page } from '@playwright/test';

const WIDTHS = [360, 375, 390, 1280];
const A = (page: Page) => page.locator('[data-t="pk-cost-a"]');

// ───────────── #97 + #103 PK 折扣浮层 / 折后价标签 ─────────────
for (const w of WIDTHS)
  test.describe(`#97+#103 ${w}px`, () => {
    test.use({ viewport: { width: w, height: 900 } });
    test.beforeEach(async ({ page }) => {
      await page.goto('#/duel?m=r&bud=3000&a=359.Byzantines.4.f.&b=569.Franks.4.f.');
      await expect(A(page)).toBeVisible();
    });
    test('#97-1「已计入」行没有绿色背景（只留绿色勾）', async ({ page }) => {
      const row = A(page).locator('[data-t="pk-applied"]');
      const bg = await row.evaluate((e) => getComputedStyle(e).backgroundColor);
      const surface = await row.evaluate((e) => {
        const p = document.createElement('div');
        p.style.backgroundColor = 'var(--color-surface)';
        e.parentElement!.appendChild(p);
        const c = getComputedStyle(p).backgroundColor;
        p.remove();
        return c;
      });
      expect(['rgba(0, 0, 0, 0)', 'transparent', surface]).toContain(bg);
    });
    test('#97-2 同一行百分比只出现一次，前缀只写「已计入：拜占庭」', async ({ page }) => {
      const t = (await A(page).locator('[data-t="pk-applied"]').textContent())!;
      expect(t.match(/[−-]\s?25%/g) ?? []).toHaveLength(1);
      expect(t).toMatch(/已计入：拜占庭(?![^骆]*[−-]25%)/);
    });
  });

for (const w of WIDTHS)
  test.describe(`#97+#103 定稿 S1 ${w}px`, () => {
    test.use({ viewport: { width: w, height: 900 } });
    test('有折扣的格子显示「原价」「实际」标签；派出数量行用「按原价」「实际」', async ({ page }) => {
      await page.goto('#/duel?m=r&bud=3000&a=359.Byzantines.4.f.&b=569.Franks.4.f.');
      for (const r of ['pk-res-Food', 'pk-res-Wood']) {
        const t = (await A(page).locator(`[data-t="${r}"] td`).nth(1).textContent())!;
        expect(t, r).toMatch(/原价\s*35|原价\s*25/);
        expect(t, r).toContain('实际');
      }
      const c = (await A(page).locator('[data-t="pk-count"] td').nth(1).textContent())!;
      expect(c).toMatch(/按原价/);
      expect(c).toMatch(/实际/);
    });
    test('负号统一 U+2212：已计入行和加成原文里不出现连字符「-数字」', async ({ page }) => {
      await page.goto('#/duel?m=r&bud=3000&a=359.Byzantines.4.f.&b=569.Franks.4.f.');
      const t = (await A(page).locator('[data-t="pk-applied"]').textContent())!;
      expect(t).toContain('−25%');
      expect(t).not.toMatch(/-\s?\d/);
    });
  });

// ───────────── 旧用例按 v0.6.0 新口径（Steve 定稿）：pkDiscount24.spec.ts:66 的百分比、:81 的负号由 #97/#103 引起 ─────────────
test.describe('#97+#103 引起的旧用例口径调整', () => {
  for (const w of [1280, 390]) {
    test(`${w}px pkDiscount24:66 柏柏尔骆驼「已计入」行不单独显示 −15%/−20%，只在加成原文里出现「−15/20%」`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      for (const q of ['a=329.Berbers.3.f.&b=38.Franks.3.f.', 'a=329.Berbers.4.f.&b=38.Franks.3.f.']) {
        await page.goto(`#/duel?m=r&bud=3000&${q}`);
        const row = A(page).locator('[data-t="pk-applied"]');
        await expect(row, q).toBeVisible();
        const t = (await row.textContent())!;
        expect(t, q).not.toMatch(/[−-]\s?(15|20)%/);
        await expect(row.locator('[data-t="pk-orig"]'), q).toContainText('−15/20%');
      }
    });
    test(`${w}px pkDiscount24:81 拜占庭加成原文负号为 U+2212：「−25%」`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto('#/duel?m=r&bud=3000&a=359.Byzantines.4.f.&b=569.Franks.4.f.');
      await expect(A(page).locator('[data-t="pk-orig"]')).toHaveText('骆驼骑兵、掷矛手和长矛兵系的费用 −25%');
    });
  }
});
