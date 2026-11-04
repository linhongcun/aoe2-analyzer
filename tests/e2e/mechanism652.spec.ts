import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const techNames = JSON.parse(readFileSync('src/data/techs.json', 'utf8')) as { id: number; zh: string }[];
const archerArmor = techNames.find((tech) => tech.id === 211),
  thumbRing = techNames.find((tech) => tech.id === 437);
if (!archerArmor || !thumbRing) throw new Error('Missing pinned archer technology names');
async function select(page: Page, lane = '边路', expand = true) {
  await page.goto('./#/');
  await page.getByRole('button', { name: /组队随机地图/ }).click();
  await page.getByRole('button', { name: '4v4', exact: true }).click();
  await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
  await page.getByRole('button', { name: new RegExp('^' + lane) }).click();
  await expect(page.getByTestId('scene-Britons').getByText(/^城堡时代 ·/)).toBeVisible();
  if (expand) for (const why of await page.getByTestId('scenario-suggestions').getByText('为什么', { exact: true }).all()) await why.click();
}
for (const width of [360, 375, 390, 1280]) {
  test(`#679 @${width} 边路说明与科技表中文名一致`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.setViewportSize({ width, height: 900 });
    await select(page);
    const source = page.getByText('范围、科技包与来源', { exact: true });
    await source.click();
    const packageNote = source.locator('..').locator('p').filter({ hasText: '共同包：' });
    await expect(packageNote).toContainText(archerArmor.zh);
    await expect(packageNote).toContainText(thumbRing.zh);
    await expect(packageNote).not.toContainText(/弓兵鳞甲|指环/);
    await source.locator('..').screenshot({ path: testInfo.outputPath('scenario-tech-names.png') });
    await page.getByText('封建到城堡：路线衔接', { exact: true }).click();
    const routeSource = page.getByText('两阶段规则与数据来源', { exact: true });
    await routeSource.click();
    const routePackage = routeSource.locator('..').locator('p').filter({ hasText: '共同包：' });
    await expect(routePackage).toContainText(archerArmor.zh);
    await expect(routePackage).not.toContainText(/弓兵鳞甲|指环/);
    await routeSource.locator('..').screenshot({ path: testInfo.outputPath('route-tech-names.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
for (const width of [360, 375, 390, 1280]) {
  test(`#678 @${width} 人数侧重与理论先手机会分开`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.setViewportSize({ width, height: 900 });
    await select(page);
    const mayans = page.getByTestId('scene-Mayans'),
      britons = page.getByTestId('scene-Britons');
    await expect(mayans).toContainText('0 次');
    await expect(mayans.locator(':scope > .start-k')).toHaveText('人数侧重 · 无先手机会');
    await expect(britons).toContainText('1 次');
    await expect(britons.locator(':scope > .start-k')).toHaveText('理论先手机会侧重');
    await mayans.screenshot({ path: testInfo.outputPath('mayans-zero.png') });
    await britons.screenshot({ path: testInfo.outputPath('britons-opening.png') });
    const section = page.getByTestId('scenario-suggestions');
    await section.getByText('调整场景与投入', { exact: true }).click();
    await page.getByLabel('反应延迟', { exact: true }).selectOption('1.25');
    await expect(britons).toContainText('0 次');
    await expect(britons.locator(':scope > .start-k')).not.toContainText('先手机会侧重');
    await expect(section.getByText('理论先手机会侧重', { exact: true })).toHaveCount(0);
    await page.getByLabel('场景距离', { exact: true }).selectOption('2');
    await expect(section.getByText('理论先手机会侧重', { exact: true })).toHaveCount(0);
    await page.getByLabel('军事投入', { exact: true }).selectOption('0');
    await expect(section).toContainText('当前预算或期限没有可优先建议的部队');
    await expect(section.getByText('人数侧重 · 无先手机会', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
for (const width of [360, 375, 390, 1280]) {
  test(`#677 @${width} 中路仅比较到场，展开保留耐久差异`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.setViewportSize({ width, height: 900 });
    await select(page, '中路');
    const section = page.getByTestId('scenario-suggestions'),
      huns = page.getByTestId('scene-Huns');
    await expect(huns.locator(':scope > .start-k')).toHaveText('到场数量 / 时间侧重');
    await expect(section.getByText(/到场分组仅比较期限前人数与首兵到达，未比较生命、攻击和完整战力；相同到达结果不代表相同耐久。/)).toBeVisible();
    await expect(section.getByText('本场景指标优先', { exact: true })).toHaveCount(0);
    for (const [civ, hp] of [
      ['Franks', 120],
      ['Britons', 100],
    ] as const) {
      const card = page.getByTestId(`scene-${civ}`),
        inputs = card.getByText('查看计算输入', { exact: true }).locator('..').locator('p').first();
      await expect(card.locator(':scope > .start-k')).toHaveText('到场对照候选');
      await expect(card).toContainText('首兵 50.202 秒 · 期限前 3 兵');
      await expect(inputs).not.toBeVisible();
      await card.getByText('查看计算输入', { exact: true }).click();
      await expect(inputs).toBeVisible();
      await expect(inputs).toContainText(`生命 ${hp} · 攻击`);
      await expect(inputs).toContainText('速度用于到达计算；新训练部队还须完成首个训练周期，现成部队不等待训练。生命、攻击等未参与到场分组。');
      await card.screenshot({ path: testInfo.outputPath(`pocket-${civ.toLowerCase()}.png`), style: 'header.topbar { visibility: hidden !important; }' });
    }
    await section.getByText('调整场景与投入', { exact: true }).click();
    await page.getByLabel('部队状态', { exact: true }).selectOption('ready');
    await expect(page.getByTestId('scene-Franks')).toContainText('首兵 20.202 秒 · 期限前 6 兵');
    await expect(page.getByTestId('scene-Franks').getByText(/速度用于到达计算；新训练部队还须完成首个训练周期，现成部队不等待训练。/)).toBeVisible();
    await page.getByLabel('军事投入', { exact: true }).selectOption('0');
    await expect(huns.locator(':scope > .start-k')).toHaveText('预算不足以完成科技包并购买一兵');
    await expect(section.getByText('到场数量 / 时间侧重', { exact: true })).toHaveCount(0);
    await expect(section.getByText('到场对照候选', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
for (const width of [360, 375, 390, 1280])
  for (const theme of ['dark', 'light']) {
    test(`${width} ${theme} 场景指标与布局`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (e) => {
        if (e.type() === 'error') errors.push(e.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((t) => localStorage.setItem('aoe2-theme', t), theme);
      await select(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const section = page.getByTestId('scenario-suggestions');
      await expect(section).toContainText('不是整局强度榜');
      await expect(page.getByTestId('scene-Britons')).toContainText('1 次');
      await section.getByText('调整场景与投入', { exact: true }).click();
      await page.getByLabel('反应延迟', { exact: true }).selectOption('1.25');
      await expect(page.getByTestId('scene-Britons')).toContainText('0 次');
      await page.getByLabel('场景距离', { exact: true }).selectOption('2');
      await expect(page.getByTestId('scene-Britons')).toContainText('没有先手发射机会');
      await page.getByLabel('后撤空间', { exact: true }).selectOption('4');
      await page.getByLabel('军事投入', { exact: true }).selectOption('0');
      await expect(section).toContainText('当前预算或期限没有可优先建议的部队');
      await section.getByText('范围、科技包与来源', { exact: true }).click();
      await section.getByText('查看计算输入', { exact: true }).first().click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
      await page.getByLabel('军事投入', { exact: true }).selectOption('12000');
      await page.getByLabel('场景距离', { exact: true }).selectOption('12');
      await page.getByLabel('反应延迟', { exact: true }).selectOption('0.5');
      await page.screenshot({ path: testInfo.outputPath(`scenes-${width}-${theme}.png`), fullPage: true });
      if (width === 360) {
        expect((await new AxeBuilder({ page }).include('[data-testid="scenario-suggestions"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual(
          [],
        );
        for (const box of await section
          .locator('button,select,summary')
          .evaluateAll((elements) =>
            elements.filter((e) => e.getClientRects().length).map((e) => ({ w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height })),
          ))
          expect(box.h).toBeGreaterThanOrEqual(44);
      }
    });
  }
test('中路更换场景、保留文明、修改地图、跳过和再开一局', async ({ page }) => {
  await select(page, '中路');
  const section = page.getByTestId('scenario-suggestions');
  await section.getByText('调整场景与投入', { exact: true }).click();
  await page.getByLabel('场景距离', { exact: true }).selectOption('10');
  await expect(page.getByTestId('scene-Huns')).toContainText('4 兵');
  await page.getByLabel('支援期限', { exact: true }).selectOption('1200');
  await expect(page.getByTestId('scene-Berbers')).toContainText('35 兵');
  await page.getByLabel('部队状态', { exact: true }).selectOption('ready');
  await expect(page.getByTestId('scene-Huns')).toContainText('6 兵');
  await page.getByTestId('scene-Huns').getByRole('button', { name: /匈奴/ }).click();
  await page.getByTestId('start-skip').click();
  await expect(page.getByTestId('start-summary')).toContainText('匈奴');
  await page.getByRole('button', { name: '修改地图', exact: true }).click();
  await page.getByTestId('start-skip').click();
  await page.getByTestId('start-skip').click();
  await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
  await expect(page.getByTestId('start-step')).toContainText('已选文明保留');
  await expect(page.getByTestId('scenario-suggestions')).toHaveCount(0);
  await page.getByTestId('start-skip').click();
  await page.getByTestId('start-skip').click();
  await page.getByRole('button', { name: '再开一局', exact: true }).click();
  await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'mode');
  await expect(page.getByTestId('scenario-suggestions')).toHaveCount(0);
});
test('2v2和未选路位不套用计算建议', async ({ page }) => {
  await page.goto('./#/');
  await page.getByRole('button', { name: /组队随机地图/ }).click();
  await page.getByRole('button', { name: '2v2', exact: true }).click();
  await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
  await page.getByRole('button', { name: /^中路/ }).click();
  await expect(page.getByTestId('scenario-suggestions')).toHaveCount(0);
  await expect(page.getByTestId('start-step')).toContainText('当前条件暂无机制建议');
});

test('数据加载失败时保留选择并可继续，不刷新整页', async ({ page }) => {
  await page.route(/\/assets\/trees-[^/]+\.js$/, (route) => route.abort());
  await page.goto('./#/');
  await page.getByTestId('start-lobby').click();
  await page.getByRole('button', { name: /匈奴/ }).click();
  await page.getByTestId('start-skip').click();
  await page.getByRole('button', { name: '修改模式', exact: true }).click();
  await page.getByRole('button', { name: /组队随机地图/ }).click();
  await page.getByRole('button', { name: '4v4', exact: true }).click();
  await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
  await page.getByRole('button', { name: /^中路/ }).click();
  await expect(page.getByRole('alert')).toContainText('加载失败');
  await expect(page.getByTestId('start-step')).toContainText('已选文明保留');
  await page.unroute(/\/assets\/trees-[^/]+\.js$/);
  await page.getByRole('button', { name: '重试场景', exact: true }).click();
  await expect(page.getByTestId('scene-Huns').getByText('城堡时代 · 骑士', { exact: true })).toBeVisible();
  await page.getByTestId('scene-Huns').getByText('为什么', { exact: true }).click();
  await expect(page.getByTestId('scene-Huns').locator('p').filter({ hasText: '预算可负担' })).toBeVisible();
  await expect(page.getByTestId('start-step')).toContainText('已选文明保留');
  await page.getByRole('button', { name: '保留此文明继续', exact: true }).click();
  await page.getByTestId('start-skip').click();
  await expect(page.getByTestId('start-summary')).toContainText('匈奴');
});

for (const [civ, lane, reason] of [
  ['玛雅', '中路', '此路线不可用'],
  ['匈奴', '边路', '不在此路位首批比较范围'],
])
  test(`已选${civ}${lane}解释资格，仍可保留继续`, async ({ page }) => {
    await select(page, lane);
    await page.getByRole('searchbox', { name: '搜索文明', exact: true }).fill(civ!);
    await page.getByRole('button', { name: new RegExp(civ!) }).click();
    await page.getByTestId('start-skip').click();
    await page.getByRole('button', { name: '修改文明', exact: true }).click();
    await expect(page.getByTestId('scenario-suggestions')).toContainText(reason!);
    await page.getByRole('button', { name: '保留此文明继续', exact: true }).click();
    await page.getByTestId('start-skip').click();
    await expect(page.getByTestId('start-summary')).toContainText(civ!);
    const summary = page.getByTestId('start-scene-summary');
    await expect(summary).toContainText(reason!);
    await summary.getByText('查看本局场景结果', { exact: true }).click();
    await expect(summary.locator('p').filter({ hasText: '预算可负担' })).toHaveCount(0);
    await expect(summary.locator('p').filter({ hasText: /先手窗口|期限前/ })).toHaveCount(0);
  });

test('#667 @1280 主卡默认折叠计算证据', async ({ page }) => {
  await select(page, '边路', false);
  console.log(
    JSON.stringify({
      version: await page.locator('[data-t="footer-app-version"]').innerText(),
      build: await page.locator('[data-t="footer-build"]').innerText(),
    }),
  );
  await expect(page.getByTestId('scene-Britons').locator('p').filter({ hasText: '科技及升级' })).not.toBeVisible();
});
test('#667 @1280 本局摘要保留调过的场景', async ({ page }) => {
  await select(page, '中路');
  await page.getByText('调整场景与投入', { exact: true }).click();
  await page.getByLabel('军事投入', { exact: true }).selectOption('2000');
  await page.getByLabel('场景距离', { exact: true }).selectOption('10');
  await page.getByLabel('支援期限', { exact: true }).selectOption('1200');
  await page.getByLabel('部队状态', { exact: true }).selectOption('ready');
  await page.getByLabel('畜牧状态', { exact: true }).selectOption('false');
  await page.getByTestId('scene-Huns').getByRole('button', { name: /匈奴/ }).click();
  await page.getByRole('button', { name: '完成本局', exact: true }).click();
  await expect(page.getByTestId('start-scene-summary')).toContainText('1200');
});
test('#667 @1280 开局打开真实文明时间线', async ({ page }) => {
  await select(page);
  await page
    .getByTestId('scene-Britons')
    .getByRole('button', { name: /不列颠/ })
    .click();
  await page.getByRole('button', { name: '完成本局', exact: true }).click();
  await page.getByTestId('start-summary').getByRole('link', { name: '开局流程', exact: true }).click();
  await expect(page.locator('[data-t="timeline"]')).toBeVisible();
  await expect(page).toHaveURL(/bo=archers-19/);
  await expect(page.locator('[data-t="sum-civ"]')).toContainText('按不列颠计');
});

function planUrl(url: string) {
  const hash = new URL(url).hash;
  return JSON.parse(new URLSearchParams(hash.slice(hash.indexOf('?'))).get('sg')!) as import('../../src/domain/startGame').StartState;
}
for (const width of [360, 375, 390, 1280]) {
  test(`#667 @${width} 两账独立保存到摘要并跨context恢复`, async ({ page, browser }, info) => {
    const errors: string[] = [];
    const listen = (p: Page) => {
      p.on('pageerror', (e) => errors.push(e.message));
      p.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
    };
    listen(page);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((theme) => localStorage.setItem('aoe2-theme', theme), width === 390 ? 'dark' : 'light');
    await select(page, '边路', false);
    for (const card of await page.getByTestId('scenario-suggestions').locator('> article').all()) {
      await expect(card).toContainText('城堡时代 · 弩手');
      await expect(card.locator('.start-why')).toBeVisible();
      await expect(card.locator('p').filter({ hasText: '科技及升级' })).not.toBeVisible();
    }
    await page
      .locator('#home')
      .screenshot({ path: info.outputPath(`plan667-cards-${width}.png`), style: 'header.topbar, .skip-link { visibility:hidden!important; }' });
    const britons = page.getByTestId('scene-Britons');
    await britons.getByText('为什么', { exact: true }).click();
    await expect(britons.locator('p').filter({ hasText: '科技及升级' })).toBeVisible();
    await expect(britons).toContainText('1 次');
    await page.getByTestId('start-back').click();
    await page.getByRole('button', { name: /^中路/ }).click();
    await page.getByText('调整场景与投入', { exact: true }).click();
    await page.getByLabel('军事投入', { exact: true }).selectOption('2000');
    await page.getByLabel('场景距离', { exact: true }).selectOption('10');
    await page.getByLabel('支援期限', { exact: true }).selectOption('1200');
    await page.getByLabel('部队状态', { exact: true }).selectOption('ready');
    await page.getByLabel('畜牧状态', { exact: true }).selectOption('false');
    await page.getByText('封建到城堡：路线衔接', { exact: true }).click();
    await expect.poll(() => planUrl(page.url()).routeConfig).toBeNull();
    await page.getByLabel('封建军事额度（工秒）', { exact: true }).selectOption('6000');
    await page.getByLabel('城堡追加额度（工秒）', { exact: true }).selectOption('600');
    await page.getByLabel('计划保留封建兵数', { exact: true }).selectOption('12');
    await page.getByLabel('城堡新增上限', { exact: true }).selectOption('0');
    await page.getByLabel('路线支援距离（格）', { exact: true }).selectOption('60');
    await page.getByLabel('路线观察窗口（秒）', { exact: true }).selectOption('60');
    await page.getByLabel('路线畜牧', { exact: true }).selectOption('true');
    await expect(page.getByLabel('场景距离', { exact: true })).toHaveValue('10');
    await expect(page.getByLabel('支援期限', { exact: true })).toHaveValue('1200');
    await page.getByTestId('scene-Huns').getByText('为什么', { exact: true }).click();
    const support = page
      .getByTestId('scene-Huns')
      .locator('p')
      .filter({ hasText: /期限前/ });
    await expect(support).toBeVisible();
    const currentSupport = await support.innerText();
    await page.getByTestId('scene-Huns').getByRole('button', { name: /匈奴/ }).click();
    await page.getByRole('button', { name: '完成本局', exact: true }).click();
    await expect(page.getByTestId('start-scene-summary')).toContainText('军事投入 2000 工秒 · 距离 10 格 · 现成部队 · 期限 1200 秒 · 未研究畜牧');
    await expect(page.getByTestId('start-route-summary')).toContainText('独立封建额度 6000 工秒 · 城堡追加 600 工秒');
    await expect(page.getByTestId('start-route-summary')).toContainText('距离 60 格 · 窗口 60 秒');
    await expect.poll(() => planUrl(page.url()).current).toBeNull();
    const saved = planUrl(page.url());
    expect(saved.sceneConfig).toMatchObject({ budget: 2000, distance: 10, deadline: 1200, mode: 'ready', husbandry: false });
    expect(saved.routeConfig).toMatchObject({ feudalBudget: 6000, castleBudget: 600, survivors: 12, newLimit: 0, distance: 60, deadline: 60, husbandry: true });
    const url = page.url();
    await page.getByText('查看本局场景结果', { exact: true }).click();
    await expect(page.getByTestId('start-scene-summary')).toContainText(currentSupport);
    await page.getByText('查看本局场景结果', { exact: true }).click();
    await page
      .locator('#home')
      .screenshot({ path: info.outputPath(`plan667-summary-${width}.png`), style: 'header.topbar, .skip-link { visibility:hidden!important; }' });
    await page.getByRole('button', { name: '修改文明', exact: true }).click();
    await page.getByText('调整场景与投入', { exact: true }).click();
    await expect(page.getByLabel('场景距离', { exact: true })).toHaveValue('10');
    await expect(page.getByLabel('支援期限', { exact: true })).toHaveValue('1200');
    await page.getByText('封建到城堡：路线衔接', { exact: true }).click();
    await expect(page.getByLabel('路线支援距离（格）', { exact: true })).toHaveValue('60');
    await expect(page.getByLabel('城堡追加额度（工秒）', { exact: true })).toHaveValue('600');
    await page.getByLabel('军事投入', { exact: true }).selectOption('12000');
    await expect(page.getByLabel('城堡追加额度（工秒）', { exact: true })).toHaveValue('600');
    await page.evaluate((value) => {
      location.hash = new URL(value).hash;
    }, url);
    await expect(page.getByTestId('start-scene-summary')).toContainText('2000 工秒');
    await page.reload();
    await expect(page.getByTestId('start-route-summary')).toContainText('6000 工秒');
    const freshContext = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      await freshContext.addInitScript(() =>
        localStorage.setItem(
          'aoe2-start-game-v1',
          JSON.stringify({
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
          }),
        ),
      );
      const fresh = await freshContext.newPage();
      listen(fresh);
      await fresh.goto(url);
      await expect(fresh.getByTestId('start-scene-summary')).toContainText('匈奴');
      await expect(fresh.getByTestId('start-route-summary')).toContainText('距离 60 格 · 窗口 60 秒');
      expect(planUrl(fresh.url())).toEqual(saved);
      expect(await fresh.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally {
      await freshContext.close();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

for (const [civ, zh, lane, bo] of [
  ['Huns', '匈奴', '中路', 'scouts-18'],
  ['Franks', '法兰克', '中路', 'scouts-18'],
  ['Berbers', '柏柏尔', '中路', 'fast-castle-knights'],
  ['Vietnamese', '越南', '边路', 'archers-19'],
  ['Incas', '印加', '边路', null],
  ['Mayans', '玛雅', '中路', null],
] as const) {
  test(`#667 @1280 ${civ}真实流程或诚实空态`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await select(page, lane, false);
    await page.getByRole('searchbox', { name: '搜索文明', exact: true }).fill(zh);
    await page
      .locator('.start-catalog')
      .getByRole('button', { name: new RegExp(zh) })
      .click();
    await page.getByRole('button', { name: '完成本局', exact: true }).click();
    const summary = page.getByTestId('start-summary');
    await expect(summary).toContainText(zh);
    if (bo) {
      if (civ === 'Vietnamese') await expect(summary).toContainText('通用示意，资料未列出该文明');
      if (civ === 'Berbers') await expect(summary).toContainText('安全直城后转型，不适合盲目裸奔');
      await summary.getByRole('link', { name: '开局流程', exact: true }).click();
      await expect(page.locator('[data-t="timeline"]')).toBeVisible();
      const query = new URLSearchParams(page.url().split('?')[1]);
      expect(query.get('bo')).toBe(bo);
      expect(query.get('civ')).toBe(civ);
      await expect(page.getByLabel('开局', { exact: true })).toHaveValue(bo);
      await expect(page.locator('#tlciv')).toHaveAttribute('data-value', civ);
      await expect(page.locator('[data-t="sum-civ"]')).toContainText(`按${zh}计`);
      if (civ === 'Vietnamese') await expect(page.getByRole('region', { name: '开局适用文明', exact: true })).toContainText('通用示意');
      await page.reload();
      await expect(page.locator('#tlciv')).toHaveAttribute('data-value', civ);
      await expect(page.getByLabel('开局', { exact: true })).toHaveValue(bo);
    } else {
      await expect(summary).toContainText('暂无与当前路线匹配的开局');
      await expect(summary.getByRole('link', { name: '开局流程', exact: true })).toHaveCount(0);
      await expect(summary.getByRole('link', { name: '查看全部开局', exact: true })).toHaveAttribute('href', new RegExp('#/builds\\?civ=' + civ + '$'));
    }
    expect(errors).toEqual([]);
  });
}

test('#667 @1280 摘要真实数据失败重试、非法配置保留地址和存档', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const state = {
    choice: { mode: 'team', teamSize: '4v4', mapId: 'arabia', lane: 'pocket', civ: 'Huns' },
    sceneConfig: { age: 3, budget: 2000, distance: 10, deadline: 1200, reaction: 0.5, room: 0, mode: 'ready', husbandry: false },
    routeConfig: { feudalBudget: 6000, castleBudget: 600, survivors: 12, newLimit: 0, husbandry: true, distance: 60, deadline: 60 },
    skipped: {},
    prefilled: {},
    teamArmed: true,
    lobby: false,
    laneOpen: false,
    current: 'opponent',
  };
  await page.route(/\/assets\/trees-[^/]+\.js$/, (r) => r.abort());
  await page.goto('./#/?' + new URLSearchParams({ sgv: '1', sg: JSON.stringify(state) }));
  await page.getByRole('button', { name: '完成本局', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('本局打法数据加载失败，已选文明和输入保留');
  await expect(page.getByTestId('start-summary')).toContainText('匈奴');
  expect(planUrl(page.url()).sceneConfig).toEqual(state.sceneConfig);
  await page.unroute(/\/assets\/trees-[^/]+\.js$/);
  await page.getByRole('button', { name: '重试本局打法', exact: true }).click();
  await expect(page.getByTestId('start-scene-summary')).toContainText('2000 工秒');
  const original = await page.evaluate(() => localStorage.getItem('aoe2-start-game-v1'));
  const invalid = planUrl(page.url());
  invalid.sceneConfig!.distance = 11;
  const hash = '/?' + new URLSearchParams({ sgv: '1', sg: JSON.stringify(invalid) });
  await page.evaluate((value) => {
    location.hash = value;
  }, hash);
  await expect(page.getByRole('alert')).toContainText('链接中的本局进度无法恢复');
  await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'mode');
  expect(new URL(page.url()).hash).toBe('#' + hash);
  expect(await page.evaluate(() => localStorage.getItem('aoe2-start-game-v1'))).toBe(original);
  await page.getByRole('button', { name: /1v1 随机地图/ }).click();
  await expect.poll(() => planUrl(page.url()).choice.mode).toBe('1v1');
  expect(planUrl(page.url()).sceneConfig).toBeNull();
  expect(planUrl(page.url()).routeConfig).toBeNull();
  expect(errors).toEqual([]);
});
