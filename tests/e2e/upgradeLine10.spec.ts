import { test, expect } from '@playwright/test';

test('#10 波斯重装骑士：升级路线末级萨瓦尔带「萨瓦尔 · 波斯」灰色小标签', async ({ page }) => {
  await page.goto('./#/unit/283/Persians');
  const line = page.locator('.uline.vline');
  const tag = line.locator('[data-t="uu-tag"]');
  await expect(tag).toHaveText('萨瓦尔 · 波斯');
  await expect(tag.locator('img.ico')).toHaveCount(1);
  expect(await tag.evaluate((e) => getComputedStyle(e).fontSize)).toBe('12px');
  const href = await line.locator('a.ulink', { hasText: '萨瓦尔' }).getAttribute('href');
  expect(href!.split('?')[0]).toBe('#/unit/1813');
  const query = new URLSearchParams(href!.split('?')[1]);
  expect(query.get('civ')).toBe('Persians');
  expect(query.get('ctxReturn')).toContain('/unit/283/Persians');
});

test('#10 通用重装骑士：末级游侠，没有独特单位标签', async ({ page }) => {
  await page.goto('./#/unit/283');
  const line = page.locator('.uline.vline');
  await expect(line).toContainText('游侠');
  await expect(line.locator('[data-t="uu-tag"]')).toHaveCount(0);
});
