import { expect, test } from '@playwright/test';

test('赛事公告直接地址呈现已加载的真实卡片', async ({ page }) => {
  await page.goto('/#/events');
  await expect(page.getByRole('heading', { level: 1, name: '赛事公告', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'The Garrison 2026', exact: true })).toBeVisible();
  await expect(page.getByText('2026-11-25', { exact: true })).toBeVisible();
  await expect(page.getByText('2026-11-29', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Hera', exact: true })).toBeVisible();
});
