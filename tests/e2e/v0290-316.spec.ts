import { expect, test, type Page } from '@playwright/test';
import { guardPage, noOverflow, WIDTHS, wrappedNums } from './v0290-helpers';

/**
 * v0.29.0 验收（#329）B 组 #316 部分：取自 Kent Beck test/v0290-acceptance @ b34fc4c tests/e2e/v0290-B.spec.ts，断言原样未改。
 */
guardPage();

// ---------- #316 ----------
const menuButton = (page: Page) => page.getByRole('button', { name: '菜单', exact: true });
const toolsButton = (page: Page) => page.getByRole('button', { name: '工具', exact: true });
test.describe('#316 首页与导航', () => {
  test('首页四组卡片的「打开」提示一致（全显示或全不显示），读屏名称不重复「打开」', async ({ page }) => {
    await page.goto('./#/');
    const cards = page.locator('#home a.hcard');
    await expect(cards.first()).toBeVisible();
    // 按实际是否看得见判断（用 CSS 统一隐藏也算「都不显示」）
    const flags = await cards.evaluateAll((els) =>
      els.map((e) => [...e.querySelectorAll('.hc-open')].some((x) => x.getClientRects().length > 0 && getComputedStyle(x).visibility !== 'hidden')),
    );
    expect(new Set(flags).size, '全显示或全不显示').toBe(1);
    const names = await cards.evaluateAll((els) =>
      els.map((e) => {
        const clone = e.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('[aria-hidden="true"]').forEach((x) => x.remove());
        return e.getAttribute('aria-label') ?? clone.textContent ?? '';
      }),
    );
    expect(names.filter((n) => (n.match(/打开/g) ?? []).length > 1)).toEqual([]);
  });

  test('「侦察辨析」在首页卡片和工具菜单里是新措辞', async ({ page }) => {
    await page.goto('./#/');
    const NEW = '对照具体信号，判断对手在做什么，安排下一步';
    await expect(page.locator('#home a.hcard[href$="/scouting"]')).toContainText(NEW);
    await toolsButton(page).click();
    const panel = page.locator('#tools-menu');
    await expect(panel).toBeVisible();
    const text = await panel.innerText();
    expect(text).not.toContain('对照相容解释');
  });

  for (const width of [360, 375, 390])
    test(`@${width} 在工具页打开抽屉：「工具」默认展开、当前页高亮；Esc 关闭后焦点回到菜单按钮`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const [route, label] of [
        ['/builds', '开局流程'],
        ['/market', '市场买卖'],
        ['/scouting', '侦察辨析'],
      ] as const) {
        void label; // 按 href 定位，链接里加说明文字也不影响
        await page.goto('./#' + route);
        await menuButton(page).click();
        await expect(toolsButton(page), route).toHaveAttribute('aria-expanded', 'true');
        const current = page.locator(`#tools-menu a[href$="#${route}"]`);
        await expect(current).toBeVisible();
        await expect(current).toHaveAttribute('aria-current', 'page');
        await noOverflow(page);
      }
      for (let i = 0; i < 2 && (await page.locator('#main-navigation.open').count()); i++) await page.keyboard.press('Escape');
      await expect(page.locator('#main-navigation.open')).toHaveCount(0);
      await expect(menuButton(page)).toBeFocused();
    });

  for (const width of [360, 390])
    test(`守卫 @${width}：在首页、百科页打开抽屉，「工具」仍收起`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const route of ['/', '/civs', '/units']) {
        await page.goto('./#' + route);
        await menuButton(page).click();
        await expect(toolsButton(page), route).toHaveAttribute('aria-expanded', 'false');
        await page.keyboard.press('Escape');
      }
    });

  test('守卫 @360：工具页抽屉按 Esc 关闭，焦点回到菜单按钮', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('./#/builds');
    await menuButton(page).click();
    await expect(page.locator('#main-navigation.open')).toHaveCount(1);
    for (let i = 0; i < 2 && (await page.locator('#main-navigation.open').count()); i++) await page.keyboard.press('Escape');
    await expect(page.locator('#main-navigation.open')).toHaveCount(0);
    await expect(menuButton(page)).toBeFocused();
  });

  test('守卫 @1280：工具页上的桌面下拉菜单仍是点击才展开', async ({ page }) => {
    await page.goto('./#/builds');
    await expect(toolsButton(page)).toHaveAttribute('aria-expanded', 'false');
    await toolsButton(page).click();
    await expect(toolsButton(page)).toHaveAttribute('aria-expanded', 'true');
  });

  for (const width of WIDTHS)
    test(`首页 @${width}：.num 不折行`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./#/');
      await expect(page.locator('#home a.hcard').first()).toBeVisible();
      expect(await wrappedNums(page, 'main')).toEqual([]);
    });
});

