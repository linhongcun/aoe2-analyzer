// #921 #923 建筑/单位详情文案。只核骡车 1808 与民兵 74，不代替数值正确性。
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const shots = '/opt/cursor/artifacts/detail-copy-921';

async function open(page: Page, hash: string) {
  await page.goto('./#' + hash);
}

async function setTheme(page: Page, value: 'light' | 'dark') {
  await page.evaluate((next) => localStorage.setItem('aoe2-theme', next), value);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', value);
}

test('骡车 1280/390：文案层级、整数生命、未选短状态和修复来源', async ({ page }) => {
  mkdirSync(shots, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, '/building/1808');
  await setTheme(page, 'light');
  await expect(page.locator('#building h1')).toContainText('骡车');
  await expect(page.locator('#building')).toHaveAttribute('data-view', 'overview');
  const light = await page.locator('#building').innerText();
  expect(light).not.toContain('目录造价。');
  expect(light.match(/未计文明加成/g)).toEqual(['未计文明加成']);
  await expect(page.locator('[data-stat="hp"] [data-t="stat-value"]')).toHaveText('300');
  await expect(page.locator('[data-t="panel-time"]')).toContainText('25秒');
  await expect(page.locator('[data-t="panel-time"]')).toContainText('不是多人施工里的村民工时');
  await expect(page.locator('[data-t="panel-time"]')).not.toContainText('预填目录时代');
  await expect(page.locator('[data-t="construction-note"]')).toHaveCount(0);
  await expect(page.locator('[data-t="construction-needs-civ"]')).toHaveText('先选择文明。');
  await expect(page.locator('[data-t="workspace-status"]')).toHaveText('查看科技效果。未指定文明时需先选择文明。');
  const repair = page.getByRole('region', { name: '修复费用', exact: true });
  const main = repair.locator('[data-t="repair-cost-main"]');
  const source = repair.locator('[data-t="repair-cost-source"]');
  await expect(main).toContainText('待确认');
  await expect(main).toContainText('×0.75');
  await expect(main).not.toContainText('Unit Repair Cost');
  await expect(main).not.toContainText('eco.json');
  await expect(source).toContainText('270');
  await expect(source).toContainText('271');
  await expect(source).toContainText('Unit Repair Cost');
  await expect(source).toContainText('2026-11-07');
  await expect(source).toContainText('eco.json');
  await expect(source).toContainText('effects.json');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${shots}/1808-1280-light.png` });
  await repair.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/1808-repair-1280-light.png` });

  await setTheme(page, 'dark');
  await expect(page.locator('[data-stat="hp"] [data-t="stat-value"]')).toHaveText('300');
  await expect(page.locator('[data-t="workspace-status"]')).toContainText('未指定文明时需先选择文明');
  await page.screenshot({ path: `${shots}/1808-1280-dark.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  await setTheme(page, 'light');
  await expect(page.locator('[data-stat="hp"] [data-t="stat-value"]')).toHaveText('300');
  await expect(page.locator('#building')).not.toContainText('目录造价。');
  await expect(page.locator('[data-t="construction-note"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${shots}/1808-390-light.png` });
  await page.locator('[data-t="construction-needs-civ"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/1808-390-status-light.png` });
  await repair.scrollIntoViewIfNeeded();
  await expect(main).toContainText('待确认');
  await expect(main).not.toContainText('eco.json');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${shots}/1808-repair-390-light.png` });
});

test('骡车切换亚美尼亚不打开工具，预填说明紧邻施工入口', async ({ page }) => {
  mkdirSync(shots, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, '/building/1808');
  await expect(page.locator('#building h1')).toContainText('骡车');
  await page.locator('#building-civ').click();
  await page.locator('.cp-panel .cp-q').fill('Armenians');
  await page.locator('.cp-panel [data-civ="Armenians"]').click();
  await expect(page).toHaveURL(/civ=Armenians/);
  await expect(page).not.toHaveURL(/tab=/);
  await expect(page.locator('#building')).toHaveAttribute('data-view', 'overview');
  await expect(page.locator('#building-sim')).toHaveCount(0);
  await expect(page.locator('#building-garrison')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '打开科技模拟器', exact: true })).toBeVisible();
  await expect(page.locator('[data-t="workspace-status"]')).toHaveText('查看科技效果。');
  const block = page.locator('[data-t="construction-entry-block"]');
  await expect(block.locator('[data-t="construction-entry"]')).toBeVisible();
  await expect(block.locator('[data-t="construction-note"]')).toHaveText('预填目录时代，非解锁条件。');
  await expect(page.locator('[data-t="panel-time"]')).not.toContainText('预填目录时代');
  await page.screenshot({ path: `${shots}/1808-armenians-1280-light.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(block.locator('[data-t="construction-note"]')).toHaveText('预填目录时代，非解锁条件。');
  await expect(page).not.toHaveURL(/tab=/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await block.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/1808-armenians-390-light.png` });
});

test('民兵 1280/390：生命 40，基础口径一处，折扣说明保留', async ({ page }) => {
  mkdirSync(shots, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, '/unit/74');
  await setTheme(page, 'light');
  await expect(page.locator('#unit h1')).toContainText('民兵');
  await expect(page.locator('[data-stat="hp"] .num')).toHaveText('40');
  const light = await page.locator('#unit').innerText();
  expect(light.match(/未计文明加成/g)).toEqual(['未计文明加成']);
  expect(light).toContain('目录造价，未计文明折扣。');
  expect(light).not.toContain('未指定文明时需先选择文明');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${shots}/74-1280-light.png` });

  await setTheme(page, 'dark');
  await expect(page.locator('[data-stat="hp"] .num')).toHaveText('40');
  await page.screenshot({ path: `${shots}/74-1280-dark.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  await setTheme(page, 'light');
  await expect(page.locator('[data-stat="hp"] .num')).toHaveText('40');
  expect((await page.locator('#unit').innerText()).match(/未计文明加成/g)).toEqual(['未计文明加成']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${shots}/74-390-light.png` });
});
