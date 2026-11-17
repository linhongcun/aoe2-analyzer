import { expect, test } from '@playwright/test';
import { unitConflictFixture, unitSourceStateFixture } from '../helpers/unitUpdatesFixture';
import { UNIT_SOURCE_LABELS } from '../../src/domain/unitUpdates';
import { historyFixture } from '../helpers/civUpdatesFixture';

test('unit detail projects one shape while source processing keeps all eight original bullets', async ({ page }) => {
  await page.goto('/#/unit/1231?tab=history&histVersion=de-34055');
  const reader = page.locator('[data-unit-history="unit/1231"]');
  const hp = reader.locator('[data-event-id="ev-se-73d7a54c-b4cb-44a0-84c3-f58ec2a048fb"]');
  await expect(hp.locator('.civ-update-values .num')).toHaveText(['50 HP', '40 HP']);
  await hp.getByText('来源与原文', { exact: false }).click();
  await expect(hp.locator('blockquote').last()).toContainText('50/55生命值');
  await reader.getByText('来源覆盖与逐条处理', { exact: false }).click();
  const processing = reader.locator('.civ-update-processing').first();
  await expect(processing.locator('article')).toHaveCount(8);
  await expect(processing).toContainText('已排除');
  await expect(processing).toContainText('61321');
  await reader
    .getByRole('navigation', { name: '单位形态与独立身份' })
    .getByRole('link', { name: /ID 1233/ })
    .click();
  await expect(page).toHaveURL(/histVersion=de-34055/);
  await expect(page.locator('[data-event-id="ev-se-73d7a54c-b4cb-44a0-84c3-f58ec2a048fb"] .civ-update-values .num')).toHaveText(['55 HP', '45 HP']);
  await page
    .getByRole('navigation', { name: '单位形态与独立身份' })
    .getByRole('link', { name: /ID 1260/ })
    .click();
  await expect(page.locator('[data-unit-history]')).toContainText('尚未收录该单位');
});

for (const state of ['pending', 'not-checked', 'not-located', 'page-not-found', 'no-log'] as const) {
  test(`labelled ${state} source fixture has its own honest coverage state`, async ({ page }) => {
    await page.route('**/civ-updates*.json', (route) => route.fulfill({ json: unitSourceStateFixture(state) }));
    await page.goto('/#/patches?obj=unit:1372');
    const reader = page.locator('[data-unit-history="unit/1372"]');
    await expect(reader).toContainText(UNIT_SOURCE_LABELS[state]);
    await reader.getByText('来源覆盖与逐条处理', { exact: false }).click();
    await expect(reader).toContainText('测试夹具：' + state);
    if (state === 'pending') await expect(reader).toContainText('尚未归并的单位原文');
    if (state === 'no-log') await expect(reader).toContainText('原始条目：0');
    await expect(page.getByRole('button', { name: '重试单位历史' })).toHaveCount(0);
  });
}

test('historical name search, keyboard selection, share reload and full return preserve identity and filters', async ({ page, context }) => {
  await page.goto('/#/patches');
  const search = page.getByRole('combobox', { name: '搜索单位历史' });
  await search.fill('钦察骑射手');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/obj=unit%3A1231/);
  await expect(page.locator('#unit-history-title')).toBeFocused();
  const reader = page.locator('[data-unit-history]');
  await reader.getByText('筛选已收录的单位历史', { exact: true }).click();
  await reader.getByRole('combobox', { name: '版本', exact: true }).selectOption('de-34055');
  await reader.getByLabel('事实核验').selectOption('unverified');
  const before = new URL(page.url()).hash;
  await reader.getByRole('link', { name: '打开单位详情' }).click();
  await expect(page).toHaveURL(/tab=history/);
  await expect(page).toHaveURL(/histReturn=/);
  await page.reload();
  await expect(page.getByRole('combobox', { name: '版本', exact: true })).toHaveValue('de-34055');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: '复制历史分享地址' }).click();
  await expect(page.getByRole('status').filter({ hasText: '已复制当前历史地址' })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).not.toContain('histReturn');
  expect(copied).toContain('histVersion=de-34055');
  await page.getByRole('link', { name: '返回上次历史结果' }).click();
  expect(new URL(page.url()).hash).toBe(before);
});

