import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const techNames = JSON.parse(readFileSync('src/data/techs.json', 'utf8')) as { id: number; zh: string }[];
const archerArmor = techNames.find((tech) => tech.id === 211),
  thumbRing = techNames.find((tech) => tech.id === 437);
if (!archerArmor || !thumbRing) throw new Error('Missing pinned archer technology names');
async function select(page: Page, lane = '边路') {
  await page.goto('./#/');
  await page.getByRole('button', { name: /组队随机地图/ }).click();
  await page.getByRole('button', { name: '4v4', exact: true }).click();
  await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
  await page.getByRole('button', { name: new RegExp('^' + lane) }).click();
  await expect(page.getByTestId('scene-Britons')).toContainText('预算可负担');
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
  await page.getByRole('button', { name: '补路位', exact: true }).click();
  await page.getByRole('button', { name: /^中路/ }).click();
  await expect(page.getByRole('alert')).toContainText('加载失败');
  await expect(page.getByTestId('start-step')).toContainText('已选文明保留');
  await page.unroute(/\/assets\/trees-[^/]+\.js$/);
  await page.getByRole('button', { name: '重试场景', exact: true }).click();
  await expect(page.getByTestId('scene-Huns')).toContainText('预算可负担');
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
  });
