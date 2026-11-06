import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const ages = [
  {
    tech: 101,
    name: '封建时代',
    counted: [68, 562, 584, 12, 45],
    absent: [87, 101, 103, 84, 209, 49, 104, 82, 1251, 117, 79],
  },
  {
    tech: 102,
    name: '城堡时代',
    counted: [87, 101, 103, 84],
    absent: [68, 562, 584, 12, 45, 209, 49, 104, 82, 1251],
  },
  {
    tech: 103,
    name: '帝王时代',
    counted: [209, 49, 104, 82, 1251],
    absent: [68, 562, 584, 12, 45, 87, 101, 103, 84],
  },
] as const;

async function shot(page: Page, path: string) {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    scrollTo(0, 0);
  });
  await page.screenshot({ path, fullPage: true });
}

for (const width of [360, 375, 390, 1280]) {
  for (const theme of ['light', 'dark']) {
    test(`升时代建筑门槛归位 ${width}-${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (e) => {
        if (e.type() === 'error') errors.push(e.text());
      });

      await page.goto('./#/buildings');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const list = page.locator('#buildings');
      await expect(list.getByRole('region', { name: '升时代需要哪些建筑' })).toHaveCount(0);
      await expect(list).not.toContainText('计入示例');
      await expect(list).not.toContainText('不计入示例');
      await expect(list).not.toContainText('两座同类建筑不算两种');
      await expect(list.locator('[data-counts]')).toHaveCount(0);
      const guides = list.getByRole('navigation', { name: '时代升级说明' });
      await expect(guides.getByRole('link', { name: '封建时代说明', exact: true })).toHaveAttribute('href', '#/tech/101');
      await expect(guides.getByRole('link', { name: '城堡时代说明', exact: true })).toHaveAttribute('href', '#/tech/102');
      await expect(guides.getByRole('link', { name: '帝王时代说明', exact: true })).toHaveAttribute('href', '#/tech/103');
      for (const link of await guides.getByRole('link').all()) {
        const bounds = await link.boundingBox();
        expect(bounds!.width).toBeGreaterThanOrEqual(44);
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
      }
      await page.locator('#bq').fill('磨坊');
      await expect(page.locator('#bgrid > a')).toHaveCount(1);
      await expect(guides).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).include('[aria-label="时代升级说明"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      await shot(page, info.outputPath(`age-buildings-list-${width}-${theme}.png`));

      for (const age of ages) {
        await page.goto(`./#/tech/${age.tech}`);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const panel = page.getByRole('region', { name: '升时代需要哪些建筑' });
        await expect(panel).toBeVisible();
        await expect(panel.getByRole('article')).toHaveCount(1);
        const row = panel.getByRole('article', { name: new RegExp(`升${age.name}$`) });
        await expect(panel).toContainText('两种不同');
        await expect(panel).toContainText('两座同类建筑不算两种');
        await expect(panel).toContainText('不是完整的文明专属清单');
        await expect(row).toContainText('计入示例');
        await expect(row).toContainText('不计入示例');
        await expect(row.getByRole('link', { name: '房屋', exact: true })).toHaveAttribute('href', '#/building/70');
        await expect(row.getByRole('link', { name: '农田', exact: true })).toHaveAttribute('href', '#/building/50');
        await expect(row.getByRole('link', { name: '木栅栏', exact: true })).toHaveAttribute('href', '#/building/72');
        for (const id of age.counted) await expect(row.locator(`[data-counts="true"][href="#/building/${id}"]`)).toBeVisible();
        for (const id of age.absent) await expect(panel.locator(`[href="#/building/${id}"]`)).toHaveCount(0);
        for (const other of ages) if (other.tech !== age.tech) await expect(panel).not.toContainText(`升${other.name}`);
        if (age.tech === 101) {
          await expect(panel).not.toContainText('一座');
        } else {
          await expect(row.locator('[data-counts="false"][href="#/building/117"]')).toBeVisible();
          await expect(row.locator('[data-counts="false"][href="#/building/79"]')).toBeVisible();
        }
        if (age.tech === 103) {
          await expect(row).toContainText('一座');
          await expect(row.getByRole('link', { name: '城堡', exact: true })).toHaveAttribute('href', '#/building/82');
          await expect(row.getByRole('link', { name: '营垒', exact: true })).toHaveAttribute('href', '#/building/1251');
        } else await expect(panel).not.toContainText('营垒');
        await expect(panel).toContainText('高棉');
        await expect(panel).toContainText('DE Update 188329');
        const nowrap = await panel.locator('.num.nw').evaluateAll((els) =>
          els.map((el) => ({
            text: el.textContent,
            lines: el.getClientRects().length,
            whiteSpace: getComputedStyle(el).whiteSpace,
          })),
        );
        expect(nowrap.length).toBeGreaterThan(0);
        for (const item of nowrap) {
          expect(item.whiteSpace).toContain('nowrap');
          expect(item.lines, item.text ?? '').toBe(1);
        }
        for (const link of await panel.getByRole('link').all()) {
          const bounds = await link.boundingBox();
          expect(bounds!.width).toBeGreaterThanOrEqual(44);
          expect(bounds!.height).toBeGreaterThanOrEqual(44);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(
          (await new AxeBuilder({ page }).include('[aria-labelledby="age-buildings-title"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
        ).toEqual([]);
        await shot(page, info.outputPath(`age-buildings-${age.tech}-${width}-${theme}.png`));
      }

      await page.goto('./#/tech/101');
      await page.getByRole('region', { name: '升时代需要哪些建筑' }).getByRole('link', { name: '磨坊', exact: true }).click();
      await expect(page).toHaveURL(/#\/building\/68$/);
      await expect(page.getByRole('region', { name: '升时代需要哪些建筑' })).toHaveCount(0);
      await page.goto('./#/tech/22');
      await expect(page.locator('#tech h1')).toContainText('织布机');
      await expect(page.getByRole('region', { name: '升时代需要哪些建筑' })).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
}
