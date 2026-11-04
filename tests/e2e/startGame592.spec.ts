import { expect, test, type Page } from '@playwright/test';

const WIDTHS = [360, 375, 390, 1280] as const;

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

function flowText(page: Page) {
  return page.getByTestId('start-game');
}

test.describe('首页开一局 #592', () => {
  test('路径 A 先选模式再选地图，1v1 没有路位，能走到本局摘要', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('./#/');
    await expect(page.getByRole('heading', { level: 1, name: '开一局', exact: true })).toBeVisible();
    const title = await page.getByRole('heading', { level: 1 }).boundingBox();
    const card = await page.locator('#home .hcard').first().boundingBox();
    expect(title && card && title.y < card.y).toBe(true);
    await expect(page.getByTestId('start-more-tools')).toBeVisible();
    await expect(page.getByTestId('start-steps')).toHaveText(/模式\s*地图\s*文明\s*对手/);
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'mode');
    await expect(page.getByRole('button', { name: '2v2', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: /1v1 随机地图/ }).click();
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'map');
    await expect(page.getByTestId('start-steps')).toHaveText(/模式\s*地图\s*文明\s*对手/);
    await expect(page.getByTestId('start-empty')).toHaveText('暂无建议');
    await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
    await expect(page.getByTestId('start-steps')).not.toContainText('路位');
    await expect(page.getByTestId('start-empty')).toHaveText('暂无建议');
    await page.getByRole('button', { name: /法兰克/ }).click();
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'opponent');
    await expect(page.getByTestId('start-empty')).toHaveText('暂无建议');
    await expect(page.getByRole('link', { name: '对局助手', exact: true })).toHaveAttribute('href', /#\/matchup$/);
    await page.getByRole('button', { name: '完成本局', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: '本局摘要', exact: true })).toBeVisible();
    await expect(page.getByTestId('start-summary').locator('.start-sumkey')).toHaveText(['模式', '地图', '文明', '对手']);
    await expect(page.getByTestId('start-summary').getByTestId('start-empty')).toHaveText('暂无建议');
    await expect(page.getByTestId('start-summary')).toContainText('不是这一局的胜率');
    await expect(page.getByTestId('start-summary').getByRole('link', { name: '对局助手', exact: true })).toHaveAttribute('href', /#\/matchup$/);
    await expect(page.getByTestId('start-summary').getByRole('link', { name: '天梯数据', exact: true })).toHaveAttribute('href', /#\/ladder$/);
    await expect(flowText(page)).not.toContainText('热门');
    await expect(flowText(page)).not.toContainText('常打');
    await expect(flowText(page)).not.toContainText('出场率');
    expect(await flowText(page).innerText()).not.toMatch(/\d+(?:\.\d+)?\s*%/);
    await noOverflow(page);
  });

  test('组队才出现路位；跳过不替玩家选择；上一步留着已经点过的图', async ({ page }) => {
    await page.goto('./#/');
    await page.getByRole('button', { name: /组队随机地图/ }).click();
    await page.getByRole('button', { name: '4v4', exact: true }).click();
    await expect(page.getByTestId('start-steps')).toHaveText(/模式\s*地图\s*路位\s*文明\s*对手/);
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'map');
    await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'lane');
    await page.getByRole('button', { name: /^中路/ }).click();
    const franks = page.getByRole('button', { name: /法兰克/ });
    await expect(page.getByTestId('scene-Franks')).toContainText('期限前');
    await expect(franks).toBeVisible();
    await expect(page.getByTestId('scenario-suggestions')).toContainText('城堡时代场景建议');
    await expect(page.getByRole('link', { name: '查看法兰克', exact: true })).toHaveAttribute('href', /#\/civ\/Franks$/);
    await page.getByTestId('start-back').click();
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'lane');
    await expect(page.getByRole('button', { name: /^中路/ })).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('start-skip').click();
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
    await expect(page.getByTestId('start-empty')).toHaveText('暂无建议');
    await page.getByTestId('start-skip').click();
    await page.getByTestId('start-skip').click();
    await expect(page.getByRole('heading', { level: 1, name: '本局摘要', exact: true })).toBeVisible();
    const lane = page.getByTestId('start-summary').locator('.start-sumrow', { hasText: '路位' });
    await expect(lane.getByTestId('start-empty')).toHaveText('暂无建议');
    await expect(lane).toContainText('已跳过');
    await expect(lane.getByTestId('start-empty')).not.toContainText('已跳过');
    await page.getByRole('button', { name: '修改地图', exact: true }).click();
    await expect(page.getByRole('button', { name: /阿拉伯半岛/ })).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('start-back').click();
    await page.getByRole('button', { name: /1v1 随机地图/ }).click();
    await expect(page.getByTestId('start-steps')).toHaveText(/模式\s*地图\s*文明\s*对手/);
    await expect(page.getByRole('button', { name: /阿拉伯半岛/ })).not.toHaveAttribute('aria-pressed', 'true');
  });

  test('已在大厅从文明起；先练文明不能点', async ({ page }) => {
    await page.goto('./#/');
    const practice = page.getByTestId('start-practice');
    await expect(practice).toHaveText('按文明练习 · 即将提供');
    expect(await practice.evaluate((el) => el.matches('a, button, [href], [tabindex]'))).toBe(false);
    await page.getByTestId('start-lobby').click();
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
    await expect(page.getByTestId('start-steps')).toHaveText(/模式\s*地图\s*文明\s*对手/);
    await expect(flowText(page)).not.toContainText('已预填');
    await expect(flowText(page)).not.toContainText('阿拉伯半岛');
    await expect(flowText(page)).toContainText('没有连上游戏大厅');
    await page.getByRole('button', { name: '修改模式和地图', exact: true }).click();
    await page.getByRole('button', { name: '组队随机地图', exact: false }).click();
    await page.getByRole('button', { name: '4v4', exact: true }).click();
    await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'lane');
    await page.getByTestId('start-skip').click();
    await expect(page.getByTestId('scenario-suggestions')).toHaveCount(0);
    await expect(flowText(page)).toContainText('当前条件暂无机制建议');
    await expect(page.getByRole('button', { name: /不列颠/ })).toBeVisible();
    await page.getByRole('button', { name: '补路位', exact: true }).click();
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'lane');
    await expect(page.getByTestId('start-steps')).toContainText('路位');
  });

  test('#670 大厅补路位不承诺未覆盖条件有机制建议', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('./#/');
    for (const [size, map] of [
      ['2v2', /阿拉伯半岛/],
      ['4v4', /竞技场/],
    ] as const) {
      await page.getByTestId('start-lobby').click();
      await page.getByRole('button', { name: '修改模式和地图', exact: true }).click();
      await page.getByRole('button', { name: /组队随机地图/ }).click();
      await page.getByRole('button', { name: size, exact: true }).click();
      await page.getByRole('button', { name: map }).click();
      await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'lane');
      await page.getByTestId('start-skip').click();
      await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
      expect(await page.locator('.start-note').innerText()).not.toMatch(/补路位.*查看.*建议/);
      await page.getByRole('button', { name: '补路位', exact: true }).click();
      await page.getByRole('button', { name: /^中路/ }).click();
      await expect(page.getByTestId('scenario-suggestions')).toHaveCount(0);
      await expect(page.getByTestId('start-step')).toContainText('当前条件暂无机制建议');
      await page.getByRole('button', { name: /法兰克/ }).click();
      await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'opponent');
      await noOverflow(page);
      await page.getByRole('button', { name: '完成本局', exact: true }).click();
      await page.getByRole('button', { name: '再开一局', exact: true }).click();
    }
    expect(errors).toEqual([]);
  });

  for (const width of WIDTHS) {
    test(`#670 @${width} 选地图前说明机制范围，缺条件仍可选文明`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      const step = page.getByTestId('start-step');
      const scope = page.getByTestId('start-scenario-scope');
      const mapScope = async () => {
        await expect(step).toHaveAttribute('data-step', 'map');
        await expect(scope).toBeVisible();
        const copy = await scope.innerText();
        expect(copy).toMatch(/机制.*仅/);
        expect(copy).toContain('阿拉伯半岛');
        expect(copy).toMatch(/组队\s*4v4/);
        expect(copy).toMatch(/需.*路位/);
        expect(copy).toContain('暂无机制建议');
        expect(copy).toContain('自主选择文明');
        await noOverflow(page);
      };
      const unsupported = async () => {
        await expect(step).toHaveAttribute('data-step', 'civ');
        await expect(page.getByTestId('scenario-suggestions')).toHaveCount(0);
        await expect(step).toContainText('当前条件暂无机制建议');
        await expect(page.getByRole('searchbox', { name: '搜索文明', exact: true })).toBeVisible();
        await noOverflow(page);
      };
      const chooseFranks = async () => {
        await page.getByRole('button', { name: /法兰克/ }).click();
        await page.getByRole('button', { name: '完成本局', exact: true }).click();
        await expect(page.getByTestId('start-summary')).toContainText('法兰克');
      };
      const teamMap = async () => {
        await page.getByRole('button', { name: /组队随机地图/ }).click();
        await page.getByRole('button', { name: '4v4', exact: true }).click();
        await mapScope();
      };
      const capture = async (state: string) => {
        await page.locator('#home').screenshot({
          path: testInfo.outputPath(`scope670-${state}-${width}.png`),
          style: 'header.topbar, .skip-link { visibility: hidden !important; }',
        });
      };

      await page.goto('./#/');
      await page.getByRole('button', { name: /1v1 随机地图/ }).click();
      await mapScope();
      await capture('map');
      await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
      await unsupported();
      await chooseFranks();

      await page.getByRole('button', { name: '再开一局', exact: true }).click();
      await teamMap();
      await page.getByRole('button', { name: /竞技场/ }).click();
      await page.getByRole('button', { name: /^中路/ }).click();
      await unsupported();
      await chooseFranks();

      await page.getByRole('button', { name: '再开一局', exact: true }).click();
      await teamMap();
      await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
      await page.getByTestId('start-skip').click();
      await unsupported();
      await expect(page.getByRole('button', { name: '补路位', exact: true })).toHaveCount(0);
      await page.getByTestId('start-back').click();
      await page.getByRole('button', { name: /^中路/ }).click();
      await expect(page.getByTestId('scene-Franks')).toContainText('预算可负担');
      await noOverflow(page);
      await chooseFranks();

      await page.getByRole('button', { name: '再开一局', exact: true }).click();
      await page.getByTestId('start-lobby').click();
      await page.getByRole('button', { name: '修改模式和地图', exact: true }).click();
      await teamMap();
      await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
      await expect(step).toHaveAttribute('data-step', 'lane');
      await page.getByTestId('start-skip').click();
      await unsupported();
      await expect(page.getByRole('button', { name: '补路位', exact: true })).toBeVisible();
      await capture('missing-lane');
      await page.getByRole('button', { name: '补路位', exact: true }).click();
      await page.getByRole('button', { name: /^边路/ }).click();
      await expect(page.getByTestId('scene-Britons')).toContainText('预算可负担');
      await expect(page.getByTestId('scenario-suggestions')).toContainText('不是整局强度榜，也不覆盖全部文明');
      await noOverflow(page);
      expect(errors).toEqual([]);
    });

    test(`#673 @${width} 三条开局路径只显示玩家能用的说明`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      const developerCopy =
        /首刀不做|不占一格|步数不固定|不是固定的第\s*3\s*步|路位插在地图和文明之间|还没到的格子不能点|模式不算完成|模式才算完成|人数三枚|顺序跟名单一致|编辑叫法|先记这一侧|和中路同一级|不再是首页第一件事|这一步不展开|没有数据的格子写/;
      const check = async (step: string | null) => {
        if (step) await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', step);
        else await expect(page.getByTestId('start-summary')).toBeVisible();
        expect(await flowText(page).innerText()).not.toMatch(developerCopy);
        expect(await page.locator('#home').innerText()).not.toMatch(developerCopy);
        await noOverflow(page);
      };
      const capture = async (state: string) => {
        await page.locator('#home').screenshot({
          path: testInfo.outputPath(`copy673-${state}-${width}.png`),
          style: 'header.topbar { visibility: hidden !important; }',
        });
      };

      await page.goto('./#/');
      await check('mode');
      await capture('mode');
      await page.getByRole('button', { name: /1v1 随机地图/ }).click();
      await check('map');
      await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
      await check('civ');
      await page.getByRole('button', { name: /法兰克/ }).click();
      await check('opponent');
      await page.getByRole('button', { name: '完成本局', exact: true }).click();
      await check(null);

      await page.getByRole('button', { name: '再开一局', exact: true }).click();
      await page.getByRole('button', { name: /组队随机地图/ }).click();
      await check('mode');
      await page.getByRole('button', { name: '4v4', exact: true }).click();
      await check('map');
      await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
      await check('lane');
      await capture('team-lane');
      await page.getByRole('button', { name: /^中路/ }).click();
      await expect(page.getByTestId('scenario-suggestions')).toBeVisible();
      await check('civ');
      await page.getByRole('button', { name: /法兰克/ }).click();
      await check('opponent');
      await page.getByRole('button', { name: '完成本局', exact: true }).click();
      await check(null);

      await page.getByRole('button', { name: '再开一局', exact: true }).click();
      await page.getByTestId('start-lobby').click();
      await check('civ');
      await capture('lobby-civ');
      await page.getByRole('button', { name: /法兰克/ }).click();
      await check('opponent');
      await page.getByRole('button', { name: '完成本局', exact: true }).click();
      await check(null);
      expect(errors).toEqual([]);
    });

    test(`@${width} 模式步和摘要没有横向滚动`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('./#/');
      await expect(page.getByTestId('start-game')).toBeVisible();
      await noOverflow(page);
      await page.getByRole('button', { name: /组队随机地图/ }).click();
      await page.getByRole('button', { name: '4v4', exact: true }).click();
      await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
      await page.getByRole('button', { name: /^中路/ }).click();
      await page.getByRole('button', { name: /法兰克/ }).click();
      await page.getByRole('button', { name: '跳过此步', exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: '本局摘要', exact: true })).toBeVisible();
      await expect(page.getByTestId('start-summary')).toContainText('暂无建议');
      await expect(page.locator('.start-sumkey', { hasText: '路位' })).toBeVisible();
      await noOverflow(page);
      expect(errors).toEqual([]);
    });
  }
});

