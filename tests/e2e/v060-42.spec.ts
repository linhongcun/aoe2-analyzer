// v0.6.0 用例（e2e）— Kent。#42（PR #112）
import { expect, test } from '@playwright/test';

// ───────────── #42 白名单文明：页面标识「加成暂未计入」或置灰 ─────────────
// 现有标识是 civ-warn「链接里的X加成尚未计入，已按通用计算。」+ 摘要「按通用计」。
// 文案是「尚未计入」不是「暂未计入」；两者都接受，是否要统一成「暂未计入」需 Steve 确认。
test.describe('#42 白名单文明在开局页有「未计入」标识', () => {
  for (const civ of [
    'Gurjaras',
    'Mapuche',
    'Poles',
    'Romans',
  ])
    test(civ, async ({ page }) => {
      await page.goto(`#/builds?bo=fast-castle-boom&civ=${civ}`);
      await expect(page.getByRole('list', { name: /时间线/ })).toBeVisible();
      await expect(page.locator('[data-t="civ-warn"]')).toHaveText(/(暂未|尚未)计入/);
      await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按通用计');
    });
});
