import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
const href = (changes: Record<string, string> = {}) =>
  './#/castle-defense?' +
  new URLSearchParams({ dv: '1', observation: 'stone', age: '2', escort: 'unknown', path: 'unknown', resources: 'unknown', ...changes });
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', (error) => list.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') list.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('#242 stone is a clue; confirmed observation determines the four branches', async ({ page }) => {
  await page.goto('./#/castle-defense');
  await expect(page.getByRole('heading', { name: '城堡前置应对', exact: true })).toBeVisible();
  await expect(page.getByTestId('castle-defense-result')).toContainText('还不能认定对手正在城堡前置');
  await page.getByLabel('观察状态', { exact: true }).selectOption('construction');
  await expect(page.getByTestId('castle-defense-result')).toContainText('不把未知当作没有护军');
  await expect(page.locator('[data-action="intercept"]')).toHaveCount(0);
  await page.getByLabel('敌方护军', { exact: true }).selectOption('absent');
  await page.getByLabel('到场与撤回通路', { exact: true }).selectOption('safe');
  await expect(page.locator('[data-action="intercept"]')).toBeVisible();
  await page.getByLabel('观察状态', { exact: true }).selectOption('completed');
  await expect(page.getByRole('heading', { name: '城堡已成，资源情况未知：先查退路' })).toBeVisible();
  await expect(page.locator('[data-action="intercept"]')).toHaveCount(0);
  await page.getByLabel('资源可迁移情况', { exact: true }).selectOption('movable');
  await expect(page.locator('[data-action="relocate"]')).toBeVisible();
  await expect(page.getByTestId('castle-defense-result')).toContainText('击杀建筑者已不能取消');
  await page.getByLabel('资源可迁移情况', { exact: true }).selectOption('blocked');
  await expect(page.locator('[data-action="remnant"]')).toBeVisible();
  await expect(page.locator('[data-action="relocate"]')).toHaveCount(0);
});
test('#242 unknown and unsafe access never trigger a villager rush', async ({ page }) => {
  await page.goto(href({ observation: 'construction', escort: 'absent' }));
  await expect(page.getByTestId('castle-defense-result')).toContainText('不建议村民强冲');
  await expect(page.locator('[data-action="intercept"]')).toHaveCount(0);
  await page.getByLabel('到场与撤回通路', { exact: true }).selectOption('unsafe');
  await expect(page.getByTestId('castle-defense-result')).toContainText('无法安全到场或撤回');
  await page.getByLabel('到场与撤回通路', { exact: true }).selectOption('safe');
  await page.getByLabel('敌方护军', { exact: true }).selectOption('present');
  await expect(page.locator('[data-action="intercept"]')).toHaveCount(0);
  await page.getByLabel('观察状态', { exact: true }).selectOption('completed');
  await page.getByLabel('资源可迁移情况', { exact: true }).selectOption('movable');
  await page.getByLabel('到场与撤回通路', { exact: true }).selectOption('unknown');
  await expect(page.getByTestId('castle-defense-result')).toContainText('安全通路仍未确认');
});
test('#242 trebuchets stay in future preparations before Imperial and retain conditions afterwards', async ({ page }) => {
  await page.goto(href({ observation: 'completed', resources: 'blocked', age: '2' }));
  await expect(page.getByTestId('castle-defense-actions')).not.toContainText('巨型投石机');
  await expect(page.locator('[data-action="future-castle"]')).toBeVisible();
  await expect(page.locator('[data-action="future-trebuchet"]')).toBeVisible();
  await page.getByLabel('我的当前时代', { exact: true }).selectOption('3');
  await expect(page.locator('[data-action="castle"]')).toBeVisible();
  await expect(page.getByTestId('castle-defense-actions')).not.toContainText('巨型投石机');
  await page.getByLabel('我的当前时代', { exact: true }).selectOption('4');
  await expect(page.locator('[data-action="trebuchet"]')).toContainText('本方科技树允许');
  await expect(page.locator('[data-action="future-trebuchet"]')).toHaveCount(0);
});
test('#242 complete sharing survives reload and sources distinguish guidance from evidence', async ({ page }) => {
  await page.goto(href({ observation: 'completed', resources: 'blocked', age: '4', escort: 'present', path: 'unsafe' }).replace('./#/', './unit/83/#/'));
  await page.reload();
  for (const [label, value] of [
    ['观察状态', 'completed'],
    ['我的当前时代', '4'],
    ['敌方护军', 'present'],
    ['到场与撤回通路', 'unsafe'],
    ['资源可迁移情况', 'blocked'],
  ]) {
    await expect(page.getByLabel(label!, { exact: true })).toHaveValue(value!);
  }
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
  await page.getByRole('button', { name: '复制观察链接' }).click();
  await expect(page.getByRole('status')).toContainText('自动复制失败');
  const shared = await page.getByLabel('观察链接', { exact: true }).inputValue();
  expect(new URL(shared).pathname).toMatch(/\/castle-defense\/$/);
  expect(new URL(shared).hash).toBe('');
  expect(shared).toContain('escort=present');
  expect(shared).toContain('path=unsafe');
  await page.goto(shared);
  await expect(page.getByLabel('资源可迁移情况', { exact: true })).toHaveValue('blocked');
  await page.getByText('来源、复核日期与适用范围', { exact: true }).click();
  await expect(page.getByText('Steam 原帖仅作为需求证据', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: '官方：攻城与经济调整', exact: true }).last()).toHaveAttribute('href', /military-and-economy-aoe2/);
});
test('#242 damaged parameters suspend advice until explicit reset', async ({ page }) => {
  for (const url of [
    href() + '&age=3',
    href() + '&x=1',
    href({ age: '03' }),
    href({ dv: '99' }),
    href({ escort: 'none' }),
    './#/castle-defense?dv=1',
    href() + '&broken=%FF',
  ]) {
    await page.goto(url);
    await expect(page.getByRole('alert')).toContainText('行动已暂停');
    await expect(page.getByTestId('castle-defense-result')).toHaveCount(0);
    await expect(page.getByLabel('观察状态', { exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '复制观察链接' })).toBeDisabled();
    await page.getByRole('button', { name: '重置为默认观察' }).first().click();
    await expect(page.getByTestId('castle-defense-result')).toContainText('还不能认定');
  }
});
test('#242 keyboard operation, copy feedback and printing remain usable', async ({ page }) => {
  await page.goto('./#/castle-defense');
  const observation = page.getByLabel('观察状态', { exact: true });
  await observation.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(observation).toHaveValue('construction');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => undefined } });
    window.print = () => undefined;
  });
  await page.getByRole('button', { name: '复制观察链接' }).click();
  await expect(page.getByRole('status')).toContainText('链接已复制');
  await page.getByRole('button', { name: '打印当前清单' }).click();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('[data-action="prepare"]')).toBeVisible();
  await expect(page.getByRole('button', { name: '打印当前清单' })).toBeHidden();
});
for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#242 ${width}px ${theme} has readable controls, sources and no overflow`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(href({ observation: 'completed', resources: 'blocked', age: '3', escort: 'present', path: 'unsafe' }));
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      await expect(page.getByTestId('castle-defense-page')).toBeVisible();
      await expect(page.getByTestId('castle-defense-actions')).toContainText('代价与风险');
      await expect(page.getByTestId('castle-defense-actions')).toContainText('下次复查');
      const badControls = await page
        .getByTestId('castle-defense-page')
        .locator('select, button, summary, a:visible')
        .evaluateAll((elements) =>
          elements
            .filter((element) => {
              const box = element.getBoundingClientRect();
              return box.width > 0 && box.height > 0 && box.height < 44;
            })
            .map((element) => element.textContent),
        );
      expect(badControls).toEqual([]);
      expect((await new AxeBuilder({ page }).include('[data-testid="castle-defense-page"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`castle-defense242-${width}-${theme}.png`), fullPage: true });
    });