for (const width of WIDTHS) {
  test(`#674 @${width} 大厅补图自动进入路位并在各步刷新保留本局`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('./#/');
    await page.getByTestId('start-lobby').click();
    await page.getByRole('button', { name: /法兰克/ }).click();
    await page.getByTestId('start-steps').getByRole('button', { name: '模式', exact: true }).click();
    await page.getByRole('button', { name: /组队随机地图/ }).click();
    await page.getByRole('button', { name: '4v4', exact: true }).click();
    await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'lane');
    await expect(page.locator('.start-lede')).not.toContainText('按已跳过');
    await page.reload();
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'lane');
    await expect(page.getByTestId('start-game')).toContainText('没有连上游戏大厅');
    await page.locator('#home').screenshot({ path: testInfo.outputPath(`lobby674-lane-${width}.png`) });
    await page.getByRole('button', { name: /^中路/ }).click();
    await page.reload();
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
    await expect(page.getByTestId('start-game')).toContainText('已选文明保留');
    await expect(page.locator('.start-picked')).toContainText('4v4');
    await expect(page.locator('.start-picked')).toContainText('阿拉伯半岛');
    await expect(page.locator('.start-picked')).toContainText('中路');
    await expect(page.locator('.start-lede')).not.toContainText('按已跳过');
    await page.locator('#home').screenshot({ path: testInfo.outputPath(`lobby674-civ-${width}.png`) });
    await page.getByRole('button', { name: '保留此文明继续', exact: true }).click();
    await page.getByRole('button', { name: '完成本局', exact: true }).click();
    await page.reload();
    await expect(page.getByTestId('start-summary')).toContainText('法兰克');
    await expect(page.getByTestId('start-game')).toContainText('没有连上游戏大厅');
    await page.getByRole('button', { name: '再开一局', exact: true }).click();
    await page.reload();
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'mode');
    await page.getByRole('button', { name: /1v1 随机地图/ }).click();
    await page.reload();
    await expect(page.getByTestId('start-steps')).not.toContainText('路位');
    await noOverflow(page);
    expect(errors).toEqual([]);
  });
}

