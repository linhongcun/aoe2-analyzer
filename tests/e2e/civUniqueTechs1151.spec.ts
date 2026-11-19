import { expect, test } from '@playwright/test';

const cases = [
  { civ: 'Wei', techs: [{ id: 1061, name: '屯田' }, { id: 1062, name: '明光铠' }] },
  { civ: 'Wu', techs: [{ id: 1080, name: '赤壁战术' }, { id: 1081, name: '卧虎' }] },
];

for (const { civ, techs } of cases) {
  for (const [width, theme] of [[360, 'dark'], [1280, 'light']] as const) {
    test(`${civ} 套件按时代显示两项独特科技并可往返详情（${width}px）`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const civRoute = `#/civ/${civ}#kit`;
      await page.goto(`./${civRoute}`);
      await expect(page.getByTestId('civ-kit')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      const rows = page.getByTestId('civ-unique-techs').getByRole('link');
      await expect(rows).toHaveCount(2);
      await expect(rows.locator('.kit-age')).toHaveText(['城堡时代', '帝王时代']);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

      for (const [index, { id, name }] of techs.entries()) {
        const row = rows.nth(index);
        const route = `#/tech/${id}`;
        await expect(row.locator('.kit-name')).toHaveText(name);
        await expect(row).toHaveAttribute('href', route);
        if (width === 360) {
          await expect(row.locator('.kit-age')).toHaveCSS('white-space', 'nowrap');
          await row.click();
        } else {
          await row.focus();
          await expect(row).toBeFocused();
          await row.press('Enter');
        }
        await expect(page).toHaveURL(new URL(route, page.url()).href);
        await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
        await page.goBack();
        await expect(page).toHaveURL(new URL(civRoute, page.url()).href);
        await expect(rows).toHaveCount(2);
      }
    });
  }
}
