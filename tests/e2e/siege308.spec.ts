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
// 攻城锤 1258：所有建筑 150、近战 2、间隔 5（data/game/units.json）。
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
            // 复选框本体保持原生约 20px（Jony 视觉审），触控区按包裹它的 label 计；桌面 ToolPageHeader 按钮用 44px ::after 热区。
            const hit = el instanceof HTMLInputElement && el.type === 'checkbox' && el.labels?.[0] ? el.labels[0] : el;
            const rect = hit.getBoundingClientRect();
            const afterH = el.closest('.tool-head-actions') ? parseFloat(getComputedStyle(el, '::after').height) || 0 : 0;
            const labelled = el instanceof HTMLInputElement || el instanceof HTMLSelectElement ? el.labels?.[0]?.textContent : '';
            return {
              name: (el.getAttribute('aria-label') || labelled || el.textContent || el.tagName).replace(/\s+/g, ' ').trim(),
              width: rect.width,
              height: Math.max(rect.height, afterH),
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

test.describe('Issue 1472: 攻城数量非法输入反馈、暂停计算与恢复', () => {
  test('非法输入失焦保留草稿、字段旁与结果区唯一 alert、禁复制清旧状态及多路径恢复', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.resolve() }, configurable: true });
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('./#/siege?unit=1258&n=4&bldg=82');
    await expectSiegePage(page);

    const countInput = page.getByLabel('数量', { exact: true });
    const unitSelect = page.getByLabel('攻城单位', { exact: true });
    const decBtn = page.getByRole('button', { name: '减少一台', exact: true });
    const incBtn = page.getByRole('button', { name: '增加一台', exact: true });
    const copyBtn = page.locator('header.tool-head .tool-head-actions button').first();
    const fieldError = page.locator('#siege-count-error');
    const invalidCard = page.getByTestId('siege-invalid');

    // 先复制一次，验证进入非法态后清空「已复制」状态文案与按钮标签
    await copyBtn.click();
    await expect(copyBtn).toHaveText('已复制');
    await expect(page.locator('.siege-share-status')).toContainText('链接已复制');

    const cases: readonly [string, boolean, boolean][] = [
      ['41', true, false],
      ['0', false, true],
      ['-1', false, true],
      ['1.5', true, true],
      ['abc', true, true],
      ['1e2', true, true],
      [' 4', true, true],
      ['', false, true],
    ];
    for (const [raw, canDec, canInc] of cases) {
      await countInput.fill(raw);
      await unitSelect.focus();
      await expect(countInput).toHaveValue(raw);
      expect(hashParams(page.url()).get('n')).toBe('4');
      await expect(countInput).toHaveAttribute('aria-invalid', 'true');
      await expect(countInput).toHaveAttribute('aria-describedby', 'siege-count-error');
      await expect(page.locator('.siege-stepper')).toHaveClass(/\bis-invalid\b/);
      await expect(fieldError).toHaveText('数量须为 1–40 的整数。');
      expect(await fieldError.getAttribute('role')).toBeNull();
      await expect(page.getByTestId('siege-result')).toHaveCount(0);
      await expect(page.getByTestId('siege-compare')).toHaveCount(0);
      await expect(page.getByTestId('siege-unverified')).toHaveCount(0);
      await expect(invalidCard).toHaveAttribute('role', 'alert');
      await expect(invalidCard.getByRole('heading', { name: '输入无效，暂停计算' })).toBeVisible();
      await expect(invalidCard.locator('p')).toHaveText('攻城数量须为 1–40 的整数。请修改「数量」，或点步进按钮、常用数量（1 / 4 / 6）恢复计算。');
      await expect(page.locator('[role="alert"]')).toHaveCount(1);
      await expect(copyBtn).toBeDisabled();
      await expect(copyBtn).toHaveText('复制分享链接');
      await expect(page.locator('.siege-share-status')).toHaveText('');
      for (const chip of ['1', '4', '6'])
        await expect(page.locator('.siege-chips').getByRole('button', { name: chip, exact: true })).toHaveAttribute('aria-pressed', 'false');
      await expect(decBtn).toBeEnabled({ enabled: canDec });
      await expect(incBtn).toBeEnabled({ enabled: canInc });
    }

    // 步进器确定性恢复：41 → 40、0 → 1、1.5 → 1/2、abc → 1
    await countInput.fill('41');
    await decBtn.click();
    await expect(countInput).toHaveValue('40');
    expect(hashParams(page.url()).get('n')).toBe('40');
    await expect(page.getByTestId('siege-result')).toBeVisible();
    expect([await countInput.getAttribute('aria-invalid'), await countInput.getAttribute('aria-describedby')]).toEqual([null, null]);
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
    await expect(copyBtn).toBeEnabled();

    for (const [raw, btn, expected] of [
      ['0', incBtn, '1'],
      ['1.5', decBtn, '1'],
      ['1.5', incBtn, '2'],
      ['abc', decBtn, '1'],
    ] as const) {
      await countInput.fill(raw);
      await btn.click();
      await expect(countInput).toHaveValue(expected);
    }

    // 同值芯片恢复（原 URL 为 n=4，输入 0 后点芯片 4 立即恢复）
    const chip4 = page.locator('.siege-chips').getByRole('button', { name: '4', exact: true });
    await chip4.click();
    await countInput.fill('0');
    await expect(invalidCard).toBeVisible();
    await chip4.click();
    await expect(countInput).toHaveValue('4');
    await expect(chip4).toHaveAttribute('aria-pressed', 'true');
    await expectDemolition(page, 9, 40);

    // 键盘输入合法值 6 恢复并重载保留
    await countInput.fill('41');
    await countInput.fill('6');
    await expect(fieldError).toHaveCount(0);
    await expect(invalidCard).toHaveCount(0);
    expect([await countInput.getAttribute('aria-invalid'), await countInput.getAttribute('aria-describedby')]).toEqual([null, null]);
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
    expect(hashParams(page.url()).get('n')).toBe('6');
    await expectDemolition(page, 6, 25);
    await expect(copyBtn).toBeEnabled();
    await page.reload();
    await expect(countInput).toHaveValue('6');
    await expectDemolition(page, 6, 25);
    expect(errors).toEqual([]);
  });

  test('非数量控件联动优先保错、历史回退重置草稿与非法深链保持规范化', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('./#/siege?unit=1258&n=6&bldg=82');
    await expect(page.getByTestId('siege-result')).toBeVisible();
    await page.goto('./#/siege?unit=1258&n=4&bldg=82');
    await expect(page.getByTestId('siege-result')).toBeVisible();

    const countInput = page.getByLabel('数量', { exact: true });
    const unitSelect = page.getByLabel('攻城单位', { exact: true });
    await countInput.fill('41');
    await expect(page.getByTestId('siege-invalid')).toBeVisible();

    // 切至未核实单位 280 轻型投石车：保持输入报错，不被未核实卡掩盖
    await unitSelect.selectOption('280');
    await expect(countInput).toHaveValue('41');
    expect([hashParams(page.url()).get('unit'), hashParams(page.url()).get('n')]).toEqual(['280', '4']);
    await expect(page.getByTestId('siege-invalid')).toBeVisible();
    await expect(page.getByTestId('siege-unverified')).toHaveCount(0);
    await expect(page.locator('[role="alert"]')).toHaveCount(1);

    // 联动 #1469 攻方科技与目标建筑：保持草稿并同步单位量词
    await unitSelect.selectOption('1746');
    await page.getByLabel('攻方文明', { exact: true }).selectOption('Bengalis');
    await expect(page.getByRole('button', { name: '减少一头', exact: true })).toBeEnabled();
    await page.getByTestId('siege-attacker-techs').getByRole('button', { name: '攻方满科技', exact: true }).click();
    await page.getByLabel('目标建筑', { exact: true }).selectOption('109');
    await expect(countInput).toHaveValue('41');
    await expect(page.getByTestId('siege-invalid')).toBeVisible();

    // 切回 280 并改为合法 1：恢复未核实提示与反馈入口
    await unitSelect.selectOption('280');
    await countInput.fill('1');
    await expect(page.getByTestId('siege-invalid')).toHaveCount(0);
    await expect(page.getByTestId('siege-unverified').getByRole('link', { name: '反馈数据缺口', exact: true })).toBeVisible();

    // 浏览器后退重置本地非法草稿；直接打开非法深链仍按 decodeSiege 规范化
    await countInput.fill('41');
    await expect(page.getByTestId('siege-invalid')).toBeVisible();
    await page.goBack();
    await expect(countInput).toHaveValue('6');
    await expect(page.getByTestId('siege-invalid')).toHaveCount(0);
    await expect(page.getByTestId('siege-result')).toBeVisible();

    for (const [raw, expected] of [
      ['41', '40'],
      ['-1', '4'],
      ['1.5', '4'],
    ] as const) {
      await page.goto(`./#/siege?n=${raw}`);
      await expect(countInput).toHaveValue(expected);
      expect(await countInput.getAttribute('aria-invalid')).toBeNull();
      await expect(page.locator('#siege-count-error')).toHaveCount(0);
      await expect(page.locator('[role="alert"]')).toHaveCount(0);
      await expect(page.getByTestId('siege-result')).toBeVisible();
    }
  });

  for (const [width, height, theme, raw] of [
    [390, 844, 'light', '0'],
    [360, 800, 'light', '1.5'],
    [1280, 900, 'dark', '41'],
    [360, 800, 'dark', ''],
  ] as const) {
    test(`非法态 ${theme} @${width}×${height}（输入 ${JSON.stringify(raw)}）：零溢出、不折行、触控 ≥44 与 Axe WCAG AA`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await page.setViewportSize({ width, height });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/siege?unit=1258&n=4&bldg=82');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const countInput = page.getByLabel('数量', { exact: true });
      await countInput.fill(raw);
      await page.getByLabel('攻城单位', { exact: true }).focus();
      await expect(page.locator('#siege-count-error')).toBeVisible();
      await expect(page.getByTestId('siege-invalid')).toBeVisible();

      if (width === 390) {
        const [inputBox, errBox, barBox] = await Promise.all([
          countInput.boundingBox(),
          page.locator('#siege-count-error').boundingBox(),
          page.locator('header.tool-head .tool-head-actions').boundingBox(),
        ]);
        expect(inputBox && errBox && barBox).toBeTruthy();
        expect(inputBox!.y).toBeGreaterThanOrEqual(0);
        expect(errBox!.y + errBox!.height).toBeLessThanOrEqual(barBox!.y);
      }

      const root = page.getByTestId('siege-page');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(await root.innerText()).not.toMatch(EMOJI);
      for (let i = 0; i < (await root.locator('svg').count()); i++) await expect(root.locator('svg').nth(i)).toHaveClass(/lucide/);
      for (const sel of ['.num:not(input)', '.nw'] as const) {
        const nodes = root.locator(sel);
        for (let i = 0; i < (await nodes.count()); i++) {
          const lines = await nodes.nth(i).evaluate((el) => {
            const r = document.createRange();
            r.selectNodeContents(el);
            return new Set([...r.getClientRects()].filter((b) => b.width > 0 && b.height > 0).map((b) => Math.round(b.top))).size;
          });
          expect(lines, `${sel}[${i}]`).toBeLessThanOrEqual(1);
        }
      }
      const controls = await root.locator('.siege-inputs button, .siege-inputs input, .siege-inputs select').evaluateAll((els) =>
        els
          .filter((el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0)
          .map((el) => {
            const rect = (el instanceof HTMLInputElement && el.type === 'checkbox' && el.labels?.[0] ? el.labels[0] : el).getBoundingClientRect();
            return { w: rect.width, h: rect.height };
          }),
      );
      for (const c of controls) {
        expect(c.w).toBeGreaterThanOrEqual(44);
        expect(c.h).toBeGreaterThanOrEqual(44);
      }
      expect((await new AxeBuilder({ page }).include('[data-testid="siege-page"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
});
