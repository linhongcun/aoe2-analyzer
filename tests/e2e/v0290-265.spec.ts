import { expect, test } from '@playwright/test';
import { guardPage } from './v0290-helpers';

/**
 * v0.29.0 验收（#329）A 组 #265 部分：取自 Kent Beck test/v0290-acceptance @ 2b917c0 tests/e2e/v0290-A.spec.ts，断言原样未改。
 * 公开来源：https://support.ageofempires.com/api/v2/help_center/en-us/articles/15552096234644.json 、…/31839163606932.json 的 created_at
 */
guardPage();

// ---------- #265 ----------
const SUPPORT = [
  { product: 'return-of-rome', article: '15552096234644', created: /2023-05-1[01]/, edited: /2026-01-2[01]/ },
  { product: 'chronicles-battle-for-greece', article: '31839163606932', created: /2024-11-0[45]/, edited: /2026-07-1[78]/ },
  { product: 'chronicles-alexander-the-great', article: '31839163606932', created: /2024-11-0[45]/, edited: /2026-07-1[78]/ },
];
test.describe('#265 内容指南：官方文章显示发布日期', () => {
  for (const s of SUPPORT)
    test(`${s.product}：支持站文章 ${s.article} 不再把编辑日期写成发布日期`, async ({ page }) => {
      await page.goto('./#/content-guide');
      const card = page.locator(`[data-product="${s.product}"]`);
      await card.locator('details.cg-sources > summary').click();
      const item = card.locator('details.cg-sources li').filter({ has: page.locator(`a[href*="${s.article}"]`) });
      await expect(item).toHaveCount(1);
      const text = await item.innerText();
      expect(text).not.toMatch(new RegExp('发布日期[：:]\\s*' + s.edited.source));
      const createdAsPublished = new RegExp('发布日期[：:]\\s*' + s.created.source).test(text);
      const renamedToUpdated = new RegExp('更新于[：:]?\\s*' + s.edited.source).test(text);
      expect(createdAsPublished || renamedToUpdated, text).toBe(true);
    });
});
