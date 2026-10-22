// v0.30.0 #297 验收（页面）：Ctrl+K 查「时间」「市场」「开局」时对应工具页面在前 3 个选项；#291 的键盘选择不被破坏。Kent Beck 2026-10-22。
// 单测见 tests/unit/v0300-297.test.ts。f856c9e 上这些都已满足（绿），守住改排序 / 分组时不回退。
// 360/375/390/1280 四个宽度。
import { expect, test, type Page } from '@playwright/test';

const WIDTHS = [360, 375, 390, 1280] as const;
const CASES = [
  ['时间', '时间换算', '/game-clock'],
  ['市场', '市场买卖', '/market'],
  ['开局', '开局流程', '/builds'],
] as const;
async function palette(page: Page, w: number, q: string) {
  await page.setViewportSize({ width: w, height: 800 });
  await page.goto('./#/civs', { waitUntil: 'networkidle' });
  await page.keyboard.press('Control+k');
  const box = page.getByRole('combobox', { name: '全局搜索' });
  await expect(box).toBeFocused();
  await box.fill(q);
  return box;
}
const options = (page: Page) => page.getByRole('listbox', { name: '搜索结果' }).getByRole('option');

for (const w of WIDTHS)
  test.describe(`#297 @${w}`, () => {
    for (const [q, zh, path] of CASES) {
      test(`「${q}」：前 3 个选项里有「${zh}」页面；方向键选到它、回车进入 #${path}`, async ({ page }) => {
        await palette(page, w, q);
        const texts = (await options(page).allInnerTexts()).slice(0, 3);
        const i = texts.findIndex((t) => t.includes(zh));
        expect(i, texts.join(' | ')).toBeGreaterThanOrEqual(0);
        await expect(options(page).nth(0)).toHaveAttribute('aria-selected', 'true');
        for (let k = 0; k < i; k++) await page.keyboard.press('ArrowDown');
        await expect(options(page).nth(i)).toHaveAttribute('aria-selected', 'true');
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(new RegExp(`#${path}$`));
        await expect(page.getByRole('dialog', { name: '全局搜索' })).toHaveCount(0);
      });
    }
    test('#291 对照：ArrowDown / ArrowUp 移动选中项并同步 aria-activedescendant；Esc 关闭', async ({ page }) => {
      const box = await palette(page, w, '时间');
      expect(await options(page).count()).toBeGreaterThanOrEqual(3);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      const id2 = await options(page).nth(2).getAttribute('id');
      await expect(box).toHaveAttribute('aria-activedescendant', id2!);
      await page.keyboard.press('ArrowUp');
      await expect(options(page).nth(1)).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: '全局搜索' })).toHaveCount(0);
    });
    test('#291 对照：回车打开的是方向键选中的那一项（第 1 项与第 2 项去的地方不同）', async ({ page }) => {
      await palette(page, w, '时间');
      await page.keyboard.press('Enter');
      await expect(page).not.toHaveURL(/#\/civs$/);
      const first = page.url();
      await palette(page, w, '时间');
      await page.keyboard.press('ArrowDown');
      await expect(options(page).nth(1)).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('Enter');
      await expect(page).not.toHaveURL(/#\/civs$/);
      expect(page.url()).not.toBe(first);
    });
  });
