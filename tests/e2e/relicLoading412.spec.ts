import { expect, test } from '@playwright/test';
import { openAllDetails } from './relicDetails412';
import { guardPage, WIDTHS } from './v0290-helpers';

guardPage();

for (const width of WIDTHS)
  test(`#412 @${width}：标题已出现但圣物数据未到时，等真实说明生成后展开并打开关于数据`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let release!: () => void;
    let requests = 0;
    let expansion: Promise<void> | undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(/\/assets\/relic_income-[^/]+\.js(?:\?.*)?$/, async (route) => {
      requests++;
      await held;
      await route.continue();
    });
    try {
      await page.goto('./#/relic-income');
      await expect.poll(() => requests, '必须实际扣住圣物数据分包，避免资源改名后空转').toBe(1);
      await expect(page.locator('main h1').first()).toBeVisible();
      await expect(page.locator('main').getByRole('status')).toHaveText('正在加载固定圣物数据…');
      await expect(page.locator('main details')).toHaveCount(0);

      let expanded = false;
      expansion = openAllDetails(page).then(() => {
        expanded = true;
      });
      // 浏览器往返让已有的展开操作完成；闸门仍关闭，不能把空 DOM 当作已展开。
      await page.evaluate(() => document.querySelectorAll('main details').length);
      expect(expanded, '共享展开 helper 必须等待数据生成真实说明').toBe(false);
      await expect(page.locator('main details')).toHaveCount(0);

      release();
      await expansion;
      await expect(page.locator('main').getByRole('status')).toHaveCount(0);
      await expect(page.locator('main details')).toHaveCount(2);
      await expect(page.locator('main details:not([open])')).toHaveCount(0);
      const sentence = page.locator('main p', { hasText: '数据所用游戏 .dat 的固定版本与校验信息见' });
      await expect(sentence).toHaveCount(1);
      const link = sentence.getByRole('link', { name: '关于数据', exact: true });
      await expect(link).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
      await link.click();
      await expect(page).toHaveURL(/#\/about-data$/);
      await expect(page.locator('main table.stat')).toBeVisible();
    } finally {
      release();
      await page.unrouteAll({ behavior: 'wait' });
      await expansion;
    }
  });
