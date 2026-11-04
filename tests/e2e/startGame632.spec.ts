import { expect, test, type Browser, type Page } from '@playwright/test';
import type { StartState } from '../../src/domain/startGame';
import AxeBuilder from '@axe-core/playwright';

async function editorialPath(page: Page, arena = false) {
  await page.goto('./#/');
  if (arena) {
    await page.getByRole('button', { name: /组队随机地图/ }).click();
    await page.getByRole('button', { name: '4v4', exact: true }).click();
  } else await page.getByRole('button', { name: /1v1 随机地图/ }).click();
  await page.getByRole('button', { name: arena ? /竞技场/ : /阿拉伯半岛/ }).click();
  if (arena) await page.getByRole('button', { name: /^中路/ }).click();
  await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
}

for (const width of [360, 375, 390, 1280])
  for (const arena of [false, true]) {
    test(`#666 @${width} ${arena ? 'Arena4v4' : 'Arabia1v1'}真实地图编辑参考`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const theme = width === 390 ? 'dark' : 'light';
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const errors: string[] = [];
      collectErrors(page, errors);
      await editorialPath(page, arena);
      console.log(
        JSON.stringify({
          version: await page.locator('[data-t="footer-app-version"]').innerText(),
          build: await page.locator('[data-t="footer-build"]').innerText(),
          width,
          theme,
        }),
      );
      const guide = page.getByTestId('start-editorial');
      await expect(guide).toBeVisible();
      await expect(guide.locator('.start-civrow')).toHaveCount(2);
      await expect(guide).toContainText('地图编辑参考');
      await expect(guide).toContainText('不是胜率');
      await expect(guide).toContainText('不按本局模式或路位计算');
      await expect(guide).toContainText(arena ? '僧侣争圣物' : '侦察骑兵或步弓');
      await expect(guide.locator(`a[href="https://aoe2.guide/${arena ? 'arena' : 'arabia'}/"]`)).toBeVisible();
      await expect(page.getByTestId('scenario-suggestions')).toHaveCount(0);
      expect(await guide.innerText()).not.toMatch(/\d+(?:\.\d+)?\s*%|工秒|先手窗口|本场景指标优先/);
      for (const en of arena ? ['Teutons', 'Bohemians'] : ['Franks', 'Britons'])
        await expect(guide.locator('.start-civrow').filter({ hasText: en }).locator('small')).not.toHaveText('');
      for (const control of await guide.locator('button,a').all()) {
        const box = await control.boundingBox();
        expect(box && box.width >= 44 && box.height >= 44).toBe(true);
      }
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await noOverflow(page);
      if (width === 1280) expect((await new AxeBuilder({ page }).include('[data-testid="start-game"]').analyze()).violations).toEqual([]);
      await page.locator('#home').screenshot({
        path: info.outputPath(`editorial666-${arena ? 'arena' : 'arabia'}-${width}.png`),
        style: 'header.topbar, .skip-link { visibility: hidden !important; }',
      });
      await guide.locator('.start-civrow button').first().click();
      await page.getByRole('button', { name: '完成本局', exact: true }).click();
      await expect(page.getByTestId('start-summary')).toContainText(arena ? '条顿' : '法兰克');
      await expect.poll(() => stateFromUrl(page.url())?.choice.mapId).toBe(arena ? 'arena' : 'arabia');
      expect(stateFromUrl(page.url())?.choice.lane).toBe(arena ? 'pocket' : null);
      expect(errors).toEqual([]);
    });
  }

test('#666 @1280 2v2编辑稿保留路位且不声称机制', async ({ page }) => {
  await page.goto('./#/');
  await page.getByRole('button', { name: /组队随机地图/ }).click();
  await page.getByRole('button', { name: '2v2', exact: true }).click();
  await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
  await page.getByRole('button', { name: /^边路/ }).click();
  await expect(page.getByTestId('start-editorial')).toContainText('不按本局模式或路位计算');
  await expect(page.getByTestId('scenario-suggestions')).toHaveCount(0);
  await page.getByRole('button', { name: /法兰克/ }).click();
  await page.getByRole('button', { name: '完成本局', exact: true }).click();
  await expect.poll(() => stateFromUrl(page.url())?.choice.teamSize).toBe('2v2');
  expect(stateFromUrl(page.url())?.choice.lane).toBe('flank');
});

