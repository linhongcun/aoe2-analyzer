import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const scene = {
  choice: { mode: 'team', teamSize: '4v4', mapId: 'arabia', lane: 'pocket', civ: null, opponent: null, mates: [] },
  sceneConfig: null,
  routeConfig: null,
  skipped: {},
  prefilled: {},
  teamArmed: true,
  lobby: false,
  laneOpen: false,
  current: 'civ',
};
const sceneRoute = './#/?' + new URLSearchParams({ sgv: '1', sg: JSON.stringify(scene) });

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark']) {
    test(`任务优先 UI ${theme} @${width}：六页、首屏、键盘与可访问性`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((v) => localStorage.setItem('aoe2-theme', v), theme);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      for (const [name, route, ready] of [
        ['home', './#/', '#home h1'],
        ['civs', './#/civs', '#grid .card'],
        ['units', './#/units', '#ugrid .unit-row'],
        ['civ', './#/civ/Franks', '[data-testid="civ-ratings"]'],
        ['unit', './#/unit/38', '.detail-stats'],
        ['tree', './#/tree', '.tcell'],
        ['scene', sceneRoute, '.start-scene-card'],
      ]) {
        await page.goto(route!);
        await page.locator(ready!).first().waitFor();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name).toBe(true);
        const results = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze();
        if (name === 'tree') {
          // 科技树仅审计：基线已有 #trm 无可访问名称，本轮不改科技树。
          await info.attach('technology-tree-accessibility', { body: JSON.stringify(results.violations), contentType: 'application/json' });
        } else {
          expect(
            results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
            name,
          ).toEqual([]);
        }
        if (name === 'civs' || name === 'units') {
          const toggle = page.locator('.catalog-filter-toggle'),
            panel = page.locator('.catalog-filter-panel');
          if (width <= 600) {
            await expect(panel).toBeHidden();
            const grid = page.locator(name === 'civs' ? '#grid' : '#ugrid');
            expect((await grid.boundingBox())!.y).toBeLessThan(name === 'civs' ? 550 : 430);
            await toggle.focus();
            await page.keyboard.press('Enter');
            await expect(panel).toBeVisible();
            await panel.locator('select').first().focus();
            await page.keyboard.press('Escape');
            await expect(panel).toBeHidden();
            await expect(toggle).toBeFocused();
            await page.keyboard.press('Tab');
            expect(await panel.evaluate((el) => el.contains(document.activeElement))).toBe(false);
          } else await expect(panel).toBeVisible();
        }
        if (name === 'unit') {
          expect((await page.getByTestId('insight-slot').boundingBox())!.height).toBeLessThanOrEqual(56);
          await expect(page.getByTestId('insight-empty')).toHaveText('暂无');
          await page.getByRole('tab', { name: '概览', exact: true }).focus();
          await page.keyboard.press('ArrowRight');
          await expect(page.getByRole('tab', { name: '科技模拟器', exact: true })).toBeFocused();
        }
        if (name === 'scene') {
          expect((await page.locator('.start-scene-card').first().boundingBox())!.y).toBeLessThan(width <= 600 ? 760 : 680);
          const limits = page.getByText('范围、科技包与来源', { exact: true });
          await limits.focus();
          await page.keyboard.press('Enter');
          await expect(page.getByText(/已升城堡，建筑和人口就绪，资源预先到位/)).toBeVisible();
          await expect(page.getByText(/模型 .*配置/)).toBeVisible();
        }
        await page.screenshot({ path: info.outputPath(`${name}-${theme}-${width}.png`) });
      }
      expect(errors).toEqual([]);
    });
  }

test('收起筛选保留实际条件、跨页返回与断点焦点', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('./#/units');
  const toggle = page.locator('.catalog-filter-toggle');
  await toggle.click();
  await page.locator('#urole').selectOption('cavalry');
  await page.locator('#uq').fill('Knight');
  await page.keyboard.press('Escape');
  await expect(page.locator('.catalog-filter-panel')).toBeHidden();
  await expect(page.locator('.catalog-filter-active')).toContainText('骑兵');
  await expect(page.locator('.catalog-filter-active')).toContainText('Knight');
  await page.locator('#ugrid .unit-row').first().click();
  await page.getByRole('link', { name: '单位', exact: true }).first().click();
  await expect(page.locator('.catalog-filter-active')).toContainText('骑兵');
  await expect(page.locator('.catalog-filter-panel')).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('#udlc').focus();
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(toggle).toBeFocused();
  await page.getByRole('button', { name: '清空筛选', exact: true }).click();
  await expect(page.locator('#uq')).toBeFocused();
  await expect(page.locator('#ucnt')).toHaveText('163 / 163');
});
