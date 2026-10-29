import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Locator } from '@playwright/test';
// @ts-expect-error Browser infrastructure scripts are plain Node modules
import { historicalSuiteURL } from '../../scripts/historical-ui.mjs';

test.use({ baseURL: historicalSuiteURL('duelPreset372.spec.ts') });

const CASES = [
  {
    key: 'castle-hussite-mangonel',
    title: '城堡时代：胡斯派战车对轻型投石车',
    query: 'a=1704.Bohemians.3.c.&b=280.Franks.3.c.&m=1',
    a: '胡斯派战车',
    b: '轻型投石车',
    age: '城堡时代',
  },
  {
    key: 'imperial-hussite-onager',
    title: '帝王时代：精锐胡斯派战车对中型投石车',
    query: 'a=1706.Bohemians.4.c.&b=550.Franks.4.c.&m=1',
    a: '精锐胡斯派战车',
    b: '中型投石车',
    age: '帝王时代',
  },
] as const;
const region = (page: Page) => page.getByRole('region', { name: '波希米亚预置对战', exact: true });
const card = (page: Page, key: string) => region(page).locator('[data-preset="' + key + '"]');
const dirtySides = 'a=569.Franks.4.f.0-1&b=359.Japanese.4.f.2';
const dirtyQueries = [
  dirtySides + '&m=n&na=11&nb=7&be=1',
  dirtySides + '&m=r&bud=8800&be=1&na=11&nb=7',
  dirtySides + '&m=t&vil=19&min=13&bud=8800&na=11&nb=7&be=1',
  'a=38.Byzantines.3.67.&b=38.Byzantines.3..&m=1&base=38.Byzantines.3..&fixed=38.Byzantines.3..&basev=185872&be=1',
];
async function configured(page: Page, item: (typeof CASES)[number]) {
  await expect(page.locator('#duel-res')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('#/duel?' + item.query);
  for (const [side, name, civ] of [
    ['a', item.a, '波希米亚'],
    ['b', item.b, '法兰克'],
  ] as const) {
    await expect(page.locator('#duel-' + side + ' .duel-head')).toContainText(name);
    await expect(page.locator('#duel-' + side + ' .duel-head')).toContainText(civ);
    await expect(page.locator('#duel-' + side + ' .duel-age')).toHaveText(item.age);
    await expect(page.locator('#duel-' + side).getByRole('radio', { name: '当前时代满科技', exact: true })).toHaveAttribute('aria-checked', 'true');
  }
  await expect(page.getByRole('radio', { name: '1v1', exact: true })).toHaveAttribute('aria-checked', 'true');
}
async function unblockedTitle(page: Page, title: Locator) {
  await expect(title).toBeInViewport();
  const heading = await title.boundingBox();
  const bar = await page.locator('header.topbar').boundingBox();
  expect(heading!.y).toBeGreaterThanOrEqual(bar!.y + bar!.height);
}
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', (error) => list.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') list.push(message.text());
  });
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));

test('#372 页首发现入口键盘跳转同页预置节', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('./#/duel');
  await expect(page.locator('#duel-res')).toBeVisible();
  const before = page.url();
  const jump = page.getByRole('button', { name: '查看波希米亚预置', exact: true });
  await expect(jump).toBeInViewport();
  await jump.focus();
  await jump.press('Enter');
  await expect(region(page)).toBeFocused();
  await unblockedTitle(page, region(page).getByRole('heading', { level: 2 }));
  expect(page.url()).toBe(before);
});

test('#372 精确两卡和兄弟语义区不进入旧计算器全文', async ({ page }) => {
  await page.goto('./#/duel');
  await expect(region(page)).toBeVisible();
  await expect(region(page).locator('article[data-preset]')).toHaveCount(2);
  await expect(region(page).getByRole('heading', { level: 2, name: '波希米亚预置对战', exact: true })).toHaveCount(1);
  expect(await region(page).evaluate((element) => element.previousElementSibling?.id)).toBe('duel');
  await expect(page.locator('#duel [data-preset]')).toHaveCount(0);
  for (const item of CASES) {
    await expect(card(page, item.key).getByRole('heading', { level: 3, name: item.title, exact: true })).toHaveCount(1);
    await expect(card(page, item.key).getByRole('link', { name: '打开对照', exact: true })).toHaveAttribute('href', '#/duel?' + item.query);
  }
  await expect(region(page)).toContainText('波希米亚');
  await expect(region(page)).toContainText('法兰克');
  await expect(region(page)).toContainText('当前时代满科技');
  await expect(region(page)).toContainText('无团队加成');
  await expect(region(page)).toContainText(/DE\s*185872/);
  await expect(region(page)).toContainText('近似模型');
  await expect(region(page)).toContainText('不等同实战');
  await expect(region(page)).not.toContainText('通用');
  await expect(region(page)).not.toContainText('重型投石车');
});

