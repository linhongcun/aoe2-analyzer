import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { BUILD_ALIAS_ROWS } from '../../src/data/aliases';

const zh = (id: string) => JSON.parse(readFileSync(new URL(`../../src/data/build-orders/${id}.json`, import.meta.url), 'utf8')).name.zh as string;

async function open(page: import('@playwright/test').Page, q: string) {
  await page.goto('./');
  await page.locator('#home').waitFor();
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/搜索文明、单位、科技/).fill(q);
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
  ['19P斥候', 'scouts-18'],
  ['Fast Castle', 'fast-castle-boom'],
] as const)
  test(`大小写/空格不敏感：「${q}」能搜到 ${id}`, async ({ page }) => {
    const hits = await boHits(await open(page, q));
    expect(hits.some((h) => h.includes(zh(id)))).toBe(true);
  });

for (const q of ['武士', '骑士', '长剑', '弓箭手'])
  test(`搜「${q}」：第一条不是开局`, async ({ page }) => {
    const li = await open(page, q);
    await expect(li.first()).not.toContainText('开局时间线');
  });
