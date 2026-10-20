import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const params = (patch: Record<string, string> = {}) =>
  new URLSearchParams({
    mv: '1',
    build: '185872',
    civ: 'Britons',
    age: '4',
    scenario: 'britons-archer-cover',
    mode: 'unknown',
    ownMain: 'unknown',
    enemy: 'unknown',
    wagon: 'unknown',
    cannon: 'unknown',
    terrain: 'unknown',
    formation: 'unknown',
    flank: 'unknown',
    position: 'unknown',
    retreat: 'unknown',
    food: 'unknown',
    woodGold: 'unknown',
    completedForms: '',
    completedUnlockTechIds: '',
    completedBuildings: '',
    ...patch,
  });
const href = (patch: Record<string, string> = {}) => './#/mixed-army?' + params(patch);
const britons = {
  ownMain: '492',
  enemy: 'cavalry-skirmishers',
  terrain: 'open',
  formation: 'grouped',
  flank: 'clear',
  position: 'safe',
  retreat: 'safe',
  food: 'sustainable',
  woodGold: 'sustainable',
  completedForms: '492,359,546,550',
  completedBuildings: '87,12,101,49',
};
const turks = {
  scenario: 'arena-wagon-cannon',
  civ: 'Turks',
  mode: 'one-v-one-arena',
  ownMain: '5',
  enemy: 'wagons-cannon-halberdiers',
  wagon: '1706',
  cannon: '1709',
  terrain: 'open',
  formation: 'spread',
  flank: 'clear',
  position: 'safe',
  retreat: 'safe',
  food: 'sustainable',
  woodGold: 'sustainable',
  completedForms: '441',
  completedUnlockTechIds: '47,10',
  completedBuildings: '87,101,49',
};
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const found: string[] = [];
  errors.set(page, found);
  page.on('pageerror', (error) => found.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') found.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('#241 defaults preserve unknowns, with inputs before folded sources and no adoptable route', async ({ page }) => {
  await page.goto('./#/mixed-army');
  await expect(page.getByRole('heading', { name: '混兵情境卡', exact: true })).toBeVisible();
  await expect(page.getByLabel('现有主力准确形态', { exact: true })).toHaveValue('unknown');
  await expect(page.getByTestId('mixed-conditions-met')).toContainText('目前没有可按所填条件采用的路线');
  expect(await page.getByText('来源、核对日期与适用边界', { exact: true }).evaluate((node) => (node.parentElement as HTMLDetailsElement).open)).toBe(false);
  await expect(page.getByLabel('情境', { exact: true })).toBeInViewport();
});
test('#241 cavalry gains skirmisher protection: task explanation and applicable routes change', async ({ page }) => {
  await page.goto(href({ ...britons, enemy: 'cavalry' }));
  await expect(page.getByTestId('mixed-army-result')).toContainText('只见骑兵时');
  await expect(page.locator('[data-card="britons-halb-screen"]')).toHaveAttribute('data-card-status', 'conditions-met');
  await expect(page.locator('[data-card="britons-light-cav-access"]')).toHaveAttribute('data-card-status', 'conditions-not-met');
  await page.getByLabel('实际敌军组合', { exact: true }).selectOption('cavalry-skirmishers');
  await expect(page.getByTestId('mixed-army-result')).toContainText('不能解决后方掷矛手');
  await expect(page.locator('[data-card="britons-light-cav-access"]')).toHaveAttribute('data-card-status', 'conditions-met');
  await page.getByLabel('侧向到场与后排空当', { exact: true }).selectOption('unknown');
  await expect(page.locator('[data-card="britons-light-cav-access"]')).toHaveAttribute('data-card-status', 'needs-observation');
  await page.getByLabel('侧向到场与后排空当', { exact: true }).selectOption('blocked');
  await page.getByLabel('交战地形', { exact: true }).selectOption('narrow');
  await expect(page.locator('[data-card="britons-light-cav-access"]')).toHaveAttribute('data-card-status', 'conditions-not-met');
  await expect(page.locator('[data-card="britons-protected-onager"]')).toHaveAttribute('data-card-status', 'conditions-met');
});
test('#241 selecting a shape does not confirm its upgrades or a building', async ({ page }) => {
  await page.goto(href({ enemy: 'cavalry', food: 'sustainable', woodGold: 'sustainable' }));
  await page.getByLabel('现有主力准确形态', { exact: true }).selectOption('492');
  await page.getByText('记录已完成的形态、研究与生产建筑', { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '劲弩手', exact: true })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: '靶场', exact: true })).not.toBeChecked();
  await page.getByRole('checkbox', { name: '劲弩手', exact: true }).check();
  await page.getByRole('checkbox', { name: '靶场', exact: true }).check();
  await expect(page.locator('[data-card="britons-halb-screen"]')).toHaveAttribute('data-card-status', 'missing-prerequisites');
  await page.getByRole('checkbox', { name: '长戟兵', exact: true }).check();
  await page.getByRole('checkbox', { name: '兵营', exact: true }).check();
  await expect(page.locator('[data-card="britons-halb-screen"]')).toHaveAttribute('data-card-status', 'conditions-met');
  await page.reload();
  await page.getByText('记录已完成的形态、研究与生产建筑', { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '劲弩手', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '兵营', exact: true })).toBeChecked();
});
test('#241 exact shape replacement and unavailable age stay distinct', async ({ page }) => {
  await page.goto(
    href({
      ...britons,
      ownMain: '8',
      completedForms: '530,359,546,550',
      completedBuildings: '82,12,101,49',
    }),
  );
  await expect(page.locator('[data-card="britons-halb-screen"]')).toHaveAttribute('data-card-status', 'superseded-shape');
  await expect(page.getByTestId('mixed-army-result')).toContainText('已被升级取代');
  await page.goto(
    href({
      ownMain: '8',
      age: '3',
      enemy: 'cavalry',
      completedBuildings: '82',
    }),
  );
  await expect(page.locator('[data-card="britons-halb-screen"]')).toHaveAttribute('data-card-status', 'age-unavailable');
  await expect(page.getByTestId('mixed-conditions-met')).not.toContainText('长戟兵守步弓');
});
test('#241 protected cannon needs explicit chemistry/artillery and a workshop; free is never prechecked', async ({ page }) => {
  await page.goto(href({ ...turks, completedUnlockTechIds: '', completedForms: '' }));
  await expect(page.locator('[data-card="turks-protected-artillery"]')).toHaveAttribute('data-card-status', 'missing-prerequisites');
  await page.getByText('记录已完成的形态、研究与生产建筑', { exact: true }).click();
  for (const name of ['化学', '火炮术', '翼骑兵']) await expect(page.getByRole('checkbox', { name, exact: true })).not.toBeChecked();
  await page.getByRole('checkbox', { name: '化学', exact: true }).check();
  await page.getByRole('checkbox', { name: '火炮术', exact: true }).check();
  await expect(page.locator('[data-card="turks-protected-artillery"]')).toHaveAttribute('data-card-status', 'conditions-met');
  await expect(page.locator('[data-card="turks-flank-opening"]')).toHaveAttribute('data-card-status', 'missing-prerequisites');
  await page.getByRole('checkbox', { name: '翼骑兵', exact: true }).check();
  await expect(page.locator('[data-card="turks-flank-opening"]')).toHaveAttribute('data-card-status', 'conditions-met');
  await page.getByRole('checkbox', { name: '攻城武器厂', exact: true }).uncheck();
  await expect(page.locator('[data-card="turks-protected-artillery"]')).toHaveAttribute('data-card-status', 'missing-prerequisites');
  await page.getByLabel('侧向到场与后排空当', { exact: true }).selectOption('blocked');
  await expect(page.locator('[data-card="turks-flank-opening"]')).toHaveAttribute('data-card-status', 'conditions-not-met');
});
test('#241 out-of-scope civilization, mode and extra enemy remain editable and explicit', async ({ page }) => {
  await page.goto(href(turks));
  await page.getByLabel('我的文明', { exact: true }).selectOption('Britons');
  await expect(page.getByRole('heading', { name: '暂未覆盖这组输入', exact: true })).toBeVisible();
  await expect(page.getByLabel('我的文明', { exact: true })).toHaveValue('Britons');
  await expect(page.locator('[data-card]')).toHaveCount(0);
  await page.goto(href({ ...turks, mode: 'team' }));
  await expect(page.getByTestId('mixed-army-result')).toContainText('其他模式暂未覆盖');
  await page.getByLabel('地图与模式', { exact: true }).selectOption('one-v-one-arena');
  await page.getByLabel('实际敌军组合', { exact: true }).selectOption('other');
  await expect(page.getByTestId('mixed-army-result')).toContainText('实际敌军组合暂未收录');
});
test('#241 complete sharing, manual-copy fallback, fresh tab restore and browser history', async ({ page, context }) => {
  await page.goto(href({ ...turks, food: 'tight', retreat: 'unknown' }));
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('blocked');
        },
      },
    }),
  );
  await page.getByRole('button', { name: '复制情境链接', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('自动复制失败');
  const shared = await page.getByLabel('手动复制情境链接', { exact: true }).inputValue();
  const parsed = new URL(shared);
  expect(parsed.pathname).toMatch(/\/mixed-army\/$/);
  expect(parsed.searchParams.get('completedForms')).toBe('441');
  expect(parsed.searchParams.get('completedUnlockTechIds')).toBe('47,10');
  expect(parsed.searchParams.get('retreat')).toBe('unknown');
  const tab = await context.newPage();
  await tab.goto(shared);
  await expect(tab.getByLabel('我的文明', { exact: true })).toHaveValue('Turks');
  await expect(tab.getByLabel('食物持续能力', { exact: true })).toHaveValue('tight');
  await expect(tab.getByLabel('撤回与替代资源', { exact: true })).toHaveValue('unknown');
  await tab.getByText('记录已完成的形态、研究与生产建筑', { exact: true }).click();
  await expect(tab.getByRole('checkbox', { name: '化学', exact: true })).toBeChecked();
  await expect(tab.getByRole('checkbox', { name: '翼骑兵', exact: true })).toBeChecked();
  await tab.close();
  await page.goto(href(britons));
  await page.goBack();
  await expect(page.getByLabel('我的文明', { exact: true })).toHaveValue('Turks');
  await expect(page.getByLabel('撤回与替代资源', { exact: true })).toHaveValue('unknown');
});
test('#241 strict damaged links lock; recoverable semantic mistakes retain editable values', async ({ page }) => {
  for (const bad of [
    href() + '&age=4',
    href() + '&extra=1',
    './#/mixed-army?mv=1',
    href({ mv: '99' }),
    href({ build: '0' }),
    href({ completedForms: '441,441' }),
    href() + '&bad=%FF',
    './#/mixed-army?' + 'x'.repeat(6001),
  ]) {
    await page.goto(bad);
    await expect(page.getByRole('alert')).toContainText('推导已暂停');
    await expect(page.getByTestId('mixed-army-result')).toHaveCount(0);
    await expect(page.getByLabel('情境', { exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '复制情境链接', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '重置为默认情境', exact: true }).click();
    await expect(page.getByLabel('现有主力准确形态', { exact: true })).toHaveValue('unknown');
  }
  await page.goto(href({ age: '9' }));
  await expect(page.getByLabel('我的当前时代', { exact: true })).toHaveValue('9');
  await expect(page.getByLabel('我的当前时代', { exact: true })).toBeEnabled();
  await expect(page.getByTestId('mixed-army-result')).toContainText('需要修正');
  await page.getByLabel('我的当前时代', { exact: true }).selectOption('4');
  await expect(page.getByTestId('mixed-army-result')).toContainText('关键信息仍未知');
});
test('#241 keyboard focus, sources and copy feedback remain usable', async ({ page }) => {
  await page.goto(href(britons));
  const enemy = page.getByLabel('实际敌军组合', { exact: true });
  await enemy.focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(enemy).toHaveValue('skirmishers');
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => undefined },
    }),
  );
  await page.getByRole('button', { name: '复制情境链接', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('情境链接已复制');
  await page.getByText('来源、核对日期与适用边界', { exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('尚未完成该版本客户端交战实测', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: '单位PK：局部单兵资料', exact: true })).toHaveAttribute('href', /\/duel$/);
});
test('#241 asynchronous fixed-tree loading failure has an explicit retry state', async ({ page }) => {
  const treeAsset = /\/(?:assets\/trees-[^/]+\.js|src\/data\/trees\.json)(?:\?.*)?$/;
  await page.route(treeAsset, (route) => route.fulfill({ status: 503, contentType: 'text/javascript', body: 'fixture unavailable' }));
  await page.goto('./#/mixed-army');
  await expect(page.getByRole('alert')).toContainText('固定资料加载失败');
  await expect(page.getByRole('button', { name: '重新加载资料', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '复制情境链接', exact: true })).toBeDisabled();
  // The expected HTTP 503 emits a resource error; all unrelated errors still fail this test.
  errors.set(
    page,
    (errors.get(page) ?? []).filter((message) => !message.includes('status of 503')),
  );
  await page.unroute(treeAsset);
  await page.getByRole('button', { name: '重新加载资料', exact: true }).click();
  await expect(page.getByLabel('情境', { exact: true })).toBeVisible();
});
for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#241 ${width}px ${theme}: layout, targets, AA and sources`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(href({ ...britons, flank: 'blocked', terrain: 'narrow' }));
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      await expect(page.getByTestId('mixed-army-page')).toBeVisible();
      await page.getByText('记录已完成的形态、研究与生产建筑', { exact: true }).click();
      await page.getByText('来源、核对日期与适用边界', { exact: true }).click();
      await page.locator('[data-card="britons-protected-onager"] summary').click();
      const undersized = await page
        .getByTestId('mixed-army-page')
        .locator('select, button, summary, a')
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => {
              const rect = node.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
            })
            .map((node) => ({
              text: node.textContent,
              width: node.getBoundingClientRect().width,
              height: node.getBoundingClientRect().height,
            })),
        );
      expect(undersized).toEqual([]);
      expect(
        (await new AxeBuilder({ page }).include('[data-testid="mixed-army-page"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations,
      ).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`mixed-army-${width}-${theme}.png`),
        fullPage: true,
      });
    });
