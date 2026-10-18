import { expect, test } from '@playwright/test';
for (const width of [360, 375, 390, 1280]) {
  test(`早期应对 ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (e) => {
      if (e.type() === 'error') errors.push(e.text());
    });
    await page.goto('./#/matchup?rush=scouts');
    const section = page.getByRole('region', { name: '应对早期进攻' });
    for (const [id, a, b] of [
      ['militia', '2', '3'],
      ['scouts', '2', '3'],
      ['archers', '4', '4'],
      ['towers', '6', '5'],
    ]) {
      await section.getByRole('combobox').selectOption(id!);
      await expect(page).toHaveURL(new RegExp(`rush=${id}`));
      await expect(section).toContainText('城镇中心');
      await section.getByRole('link', { name: /打开 PK 演练/ }).click();
      await expect(page.locator('#duel-res')).toBeVisible();
      await expect(page.locator('#duel-res .duel-tab')).toContainText(`A ${a}`);
      await expect(page.locator('#duel-res .duel-tab')).toContainText(`B ${b}`);
      await page.goBack();
      await expect(section.getByRole('combobox')).toHaveValue(id!);
    }
    await expect(section).toContainText('不模拟打塔');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`rush-${width}.png`), fullPage: true });
    await section.getByRole('link', { name: /参考开局/ }).click();
    await expect(page.getByRole('list', { name: '时间线', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
