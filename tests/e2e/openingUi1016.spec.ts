import { expect, test } from '@playwright/test';

for (const width of [390, 1280]) {
  test(`#1016 开局进度与步骤布局 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./#/start');
    const progress = page.locator('.start-progress');
    const current = page.getByTestId('start-step');
    await expect(current).toHaveAttribute('data-step', 'mode');
    const p = await progress.boundingBox();
    const c = await current.boundingBox();
    if (width === 1280) expect(p!.x + p!.width).toBeLessThanOrEqual(c!.x);
    else expect(p!.y + p!.height).toBeLessThanOrEqual(c!.y);
    await page.getByTestId('start-skip').click();
    await expect(current).toHaveAttribute('data-step', 'map');
    await page.getByTestId('start-feature-menu').locator('summary').click();
    await page.getByRole('button', { name: '回到本局步骤', exact: true }).click();
    await expect(page.locator('#start-map-h')).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`#1016 复盘导航仅定位且保留记录 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./#/match-review');
    await page.getByRole('textbox', { name: '复盘标题', exact: true }).fill('导航不会替换记录');
    await page.getByRole('button', { name: '添加关键事件', exact: true }).click();
    await page.getByRole('textbox', { name: '事件 1：当时可见事实', exact: true }).fill('当时的观察');
    const before = await page.locator('#mr-backup-text').inputValue();
    const url = page.url();
    for (const [label, id] of [
      ['关键事件', 'mr-events-title'],
      ['下局目标', 'mr-goal-title'],
      ['跟进尝试', 'mr-attempts-title'],
      ['对局上下文', 'mr-context-heading'],
    ]) {
      await page.getByRole('navigation', { name: '复盘记录导航' }).getByRole('button', { name: label, exact: true }).click();
      const heading = page.locator(`#${id}`);
      await expect(heading).toBeFocused();
      await expect(heading).toBeInViewport();
      const box = await heading.boundingBox();
      const topbar = await page.locator('header.topbar').boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(topbar!.y + topbar!.height);
      expect(page.url()).toBe(url);
      expect(await page.locator('#mr-backup-text').inputValue()).toBe(before);
    }
    const context = await page.locator('.mr-context-column').boundingBox();
    const events = await page.locator('section[aria-labelledby="mr-events-title"]').boundingBox();
    if (width === 1280) expect(context!.x + context!.width).toBeLessThanOrEqual(events!.x);
    else expect(context!.y + context!.height).toBeLessThanOrEqual(events!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