// ---------- #316 新增城镇中心：两种解读同时列出（Steve 2026-10-21 21:11 / 21:18；issue 316 comment 6316912314） ----------
// 「看见新增城镇中心」始终同时列出两种解读，各带判断依据（位置）和一句应对；不随「可见范围」变化，不加新字段。
// 公开来源 AoE2 Coach 城镇中心页 https://aoecoach.com/en/resources/buildings/town-center/ ：
// - Castle Age Boom：“Upon reaching Castle Age, immediately build 2-3 additional Town Centers … rapidly grows your economy”
// - Forward Town Center：“building a Town Center on a contested gold or stone pile secures resources”；In pro play：“placing a TC near the opponent both pressures them”
// - How to counter it：“either boom harder yourself or punish them militarily”；“Forward TCs can be denied by contesting the location with early military or by Trebuchet/siege”
/** 判断依据 + 解读：同一句里（不跨句号 / 分号）位置线索与解读关键词相距不超过 24 字 */
const near = (cue: string, kw: string) => new RegExp(`(?:${cue})[^。；]{0,24}(?:${kw})|(?:${kw})[^。；]{0,24}(?:${cue})`);
const TC_BOOM_CUE = '敌方自家附近';
const TC_FWD_CUE = '前线|我方资源';
const TC_BOOM_READ = near(TC_BOOM_CUE, '扩张|经济');
const TC_FWD_READ = near(TC_FWD_CUE, '前置|进攻|压制');
/** 应对：扩张经济 → 同步扩张或用军队施压；前置 → 出兵争夺位置或用攻城武器拆除（须和「前置 / 前线 / 我方资源」写在同一句） */
const TC_BOOM_NEXT = /同步(扩张|发展)|更快地?(扩张|发展)|施压|惩罚|趁[^。；]{0,10}(出兵|进攻)/;
const TC_FWD_NEXT = near('前置|前线|我方资源', '争夺|驱逐|拆除|拆掉|投石|攻城|阻止|摧毁');
/** 城堡阶段情境下把「新增城镇中心」标为看到并选定可见范围，返回「看见新增城镇中心」这条信号的文字 */
async function extraTcSignal(page: Page, area: string): Promise<string> {
  await page.goto('./#/scouting');
  await page.getByLabel('情境', { exact: true }).selectOption('walled');
  await expect(page.getByLabel('我的当前阶段', { exact: true })).toHaveValue('castle');
  const obs = page.locator('[data-observation="new-town-center"]');
  await obs.getByLabel('新增城镇中心：状态', { exact: true }).selectOption('seen');
  await obs.locator('summary').click();
  await obs.getByLabel('新增城镇中心：可见范围', { exact: true }).selectOption(area);
  await expect(page.getByTestId('scouting-result')).toHaveAttribute('data-analysis-status', 'covered');
  const li = page.locator('[data-testid="scouting-signals"] > li[data-signal="extra-tc"]');
  await expect(li).toBeVisible();
  await expect(li).toContainText('看见新增城镇中心');
  return (await li.innerText()).replace(/\s+/g, ' ');
}
test.describe('#316 「看见新增城镇中心」同时列出两种解读', () => {
  test('标为看到后，信号里同时看得到两种解读、各自的判断依据和应对；换一种可见范围内容不变', async ({ page }) => {
    const a = await extraTcSignal(page, 'enemy-front');
    expect(a, '前置进攻（前线 / 我方资源点）').toMatch(TC_FWD_READ);
    expect(a, '扩张经济（必须写「敌方自家附近」，Steve 21:22）').toMatch(TC_BOOM_READ);
    expect(a, '前置的应对：出兵争夺位置或用攻城武器拆除').toMatch(TC_FWD_NEXT);
    expect(a, '扩张经济的应对：同步扩张或用军队施压').toMatch(TC_BOOM_NEXT);
    for (const area of ['own-approach', 'unknown']) expect(await extraTcSignal(page, area), `可见范围 ${area} 时内容相同`).toBe(a);
  });
  test('「看见新增城镇中心」的来源只有 AoE2 Coach，不标「本站整理」', async ({ page }) => {
    await page.goto('./#/scouting');
    await page.getByLabel('情境', { exact: true }).selectOption('walled');
    const li = page.locator('[data-testid="scouting-signals"] > li[data-signal="extra-tc"]');
    await expect(li).toContainText('看见新增城镇中心');
    await expect(li.locator('a[href^="http"]')).toHaveCount(1);
    await expect(li.locator('a[href^="http"]')).toHaveAttribute('href', 'https://aoecoach.com/en/resources/buildings/town-center/');
    await expect(li).not.toContainText('本站整理');
  });
  for (const width of WIDTHS)
    test(`#/scouting 城堡阶段、新增城镇中心标为看到 @${width}：.num 不折行、无横向滚动`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await extraTcSignal(page, 'enemy-front');
      expect(await wrappedNums(page, 'main')).toEqual([]);
      await noOverflow(page);
    });
});