for (const [name, en, limitation] of [
  ['游牧', 'Nomad', /先落城镇中心.*码头.*不能照搬.*出生配置和时间/],
  ['岛屿', 'Islands', /安全近岸渔场.*水陆混合图.*纯岛图.*敌方距离调整造船/],
] as const)
  test(`#666 @1280 ${en}保留编辑来源的开局限制`, async ({ page }) => {
    await page.goto('./#/');
    await page.getByRole('button', { name: /1v1 随机地图/ }).click();
    await page.getByRole('button', { name: `${name} ${en}`, exact: true }).click();
    const guide = page.getByTestId('start-editorial');
    await expect(guide.locator('.start-civrow')).toHaveCount(2);
    await expect(guide).toContainText(limitation);
    await expect(guide.locator('a[href^="https://sitaux.com/"]').first()).toBeVisible();
    await expect(guide.getByRole('link', { name: '查看地图攻略（需在页内选图）' })).toHaveAttribute('href', /#\/maps$/);
  });

test('#666 @1280 未核对地图与空大厅不借用参考或默认', async ({ page }) => {
  await page.goto('./#/');
  await page.getByTestId('start-lobby').click();
  await expect(page.getByTestId('start-editorial')).toHaveCount(0);
  await expect(page.getByTestId('start-step')).not.toContainText('阿拉伯半岛');
  await expect(page.getByTestId('start-step')).not.toContainText('4v4');
  await page.getByRole('button', { name: '修改模式和地图', exact: true }).click();
  await page.getByRole('button', { name: /1v1 随机地图/ }).click();
  await page.getByRole('button', { name: /黑森林/ }).click();
  await expect(page.getByTestId('start-step')).toContainText('暂无这张地图的文明编辑参考');
  await expect(page.getByTestId('start-editorial')).toHaveCount(0);
  await expect(page.getByTestId('scenario-suggestions')).toHaveCount(0);
  await page.getByRole('button', { name: /法兰克/ }).click();
  await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'opponent');
});

test('#666 @1280 参考外已选文明保留且仍可搜索其它文明', async ({ page }) => {
  await editorialPath(page);
  await page.getByRole('searchbox').fill('Mongols');
  await page.getByRole('button', { name: /^蒙古/ }).click();
  await page.getByRole('button', { name: '完成本局', exact: true }).click();
  await page.getByRole('button', { name: '修改地图', exact: true }).click();
  await page.getByRole('button', { name: /竞技场/ }).click();
  await expect(page.getByTestId('start-editorial')).toContainText('Teutons');
  await expect.poll(() => stateFromUrl(page.url())?.choice.civ).toBe('Mongols');
  await page.getByRole('button', { name: '保留此文明继续', exact: true }).click();
  await page.getByRole('button', { name: '完成本局', exact: true }).click();
  await expect(page.getByTestId('start-summary')).toContainText('蒙古');
  await page.getByRole('button', { name: '修改文明', exact: true }).click();
  await page.getByRole('searchbox').fill('Huns');
  await page.getByRole('button', { name: /^匈奴/ }).click();
  await page.getByRole('button', { name: '完成本局', exact: true }).click();
  await expect(page.getByTestId('start-summary')).toContainText('匈奴');
});

