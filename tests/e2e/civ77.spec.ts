import { expect, test } from '@playwright/test';

for (const width of [360, 375, 390, 1280]) {
  test(`文明详情入口与开局 ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (e) => {
      if (e.type() === 'error') errors.push(e.text());
    });
    await page.goto('./#/civ/Mongols');
    const opening = page.getByRole('region', { name: '开局建议' });
    await expect(opening).toContainText('蒙古突骑');
    await expect(opening).not.toContainText('芒古代');
    await expect(opening.getByTestId('civ-opening-summary')).toHaveCount(1);
    await expect(opening.locator('ol, li')).toHaveCount(0);
    await expect(page.getByText('标签说明：', { exact: false })).toBeVisible();
    const bonusLink = page.getByRole('link', { name: '查看完整加成表', exact: true });
    await expect(bonusLink).toHaveAttribute('href', '#/bonuses');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await opening.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`civ-${width}.png`), fullPage: true });
    await opening.getByRole('link', { name: '18 人口侦察骑兵速攻（单马厩）', exact: true }).click();
    await expect(page).toHaveURL(/bo=scouts-18/);
    await expect(page.getByText('加载中', { exact: true })).toHaveCount(0);
    await page.goBack();
    await page.getByRole('link', { name: '查看完整加成表', exact: true }).click();
    await expect(page).toHaveURL(/#\/bonuses$/);
    await page.goto('./#/civ/Vietnamese');
    await expect(page.getByRole('region', { name: '开局建议' })).toContainText('藤弓兵');
    expect(errors).toEqual([]);
  });
}
