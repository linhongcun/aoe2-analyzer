import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const history = (page: Page) => page.getByTestId('entity-history');
const version = (page: Page, id: string) => history(page).locator(`[data-history-version="${id}"]`);

async function openHistory(page: Page, route: string) {
  await page.goto(`./#${route}`);
  await expect(history(page).locator('[data-history-entry]').first()).toBeVisible();
}

function recordErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('#435 弩手跨版本升级费用可追溯，历史筛选可分享并恢复', async ({ page }) => {
  const errors = recordErrors(page);
  await openHistory(page, '/unit/24?tab=history&civ=Britons');
  await expect(page.getByRole('tab', { name: '更新历史', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(version(page, '66692')).toContainText(/125\s*食物/);
  await expect(version(page, '66692')).toContainText(/175\s*食物/);
  await expect(version(page, '66692')).toContainText('升级');
  await expect(version(page, '125283')).toContainText(/100\s*(?:黄金|金)/);
  await expect(version(page, '125283')).toContainText('升级');
  const source = version(page, '66692').getByRole('link', { name: /官方/ }).first();
  await expect(source).toHaveAttribute('href', 'https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-66692/');
  const english = version(page, '66692').locator('details').first();
  await english.locator('summary').click();
  await expect(english).toContainText('Crossbowman');
  await page.getByLabel('开始日期', { exact: true }).fill('2022-08-29');
  await page.getByLabel('结束日期', { exact: true }).fill('2022-08-29');
  await expect(version(page, '66692')).toBeVisible();
  await expect(version(page, '125283')).toHaveCount(0);
  await page.reload();
  await expect(version(page, '66692')).toBeVisible();
  await expect(page.getByLabel('开始日期', { exact: true })).toHaveValue('2022-08-29');
  await page.getByLabel('搜索历史', { exact: true }).fill('无此历史内容435');
  await expect(history(page)).toContainText('没有符合筛选条件的记录');
  await expect(history(page)).not.toContainText('尚未收录该对象的更新历史');
  await page.getByRole('button', { name: '清除历史筛选', exact: true }).click();
  await expect(version(page, '125283')).toBeVisible();
  await expect(page).toHaveURL(/tab=history/);
  await expect(page).toHaveURL(/civ=Britons/);
  expect(new URL(page.url()).hash).not.toMatch(/hist(?:From|To|Query)=/);
  await page.getByLabel('开始日期', { exact: true }).fill('2024-10-15');
  await page.getByLabel('结束日期', { exact: true }).fill('2022-08-29');
  await expect(history(page)).toContainText('开始日期不能晚于结束日期');
  expect(errors).toEqual([]);
});

test('#435 古拉姆普通和精锐历史分开，文明与科技都有来源记录', async ({ page }) => {
  const errors = recordErrors(page);
  await openHistory(page, '/unit/1747?tab=history');
  await expect(version(page, '66692')).toContainText('65');
  await expect(version(page, '66692')).toContainText('55');
  await expect(version(page, '66692').locator('[data-history-entry]').filter({ hasText: '75' })).toHaveCount(0);
  await openHistory(page, '/unit/1749?tab=history');
  await expect(version(page, '66692')).toContainText('75');
  await expect(version(page, '66692')).toContainText('65');
  await expect(version(page, '66692').locator('[data-history-entry]').filter({ hasText: '55' })).toHaveCount(0);
  await openHistory(page, '/civ/Burgundians?tab=history');
  const economy = version(page, '66692')
    .locator('[data-history-entry]')
    .filter({ hasText: /经济科技/ });
  await expect(economy).toContainText('50');
  await expect(economy).toContainText('40');
  await openHistory(page, '/tech/875?tab=history');
  await expect(version(page, '81058')).toContainText('新增');
  await expect(version(page, '81058')).toContainText(/护甲/);
  await openHistory(page, '/unit/74?tab=history');
  await page.getByLabel('影响关系', { exact: true }).selectOption('related');
  await expect(history(page)).toContainText('软甲');
  await expect(history(page)).toContainText('关联影响');
  expect(errors).toEqual([]);
});

test('#435 已删除科技可直接打开历史档案，不回退到当前科技列表', async ({ page }) => {
  const errors = recordErrors(page);
  await openHistory(page, '/tech/716?tab=history');
  await expect(page.getByRole('heading', { name: /补给/ }).first()).toBeVisible();
  await expect(page.getByText('历史档案，当前数据目录未收录', { exact: true })).toBeVisible();
  await expect(version(page, '81058')).toContainText('35');
  await expect(version(page, '81058')).toContainText('20');
  await expect(history(page).getByRole('link', { name: /81058/ }).first()).toHaveAttribute('href', '#/patches/81058');
  await openHistory(page, '/tech/legacy-berserkergang?tab=history');
  await expect(page.getByRole('heading', { name: /Berserkergang/ }).first()).toBeVisible();
  await expect(page.getByText('历史档案，当前数据目录未收录', { exact: true })).toBeVisible();
  await expect(history(page)).toContainText('81058');
  expect(errors).toEqual([]);
});

test('#435 尚未收录的当前科技与筛选无结果使用不同空态', async ({ page }) => {
  await page.goto('./#/tech/22?tab=history');
  await expect(history(page)).toContainText('尚未收录该对象的更新历史');
  await expect(history(page)).not.toContainText('没有符合筛选条件的记录');
  await expect(history(page).locator('[data-history-entry]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /织布机/ }).first()).toBeVisible();
});

test('#435 更新历史真实数据请求被延迟时显示加载，放行后再展示记录', async ({ page }) => {
  let release!: () => void;
  let intercepted!: () => void;
  const requestSeen = new Promise<void>((resolve) => {
    intercepted = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/*66692*.json', async (route) => {
    intercepted();
    await gate;
    await route.continue();
  });
  try {
    await page.goto('./#/unit/24?tab=history');
    await requestSeen;
    await expect(page.getByRole('status').filter({ hasText: '正在加载更新历史' })).toBeVisible();
    await expect(page.locator('[data-history-entry]')).toHaveCount(0);
    release();
    await expect(version(page, '66692').locator('[data-history-entry]').first()).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: '正在加载更新历史' })).toHaveCount(0);
  } finally {
    release();
  }
});

test('#435 数据请求失败后重试会重新请求并恢复原有筛选', async ({ page }) => {
  let requests = 0;
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/*66692*.json', async (route) => {
    requests += 1;
    if (requests === 1) await route.fulfill({ status: 503, body: 'temporary failure', headers: { 'cache-control': 'no-store' } });
    else await route.continue();
  });
  await page.goto('./#/unit/24?tab=history&histKind=nerf');
  await expect(page.getByRole('alert')).toContainText('更新历史加载失败');
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(version(page, '66692').locator('[data-history-entry]').first()).toBeVisible();
  await expect(page.getByLabel('改动类型', { exact: true })).toHaveValue('nerf');
  await expect(page).toHaveURL(/histKind=nerf/);
  expect(requests).toBe(2);
  expect(pageErrors).toEqual([]);
});

test('#435 按版本浏览四份档案，旧版不混入后来热修和最新版说明', async ({ page }) => {
  const errors = recordErrors(page);
  await page.goto('./#/patches');
  for (const id of ['185872', '125283', '81058', '66692']) await expect(page.getByRole('link', { name: new RegExp(`DE Update ${id}`) })).toBeVisible();
  for (const id of ['66692', '81058', '125283', '185872']) {
    await page.goto(`./#/patches/${id}`);
    await expect(page.getByRole('heading', { name: `DE Update ${id}`, exact: true })).toBeVisible();
    await expect(page.locator('.patch-entry').first()).toBeVisible();
    await noOverflow(page);
    if (id !== '185872') await expect(page.locator('.patches')).not.toContainText('新增地图 Arabian Desert');
  }
  await page.goto('./#/patches/66692');
  await expect(page.locator('.patch-entry').filter({ hasText: '71094' })).toHaveCount(0);
  await page.goto('./#/patches/125283');
  await expect(page.locator('.patch-entry').filter({ hasText: '127161' })).toHaveCount(0);
  await page.goto('./#/patches/unknown-history435');
  await expect(page.getByRole('heading', { name: '找不到版本 unknown-history435' })).toBeVisible();
  expect(errors).toEqual([]);
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#435 更新历史四宽双主题 ${width} ${theme}`, async ({ page }, info) => {
      const errors = recordErrors(page);
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      for (const [name, route] of [
        ['unit', '/unit/24?tab=history'],
        ['civ', '/civ/Burgundians?tab=history'],
        ['tech', '/tech/875?tab=history'],
        ['archived-tech', '/tech/716?tab=history'],
      ]) {
        await openHistory(page, route!);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await noOverflow(page);
        const controls = history(page).locator('input, select, button');
        for (const control of await controls.all()) {
          if (!(await control.isVisible())) continue;
          const box = await control.boundingBox();
          expect(box!.height).toBeGreaterThanOrEqual(44);
        }
        await page.screenshot({ path: info.outputPath('entity-history-435', `${name}-${width}-${theme}.png`), fullPage: true });
      }
      const violations = (await new AxeBuilder({ page }).include('[data-testid="entity-history"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations;
      expect(violations).toEqual([]);
      await page.getByLabel('搜索历史', { exact: true }).focus();
      await expect(page.getByLabel('搜索历史', { exact: true })).toBeFocused();
      expect(errors).toEqual([]);
    });