for (const width of [360, 375, 390, 1280]) {
  test(`#632 @${width} 空大厅不填示例，摘要保留跳过，可补选单挑`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('./#/');
    await page.getByTestId('start-lobby').click();
    const flow = page.getByTestId('start-game');
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
    await expect(flow).not.toContainText('已预填');
    await expect(flow).not.toContainText('阿拉伯半岛');
    await expect(flow).not.toContainText('4v4');
    await expect(flow).toContainText('暂无建议');
    const modify = page.getByRole('button', { name: '修改模式和地图', exact: true });
    await expect(modify).toBeVisible();
    await modify.focus();
    await expect(modify).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath(`lobby632-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: /法兰克/ }).click();
    await page.getByRole('button', { name: '完成本局', exact: true }).click();
    const summary = page.getByTestId('start-summary');
    await expect(summary.getByText('已跳过', { exact: true })).toHaveCount(2);
    await expect(summary).not.toContainText('阿拉伯半岛');
    await expect(summary).not.toContainText('4v4');
    await expect(summary).not.toContainText('中路适合');
    await page.screenshot({ path: testInfo.outputPath(`summary632-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: '修改模式', exact: true }).click();
    await page.getByRole('button', { name: /1v1 随机地图/ }).click();
    await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
    await page.getByRole('button', { name: /法兰克/ }).click();
    await page.getByRole('button', { name: '完成本局', exact: true }).click();
    await expect(summary).toContainText('1v1');
    await expect(summary).not.toContainText('中路适合');
    await expect(summary.locator('.start-sumkey').filter({ hasText: /^路位$/ })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.getByRole('button', { name: '再开一局', exact: true }).click();
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'mode');
  });
}

const KEY = 'aoe2-start-game-v1';
const CONFLICT = JSON.stringify({
  version: 1,
  state: {
    choice: { mode: '1v1', teamSize: null, mapId: null, lane: null, civ: null },
    skipped: {},
    prefilled: {},
    teamArmed: false,
    lobby: false,
    laneOpen: false,
    current: 'map',
  },
});
function stateFromUrl(url: string): StartState | null {
  try {
    const hash = new URL(url).hash.slice(1);
    const raw = new URLSearchParams(hash.slice(hash.indexOf('?'))).get('sg');
    return raw ? (JSON.parse(raw) as StartState) : null;
  } catch {
    return null;
  }
}
function collectErrors(page: Page, errors: string[]) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function receiver(browser: Browser, width: number, raw?: string) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  if (raw !== undefined) await context.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: KEY, value: raw });
  if (width === 375) await context.addInitScript(() => localStorage.setItem('aoe2-theme', 'light'));
  return context;
}

