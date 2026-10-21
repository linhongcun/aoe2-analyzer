// issue 317：罗马经济/费用类加成按工具写明已计入 / 未计入，不再一律「仅文本，未计入数值」。
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const WIDTHS = [360, 375, 390, 1280];
const noWrap = (page: Page, sel: string) =>
  page
    .locator(sel)
    .evaluateAll((els) =>
      els.every((e) => e.getClientRects().length <= 1 && (e as HTMLElement).offsetHeight < 2.2 * parseFloat(getComputedStyle(e).lineHeight || '20')),
    );
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const axe = async (page: Page, sel: string) => (await new AxeBuilder({ page }).include(sel).withRules(['color-contrast']).analyze()).violations;

test.describe('issue 317 罗马加成标签', () => {
  test('#/civ/Romans：第 1 条部分计入、第 3 条已计入，展开后按工具列出', async ({ page }) => {
    await page.goto('./#/civ/Romans');
    const r0 = page.locator('.brow[data-bonus="0"]');
    const r2 = page.locator('.brow[data-bonus="2"]');
    await expect(r0.locator('.brow-h .tag')).toHaveText('部分计入');
    await expect(r2.locator('.brow-h .tag')).toHaveText('已计入');
    await r0.locator('.brow-h').click();
    await expect(r0).not.toContainText('仅文本，未计入数值');
    await expect(r0).toContainText('已计入：真实成本、施工工具');
    await expect(r0).toContainText('未计入：开局模拟、修理');
    await expect(r0.locator('[data-usage="sim"]')).toHaveAttribute('data-on', 'false');
    await expect(r0.locator('[data-usage="sim"]')).toContainText('按通用文明计算');
    await expect(r0.locator('[data-usage="gather"]')).toHaveAttribute('data-on', 'true');
    await expect(r0.locator('[data-usage="construction"]')).toHaveAttribute('data-on', 'true');
    await expect(r0.locator('[data-usage="repair"]')).toHaveAttribute('data-on', 'false');
    await r2.locator('.brow-h').click();
    await expect(r2).not.toContainText('仅文本，未计入数值');
    await expect(r2).toContainText('已计入：训练费用');
    await expect(r2.locator('[data-usage]')).toHaveCount(1);
    await expect(r2.locator('[data-usage="cost"]')).toContainText('单位 PK「等资源」');
    // Steve 设计审查：有工具计入的加成不再显示「.dat 经济/费用效果（文本展示）」
    await expect(r0).not.toContainText('经济/费用效果（文本展示）');
    await expect(r2).not.toContainText('经济/费用效果（文本展示）');
  });

  test('没有任何工具计入的经济加成仍显示「.dat 经济/费用效果（文本展示）」', async ({ page }) => {
    // 中国第 1 条「初始村民 +3…」：中国开局模拟不支持，其他工具也不涉及
    await page.goto('./#/civ/Chinese/bonus/0');
    await expect(page.locator('#bonus')).toContainText('仅文本，未计入数值');
    await expect(page.locator('#bonus')).toContainText('.dat 经济/费用效果（文本展示）');
  });

  test('#/bonuses 与详情页：罗马第 1 条不再显示「仅文本，未计入数值」', async ({ page }) => {
    await page.goto('./#/bonuses');
    await page.locator('#bq').fill('村民收集、建造和修理');
    const li = page.locator('#blist li').filter({ hasText: '罗马' });
    await expect(li).toHaveCount(1);
    await expect(li).not.toContainText('仅文本，未计入数值');
    await expect(li).toContainText('已计入：真实成本、施工工具');
    await expect(li).not.toContainText('经济/费用效果（文本展示）');
    await page.goto('./#/civ/Romans/bonus/0');
    await expect(page.locator('#bonus')).not.toContainText('仅文本，未计入数值');
    await expect(page.locator('#bonus [data-usage]')).toHaveCount(4);
    await expect(page.locator('#bonus')).not.toContainText('经济/费用效果（文本展示）');
  });

  for (const theme of ['light', 'dark'])
    for (const w of WIDTHS)
      test(`${theme} @${w}：标签对比度 AA、.num 不折行、不横向溢出`, async ({ page }) => {
        await page.addInitScript((v) => localStorage.setItem('aoe2-theme', v), theme);
        await page.setViewportSize({ width: w, height: 900 });
        await page.goto('./#/civ/Romans');
        await page.locator('.brow[data-bonus="0"] .brow-h').click();
        await expect(page.locator('.brow[data-bonus="0"] .busage')).toBeVisible();
        expect(await axe(page, '.blrows')).toEqual([]);
        expect(await noWrap(page, '.num:visible')).toBe(true);
        expect(await noOverflow(page)).toBe(true);
        await page.goto('./#/civ/Romans/bonus/0');
        await expect(page.locator('#bonus .busage')).toBeVisible();
        expect(await axe(page, '#bonus')).toEqual([]);
        expect(await noWrap(page, '.num:visible')).toBe(true);
        expect(await noOverflow(page)).toBe(true);
      });
});
