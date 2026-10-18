import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** #6 浅色编辑风：首屏信息、深浅主题、移动触控与详情数据在改版后保持可用。 */
const WIDTHS = [360, 375, 390, 1280];
const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];
const STORAGE_KEY = 'aoe2-theme';
type UnitStats = { id: number; hp: number; atk: number; up: [Record<string, number>, number] | null };
const UNITS = JSON.parse(readFileSync('src/data/units.json', 'utf8')) as UnitStats[];
const BASE = UNITS.find((unit) => unit.id === 281)!;
const ELITE = UNITS.find((unit) => unit.id === 531)!;
const PAGES = [
  ['', '#home .hcard'],
  ['unit/531', '#unit h1'],
  ['civ/Franks', '#detail h1'],
  ['tech/22', '#tech h1'],
  ['building/12', '#building h1'],
  ['units', '#ugrid .card'],
  ['unit/569/Franks/4', '#sim .simtab'],
  ['duel', '#duel-res'],
  ['builds?bo=scouts-18', '.tl-steps'],
  ['patches/185872', '.patch-entry'],
  ['maps', '.map-guide article'],
] as const;

async function chooseInitialTheme(page: Page, theme: Theme) {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: STORAGE_KEY, value: theme });
}

async function ready(page: Page, route: string, selector: string) {
  await page.goto('./#/' + route);
  await expect(page.locator(selector).first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function undersizedMobileControls(page: Page) {
  return page
    .locator(
      'button, select, summary, [role="tab"], ' +
        'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="hidden"]), ' +
        '.civchip, a.dlcb, .fbbtn, .cp-trigger, .brow-h, .tag.tagl, .eseg a, ' +
        'label:has(> input[type="checkbox"]), label:has(> input[type="radio"])',
    )
    .evaluateAll((controls) =>
      controls.flatMap((control) => {
        if (control.closest('td, th, svg')) return [];
        const rect = control.getBoundingClientRect();
        if (!rect.width || !rect.height || getComputedStyle(control).visibility === 'hidden') return [];
        return rect.height >= 44 ? [] : [{ name: control.getAttribute('aria-label') ?? control.textContent?.trim(), height: rect.height }];
      }),
    );
}

for (const width of WIDTHS)
  for (const theme of THEMES)
    test(`#6 ${theme} @${width}：主要页面无横向溢出或运行错误`, async ({ page }, info) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width, height: 900 });
      await chooseInitialTheme(page, theme);
      const errors = collectErrors(page);
      for (const [route, selector] of PAGES) {
        await ready(page, route, selector);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route || '首页').toBe(true);
        if (width <= 600) expect(await undersizedMobileControls(page), route || '首页').toEqual([]);
      }
      await page.screenshot({ path: info.outputPath(`maps-${theme}-${width}.png`), fullPage: true });
      expect(errors).toEqual([]);
    });

for (const width of [390, 1280])
  for (const theme of THEMES)
    test(`#6 ${theme} @${width}：首页、单位、文明评分、列表和模拟器文字满足 AA`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width, height: 900 });
      await chooseInitialTheme(page, theme);
      for (const [route, selector] of [
        ['', '#home .hcard'],
        ['unit/531', '#unit h1'],
        ['civ/Franks?tab=data', '.ratehead'],
        ['units', '#ugrid .card'],
        ['unit/569/Franks/4', '#sim .simtab'],
      ]) {
        await ready(page, route!, selector!);
        const result = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
        expect(
          result.violations.map((violation) => ({
            id: violation.id,
            nodes: violation.nodes.map((node) => ({ target: node.target, reason: node.failureSummary })),
          })),
          route || '首页',
        ).toEqual([]);
      }
    });

