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
    await expect(page.getByTestId('scenario-suggestions')).toHaveCount(0);
    await expect(flowText(page)).toContainText('当前条件暂无机制建议');
    await expect(page.getByRole('button', { name: /不列颠/ })).toBeVisible();
    await page.getByRole('button', { name: '补路位', exact: true }).click();
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'lane');
    await expect(page.getByTestId('start-steps')).toContainText('路位');
  });

  for (const width of WIDTHS) {
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
