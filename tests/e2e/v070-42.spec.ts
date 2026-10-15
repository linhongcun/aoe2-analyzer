// v0.7.0 #42 第二批（Kent 草稿 #120 issuecomment-6193649914）：匈奴、哥特按本文明计
import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, q: string) {
  await page.goto(`#/builds?${q}`);
  await expect(page.getByRole('list', { name: /时间线/ })).toBeVisible();
}

test.describe('#42 匈奴', () => {
  test('A3/A4/A5 scouts-18：按匈奴计，无提示条；写「马的食物未计入」；没有「也有 3 人的写法」', async ({ page }) => {
    await open(page, 'bo=scouts-18&civ=Huns');
    await expect(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
    await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按匈奴计');
    await expect(page.locator('[data-t="civ-note"]')).toContainText('马的食物未计入');
    await expect(page.getByText('也有 3 人的写法')).toHaveCount(0);
  });
});

test.describe('#42 哥特', () => {
  test('B5 drush-fc：按哥特计，无提示条；res 268 范围标「未核实」', async ({ page }) => {
    await open(page, 'bo=drush-fc&civ=Goths');
    await expect(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
    await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按哥特计');
    await expect(page.locator('[data-t="civ-note"]')).toContainText('未核实');
  });
  test('B4 民兵步骤详情：食物 42.5（1 位小数，不是 43/42），黄金 17', async ({ page }) => {
    await open(page, 'bo=drush-fc&civ=Goths');
    const row = page.locator('ol.tl-steps > li').filter({ hasText: '民兵' }).first();
    await row.locator('button').first().click();
    const cost = page.locator('[data-t="step-cost"]');
    await expect(cost).toContainText('食物 42.5');
    await expect(cost).toContainText('黄金 17');
    await expect(cost).not.toContainText(/食物 4[23](?!\.5)/);
  });
  test('scouts-18：按哥特计', async ({ page }) => {
    await open(page, 'bo=scouts-18&civ=Goths');
    await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按哥特计');
  });
});
