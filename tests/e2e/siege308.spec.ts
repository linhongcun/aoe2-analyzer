// #308 攻城拆建筑用时：失败验收（Kent）。只编码验收，不实现 #/siege。
// 当前 main 没有该页，用例应红。不要改这些期望去凑绿，也不要改 tests/**/v0*-acceptance*。
//
// 路由（2026-10-30 锁定）：独立工具页 #/siege，不是单位 PK（#/duel）里的模式。
// 深链（本文件写死；省略 civ、armor 表示无攻方文明加成、无守方建筑护甲科技）：
//   #/siege?unit=<单位 id>&n=<数量>&bldg=<建筑 id>&civ=<文明英文名>&armor=<护甲科技标记>
// 控件：原生 select / 数字输入，option 的 value 用数据 id；可见文字用中文名。
// 结果契约：data-testid="siege-page|siege-result|siege-hits|siege-game-seconds|siege-real-seconds|siege-compare"
//
// 数值只覆盖简表已经闭合的冲车系（与单位 PK damagePerHit、首击 t=0 相同）：
//   每击 = max(1, Σ max(0, 攻击 − 护甲))；护甲只用建筑物的近战 ma 与「所有建筑」barm（类别 11，
//   scripts/buildings_build.py、tests/unit/buildingSim.test.ts）。冲车另有「攻城武器」攻击，
//   建筑简表没有该类别，不计入。N 台理想齐射：击数 = ceil(hp / (N × 每击))，游戏秒 = (击数 − 1) × 攻击间隔。
//   不含走位、展开、前摇、飞行、修理、反击。现实秒 = 游戏秒 / 1.7（#266），显示容差 ±0.05。
// 攻城锤 1258：所有建筑 150、近战 2、间隔 5（src/data/units.json）。
//   城镇中心 109：2400 血、ma 3、barm 0 → 每击 150；1 台 = 16 击、75 游戏秒。barm 0 按「类别在、护甲 0」。
//   城堡 82：4800 血、ma 8、barm 8 → 每击 142；1 台 = 34 击、165 游戏秒；4 台 = 9 击、40 游戏秒。
//   瞭望箭塔 79：850 血、ma 1、barm 0 → 每击 151；1 台 = 6 击、25 游戏秒。
// 手推炮的「石质防御」不在 buildings.json，不写黄金秒数。
// 投石车 280/550/588 的主弹/副弹结算在 DE 188329 仍未核实：选择器可以有，但不得给出完整用时。
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const SPEED = 1.7;
const REAL_TOLERANCE = 0.05;
const EMOJI = /\p{Extended_Pictographic}/u;

function hashParams(url: string): URLSearchParams {
  const hash = new URL(url).hash;
  const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  return new URLSearchParams(query);
}

function siegeHref(href: string | null): boolean {
  if (!href) return false;
  const hash = href.includes('#') ? href.slice(href.indexOf('#') + 1) : href;
  const path = hash.split('?')[0];
  return path === '/siege' || path === '/siege/';
}

async function siegeLinks(scope: Locator) {
  const links = await scope
    .locator('a[href]')
    .evaluateAll((els) => els.map((el) => ({ href: el.getAttribute('href'), text: (el.textContent ?? '').replace(/\s+/g, ' ').trim() })));
  return links.filter((link) => siegeHref(link.href));
}

/** 当前 main 会停在这里：#/siege 仍是「找不到该页」。后面的结果断言要等页面落地才执行。 */
async function expectSiegePage(page: Page) {
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  expect(await page.getByRole('heading', { level: 1, name: '找不到该页', exact: true }).count(), '#/siege 应是攻城拆建筑页').toBe(0);
  const root = page.getByTestId('siege-page');
  await expect(root).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: /攻城|拆建筑/ })).toBeVisible();
  await expect(root).toContainText(/理想/);
  await expect(root).toContainText(/1\.7/);
  await expect(root).toContainText(/走位|展开|前摇|修理|反击/);
  await expect(page.locator('footer')).toContainText(/DE\s*188329/);
  expect(await root.innerText()).not.toMatch(EMOJI);
  const icons = root.locator('svg');
  const count = await icons.count();
  for (let i = 0; i < count; i++) await expect(icons.nth(i)).toHaveClass(/lucide/);
  return root;
}

async function expectNowrapMetric(locator: Locator, text: RegExp) {
  await expect(locator).toHaveText(text);
  await expect(locator).toHaveClass(/\bnum\b/);
  const box = await locator.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
    const style = getComputedStyle(el);
    return {
      lines: lines.size,
      nowrap: el.classList.contains('nw') || style.whiteSpace === 'nowrap' || style.whiteSpace === 'pre',
    };
  });
  expect(box.lines).toBeLessThanOrEqual(1);
  expect(box.nowrap).toBe(true);
}

