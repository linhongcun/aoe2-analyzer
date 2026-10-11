import { expect, test } from '@playwright/test';

/** #3 P0 修好后撤掉临时置灰（#50）：两条速升城堡开局到处显示真实城堡时间（通用、距离 4） */
const CASES = [
  { id: 'fast-castle-boom', click: '12:53', reach: '15:33' },
  { id: 'drush-fc', click: '14:31', reach: '17:11' },
];

for (const c of CASES) {
  test(`${c.id}：摘要、步骤、条块、深链都显示真实城堡时间`, async ({ page }) => {
    await page.goto(`#/builds?bo=${c.id}`);
    await expect(page.locator('[data-t="sum-arrive"]')).toContainText(`到达城堡`);
    await expect(page.locator('[data-t="sum-arrive"]')).toContainText(`约 ${c.reach}`);
    await expect(page.locator('body')).not.toContainText('计算修正中');
    await expect(page.locator('[data-pending]')).toHaveCount(0);
    await expect(page.locator('[data-age="castle"]')).toHaveAttribute('aria-label', `到达城堡 约 ${c.reach}`);
    // 点城堡那一行：行时间 = 实际点击时间，详情写等前置建筑
    const row = page.locator('.tl-steps > li').filter({ hasText: '点城堡' }).last();
    await expect(row).toContainText(`约 ${c.click}`);
    await expect(row).toContainText('等前置建筑');
    await row.locator('.tl-step').click();
    await expect(row.locator('[data-t="prereq-detail"]')).toContainText('升城堡需先建完 2 座封建建筑');
    // 深链：重新打开同一 URL 仍选中这一行并显示同样的时间
    const url = page.url();
    await page.goto('about:blank');
    await page.goto(url);
    const sel = page.locator('.tl-steps > li[aria-selected="true"]');
    await expect(sel).toContainText(`约 ${c.click}`);
    await expect(sel.locator('[data-t="prereq-detail"]')).toBeVisible();
  });
}

test('开局列表页不再有「计算修正中」', async ({ page }) => {
  await page.goto('#/builds');
  await expect(page.locator('[data-t="build-order"]').first()).toBeAttached();
  await expect(page.locator('body')).not.toContainText('计算修正中');
  await expect(page.locator('[data-pending]')).toHaveCount(0);
});