for (const item of CASES) {
  test('#372 原生query控制 ' + item.key, async ({ page }) => {
    await page.goto('./#/duel?' + item.query);
    await configured(page, item);
    await page.reload();
    await configured(page, item);
  });

  test('#372 脏状态打开与刷新 ' + item.key, async ({ page }) => {
    for (const query of dirtyQueries) {
      await page.goto('./#/duel?' + query);
      await expect(page.locator('#duel-res')).toBeVisible();
      const open = card(page, item.key).getByRole('link', { name: '打开对照', exact: true });
      await open.scrollIntoViewIfNeeded();
      await open.click();
      await configured(page, item);
      await unblockedTitle(page, page.locator('#duel .lhead h1'));
      const params = new URLSearchParams(new URL(page.url()).hash.split('?')[1]);
      expect([...params.keys()]).toEqual(['a', 'b', 'm']);
    }
    await page.reload();
    await configured(page, item);
  });

  test('#372 真实复制静态入口与恢复 ' + item.key, async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('./duel/?' + dirtyQueries[2]);
    await expect(page.locator('#duel-res')).toBeVisible();
    const before = page.url();
    await card(page, item.key)
      .getByRole('button', { name: /复制对照链接/ })
      .click();
    await expect(card(page, item.key).getByRole('status')).toHaveText('对照链接已复制。');
    expect(page.url()).toBe(before);
    const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()));
    const base = await page.evaluate(() => document.baseURI);
    expect(copied.pathname).toBe(new URL('duel/', base).pathname);
    expect(copied.origin).toBe(new URL(base).origin);
    expect(copied.hash).toBe('');
    expect(copied.searchParams.toString()).toBe(item.query);
    await page.goto(copied.href);
    await configured(page, item);
    await page.reload();
    await configured(page, item);
  });
}

test('#372 复制失败完整可选链接及旧反馈清理', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('clipboard unavailable');
        },
      },
    }),
  );
  await page.goto('./#/duel?' + dirtyQueries[0]);
  await expect(page.locator('#duel-res')).toBeVisible();
  const before = page.url();
  const current = card(page, CASES[0].key);
  await current.getByRole('button', { name: /复制对照链接/ }).click();
  await expect(current.getByRole('status')).toContainText('手动复制');
  const fallback = current.getByRole('textbox', { name: '完整对照链接', exact: true });
  await expect(fallback).toHaveAttribute('readonly', '');
  expect(new URL(await fallback.inputValue()).searchParams.toString()).toBe(CASES[0].query);
  await fallback.focus();
  expect(
    await fallback.evaluate((element) => {
      const area = element as HTMLTextAreaElement;
      return [area.selectionStart, area.selectionEnd];
    }),
  ).toEqual([0, (await fallback.inputValue()).length]);
  expect(page.url()).toBe(before);
  await page.getByRole('radio', { name: '等资源', exact: true }).first().click();
  await expect(current.getByRole('status')).toHaveCount(0);
  await expect(current.getByRole('textbox')).toHaveCount(0);
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'] as const) {
    test('#372 四宽明暗 ' + width + ' ' + theme, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/duel');
      await expect(region(page)).toBeVisible();
      await page.getByRole('button', { name: '查看波希米亚预置', exact: true }).click();
      await expect(region(page)).toBeFocused();
      await unblockedTitle(page, region(page).getByRole('heading', { level: 2 }));
      await page.evaluate(() => document.fonts.ready);
      for (const action of await region(page).locator('a,button').all()) {
        const box = await action.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
      }
      for (const number of await region(page).locator('.num.nw').all())
        expect(await number.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe('nowrap');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).include('#duel-presets').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      expect((await new AxeBuilder({ page }).include('main').withRules(['heading-order', 'page-has-heading-one']).analyze()).violations).toEqual([]);
      await page.screenshot({ path: info.outputPath('duel-presets-' + width + '-' + theme + '.png'), fullPage: true, animations: 'disabled' });
      await region(page).screenshot({ path: info.outputPath('duel-presets-cards-' + width + '-' + theme + '.png'), animations: 'disabled' });
      await card(page, CASES[0].key).getByRole('link', { name: '打开对照', exact: true }).click();
      await configured(page, CASES[0]);
      await unblockedTitle(page, page.locator('#duel .lhead h1'));
      await expect(page.locator('#duel')).toBeFocused();
    });
  }