for (const width of [360, 375, 390, 1280]) {
  test(`#669 @${width} 完整URL在独立context恢复当前局`, async ({ page, browser }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    if (width === 375) await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'light'));
    const errors: string[] = [];
    collectErrors(page, errors);
    await page.goto('./#/');
    const historyBefore = await page.evaluate(() => history.length);
    await page.getByRole('button', { name: /组队随机地图/ }).click();
    await page.getByRole('button', { name: '4v4', exact: true }).click();
    await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
    await page.getByRole('button', { name: /^中路/ }).click();
    await page.getByRole('button', { name: /法兰克/ }).click();
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'opponent');
    await expect
      .poll(() => stateFromUrl(page.url()))
      .toMatchObject({ current: 'opponent', choice: { mode: 'team', teamSize: '4v4', mapId: 'arabia', lane: 'pocket', civ: 'Franks' } });
    expect(await page.evaluate(() => history.length)).toBe(historyBefore);
    const url = page.url();
    console.log(
      JSON.stringify({
        sourceVersion: await page.locator('[data-t="footer-app-version"]').innerText(),
        sourceBuild: await page.locator('[data-t="footer-build"]').innerText(),
        hashLength: new URL(url).hash.length,
      }),
    );
    await noOverflow(page);
    const freshContext = await receiver(browser, width);
    try {
      const fresh = await freshContext.newPage();
      collectErrors(fresh, errors);
      await fresh.goto(url);
      await expect(fresh.getByTestId('start-step')).toHaveAttribute('data-step', 'opponent');
      await expect(fresh.locator('.start-picked')).toContainText('4v4');
      await expect(fresh.locator('.start-picked')).toContainText('阿拉伯半岛');
      await expect(fresh.locator('.start-picked')).toContainText('中路');
      expect(stateFromUrl(fresh.url())).toEqual(stateFromUrl(url));
      await noOverflow(fresh);
      await fresh
        .locator('#home')
        .screenshot({ path: testInfo.outputPath(`url669-opponent-${width}.png`), style: 'header.topbar, .skip-link { visibility: hidden !important; }' });
      await fresh.getByRole('button', { name: '完成本局', exact: true }).click();
      await expect(fresh.getByTestId('start-summary')).toContainText('法兰克');
      await fresh.reload();
      await expect(fresh.getByTestId('start-summary')).toContainText('法兰克');
      await noOverflow(fresh);
      await fresh
        .locator('#home')
        .screenshot({ path: testInfo.outputPath(`url669-summary-${width}.png`), style: 'header.topbar, .skip-link { visibility: hidden !important; }' });
    } finally {
      await freshContext.close();
    }

    const conflictContext = await receiver(browser, width, CONFLICT);
    try {
      const conflict = await conflictContext.newPage();
      collectErrors(conflict, errors);
      await conflict.goto(url);
      await expect(conflict.getByTestId('start-step')).toHaveAttribute('data-step', 'opponent');
      await conflict.getByRole('button', { name: '完成本局', exact: true }).click();
      await expect(conflict.getByTestId('start-summary')).toContainText('法兰克');
      await expect(conflict.getByTestId('start-summary')).toContainText('4v4');
      await expect(conflict.getByTestId('start-summary')).toContainText('中路');
      await noOverflow(conflict);
    } finally {
      await conflictContext.close();
    }

    const invalidContext = await receiver(browser, width, CONFLICT);
    try {
      const invalid = await invalidContext.newPage();
      collectErrors(invalid, errors);
      const bad = new URL(url);
      bad.hash = '/?sgv=99&sg=bad';
      await invalid.goto(bad.toString());
      await expect(invalid.getByRole('alert')).toContainText('链接中的本局进度无法恢复');
      await expect(invalid.getByTestId('start-step')).toHaveAttribute('data-step', 'mode');
      await expect(invalid.getByRole('button', { name: '4v4', exact: true })).toBeDisabled();
      await expect(invalid.getByTestId('start-game')).not.toContainText('阿拉伯半岛');
      expect(invalid.url()).toBe(bad.toString());
      expect(await invalid.evaluate((key) => localStorage.getItem(key), KEY)).toBe(CONFLICT);
      await invalid.getByRole('button', { name: /1v1 随机地图/ }).click();
      await expect.poll(() => stateFromUrl(invalid.url())?.choice.mode).toBe('1v1');
      expect(invalid.url()).not.toBe(bad.toString());
      expect(await invalid.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state.choice.mode, KEY)).toBe('1v1');
      await noOverflow(invalid);
    } finally {
      await invalidContext.close();
    }
    expect(errors).toEqual([]);
  });

  test(`#669 @${width} 大厅刷新显式reset与真实back恢复旧URL`, async ({ page, browser }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    collectErrors(page, errors);
    await page.goto('./?cache=sg669#/');
    const historyBefore = await page.evaluate(() => history.length);
    await page.getByTestId('start-lobby').click();
    await page.getByRole('button', { name: /法兰克/ }).click();
    await page.getByTestId('start-steps').getByRole('button', { name: '文明', exact: true }).click();
    await expect.poll(() => stateFromUrl(page.url())?.current).toBe('civ');
    const a = page.url();
    await page.reload();
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
    await expect(page.getByTestId('start-game')).toContainText('没有连上游戏大厅');
    await expect(page.getByTestId('start-game')).toContainText('已选文明保留');
    await page.getByRole('button', { name: '修改模式和地图', exact: true }).click();
    await page.getByRole('button', { name: /组队随机地图/ }).click();
    await page.getByRole('button', { name: '4v4', exact: true }).click();
    await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
    await page.getByRole('button', { name: /^中路/ }).click();
    await page.getByRole('button', { name: '保留此文明继续', exact: true }).click();
    await page.getByRole('button', { name: '完成本局', exact: true }).click();
    await expect.poll(() => stateFromUrl(page.url())?.current).toBeNull();
    const b = page.url();
    await page.reload();
    await expect(page.getByTestId('start-summary')).toContainText('法兰克');
    await expect(page.getByTestId('start-game')).toContainText('没有连上游戏大厅');
    expect(await page.evaluate(() => history.length)).toBe(historyBefore);
    expect(new URL(page.url()).search).toBe('?cache=sg669');
    await page.evaluate((url) => {
      location.hash = new URL(url).hash;
    }, a);
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
    await expect(page.getByTestId('start-game')).not.toContainText('阿拉伯半岛');
    await page.goBack();
    await expect(page.getByTestId('start-summary')).toContainText('4v4');
    expect(page.url()).toBe(b);
    await page.goForward();
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
    expect(page.url()).toBe(a);
    await page.getByRole('button', { name: '保留此文明继续', exact: true }).click();
    await page.getByRole('button', { name: '完成本局', exact: true }).click();
    await page.getByRole('button', { name: '再开一局', exact: true }).click();
    await expect.poll(() => stateFromUrl(page.url())?.current).toBe('mode');
    const resetUrl = page.url();
    expect(stateFromUrl(resetUrl)?.choice).toEqual({ mode: null, teamSize: null, mapId: null, lane: null, civ: null });
    await page.reload();
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'mode');
    const resetContext = await receiver(browser, width, CONFLICT);
    try {
      const resetPage = await resetContext.newPage();
      collectErrors(resetPage, errors);
      await resetPage.goto(resetUrl);
      await expect(resetPage.getByTestId('start-step')).toHaveAttribute('data-step', 'mode');
      await expect(resetPage.getByRole('button', { name: '4v4', exact: true })).toBeDisabled();
      expect(new URL(resetPage.url()).search).toBe('?cache=sg669');
      await noOverflow(resetPage);
    } finally {
      await resetContext.close();
    }
    await noOverflow(page);
    expect(errors).toEqual([]);
  });
}