test('loading and failed payload retry retain unit and query state', async ({ page }) => {
  let attempts = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/civ-updates*.json', async (route) => {
    if (++attempts === 1) {
      await held;
      await route.fulfill({ status: 503, body: 'unavailable' });
    } else await route.continue();
  });
  await page.goto('/#/patches?obj=unit:1231&histVersion=de-34055');
  await expect(page.getByRole('status')).toContainText('正在读取单位');
  release();
  await expect(page.getByRole('alert')).toContainText('单位更新历史读取失败');
  await page.getByRole('button', { name: '重试单位历史' }).click();
  await expect(page.locator('[data-unit-history]')).toBeVisible();
  await expect(page.getByRole('combobox', { name: '版本', exact: true })).toHaveValue('de-34055');
  expect(attempts).toBe(2);
});

test('labelled conflict fixture keeps both claims and source evidence at narrow dark viewport', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));
  await page.route('**/civ-updates*.json', (route) => route.fulfill({ json: unitConflictFixture() }));
  await page.goto('/#/patches?obj=unit:1231&histVerification=conflict&histCiv=Cumans');
  const event = page.locator('[data-event-id="fixture-conflict"]');
  await expect(event).toContainText('来源冲突，尚未确认');
  await expect(event.locator('.civ-update-claim')).toHaveCount(2);
  await event.locator('summary').click();
  await expect(event.locator('blockquote')).toHaveCount(2);
  await expect(event.locator('img[src="x"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await event.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('unit-conflict-390-dark.png'), fullPage: false });
});

test('invalid and empty filters recover without clearing selected shape or object search', async ({ page }) => {
  await page.goto('/#/patches?obj=unit:1370&histQuery=草原&histVersion=bad');
  await expect(page.getByRole('alert')).toContainText('无法识别');
  await page.getByRole('button', { name: '清除历史筛选' }).click();
  await expect(page).toHaveURL(/obj=unit%3A1370/);
  await expect(page.getByRole('combobox', { name: '搜索单位历史' })).toHaveValue('草原');
  await page.getByText('筛选已收录的单位历史', { exact: true }).click();
  await page.getByRole('combobox', { name: '版本', exact: true }).selectOption('de-47820');
  await expect(page.locator('[data-unit-history]')).toContainText('45');
  await page
    .getByRole('navigation', { name: '单位形态与独立身份' })
    .getByRole('link', { name: /ID 1372/ })
    .click();
  await expect(page).toHaveURL(/histVersion=de-47820/);
  await expect(page.locator('[data-unit-history]')).toContainText('没有符合筛选条件');
});

test('labelled source read failure keeps pinned old evidence and is distinct from application fetch failure', async ({ page }) => {
  const data = historyFixture();
  const row = data.units!.rows.find((r) => r.entityId === 'unit/1231')!;
  row.searchState = row.sourceState = 'read-failed';
  row.reason = '测试夹具：来源读取失败，继续保留已登记旧快照，不是生产网络故障。';
  await page.route('**/civ-updates*.json', (route) => route.fulfill({ json: data }));
  await page.goto('/#/patches?obj=unit:1231&histVersion=de-34055');
  await expect(page.locator('[data-unit-history]')).toContainText('来源读取失败（保留旧快照）');
  await expect(page.locator('[data-event-id="ev-se-73d7a54c-b4cb-44a0-84c3-f58ec2a048fb"]')).toBeVisible();
  await expect(page.getByRole('button', { name: '重试单位历史' })).toHaveCount(0);
});

test('unit directory source status survives reload and back without invalidating civilization overview', async ({ page }) => {
  await page.goto('/#/patches?unitSourceState=processed');
  const directory = page.getByRole('region', { name: '单位历史来源目录' });
  await directory.getByText('查看单位目录与来源覆盖', { exact: false }).click();
  await expect(directory.locator('li')).toHaveCount(2);
  await directory.getByRole('combobox', { name: '单位来源状态', exact: true }).selectOption('not-checked');
  await expect(page).toHaveURL(/unitSourceState=not-checked/);
  await expect(directory.locator('li')).toHaveCount(246);
  await page.reload();
  await directory.getByText('查看单位目录与来源覆盖', { exact: false }).click();
  await expect(directory.locator('li')).toHaveCount(246);
  await expect(page.getByTestId('civ-updates-overview').getByRole('alert')).toHaveCount(0);
  await page.goBack();
  await expect(directory.locator('li')).toHaveCount(2);
});
