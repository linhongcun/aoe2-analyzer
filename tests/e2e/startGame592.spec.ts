import { expect, test, type Page } from '@playwright/test';

const WIDTHS = [360, 375, 390, 1280] as const;
const FRANK = '骑兵从封建时代起生命更高，磨坊科技免费，中路适合发育后出骑士。';

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
    await expect(franks).toContainText(FRANK);
    await expect(franks).toContainText('编辑口径，不是胜率');
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
    await expect(practice).toHaveText('先练某个文明 · 首刀不做');
    expect(await practice.evaluate((el) => el.matches('a, button, [href], [tabindex]'))).toBe(false);
    await page.getByTestId('start-lobby').click();
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
    await expect(page.getByTestId('start-steps')).toHaveText(/模式\s*地图\s*文明\s*对手/);
    await expect(flowText(page)).toContainText('已预填');
    await expect(flowText(page)).toContainText('阿拉伯半岛');
    await expect(flowText(page)).toContainText('没有连上游戏大厅');
    await expect(page.getByRole('button', { name: /法兰克/ })).toContainText(FRANK);
    await expect(page.getByRole('button', { name: /不列颠/ })).toBeVisible();
    await page.getByRole('button', { name: '补路位', exact: true }).click();
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'lane');
    await expect(page.getByTestId('start-steps')).toContainText('路位');
  });

  for (const width of WIDTHS) {
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
