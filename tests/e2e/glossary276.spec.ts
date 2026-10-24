import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { GlossaryTerm } from '../../src/domain/glossary';
const glossary: GlossaryTerm[] = JSON.parse(readFileSync('src/content/glossary.json', 'utf8'));
const pinyin: Record<string, { py: string }> = JSON.parse(readFileSync('src/data/search-py.json', 'utf8'));

const added = glossary.filter((term) => term.checkedAt === '2026-10-24');
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') messages.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('#276 全部新增条目能从 Ctrl+K 的英文、中文和拼音结果直达', async ({ page }) => {
  expect(added.length).toBeGreaterThanOrEqual(10);
  await page.goto('./#/');
  await expect(page.locator('#home h1')).toBeVisible();
  for (const term of added) {
    // 中文名由拼音生成脚本索引，查询与页面共用的生成结果。
    const py = pinyin[term.zh]!.py;
    for (const query of [term.en, term.zh.split('：')[1]!, py]) {
      await page.keyboard.press('Control+k');
      const dialog = page.getByRole('dialog', { name: '全局搜索', exact: true });
      const input = dialog.getByRole('combobox', { name: '全局搜索', exact: true });
      await input.fill(query);
      const result = dialog.getByRole('option').filter({ has: page.locator('b', { hasText: term.zh }) });
      await expect(result).toBeVisible();
      await result.click();
      await expect(page).toHaveURL(new RegExp(`#/glossary/${term.id}$`));
      await expect(page.getByRole('heading', { name: term.zh, exact: true })).toBeVisible();
    }
  }
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#276 @${width} ${theme} 分类、搜索、详情来源和对比度`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/glossary');
      await expect(page.locator('.gl-list article')).toHaveCount(21);
      for (const category of ['开局', '单位', '团战', '经济', '常见措辞']) {
        await expect(page.getByRole('region', { name: category, exact: true })).toBeVisible();
      }
      const wording = page.getByRole('region', { name: '常见措辞', exact: true });
      await expect(wording.locator('article')).toHaveCount(2);
      await expect(wording).toContainText('速率与耗时');
      await expect(wording).toContainText('科技效果更强');
      await expect(page.getByRole('status')).toContainText('21 / 21');
      await page.screenshot({ path: info.outputPath(`glossary-${width}-${theme}.png`), fullPage: true });
      const violations = (await new AxeBuilder({ page }).include('.glossary').withTags(['wcag2a', 'wcag2aa']).analyze()).violations;
      expect(violations).toEqual([]);
      await page.getByRole('searchbox', { name: '搜索术语' }).fill('tuilu');
      await expect(page.locator('.gl-group')).toHaveCount(1);
      await expect(page.getByRole('region', { name: '经济', exact: true })).toBeVisible();
      await page.getByRole('link', { name: /deer push：推鹿/ }).click();
      await expect(page.getByRole('heading', { name: 'deer push：推鹿' })).toBeVisible();
      await page.getByText('来源与核对说明', { exact: true }).click();
      await expect(page.getByRole('link', { name: /Steam：A Guide to AoE 2/ })).toHaveAttribute(
        'href',
        'https://steamcommunity.com/sharedfiles/filedetails/?id=2688069784',
      );
      await expect(page.locator('.gl-sources')).toContainText('2026-10-24 已打开核对');
      expect((await page.getByRole('button', { name: '复制术语链接' }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    });
