import { expect, test, type Locator, type Page } from '@playwright/test';

const VIEW = { width: 1280, height: 844 };

async function top(locator: Locator) {
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return Math.round(box.top + window.scrollY);
  });
}

async function open(page: Page, path: string) {
  await page.goto('./#' + path);
  await expect(page.locator('header.tool-head h1')).toBeVisible();
}

const FIRST_SCREEN: { path: string; input: string; result: string }[] = [
  { path: '/construction', input: '施工文明', result: '#construction-result-title' },
  { path: '/market', input: '文明', result: '#market-compare-title' },
  { path: '/game-clock', input: '换算方向', result: '#gc-result-title' },
  { path: '/team-bonuses', input: '玩家 1 文明', result: '[data-testid="team-summary"]' },
  { path: '/eco-payoff', input: '收益文明', result: '#eco-result h2' },
  { path: '/trade-income', input: '贸易文明', result: 'h2:text-is("黄金供需")' },
  { path: '/relic-income', input: '圣物文明', result: '#relic-result-title' },
  { path: '/garrison-healing', input: '回血文明', result: '#healing-result-title' },
  { path: '/matchup/scouting', input: '情境', result: '#scouting-result-title' },
  { path: '/matchup/mixed-army', input: '情境', result: '#mixed-example-title' },
  { path: '/matchup/castle-defense', input: '观察状态', result: '#castle-defense-plan-title' },
];

test('#962 1280 首屏里，条件和结果标题都在 844 以内，右栏不跟随滚动', async ({ page }) => {
  await page.setViewportSize(VIEW);
  const measured: string[] = [];
  for (const item of FIRST_SCREEN) {
    await open(page, item.path);
    const input = page.getByLabel(item.input, { exact: false }).first();
    const result = page.locator(item.result).first();
    await expect(input, item.path).toBeVisible();
    await expect(result, item.path).toBeVisible();
    const inputY = await top(input);
    const resultY = await top(result);
    const line = `${item.path} 输入 ${inputY} / 结果 ${resultY}`;
    measured.push(line);
    console.log(line);
    expect(inputY, `${item.path} 首个输入`).toBeLessThan(844);
    expect(resultY, `${item.path} 结果标题`).toBeLessThan(844);
    const sticky = await result.evaluate((element) => {
      let node: Element | null = element;
      while (node && node !== document.body) {
        if (getComputedStyle(node).position === 'sticky') return true;
        node = node.parentElement;
      }
      return false;
    });
    expect(sticky, `${item.path} 右栏不 sticky`).toBe(false);
  }
  test.info().annotations.push({ type: 'first-screen', description: measured.join('；') });
});

test('#962 ≤1023 单栏且条件在结果前；市场和团队加成版心与施工对齐', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 844 });
  const stacked = [
    { path: '/construction', result: '#construction-result-title' },
    { path: '/market', result: '#market-compare-title' },
    { path: '/team-bonuses', result: '[data-testid="team-summary"]' },
  ];
  for (const item of stacked) {
    await open(page, item.path);
    const grid = page.locator('.tool-grid').first();
    await expect(grid).toBeVisible();
    const columns = await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    expect(columns, item.path).toBe(1);
    const input = grid.locator('input, select, textarea, button.cp-trigger').first();
    expect(await top(input), item.path).toBeLessThan(await top(page.locator(item.result)));
  }

  await page.setViewportSize(VIEW);
  await open(page, '/construction');
  const constructionX = await page.getByTestId('construction-page').evaluate((element) => Math.round(element.getBoundingClientRect().x));
  await open(page, '/market');
  const marketX = await page.getByTestId('market-page').evaluate((element) => Math.round(element.getBoundingClientRect().x));
  await open(page, '/team-bonuses');
  const teamX = await page.getByTestId('team-bonuses-page').evaluate((element) => Math.round(element.getBoundingClientRect().x));
  expect(Math.abs(marketX - constructionX)).toBeLessThan(2);
  expect(Math.abs(teamX - constructionX)).toBeLessThan(2);
  expect(constructionX).toBeGreaterThanOrEqual(40);
  expect(constructionX).toBeLessThanOrEqual(42);
});

