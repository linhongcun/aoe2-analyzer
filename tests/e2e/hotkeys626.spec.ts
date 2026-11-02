import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const SOURCE = 'https://www.reddit.com/r/aoe2/comments/1xh3y3n/psa_follow_command_now_auto_pushes_deer/';
const tip = (page: Page) => page.getByRole('complementary', { name: '推鹿与跟随提示', exact: true });

test('#626 首屏可扫读社区实测短提示，来源和搜索之前的位置明确', async ({ page }) => {
  await page.goto('./#/hotkeys');
  const note = tip(page);
  await expect(note).toBeVisible();
  await expect(note.getByRole('heading', { level: 2, name: '推鹿时试试跟随', exact: true })).toBeVisible();
  await expect(note).toContainText('188329 社区实测');
  await expect(note).toContainText('先让斥候、鹿与目标位置对齐');
  await expect(note).toContainText('跟随 / Follow');
  await expect(note).toContainText('可持续推鹿，不必反复下达');
  await expect(note).toContainText('遇障碍仍需调整');
  await expect(note).toContainText('游戏选项的快捷键设置');
  await expect(note).toContainText('绑定顺手的按键');
  await expect(note).not.toContainText(/默认键|自动识别|官方新增|保证成功/);
  const source = note.getByRole('link', { name: '社区实测：Follow 推鹿', exact: true });
  await expect(source).toHaveAttribute('href', SOURCE);
  await expect(source).toHaveAttribute('target', '_blank');
  await expect(source).toHaveAttribute('rel', 'noopener noreferrer');
  const noteBox = await note.boundingBox();
  const sourceBox = await source.boundingBox();
  const searchBox = await page.getByRole('searchbox', { name: '搜索操作（中文、英文或常见用语）' }).boundingBox();
  expect(noteBox).not.toBeNull();
  expect(sourceBox).not.toBeNull();
  expect(searchBox).not.toBeNull();
  expect(noteBox!.y).toBeGreaterThan(0);
  expect(noteBox!.y + noteBox!.height).toBeLessThanOrEqual(900);
  expect(noteBox!.y + noteBox!.height).toBeLessThan(searchBox!.y);
  expect(sourceBox!.height).toBeGreaterThanOrEqual(44);
  expect(sourceBox!.width).toBeGreaterThanOrEqual(44);
  for (let step = 0; step < 30 && !(await source.evaluate((el) => el === document.activeElement)); step++) await page.keyboard.press('Tab');
  await expect(source).toBeFocused();
});

test('#626 搜索仍显示提示，个人表保存和20项打印保持可用', async ({ page }) => {
  await page.goto('./#/hotkeys');
  await expect(tip(page)).toBeVisible();
  await expect(page.locator('.hk-card')).toHaveCount(20);
  const search = page.getByRole('searchbox', { name: '搜索操作（中文、英文或常见用语）' });
  await search.fill('Train Villager');
  await expect(page.locator('.hk-card')).toHaveCount(1);
  await expect(tip(page)).toBeVisible();
  await page.getByRole('textbox', { name: '我的按键：训练村民', exact: true }).fill('Mouse 4');
  await expect(page.getByText('单人表已保存到此浏览器。', { exact: true })).toBeVisible();
  await search.fill('not-in-catalogue');
  await expect(page.getByRole('heading', { name: '没有匹配的操作', exact: true })).toBeVisible();
  await expect(tip(page)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: '我的按键：训练村民', exact: true })).toHaveValue('Mouse 4');
  await expect(page.locator('.hk-card')).toHaveCount(20);
  await page.emulateMedia({ media: 'print' });
  await expect(tip(page)).toBeHidden();
  await expect(page.locator('[data-print-action]')).toHaveCount(20);
  await expect(page.locator('[data-print-action="train-villager"]')).toContainText('Mouse 4');
});

for (const width of [360, 375, 390, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`#626 ${theme} @${width} 可读、无溢出与页面错误`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/hotkeys');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(tip(page)).toBeVisible();
      const source = tip(page).getByRole('link', { name: '社区实测：Follow 推鹿', exact: true });
      await expect(source).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const patch = tip(page).getByText('188329', { exact: true });
      await expect(patch).toHaveClass(/\bnw\b/);
      expect(await patch.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe('nowrap');
      expect(await tip(page).evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
      expect(await source.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
      if (width === 1280) {
        const result = await new AxeBuilder({ page }).include('[data-testid="hotkeys-page"]').withTags(['wcag2a', 'wcag2aa']).analyze();
        expect(result.violations).toEqual([]);
      }
      const path = testInfo.outputPath(`hotkeys626-${theme}-${width}.png`);
      await page.screenshot({ path, fullPage: false });
      await testInfo.attach(`hotkeys626-${theme}-${width}`, { path, contentType: 'image/png' });
      expect(errors).toEqual([]);
    });
  }
}
