import { expect, test, type Page } from '@playwright/test';

// #768：六张入门卡回到页面主内容位置（导语之后、机制卡之前），
// 「下面六张入门卡只覆盖征服示例」之后紧接六卡区域，机制/来源卡整体后移但不删除。
const MECHANISM_CARDS = [
  ['victory-modes', '房间设置和赛事口径分开看'],
  ['standard-victory', 'Standard 奇观与圣物倒计时'],
  ['elevation-bonus', '高打低、低打高各乘多少'],
  ['housing-pop', '这些建筑各提供多少人口'],
] as const;

const failures = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  failures.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(failures.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

const pageTop = (page: Page, selector: string) => page.locator(selector).evaluate((element) => element.getBoundingClientRect().top + window.scrollY);

const mechanismOrder = (page: Page) =>
  page.evaluate(() => {
    const nav = document.querySelector('.gg-nav');
    const ids = ['victory-modes', 'standard-victory', 'elevation-bonus', 'housing-pop'];
    return ids.map((id) => {
      const card = document.querySelector(`[data-testid="${id}"]`);
      if (!nav || !card) return 'missing';
      return nav.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING ? 'after' : 'before';
    });
  });

const sixCardSentence = (page: Page) =>
  page.evaluate(() => {
    const paragraph = [...document.querySelectorAll('[data-testid="game-guide-page"] p')].find((element) =>
      element.textContent?.includes('下面六张入门卡只覆盖征服示例'),
    );
    if (!paragraph) return null;
    return {
      text: paragraph.textContent ?? '',
      nextSiblingClass: (paragraph.nextElementSibling as HTMLElement | null)?.className ?? null,
    };
  });

test('#768 @1280 六卡导航回到主内容位置且在 4 张机制卡之前', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/game-guide');
  await expect(page.getByTestId('game-guide-page')).toBeVisible();
  await expect(page.locator('.gg-nav button')).toHaveCount(6);
  expect(await pageTop(page, '.gg-nav')).toBeLessThan(2400);
  expect(await mechanismOrder(page)).toEqual(['after', 'after', 'after', 'after']);
  const sentence = await sixCardSentence(page);
  expect(sentence?.text).toContain('下面六张入门卡只覆盖征服示例');
  expect(sentence?.nextSiblingClass).toContain('gg-layout');
});

test('#768 @360 六卡导航不再被压到页面深处', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('./#/game-guide');
  await expect(page.getByTestId('game-guide-page')).toBeVisible();
  expect(await pageTop(page, '.gg-nav')).toBeLessThan(4000);
  expect(await mechanismOrder(page)).toEqual(['after', 'after', 'after', 'after']);
  const sentence = await sixCardSentence(page);
  expect(sentence?.nextSiblingClass).toContain('gg-layout');
});

for (const width of [360, 375, 390, 1280])
  test(`#768 ${width} 宽六卡在前，机制卡与来源仍可见`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./#/game-guide');
    await expect(page.getByTestId('game-guide-page')).toBeVisible();
    for (const [id, title] of MECHANISM_CARDS) {
      const card = page.getByTestId(id);
      await card.scrollIntoViewIfNeeded();
      await expect(card.getByRole('heading', { name: title, level: 2 })).toBeVisible();
    }
    // 来源与更新日期块随机制卡保留在页面内。
    await expect(page.getByTestId('victory-modes').getByRole('link', { name: '官方 Support：如何创建多人游戏' })).toBeVisible();
    await expect(page.getByTestId('housing-pop')).toContainText('2026-11-05');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