test('#962 口径下沉、就近说明还在，示例块带标签且可按原逻辑收起', async ({ page }) => {
  await page.setViewportSize(VIEW);
  await open(page, '/market');
  await expect(page.getByText('预算估算，游戏实际报价优先。', { exact: true })).toBeVisible();
  const marketFoot = page.locator('.tool-foot');
  await expect(marketFoot).toContainText('按每笔整数报价估算。');
  await expect(marketFoot).toContainText('所有玩家共用市场行情；');
  await expect(marketFoot.locator('details')).not.toHaveAttribute('open');
  await expect(marketFoot.getByRole('link', { name: '持续生产', exact: true })).toHaveAttribute('href', '#/production');
  await page.goto('./#/market?v=bad');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.tool-grid')).toHaveCount(0);
  await open(page, '/market');
  await page.getByLabel('食物库存', { exact: true }).fill('-1');
  await expect(page.getByText('输入无效，暂停计算', { exact: true }).first()).toBeVisible();

  await open(page, '/game-clock');
  const clockFoot = page.locator('.tool-foot');
  await expect(clockFoot).toContainText('攻略时点通常使用游戏时钟');
  await expect(clockFoot).toContainText('换算只适用于倍率恒定、连续运行的情况');
  await expect(clockFoot.locator('details')).not.toHaveAttribute('open');
  await expect(clockFoot.getByRole('link', { name: '开局流程', exact: true })).toHaveAttribute('href', '#/builds');
  await expect(clockFoot.getByRole('link', { name: '驻军回血', exact: true })).toHaveAttribute('href', '#/garrison-healing');

  await open(page, '/team-bonuses');
  const teamFoot = page.locator('.tool-foot');
  await expect(teamFoot).toContainText('包含本人，按效果来源汇总');
  await expect(teamFoot).toContainText('研究状态只用于此页记录');
  await expect(teamFoot.locator('details')).not.toHaveAttribute('open');
  await expect(page.getByTestId('team-summary')).toBeVisible();

  await open(page, '/eco-payoff');
  await expect(page.locator('#eco-result [data-testid="eco-lead"]')).toBeVisible();
  await expect(page.locator('.tool-foot')).toContainText('首版评估伐木、采金、采石的一次升级');
  await open(page, '/trade-income');
  const tradeInput = page.locator('.trade-income-card', { has: page.getByRole('heading', { name: '本局贸易条件', exact: true }) });
  await expect(tradeInput).toContainText('默认数字只是用户测量示例，不是游戏固定收益。');
  await expect(page.locator('.tool-foot')).not.toContainText('默认数字只是用户测量示例');

  await open(page, '/construction');
  await expect(page.locator('#construction-result-title').locator('xpath=..')).toContainText('理论同时施工：所有普通村民已到场。');

  await open(page, '/matchup/scouting');
  const scoutingExample = page.getByRole('complementary', { name: '示例', exact: true });
  await expect(scoutingExample).toContainText('示例');
  await expect(scoutingExample).toContainText('示例观察：已见军事生产建筑与实际军队，进军方向待查。');
  await scoutingExample.getByRole('button', { name: '清空，填写我的观察', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '示例', exact: true })).toHaveCount(0);

  await open(page, '/matchup/mixed-army');
  const mixedExample = page.getByRole('complementary', { name: '示例', exact: true });
  await expect(mixedExample.getByRole('heading', { name: '示例结论', exact: true })).toBeVisible();
  await expect(page.locator('.mixed-output').getByTestId('mixed-pending')).toBeVisible();
  await page.getByLabel('实际敌军组合', { exact: true }).selectOption({ index: 1 });
  await expect(page.getByRole('complementary', { name: '示例', exact: true })).toHaveCount(0);
  await expect(page.locator('#mixed-result-heading')).toBeVisible();

  await open(page, '/matchup/castle-defense');
  const castleExample = page.getByRole('complementary', { name: '示例', exact: true });
  await expect(castleExample).toContainText('例如：堡已经造好，但还没查过后方金矿？先把资源保留为“未知”，查清退路后再决定迁移或解围。');
  const castleResult = await top(page.locator('#castle-defense-plan-title'));
  const castleExampleY = await top(castleExample);
  expect(castleExampleY).toBeLessThan(castleResult);

  await open(page, '/team-plan');
  await expect(page.getByRole('button', { name: '载入开放陆地4v4范例', exact: true })).toBeVisible();
  await expect(page.locator('.tool-foot')).toContainText('只核对固定数据与玩家明确确认的形态升级、解锁和生产建筑。');
  await open(page, '/hotkeys');
  const tip = page.getByRole('complementary', { name: '推鹿与跟随提示', exact: true });
  expect(await top(page.locator('#hk-query'))).toBeLessThan(await top(tip));
  await open(page, '/campaigns');
  const coverage = page.getByLabel('收录范围');
  await expect(coverage).toContainText('并非完整目录');
  expect(await top(page.getByLabel('搜索战役名称'))).toBeLessThan(await top(coverage));

  await page.goto('./#/start');
  await expect(page.locator('header.tool-head')).toHaveCount(0);
  await open(page, '/production');
  await expect(page.getByRole('navigation', { name: '生产模式' })).toBeVisible();
  await expect(page.locator('.tool-grid')).toBeVisible();
});

test('#962 390 宽无横向溢出，底部操作条仍可点', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/construction', '/market', '/game-clock', '/team-bonuses']) {
    await open(page, path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  }
  await open(page, '/construction');
  const jump = page.getByRole('button', { name: '跳到结果', exact: true });
  await expect(jump).toBeVisible();
  expect((await jump.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await jump.click();
  await expect(page.locator('#construction-result-title')).toBeFocused();
});
