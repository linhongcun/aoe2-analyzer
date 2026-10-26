import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const CASES = [
  {
    key: 'castle-britons-byzantines',
    query: 'a=2700.Britons.3..&b=39.Byzantines.3..&m=1',
    unitA: '骑马弩兵',
    civA: '不列颠',
    unitB: '骑射手',
    age: '城堡时代',
  },
  { key: 'castle-franks-byzantines', query: 'a=2700.Franks.3..&b=39.Byzantines.3..&m=1', unitA: '骑马弩兵', civA: '法兰克', unitB: '骑射手', age: '城堡时代' },
  {
    key: 'imperial-britons-byzantines',
    query: 'a=2701.Britons.4..&b=474.Byzantines.4..&m=1',
    unitA: '重装骑马弩兵',
    civA: '不列颠',
    unitB: '重装骑射手',
    age: '帝王时代',
  },
] as const;
const presets = (page: Page) => page.getByRole('region', { name: '骑马弩兵与骑射手预置', exact: true });
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') messages.push(message.text());
  });
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));

test('#441 185872补丁有三条真实文明预置入口', async ({ page }) => {
  await page.goto('./#/patches/185872');
  await expect(page.getByRole('heading', { name: 'DE Update 185872', exact: true })).toBeVisible();
  await expect(presets(page)).toBeVisible();
  for (const item of CASES) {
    const card = presets(page).locator(`[data-preset="${item.key}"]`);
    await expect(card.getByRole('link', { name: '打开对照', exact: true })).toHaveAttribute('href', `#/duel?${item.query}`);
    await expect(card).toContainText(item.civA);
    await expect(card).toContainText('拜占庭');
    await expect(card).toContainText('无可选科技');
  }
  await expect(presets(page)).toContainText(/DE\s*185872/);
  await expect(presets(page)).not.toContainText('通用');
  await expect(presets(page)).toContainText('王家敕令骑兵折扣未计入');
});

for (const item of CASES) {
  test(`#441 打开并刷新恢复${item.key}`, async ({ page }) => {
    await page.goto('./#/patches/185872?civ=Franks&q=骑马');
    await presets(page).locator(`[data-preset="${item.key}"]`).getByRole('link', { name: '打开对照', exact: true }).click();
    for (const reload of [false, true]) {
      if (reload) await page.reload();
      await expect(page.locator('#duel-res')).toBeVisible();
      expect(new URL(page.url()).hash).toBe(`#/duel?${item.query}`);
      await expect(page.locator('#duel-a .duel-head')).toContainText(item.unitA);
      await expect(page.locator('#duel-a .duel-head')).toContainText(item.civA);
      await expect(page.locator('#duel-b .duel-head')).toContainText(item.unitB);
      await expect(page.locator('#duel-b .duel-head')).toContainText('拜占庭');
      await expect(page.locator('#duel-a .duel-age')).toHaveText(item.age);
      await expect(page.locator('#duel-b .duel-age')).toHaveText(item.age);
      for (const side of ['a', 'b'])
        await expect(page.locator(`#duel-${side}`).getByRole('radio', { name: '无科技', exact: true })).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByRole('radio', { name: '1v1', exact: true })).toHaveAttribute('aria-checked', 'true');
    }
  });
}

test('#441 从静态补丁路径复制稳定URL，重开及刷新恢复完整配置', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as unknown as { copiedPreset: string }).copiedPreset = text;
        },
      },
    }),
  );
  await page.goto('./patches/185872/?civ=Franks&q=骑马');
  const before = page.url();
  const card = presets(page).locator('[data-preset="castle-franks-byzantines"]');
  await card.getByRole('button', { name: /复制对照链接/ }).click();
  await expect(card.getByRole('status')).toContainText('对照链接已复制。');
  expect(page.url()).toBe(before);
  const copied = await page.evaluate(() => (window as unknown as { copiedPreset: string }).copiedPreset);
  const url = new URL(copied);
  const projectBase = await page.evaluate(() => document.baseURI);
  expect(url.pathname).toBe(new URL('duel/', projectBase).pathname);
  expect(url.hash).toBe('');
  expect(url.searchParams.toString()).toBe(CASES[1].query);
  await page.goto(copied);
  for (const reload of [false, true]) {
    if (reload) await page.reload();
    await expect(page.locator('#duel-res')).toBeVisible();
    expect(new URL(page.url()).hash).toBe(`#/duel?${CASES[1].query}`);
    await expect(page.locator('#duel-a .duel-head')).toContainText('法兰克');
    await expect(page.locator('#duel-b .duel-head')).toContainText('拜占庭');
  }
});

test('#441 自动复制失败保留完整可选择复制的URL且不改筛选', async ({ page }) => {
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
  await page.goto('./#/patches/185872?civ=Britons');
  const card = presets(page).locator('[data-preset="castle-britons-byzantines"]');
  const before = page.url();
  await card.getByRole('button', { name: /复制对照链接/ }).click();
  await expect(card.getByRole('status')).toContainText('手动复制');
  const fallback = card.getByRole('textbox', { name: '完整对照链接', exact: true });
  await expect(fallback).toBeVisible();
  await expect(fallback).toHaveAttribute('readonly', '');
  const copied = new URL(await fallback.inputValue());
  expect(copied.searchParams.toString()).toBe(CASES[0].query);
  expect(page.url()).toBe(before);
});

test('#441 其他版本、索引和不存在的版本没有185872预置卡', async ({ page }) => {
  for (const path of ['/patches', '/patches/unknown', '/patches/125283']) {
    await page.goto(`./#${path}`);
    await expect(page.getByText('正在加载更新历史', { exact: true })).toHaveCount(0);
    await expect(presets(page)).toHaveCount(0);
  }
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark']) {
    test(`#441 四宽明暗入口布局${width} ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/patches/185872');
      const region = presets(page);
      await expect(region).toBeVisible();
      for (const action of await region.locator('a,button').all()) {
        const box = await action.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      await noOverflow(page);
      expect((await new AxeBuilder({ page }).include('[aria-label="骑马弩兵与骑射手预置"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      await page.screenshot({ path: info.outputPath(`mounted-crossbow-presets-${width}-${theme}.png`), fullPage: true });
    });
  }