test('#6 首次访问默认浅色，主题菜单可用键盘关闭并恢复焦点', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await ready(page, '', '#home .hcard');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const trigger = page.getByRole('button', { name: '主题：浅色', exact: true });
  await trigger.click();
  await expect(page.getByRole('menuitemradio', { name: '浅色', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitemradio', { name: '深色', exact: true })).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.locator('#home h1').click();
  await expect(page.getByRole('menuitemradio', { name: '深色', exact: true })).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('#6 主题选择经刷新保留，系统选项响应系统变化，分享 URL 不混入主题', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.emulateMedia({ colorScheme: 'light' });
  await ready(page, 'unit/281', '#unit h1');
  const url = page.url();
  await page.getByRole('button', { name: '主题：浅色', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '深色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(page.url()).toBe(url);
  await page.locator('#unit .dhead').getByRole('button', { name: '复制链接', exact: true }).click();
  const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  expect(copied.pathname).toMatch(/\/unit\/281\/$/);
  expect(copied.searchParams.has('theme')).toBe(false);
  expect(copied.hash).not.toContain('theme');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: '主题：深色', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '跟随系统', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(page.url()).toBe(url);
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe('system');
});

for (const width of [360, 375, 390])
  test(`#6 @${width}：手机抽屉外观切换、导航和触控目标可用`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await ready(page, '', '#home .hcard');
    const menu = page.getByRole('button', { name: '菜单', exact: true });
    await menu.click();
    const nav = page.getByRole('dialog', { name: '主导航', exact: true });
    const appearance = nav.getByRole('radiogroup', { name: '外观', exact: true });
    await appearance.getByRole('radio', { name: '深色', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(appearance.getByRole('radio', { name: '深色', exact: true })).toHaveAttribute('aria-checked', 'true');
    for (const button of await appearance.getByRole('radio').all()) {
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(nav).toBeHidden();
    await expect(menu).toBeFocused();
    await menu.click();
    await nav.getByRole('link', { name: '单位', exact: true }).click();
    await expect(page.locator('#ugrid .card').first()).toBeVisible();
    await expect(nav).toBeHidden();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

for (const width of WIDTHS)
  test(`#6 @${width}：首页首屏可搜索并看到至少四个资料入口`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await ready(page, '', '#home .hcard');
    const search = page.locator('#home .herosearch');
    await expect(search).toBeInViewport({ ratio: 1 });
    const visibleCards = await page.locator('#home .hcard').evaluateAll(
      (cards) =>
        cards.filter((card) => {
          const rect = card.getBoundingClientRect();
          return rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth;
        }).length,
    );
    expect(visibleCards).toBeGreaterThanOrEqual(4);
    await search.click();
    await expect(page.getByPlaceholder(/搜索文明、单位、科技/)).toBeFocused();
    await page.keyboard.press('Escape');
    await page.screenshot({ path: info.outputPath(`home-light-${width}.png`), fullPage: true });
  });

for (const [route, root, tab, selected] of [
  ['unit/281', '#unit', /^科技模拟器$/, 'sim'],
  ['civ/Franks', '#detail', /^数据$/, 'data'],
  ['building/12', '#building', /^生产（\d+）$/, 'prod'],
  ['tech/22', '#tech', /^作用对象$/, 'affects'],
] as const)
  test(`#6 ${route}：唯一 H1、页头复制链接与内容页签经刷新保留`, async ({ page }) => {
    await ready(page, route, `${root} h1`);
    await expect(page.locator('main h1')).toHaveCount(1);
    const head = page.locator(`${root} .dhead`);
    await expect(head.getByRole('button', { name: '复制链接', exact: true })).toBeVisible();
    await expect(head.getByRole('button')).toHaveCount(1);
    await page.locator(root).getByRole('tab', { name: tab, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]tab=${selected}(?:&|$)`));
    await page.reload();
    await expect(page.locator(root).getByRole('tab', { name: tab, exact: true })).toHaveAttribute('aria-selected', 'true');
  });

for (const width of WIDTHS)
  test(`#6 @${width}：属性块呈现数据、精锐增量与升级费用，切回普通版同步还原`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await ready(page, 'unit/531', '#unit h1');
    const stats = page.getByRole('region', { name: '基础属性', exact: true });
    await expect(stats).toBeVisible();
    for (const key of ['hp', 'atk'] as const) {
      const item = stats.locator(`[data-stat="${key}"]`);
      await expect(item.locator('[data-t="stat-value"]')).toHaveText(String(ELITE[key]));
      await expect(item.locator('[data-t="stat-delta"]')).toHaveText('+' + (ELITE[key] - BASE[key]));
    }
    await expect(stats.locator('.is-key')).toHaveCount(2);
    const columns = await stats.locator('[data-stat]').evaluateAll((items) => {
      const firstTop = items[0]!.getBoundingClientRect().top;
      return items.filter((item) => Math.abs(item.getBoundingClientRect().top - firstTop) < 1).length;
    });
    expect(columns).toBe(width <= 600 ? 2 : 4);
    const production = page.getByRole('region', { name: '造价与生产', exact: true });
    await expect(production).toBeVisible();
    const firstSection = page.locator('#unit .dmain > section').first();
    await expect(firstSection).toHaveAttribute('aria-label', '造价与生产');
    const upgrade = page.locator('#ediff');
    for (const cost of Object.values(ELITE.up![0])) await expect(upgrade).toContainText(String(cost));
    await expect(upgrade).toContainText(String(ELITE.up![1]));
    await expect(upgrade.locator('table.ediff')).toHaveCount(0);
    const eliteSwitch = page.getByRole('radiogroup', { name: '普通/精锐', exact: true });
    await eliteSwitch.getByRole('radio', { name: '普通', exact: true }).click();
    await expect(page).toHaveURL(/#\/unit\/281(?:\?|$)/);
    for (const key of ['hp', 'atk'] as const) {
      await expect(stats.locator(`[data-stat="${key}"] [data-t="stat-value"]`)).toHaveText(String(BASE[key]));
    }
    await expect(stats.locator('[data-t="stat-delta"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

test('#6 文明评分明确为主观数据，仅两个关键评分强调，开局建议置首', async ({ page }) => {
  await ready(page, 'civ/Franks', '#detail h1');
  const opening = page.locator('#detail .dmain > section').first();
  await expect(opening).toHaveAttribute('aria-label', '开局建议');
  await expect(opening.locator('a[href^="#/builds?bo="]').first()).toBeVisible();
  await page.getByRole('tab', { name: '数据', exact: true }).click();
  await expect(page.locator('.ratehead')).toContainText('主观评分，仅供参考');
  const ratings = page.locator('#detail [data-stat^="rating-"]');
  await expect(ratings).toHaveCount(8);
  await expect(page.locator('#detail [data-stat^="rating-"].is-key')).toHaveCount(2);
  await expect(page.locator('#detail [data-stat="rating-0"]')).toHaveClass(/\bis-key\b/);
  await expect(page.locator('#detail [data-stat="rating-3"]')).toHaveClass(/\bis-key\b/);
});