test('#674 @1280 大厅已选文明刷新保留进度', async ({ page }) => {
  await page.goto('./#/');
  await page.getByTestId('start-lobby').click();
  await page.getByRole('button', { name: /法兰克/ }).click();
  await page.reload();
  await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'opponent');
  await page.getByRole('button', { name: '完成本局', exact: true }).click();
  await expect(page.getByTestId('start-summary')).toContainText('法兰克');
});

test('#674 @1280 非法存档安全空局且玩家操作前不覆盖', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('aoe2-start-game-v1', '{invalid'));
  await page.goto('./#/');
  await expect(page.getByRole('alert')).toContainText('保存的本局进度无法恢复');
  await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'mode');
  await expect(page.getByRole('button', { name: '4v4', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('aoe2-start-game-v1'))).toBe('{invalid');
  await page.getByRole('button', { name: /1v1 随机地图/ }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('aoe2-start-game-v1')!));
  expect(saved.state.choice).toEqual({ mode: '1v1', teamSize: null, mapId: null, lane: null, civ: null });
});

test('#674 @1280 恢复地图加载失败保留原档且可重试', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const raw = JSON.stringify({
    version: 1,
    state: {
      choice: { mode: 'team', teamSize: '4v4', mapId: 'arabia', lane: 'pocket', civ: 'Franks' },
      skipped: {},
      prefilled: {},
      teamArmed: true,
      lobby: true,
      laneOpen: true,
      current: 'civ',
    },
  });
  await page.addInitScript((value) => localStorage.setItem('aoe2-start-game-v1', value), raw);
  await page.route(/\/assets\/mapCatalog-[^/]+\.js$/, (route) => route.abort());
  await page.goto('./#/');
  await expect(page.getByRole('alert')).toContainText('地图目录加载失败，原进度已保留');
  expect(await page.evaluate(() => localStorage.getItem('aoe2-start-game-v1'))).toBe(raw);
  await expect(page.getByTestId('start-step')).toHaveCount(0);
  await page.unroute(/\/assets\/mapCatalog-[^/]+\.js$/);
  await page.getByRole('button', { name: '重试恢复', exact: true }).click();
  await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
  await expect(page.getByTestId('start-game')).toContainText('已选文明保留');
  expect(await page.evaluate(() => localStorage.getItem('aoe2-start-game-v1'))).toBe(raw);
  expect(errors).toEqual([]);
});
