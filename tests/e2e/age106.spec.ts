import { expect, test } from '@playwright/test';

for (const width of [360, 375, 390, 1280]) {
  test(`各时代对比 ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (e) => {
      if (e.type() === 'error') errors.push(e.text());
    });
    await page.goto('./#/duel?a=567.Japanese.4.f.&b=569.Franks.4.f.&m=1');
    const details = page.locator('[data-t="age-comparison"]');
    await details.locator('summary').click();
    await expect(details.locator('section')).toHaveCount(4);
    await expect(details).toContainText('尚未解锁');
    const castle = details.locator('section').nth(2);
    await expect(castle).toContainText('长剑士');
    const winner = await castle.locator('p b').textContent();
    const dpsA = await castle
      .getByRole('row')
      .filter({ has: page.getByText('DPS', { exact: true }) })
      .locator('td')
      .first()
      .textContent();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await details.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`ages-${width}.png`), fullPage: true });
    await castle.getByRole('link').click();
    await expect(page).toHaveURL(/\.3\.f\./);
    await expect(page.locator('#duel-res .duel-win')).toContainText(winner === '平局' ? '平局' : `${winner![0]} ·`);
    const resultDps = page
      .locator('#duel-res tr')
      .filter({ has: page.getByText('DPS', { exact: true }) })
      .locator('td')
      .nth(1);
    expect(Number(await resultDps.textContent())).toBe(Number(dpsA));
    expect(errors).toEqual([]);
  });
}
