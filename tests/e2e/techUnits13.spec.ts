import { test, expect } from '@playwright/test';

test('#13 鼓风炉：涉及单位只显示一处，含骑士、长剑士，不重复', async ({ page }) => {
  await page.goto('./#/tech/75');
  await expect(page.getByRole('heading', { name: '涉及单位' })).toHaveCount(1);
  const chips = page.locator('h4:text-is("涉及单位") + .uchips a');
  await expect(chips.filter({ hasText: /^骑士$/ })).toHaveCount(1);
  await expect(chips.filter({ hasText: /^长剑士$/ })).toHaveCount(1);
  const names = await chips.allInnerTexts();
  expect(new Set(names).size).toBe(names.length);
});