async function expectRealSeconds(locator: Locator, gameSeconds: number) {
  await expectNowrapMetric(locator, /^\d+(?:\.\d+)?(?:\s*现实秒)?$/);
  const value = Number((await locator.innerText()).match(/\d+(?:\.\d+)?/)?.[0]);
  expect(Math.abs(value - gameSeconds / SPEED)).toBeLessThanOrEqual(REAL_TOLERANCE);
}

async function expectDemolition(page: Page, hits: number, gameSeconds: number) {
  const result = page.getByTestId('siege-result');
  await expect(result.getByText('击数', { exact: true })).toBeVisible();
  await expect(result.getByText('游戏秒', { exact: true })).toBeVisible();
  await expect(result.getByText('现实秒', { exact: true })).toBeVisible();
  await expectNowrapMetric(page.getByTestId('siege-hits'), new RegExp(`^${hits}(?:\\s*下)?$`));
  await expectNowrapMetric(page.getByTestId('siege-game-seconds'), new RegExp(`^${gameSeconds}(?:\\.0+)?(?:\\s*游戏秒)?$`));
  await expectRealSeconds(page.getByTestId('siege-real-seconds'), gameSeconds);
}

async function expectRow(table: Locator, name: RegExp, hits: number, gameSeconds: number) {
  const row = table.getByRole('row', { name });
  await expect(row).toBeVisible();
  const numbers = ((await row.innerText()).match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  expect(numbers).toContain(hits);
  expect(numbers).toContain(gameSeconds);
  expect(numbers.some((n) => Math.abs(n - gameSeconds / SPEED) <= REAL_TOLERANCE)).toBe(true);
}

test('#308 #/siege 不是找不到该页，工具导航和首页都有入口', async ({ page }) => {
  await page.goto('./#/siege');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  const notFound = await page.getByRole('heading', { level: 1, name: '找不到该页', exact: true }).count();
  await page.goto('./#/');
  await expect(page.locator('#home')).toBeVisible();
  await page.getByRole('button', { name: '工具', exact: true }).click();
  const menu = page.locator('#tools-menu');
  await expect(menu).toBeVisible();
  const home = await siegeLinks(page.locator('#home'));
  const tools = await siegeLinks(menu);
  expect({
    notFound,
    home: home.some((link) => /攻城|拆建筑/.test(link.text)),
    tools: tools.some((link) => /攻城|拆建筑/.test(link.text)),
  }).toEqual({ notFound: 0, home: true, tools: true });
  await menu.locator('a[href*="/siege"]').first().click();
  await expect(page).toHaveURL(/#\/siege\/?(?:\?|$)/);
  await expectSiegePage(page);
  await expect(page.getByLabel('攻城单位', { exact: true })).toBeVisible();
  await expect(page.getByLabel('数量', { exact: true })).toBeVisible();
  await expect(page.getByLabel('目标建筑', { exact: true })).toBeVisible();
  await expect(page.getByLabel('攻方文明', { exact: true })).toBeVisible();
});

test('#308 1 台攻城锤拆城镇中心：16 击、75 游戏秒、约 44.12 现实秒', async ({ page }) => {
  await page.goto('./#/siege');
  await expectSiegePage(page);
  await page.getByLabel('攻城单位', { exact: true }).selectOption('1258');
  await page.getByLabel('数量', { exact: true }).fill('1');
  await page.getByLabel('目标建筑', { exact: true }).selectOption('109');
  await expect.poll(() => hashParams(page.url()).get('unit')).toBe('1258');
  await expect.poll(() => hashParams(page.url()).get('n')).toBe('1');
  await expect.poll(() => hashParams(page.url()).get('bldg')).toBe('109');
  await expect(page.getByLabel('攻城单位', { exact: true }).locator('option:checked')).toHaveText(/攻城锤/);
  await expect(page.getByLabel('目标建筑', { exact: true }).locator('option:checked')).toHaveText(/城镇中心/);
  await expectDemolition(page, 16, 75);
});

test('#308 深链还原 4 台攻城锤与城堡，并给出 9 击、40 游戏秒', async ({ page }) => {
  await page.goto('./#/siege?unit=1258&n=4&bldg=82');
  await expectSiegePage(page);
  await expect(page.getByLabel('攻城单位', { exact: true })).toHaveValue('1258');
  await expect(page.getByLabel('数量', { exact: true })).toHaveValue('4');
  await expect(page.getByLabel('目标建筑', { exact: true })).toHaveValue('82');
  await expect(page.getByLabel('攻城单位', { exact: true }).locator('option:checked')).toHaveText(/攻城锤/);
  await expect(page.getByLabel('目标建筑', { exact: true }).locator('option:checked')).toHaveText(/城堡/);
  await expectDemolition(page, 9, 40);
  await page.reload();
  await expect(page.getByLabel('攻城单位', { exact: true })).toHaveValue('1258');
  await expect(page.getByLabel('数量', { exact: true })).toHaveValue('4');
  await expect(page.getByLabel('目标建筑', { exact: true })).toHaveValue('82');
  await expectDemolition(page, 9, 40);
  const query = hashParams(page.url());
  expect(query.get('unit')).toBe('1258');
  expect(query.get('n')).toBe('4');
  expect(query.get('bldg')).toBe('82');
});

test('#308 同一台攻城锤的对照表含城镇中心、城堡、瞭望箭塔', async ({ page }) => {
  await page.goto('./#/siege?unit=1258&n=1&bldg=109');
  await expectSiegePage(page);
  const table = page.getByTestId('siege-compare').getByRole('table', { name: /对照/ });
  await expect(table).toBeVisible();
  await expect(table.getByRole('columnheader', { name: /击数|下数/ })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: '游戏秒', exact: true })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: '现实秒', exact: true })).toBeVisible();
  await expectRow(table, /城镇中心/, 16, 75);
  await expectRow(table, /城堡/, 34, 165);
  await expectRow(table, /瞭望箭塔/, 6, 25);
});

