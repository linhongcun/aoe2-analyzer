import { expect, test, type Page } from '@playwright/test';

/**
 * #42 匈奴，v0.4.0 主状态（huns-greyed-* 稿）：simSupport('Huns') 为 false，整页按通用计。
 * 匈奴专属界面（造房片段删除线 +「匈奴不需要」、自动造房禁用、「按匈奴计」、对比行，huns-flag-* 稿）只在支持后出现；
 * 这里断言它们一个都不出现。flag 打开后的文案/拆段由 tests/unit/civ42huns.test.ts 强制支持测。
 */
async function open(page: Page, q: string) {
  await page.goto(`#/builds?${q}`);
  await expect(page.getByRole('list', { name: /时间线/ })).toBeVisible();
}
const rows = (page: Page) => page.locator('ol.tl-steps > li');

test.describe('#42 匈奴（置灰主状态）', () => {
  test('civ=Huns：提示条 + 按通用计，时间和步骤与通用完全一致，造房步骤照常显示', async ({ page }) => {
    await open(page, 'bo=scouts-18');
    const gStart = await rows(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-row-at')));
    const gText = await rows(page).locator('.n').allInnerTexts();
    const gArrive = await page.locator('[data-t="sum-arrive"] [data-time]').innerText();

    await open(page, 'bo=scouts-18&civ=Huns');
    await expect(page.locator('[data-t="civ-warn"]')).toHaveText('链接里的匈奴加成尚未计入，已按通用计算。');
    await expect(page.locator('[data-t="sum-civ"]')).toHaveText('按通用计');
    expect(await rows(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-row-at')))).toEqual(gStart);
    expect(await rows(page).locator('.n').allInnerTexts()).toEqual(gText);
    await expect(page.locator('[data-t="sum-arrive"] [data-time]')).toHaveText(gArrive);
    // 第 1 步通用写法（含盖房），第 5 步含「先盖房子」
    await expect(rows(page).nth(0)).toContainText('2 人合盖一座房子、1 人盖另一座');
    await expect(rows(page).nth(4)).toContainText('先盖房子');
  });

  test('civ=Huns：不出现任何匈奴专属界面；自动造房开关可用', async ({ page }) => {
    await open(page, 'bo=scouts-18&civ=Huns');
    await expect(page.locator('[data-t="house-skip"]')).toHaveCount(0);
    await expect(page.locator('[data-t="no-need"]')).toHaveCount(0);
    await expect(page.locator('[data-t="sum-compare"]')).toHaveCount(0);
    await expect(page.getByText(/匈奴不需要|按匈奴计|比通用/)).toHaveCount(0);
    await expect(page.locator('.tl-steps s')).toHaveCount(0);
    const sw = page.locator('[data-t="auto-house"]').first();
    await expect(sw).toBeEnabled();
    await expect(sw).not.toHaveAttribute('aria-disabled', 'true');
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await sw.click();
    await expect(page).toHaveURL(/[?&]house=0/);
  });

  test('civ=Huns&step=5：步骤数与编号不变，深链选中第 5 步', async ({ page }) => {
    await open(page, 'bo=scouts-18&civ=Huns&step=5');
    await expect(rows(page)).toHaveCount(13);
    expect(await rows(page).locator('.tl-num.i').allInnerTexts()).toEqual(Array.from({ length: 13 }, (_, i) => String(i + 1)));
    await expect(rows(page).nth(4)).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/[?&]step=5/);
  });

  test('文明选择器里匈奴置灰不可选', async ({ page }) => {
    await open(page, 'bo=scouts-18');
    await page.locator('#tlciv').click();
    const row = page.getByRole('dialog', { name: '文明' }).locator('[data-civ="Huns"]');
    await expect(row).toHaveAttribute('aria-disabled', 'true');
    await expect(row).toContainText('文明加成尚未计入');
  });

  test('手机 390：设置抽屉里的自动造房开关可用，无「匈奴不需要」', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, 'bo=scouts-18&civ=Huns');
    await expect(page.getByText(/匈奴不需要|按匈奴计|比通用/)).toHaveCount(0);
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(390);
  });
});