for (const width of [360, 375, 390, 1280]) {
  test(`#671 @${width} 真实助手与开局上下文、对手语义明确`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    if (width === 375) await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'light'));
    const errors: string[] = [];
    collectErrors(page, errors);
    await page.goto('./#/matchup?me=Franks&opp=Japanese');
    await expect(page.locator('#ma')).toHaveAttribute('data-value', 'Franks');
    await expect(page.locator('#me')).toHaveAttribute('data-value', 'Japanese');
    await page.evaluate(() => {
      location.hash = '/';
    });
    await page.getByRole('button', { name: /1v1 随机地图/ }).click();
    await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
    await page.getByRole('searchbox').fill('Mongols');
    await page.getByRole('button', { name: /^蒙古/ }).click();
    const opponent = page.getByTestId('start-step');
    await expect(opponent).toHaveAttribute('data-step', 'opponent');
    console.log(
      JSON.stringify({
        version: await page.locator('[data-t="footer-app-version"]').innerText(),
        build: await page.locator('[data-t="footer-build"]').innerText(),
      }),
    );
    await opponent.locator('a', { hasText: /^对局助手$/ }).click();
    await expect(page.locator('#ma')).toHaveAttribute('data-value', 'Mongols');
    await expect(page.locator('#me')).toHaveAttribute('data-value', 'Japanese');
    await page.goBack();
    await expect(opponent).toContainText('本步暂无已核对对手数据，未列出对手文明');
    await expect(opponent).toContainText('仅带入我方文明；对手沿用助手原有选择，非本局当前对手');
    await expect(opponent.getByTestId('start-empty')).toHaveCount(0);
    await noOverflow(page);
    await page
      .locator('#home')
      .screenshot({ path: testInfo.outputPath(`context671-opponent-${width}.png`), style: 'header.topbar, .skip-link { visibility: hidden !important; }' });
    await page.getByRole('button', { name: '完成本局', exact: true }).click();
    const summary = page.getByTestId('start-summary');
    const opponentRow = summary.locator('.start-sumrow').filter({ has: page.locator('.start-sumkey', { hasText: /^对手$/ }) });
    await expect(opponentRow).toContainText('暂无数据');
    await expect(opponentRow).not.toContainText('已跳过');
    await expect(opponentRow).not.toContainText('暂无建议');
    await expect(summary).toContainText('列表仍为全部开局');
    await expect(summary).toContainText('地图页不保证已选中阿拉伯半岛');
    await expect(summary).toContainText('未按本局筛选');
    await expect(summary.getByRole('link', { name: '地图页', exact: true })).toHaveAttribute('href', /#\/maps$/);
    await expect(summary.getByRole('link', { name: '天梯数据', exact: true })).toHaveAttribute('href', /#\/ladder$/);
    await summary.getByRole('link', { name: '对局助手', exact: true }).click();
    await expect(page.locator('#ma')).toHaveAttribute('data-value', 'Mongols');
    await expect(page.locator('#me')).toHaveAttribute('data-value', 'Japanese');
    await page.goBack();
    await page.reload();
    await expect(opponentRow).toContainText('暂无数据');
    await noOverflow(page);
    await page
      .locator('#home')
      .screenshot({ path: testInfo.outputPath(`context671-summary-${width}.png`), style: 'header.topbar, .skip-link { visibility: hidden !important; }' });
    await summary.getByRole('link', { name: '开局流程', exact: true }).click();
    await expect(page.locator('#builds nav[aria-label="对阵相关入口"]').getByRole('link', { name: /蒙古/ })).toHaveAttribute('href', /#\/civ\/Mongols$/);
    await expect(page).toHaveURL(/#\/builds\?civ=Mongols$/);
    await noOverflow(page);
    expect(errors).toEqual([]);
  });
}

test('#671 @1280 未选文明与竞技场警告、跳过可刷新分享', async ({ page, browser }) => {
  const errors: string[] = [];
  collectErrors(page, errors);
  await page.goto('./#/');
  await page.getByRole('button', { name: /1v1 随机地图/ }).click();
  await page.getByRole('button', { name: /竞技场/ }).click();
  await page.getByTestId('start-skip').click();
  const opponent = page.getByTestId('start-step');
  await expect(opponent).toContainText('未带入本局文明；助手沿用原有双方选择，不代表本局对阵');
  await expect(opponent.getByRole('link', { name: '对局助手', exact: true })).toHaveAttribute('href', /#\/matchup$/);
  await page.getByTestId('start-skip').click();
  const summary = page.getByTestId('start-summary');
  const row = summary.locator('.start-sumrow').filter({ has: page.locator('.start-sumkey', { hasText: /^对手$/ }) });
  await expect(row).toHaveText(/对手已跳过修改/);
  await expect(summary).toContainText('地图页不保证已选中竞技场');
  await expect(summary).toContainText('未带入本局文明，列表仍为全部开局');
  await expect(summary.getByRole('link', { name: '对局助手', exact: true })).toHaveAttribute('href', /#\/matchup$/);
  await expect(summary.getByRole('link', { name: '开局流程', exact: true })).toHaveAttribute('href', /#\/builds$/);
  await expect(summary.getByRole('link', { name: '地图页', exact: true })).toHaveAttribute('href', /#\/maps$/);
  await expect(summary.getByRole('link', { name: '天梯数据', exact: true })).toHaveAttribute('href', /#\/ladder$/);
  await expect(summary).toContainText('未按本局筛选，不是这一局的胜率');
  await expect.poll(() => stateFromUrl(page.url())?.skipped.opponent).toBe(true);
  const url = page.url();
  await page.reload();
  await expect(row).toContainText('已跳过');
  await page.getByRole('button', { name: '修改对手', exact: true }).click();
  await page.getByRole('button', { name: '完成本局', exact: true }).click();
  await expect(row).toContainText('已跳过');
  const freshContext = await browser.newContext();
  try {
    const fresh = await freshContext.newPage();
    collectErrors(fresh, errors);
    await fresh.goto(url);
    await expect(fresh.getByTestId('start-summary').locator('.start-sumrow', { hasText: '对手' })).toContainText('已跳过');
    await noOverflow(fresh);
  } finally {
    await freshContext.close();
  }
  await noOverflow(page);
  expect(errors).toEqual([]);
});