test('#308 轻型、中型、重型投石车未核实，不给出完整用时', async ({ page }) => {
  for (const [id, name] of [
    ['280', '轻型投石车'],
    ['550', '中型投石车'],
    ['588', '重型投石车'],
  ] as const) {
    await page.goto(`./#/siege?unit=${id}&n=1&bldg=82`);
    await expectSiegePage(page);
    await expect(page.getByLabel('攻城单位', { exact: true })).toHaveValue(id);
    await expect(page.getByLabel('攻城单位', { exact: true }).locator('option:checked')).toHaveText(new RegExp(name));
    await expect(page.getByTestId('siege-page')).toContainText(/未核实|暂不计算/);
    await expect(page.getByTestId('siege-hits')).toHaveCount(0);
    await expect(page.getByTestId('siege-game-seconds')).toHaveCount(0);
    await expect(page.getByTestId('siege-real-seconds')).toHaveCount(0);
    await expect(page.getByTestId('siege-page')).not.toContainText(/\d+(?:\.\d+)?\s*游戏秒/);
  }
});

test('#308 城镇中心勾选驻满村民后，冲车用时不变并标明未计入', async ({ page }) => {
  await page.goto('./#/siege?unit=1258&n=1&bldg=109');
  await expectSiegePage(page);
  await expectDemolition(page, 16, 75);
  const garrison = page.getByRole('checkbox', { name: '驻满村民', exact: true }).or(page.getByRole('switch', { name: '驻满村民', exact: true }));
  await garrison.check();
  await expect(garrison).toBeChecked();
  await expectDemolition(page, 16, 75);
  await expect(page.getByTestId('siege-page')).toContainText(/驻[^。\n]{0,24}未计入|未计入[^。\n]{0,24}驻/);
});

for (const width of [360, 375, 390, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`#308 ${theme} @${width} 无横向滚动、数字不折行、触控不小于 44`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/siege?unit=1258&n=1&bldg=109');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const root = await expectSiegePage(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const metrics = root.locator('.num');
      const metricCount = await metrics.count();
      expect(metricCount).toBeGreaterThan(0);
      for (let i = 0; i < metricCount; i++) {
        const lines = await metrics.nth(i).evaluate((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
        });
        expect(lines).toBeLessThanOrEqual(1);
      }
      const targets = await root.locator('button, input, select, [role="checkbox"], [role="switch"]').evaluateAll((els) =>
        els
          .filter((el) => {
            const style = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
          })
          .map((el) => {
            const rect = el.getBoundingClientRect();
            const labelled = el instanceof HTMLInputElement || el instanceof HTMLSelectElement ? el.labels?.[0]?.textContent : '';
            return {
              name: (el.getAttribute('aria-label') || labelled || el.textContent || el.tagName).replace(/\s+/g, ' ').trim(),
              width: rect.width,
              height: rect.height,
            };
          }),
      );
      expect(targets.length).toBeGreaterThan(0);
      for (const target of targets) {
        expect(target.width, target.name).toBeGreaterThanOrEqual(44);
        expect(target.height, target.name).toBeGreaterThanOrEqual(44);
      }
      if ((width === 1280 && theme === 'light') || (width === 360 && theme === 'dark')) {
        const violations = (await new AxeBuilder({ page }).include('[data-testid="siege-page"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations;
        expect(violations).toEqual([]);
      }
      expect(errors).toEqual([]);
    });
  }
}
