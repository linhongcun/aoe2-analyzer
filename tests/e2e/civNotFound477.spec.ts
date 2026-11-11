import { expect, test } from '@playwright/test';

test('#477 缺目录文明走历史身份回退，真实文明仍打开', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/civ/Tartars');
  await expect(page.getByRole('heading', { name: '尚未收录该对象的更新历史' })).toBeVisible();
  await expect(page.getByText('当前目录和历史档案均未找到此项。')).toBeVisible();
  await expect(page.getByRole('heading', { name: '没找到这个文明' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '查看更新历史', exact: true })).toHaveAttribute('href', '#/patches');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('./#/civ/Tatars');
  await expect(page.locator('main h1')).toContainText('鞑靼');
  await expect(page.getByRole('heading', { name: '尚未收录该对象的更新历史' })).toHaveCount(0);
  expect(errors).toEqual([]);
});
