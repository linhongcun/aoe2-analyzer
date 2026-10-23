// #294 补充断言：跳到主内容链接平时不占版面；跳过后焦点与路由的细节；徽章读出的名称包含看得见的版本文字。
import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, route: string, width: number, theme: 'light' | 'dark' = 'light') {
  await page.addInitScript((t) => localStorage.setItem('aoe2-theme', t), theme);
  await page.setViewportSize({ width, height: 800 });
  await page.goto(`./#${route}`, { waitUntil: 'networkidle' });
  await expect(page.locator('main')).not.toBeEmpty();
}
const skip = (page: Page) => page.getByRole('link', { name: '跳到主内容' });

for (const width of [360, 375, 390, 1280]) {
  test(`@${width}：未聚焦时跳到主内容链接完全在视口外，不挤占顶栏，无横向滚动`, async ({ page }) => {
    await open(page, '/market', width);
    const r = await skip(page).evaluate((el) => {
      const b = el.getBoundingClientRect();
      const h = document.querySelector('header')!.getBoundingClientRect();
      return { bottom: b.bottom, headerTop: h.top, scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    expect(r.bottom).toBeLessThanOrEqual(0);
    expect(r.headerTop).toBe(0);
    expect(r.scroll).toBe(0);
  });

  test(`@${width}：跳到主内容之后的下一个 Tab 停点和原来一样是顶栏第一个控件`, async ({ page }) => {
    await open(page, '/market', width);
    await page.keyboard.press('Tab');
    await expect(skip(page)).toBeFocused();
    await page.keyboard.press('Tab');
    const name = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      return el.getAttribute('aria-label') || el.innerText.trim();
    });
    expect(name).toBe(width <= 900 ? '菜单' : '帝国时代 II 分析器');
  });
}

test('@390：鼠标点跳到主内容也不改地址；焦点离开 main 后 main 不再可被 Tab 或点击吸住', async ({ page }) => {
  await open(page, '/builds', 390);
  await page.keyboard.press('Tab');
  await skip(page).click();
  expect(new URL(page.url()).hash).toBe('#/builds');
  await expect(page.locator('main')).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('main') && document.activeElement?.tagName !== 'MAIN')).toBe(true);
  await expect(page.locator('main')).not.toHaveAttribute('tabindex');
});

for (const scrolled of [0, 600])
  test(`@390${scrolled ? '（先向下滚动）' : ''}：跳过后正文开头停在吸顶栏下方，下一个 Tab 停点不被顶栏挡住；main 不画整块焦点框`, async ({ page }) => {
    await open(page, '/market', 390);
    if (scrolled) await page.evaluate((y) => scrollTo(0, y), scrolled);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    const below = () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const bar = document.querySelector('header')!.getBoundingClientRect().bottom;
        const s = getComputedStyle(el);
        return {
          tag: el.tagName,
          gap: el.getBoundingClientRect().top - bar,
          noRing: el.tagName !== 'MAIN' || s.outlineStyle === 'none' || parseFloat(s.outlineWidth) === 0,
        };
      });
    const m = await below();
    expect(m.tag).toBe('MAIN');
    expect(m.gap).toBeGreaterThanOrEqual(-0.5);
    expect(m.noRing).toBe(true);
    await page.keyboard.press('Tab');
    const next = await below();
    expect(next.gap).toBeGreaterThanOrEqual(0);
  });

for (const width of [390, 1280])
  test(`@${width}：数据版本徽章读出的名称包含看得见的版本文字（窄屏文字隐藏时也一样）`, async ({ page }) => {
    await open(page, '/market', 1280);
    const visible = (await page.locator('.verbadge span').textContent())!.trim();
    await page.setViewportSize({ width, height: 800 });
    await expect(page.locator('.verbadge')).toHaveAccessibleName(new RegExp(visible.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await expect(page.locator('.verbadge')).toHaveAccessibleName(/来源/);
  });

test('深色 @390：跳到主内容链接聚焦时有焦点环', async ({ page }) => {
  await open(page, '/market', 390, 'dark');
  await page.keyboard.press('Tab');
  const s = await skip(page).evaluate((el) => {
    const c = getComputedStyle(el);
    return c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) >= 2;
  });
  expect(s).toBe(true);
});
