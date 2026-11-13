import { expect, test, type Locator, type Page } from '@playwright/test';

async function tabTo(page: Page, target: Locator) {
  for (let step = 0; step < 60; step++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

test('#994 首页卡片图标与数量不重叠', async ({ page }) => {
  await page.goto('./#/');
  await expect(page.locator('.home-ref-card')).toHaveCount(4);
  for (const width of [360, 375, 390, 901, 1201, 1279, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const cards = await page.locator('.home-ref-card').evaluateAll((elements) =>
      elements.map((element) => {
        const card = element.getBoundingClientRect();
        const count = element.querySelector('.home-ref-count')!.getBoundingClientRect();
        const icons = [...element.querySelectorAll('.home-examples img')].filter((icon) => icon.getClientRects().length > 0);
        const last = icons.at(-1)!.getBoundingClientRect();
        const iconsContained = icons.every((icon) => {
          const bounds = icon.getBoundingClientRect();
          return bounds.left >= card.left && bounds.right <= card.right;
        });
        return {
          gap: count.left - last.right,
          contained: iconsContained && count.left >= card.left && count.right <= card.right,
        };
      }),
    );
    for (const card of cards) {
      expect(card.gap, `width ${width}`).toBeGreaterThanOrEqual(3.9);
      expect(card.contained).toBe(true);
    }
    if (width === 1280) await expect(page.locator('.home-ref-card[data-k="units"] img:visible')).toHaveCount(5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

for (const path of ['/', '/about-data', '/hotkeys']) {
  test(`#994 移动导航summary键盘循环 ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto('./#' + path);
    const menu = page.getByRole('button', { name: '菜单', exact: true });
    await tabTo(page, menu);
    await page.keyboard.press('Enter');
    const close = page.getByRole('button', { name: '关闭菜单', exact: true });
    await expect(close).toBeFocused();
    const tools = page.getByRole('button', { name: '工具', exact: true });
    await tabTo(page, tools);
    if ((await tools.getAttribute('aria-expanded')) !== 'true') await page.keyboard.press('Enter');
    const summaries = page.locator('#tools-menu summary');
    for (let index = 0; index < 4; index++) await tabTo(page, summaries.nth(index));
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(summaries.last()).toBeFocused();
    await page.keyboard.press('Enter');
    const lastGroup = page.locator('#tools-menu details').last();
    await page.keyboard.press('Tab');
    await expect(lastGroup.getByRole('link').first()).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(summaries.last()).toBeFocused();
    await page.keyboard.press('Home');
    await expect(summaries.first()).toBeFocused();
    await page.keyboard.press('End');
    await expect(lastGroup.getByRole('link').last()).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeFocused();
    await expect(page.locator('nav.mainnav')).toBeHidden();
  });
}

test('#994 开局操作热区与数据来源标题', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/builds');
  await expect(page.locator('.bo-catalog-go').first()).toBeVisible();
  for (const action of await page.locator('.bo-catalog-go,.bo-catalog-practice').all()) {
    const box = await action.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
  await page.goto('./#/about-data');
  await expect(page.getByRole('heading', { level: 1, name: '关于数据' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['固定数据来源', '补丁数据变化']);
  await expect(page.locator('.src-sha')).toContainText(/^[0-9a-f]{64}$/);
});
