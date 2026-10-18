import { expect, test } from '@playwright/test';

for (const width of [360, 375, 390, 1280]) {
  test(`issue 36：射程说明和科技别名，${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto('./#/unit/1968');
    const help = page.getByRole('button', { name: '射程说明', exact: true });
    await help.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: '射程说明', exact: true });
    await expect(dialog).toContainText('对单位');
    await expect(dialog).toContainText('对建筑');
    await expect(dialog).toBeFocused();
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    const target = await help.boundingBox();
    expect(target!.width).toBeGreaterThanOrEqual(44);
    expect(target!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`range-${width}.png`), fullPage: true });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(help).toBeFocused();
    await help.click();
    await page.locator('h2').first().click();
    await expect(dialog).toHaveCount(0);
    await page.goto('./#/tech/1452');
    await expect(page.getByText('又名：绞盘弩', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`tech-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto('./#/tech/199');
    await expect(page.locator('#tech')).toBeVisible();
    await expect(page.getByText(/^又名：/)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('issue 36：护甲类别与新手关键词可从全局搜索打开', async ({ page }) => {
  await page.goto('./#/unit/751');
  await expect(page.locator('#unit')).toBeVisible();
  await page.keyboard.press('Control+k');
  const input = page.getByPlaceholder(/搜索文明、单位、科技/);
  await input.fill('冲击步兵');
  const hits = page.locator('.cmdk-list li');
  await expect(hits.filter({ hasText: '鹰斥候' })).toBeVisible();
  await hits.filter({ hasText: '鹰斥候' }).click();
  await expect(page).toHaveURL(/#\/unit\/751$/);
  for (const q of ['新手', '快攻']) {
    await page.keyboard.press('Control+k');
    await input.fill(q);
    const builds = hits.filter({ has: page.locator('b', { hasText: /^开局流程$/ }) });
    await expect(builds).toBeVisible();
    await builds.click();
    await expect(page).toHaveURL(/#\/builds$/);
  }
  await page.keyboard.press('Control+k');
  await input.fill('绞盘弩');
  await hits.first().click();
  await expect(page).toHaveURL(/#\/tech\/1452$/);
  await expect(page.getByText('又名：绞盘弩', { exact: true })).toBeVisible();
});
