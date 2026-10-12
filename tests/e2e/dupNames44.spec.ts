import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { UNIT_ALIAS_ROWS } from '../../src/data/aliases';

const UNITS = JSON.parse(readFileSync(new URL('../../src/data/units.json', import.meta.url), 'utf8')) as { id: number; zh: string }[];

const rel = (page: Page) => page.locator('#unit [data-t="rel-first"]');

for (const [id, other, note, otherNote] of [
  [1750, 1948, '达罗毗荼', '中国等 5 个文明'],
  [1948, 1750, '中国等 5 个文明', '达罗毗荼'],
  [1759, 1962, '孟加拉', '蜀'],
  [1962, 1759, '蜀', '孟加拉'],
] as const)
  test(`#44 同名单位 ${id}：页头文明小字 + 「同名单位」互链，无混淆提示`, async ({ page }) => {
    await page.goto(`./#unit/${id}`);
    await expect(page.locator('#unit h2 .civnote')).toHaveText(note);
    const link = rel(page).locator('[data-t="dup-link"]');
    await expect(link).toHaveCount(1);
    await expect(link).toContainText('同名单位：');
    await expect(link.locator('.civnote')).toHaveText(otherNote);
    await expect(link.locator('svg.lucide-copy')).toHaveCount(1);
    await expect(rel(page)).not.toContainText('混淆');
    const box = await link.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`unit/${other}`));
  });

const REASON = '通用单位 Hussar 的官方名就叫「翼骑兵」，和波兰翼骑兵只差两个字';
for (const [id, other, name] of [
  [441, 1707, '波兰翼骑兵'],
  [1707, 441, '翼骑兵'],
] as const)
  test(`#44 易混淆 ${id}：「别和 ${name} 混淆」+ 原因行`, async ({ page }) => {
    await page.goto(`./#unit/${id}`);
    const link = rel(page).locator('[data-t="conf-link"]');
    await expect(link).toHaveCount(1);
    await expect(link).toContainText(`别和 ${name} 混淆`);
    await expect(link.locator('.rel-reason')).toHaveText(REASON);
    await expect(link.locator('svg.lucide-info')).toHaveCount(1);
    await expect(rel(page).locator('[data-t="dup-link"]')).toHaveCount(0);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`unit/${other}`));
  });

for (const id of [239, 1132, 569])
  test(`#44 ${id} 没有「相关」第一项（无重名、不在对照表）`, async ({ page }) => {
    await page.goto(`./#unit/${id}`);
    await expect(page.locator('#unit .dtabs')).toBeVisible();
    await expect(rel(page)).toHaveCount(0);
    await expect(page.locator('#unit h2 .civnote')).toHaveCount(0);
  });

test('#44 390 宽：原因行可折行，页面不横向滚动', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#unit/441');
  await expect(rel(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('#44 单位列表：两个楼船、两个战车都在，且带文明小字', async ({ page }) => {
  await page.goto('./#units');
  await page.locator('#uq').fill('楼船');
  await expect(page.locator('#ugrid .card')).toHaveCount(2);
  await expect(page.locator('#ugrid .card .civnote')).toHaveText(['达罗毗荼', '中国等 5 个文明']);
  await page.locator('#uq').fill('翼骑兵');
  await expect(page.locator('#ugrid .card .civnote')).toHaveCount(0);
});

async function palette(page: Page, q: string) {
  await page.goto('./');
  await page.locator('#home').waitFor();
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/搜索文明、单位、科技/).fill(q);
  await expect(page.locator('.cmdk-list .cmdk-t').first()).toBeVisible();
  return page.locator('.cmdk-list li');
}

test('#44 搜索「战车」：两个结果，带文明小字', async ({ page }) => {
  const li = await palette(page, '战车');
  await expect(li.filter({ hasText: '孟加拉' })).toHaveCount(1);
  await expect(li.filter({ hasText: '蜀' }).locator('.civnote')).toHaveCount(1);
});

for (const [id, alias] of UNIT_ALIAS_ROWS)
  test(`#44 搜索单位别名「${alias}」能搜到官方名`, async ({ page }) => {
    const zh = UNITS.find((u) => u.id === id)!.zh;
    const li = await palette(page, alias);
    // 单位索引异步加载：先等目标单位出现在结果里，再读取列表
    await expect.poll(async () => li.locator('.cmdk-t b').allInnerTexts()).toContain(zh);
  });

test('#44 搜「战象」列出多条，不直接跳转', async ({ page }) => {
  const li = await palette(page, '战象');
  // 单位索引异步加载：先等单位结果出现，再数条数
  await expect(li.filter({ hasText: '装甲战象' })).toHaveCount(1);
  expect(await li.count()).toBeGreaterThan(1);
  await expect(page).not.toHaveURL(/unit\//);
});
