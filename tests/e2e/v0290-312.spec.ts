import { expect, test, type Page } from '@playwright/test';
import { guardPage, WIDTHS, wrappedNums } from './v0290-helpers';

/**
 * v0.29.0 验收（#329）A 组 #312 部分：取自 Kent Beck test/v0290-acceptance @ 2b917c0 tests/e2e/v0290-A.spec.ts，断言原样未改。
 * 公开来源：https://aoecoach.com/en/resources/buildings/town-center/ （Castle Age Boom 段）
 */
guardPage();

// ---------- #312 ----------
const observationIds = ['military-building', 'field-army', 'army-departure', 'new-town-center', 'forward-production', 'forward-move'];
const scoutingHref = (scenario: string, stage: string) =>
  './#/scouting?' +
  new URLSearchParams({
    sv: '1',
    data: JSON.stringify({
      scenario,
      map: 'arabia',
      mode: 'one-v-one',
      stage,
      plan: 'undecided',
      observations: Object.fromEntries(observationIds.map((id) => [id, { state: 'unknown', at: '', area: 'unknown', stale: false }])),
    }),
  });
const scenarioSelect = (page: Page) => page.getByLabel('情境', { exact: true });
const stageSelect = (page: Page) => page.getByLabel('我的当前阶段', { exact: true });
const result = (page: Page) => page.getByTestId('scouting-result');
const signals = (page: Page) => page.getByTestId('scouting-signals').locator(':scope > li');

test.describe('#312 侦察辨析', () => {
  for (const width of [360, 1280])
    test(`从默认状态切到「城堡阶段」情境，阶段跟着变为城堡时代，直接看到 3 条信号和假设卡；切回「早期」同样直接可用 @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./#/scouting');
      await expect(scenarioSelect(page)).toHaveValue('early');
      await expect(stageSelect(page)).toHaveValue('feudal');
      await scenarioSelect(page).selectOption('walled');
      await expect(stageSelect(page), '阶段跟随情境').toHaveValue('castle');
      await expect(result(page)).toHaveAttribute('data-analysis-status', 'covered');
      await expect(signals(page)).toHaveCount(3);
      await expect(page.locator('.scouting-hypotheses .scouting-cards > *').first()).toBeAttached();
      await scenarioSelect(page).selectOption('early');
      await expect(stageSelect(page)).toHaveValue('feudal');
      await expect(result(page)).toHaveAttribute('data-analysis-status', 'covered');
      await expect(signals(page)).toHaveCount(3);
    });

  test('「看见新增城镇中心」只列 AoE2 Coach，不标「本站整理」，文字和 aria-label 都不出现「もち」', async ({ page }) => {
    await page.goto(scoutingHref('walled', 'castle'));
    await expect(result(page)).toHaveAttribute('data-analysis-status', 'covered');
    const tc = page.locator('[data-signal="extra-tc"]');
    await expect(tc).not.toContainText('本站整理');
    await expect(tc).not.toContainText('もち');
    const labels = await tc.locator('[aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
    expect(labels.filter((l) => l.includes('もち'))).toEqual([]);
    const hrefs = await tc.locator('a[href]').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(hrefs).toEqual(['https://aoecoach.com/en/resources/buildings/town-center/']);
  });

  test('守卫：forward-building、forward-units 仍显示「本站整理」', async ({ page }) => {
    await page.goto(scoutingHref('walled', 'castle'));
    for (const id of ['forward-building', 'forward-units']) await expect(page.locator(`[data-signal="${id}"]`), id).toContainText('本站整理');
  });

  test('旧分享链接含显式 stage：城堡阶段情境 + 封建时代，打开后保持封建时代，不被改写', async ({ page }) => {
    await page.goto(scoutingHref('walled', 'feudal'));
    await expect(scenarioSelect(page)).toHaveValue('walled');
    await expect(stageSelect(page)).toHaveValue('feudal');
    await page.waitForTimeout(300);
    const data = new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('data');
    expect(JSON.parse(data!).stage).toBe('feudal');
  });

  for (const width of WIDTHS)
    test(`#/scouting 城堡阶段 @${width}：.num 不折行`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(scoutingHref('walled', 'castle'));
      await expect(result(page)).toBeVisible();
      expect(await wrappedNums(page, 'main')).toEqual([]);
    });
});
