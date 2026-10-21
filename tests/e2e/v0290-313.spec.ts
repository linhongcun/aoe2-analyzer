import { expect, test, type Page } from '@playwright/test';
import { guardPage } from './v0290-helpers';

/**
 * v0.29.0 验收（#329）B 组 #313 部分：取自 Kent Beck test/v0290-acceptance @ cd1b938 tests/e2e/v0290-B.spec.ts，断言原样未改。
 */
guardPage();

// ---------- #313 ----------
const field = (page: Page, name: string) => page.getByRole('textbox', { name, exact: true });
test.describe('#313 手填复盘：连续清空两次后撤销', () => {
  for (const width of [360, 1280])
    test(`写「旧草稿」→ 清空 → 再清空（或无法再清空）→ 撤销，恢复「旧草稿」和本机存档 @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./#/match-review');
      await field(page, '复盘标题').fill('旧草稿');
      const clear = page.getByRole('button', { name: '清空本页内容', exact: true });
      const dialog = page.getByRole('dialog', { name: '确认清空本页内容？', exact: true });
      const confirm = dialog.getByRole('button', { name: '确认清空', exact: true });
      const undo = page.getByRole('button', { name: '撤销', exact: true });
      await clear.click();
      await confirm.click();
      await expect(field(page, '复盘标题')).toHaveValue('');
      await expect(undo).toBeVisible();
      if (await clear.isEnabled()) {
        await clear.click();
        if (await dialog.isVisible()) await confirm.click();
      } else {
        // 禁用方案：要有可见说明，读屏能听到原因；按钮仍不小于 44px
        await expect(clear).toHaveAccessibleDescription(/.+/);
        const box = await clear.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      await undo.click();
      await expect(field(page, '复盘标题')).toHaveValue('旧草稿');
      expect(await page.evaluate(() => localStorage.getItem('aoe2-match-review-v1') ?? '')).toContain('旧草稿');
    });
});

