import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const section = (page: Page, title: string) => page.locator('.dside .sideblk').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', (e) => list.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') list.push(e.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#460 @${width} ${theme} 两文明翼骑兵归区域单位`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      for (const civ of ['Poles', 'Lithuanians']) {
        await page.goto(`./#/civ/${civ}`);
        const unique = section(page, '独特单位');
        const regional = section(page, '区域单位');
        const link = regional.getByRole('link', { name: '波兰翼骑兵', exact: true });
        await expect(link).toHaveCount(1);
        await expect(unique.getByRole('link', { name: '波兰翼骑兵', exact: true })).toHaveCount(0);
        await expect(unique.getByRole('link').first()).toBeVisible();
        await expect(regional).not.toContainText('本文明没有区域单位。');
        await expect(link).toHaveAttribute('href', `#/unit/1707/${civ}/4/?ctxReturn=${encodeURIComponent(`/civ/${civ}`)}`);
        const box = await link.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect((await new AxeBuilder({ page }).include('.civ-regional-units').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
        await regional.scrollIntoViewIfNeeded();
        await page.screenshot({ path: info.outputPath(`${civ}-${width}-${theme}.png`), fullPage: true });
        await link.focus();
        await expect(link).toBeFocused();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    });

test('#460 单位筛选、详情与文明时代上下文', async ({ page }) => {
  await page.goto('./#/units');
  await page.locator('#uq').fill('波兰翼骑兵');
  await page.locator('#ut').selectOption('RegionalUnit');
  await expect(page.locator('#ugrid [data-unit-id="1707"]')).toBeVisible();
  await page.locator('#ut').selectOption('UniqueUnit');
  await expect(page.locator('#ugrid [data-unit-id="1707"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '没有符合条件的单位' })).toBeVisible();
  for (const civ of ['Poles', 'Lithuanians']) {
    const source = `/civ/${civ}?me=Poles&opp=Lithuanians`;
    await page.goto('./#' + source);
    const link = section(page, '区域单位').getByRole('link', { name: '波兰翼骑兵', exact: true });
    const navigation = new URLSearchParams({ me: 'Poles', opp: 'Lithuanians', ctxReturn: source });
    await expect(link).toHaveAttribute('href', `#/unit/1707/${civ}/4/?${navigation}`);
    await link.click();
    await expect(page).toHaveURL((url) => url.hash === `#/unit/1707/${civ}/4/?${navigation}`);
    await expect(page.locator('.dhead-tags')).toContainText('区域单位');
    await expect(page.locator('.dhead-tags')).not.toContainText('独特单位');
    await page.getByRole('tab', { name: '科技模拟器', exact: true }).click();
    await expect(page.locator('#simciv')).toHaveAttribute('data-value', civ);
    await expect(page.locator('#simage')).toHaveValue('4');
    await page.reload();
    await expect(page.locator('#simciv')).toHaveAttribute('data-value', civ);
    await expect(page.locator('#simage')).toHaveValue('4');
    await expect(page).toHaveURL((url) => url.hash === `#/unit/1707/${civ}/4/?${navigation}&tab=sim`);
  }
});
