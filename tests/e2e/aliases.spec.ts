import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { BUILD_ALIAS_ROWS } from '../../src/data/aliases';

const zh = (id: string) => JSON.parse(readFileSync(new URL(`../../src/data/build-orders/${id}.json`, import.meta.url), 'utf8')).name.zh as string;

async function open(page: import('@playwright/test').Page, q: string) {
  await page.goto('./');
  await page.locator('#home').waitFor();
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/搜索文明、单位、科技/).fill(q);
  // #343：搜索面板懒加载，加载期间先显示同结构外壳（#325），外壳的 .cmdk-list 里有一条「加载中」<li>。
  // 只等 `.cmdk-list li` 会在真面板挂载前就读结果，4 worker 并行时分包加载变慢就偶发红。
  // 先等真面板（只有它的输入框是 combobox）接过输入的文字，再等真正的结果项（role=option）。
  await expect(page.getByRole('combobox', { name: '全局搜索' })).toHaveValue(q);
  await expect(page.locator('.cmdk-list li[role="option"]').first()).toBeVisible();
  await expect(page.locator('.cmdk-list li').first()).toBeVisible();
  return page.locator('.cmdk-list li');
}

/** 全局搜索里的开局（sub「开局时间线」）按出现顺序 */
const boHits = async (li: import('@playwright/test').Locator) => (await li.filter({ hasText: '开局时间线' }).allInnerTexts()).map((t) => t.trim());

for (const [alias, ids] of BUILD_ALIAS_ROWS)
  test(`搜索别名「${alias}」：${ids.join('、')} 排在其他开局前面`, async ({ page }) => {
    const hits = await boHits(await open(page, alias));
    const names = ids.map(zh);
    expect(hits.length).toBeGreaterThanOrEqual(ids.length);
    for (const h of hits.slice(0, ids.length))
      expect(
        names.some((n) => h.includes(n)),
        h,
      ).toBe(true);
  });

for (const [q, id] of [
  ['Drush', 'drush-fc'],
  ['DRUSH', 'drush-fc'],
  ['Fast Castle', 'fast-castle-boom'],
] as const)
  test(`大小写/空格不敏感：「${q}」能搜到 ${id}`, async ({ page }) => {
    const hits = await boHits(await open(page, q));
    expect(hits.some((h) => h.includes(zh(id)))).toBe(true);
  });

for (const q of ['武士', '骑士', '长剑', '弓箭手'])
  test(`搜「${q}」：第一条不是开局`, async ({ page }) => {
    const li = await open(page, q);
    // #76 单位索引异步加载：先等单位结果出现，再看第一条
    await expect(li.filter({ has: page.locator('.tag', { hasText: /^单位$/ }) }).first()).toBeVisible();
    await expect(li.first()).not.toContainText('开局时间线');
  });
