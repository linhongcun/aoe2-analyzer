import { expect, test, type Page } from '@playwright/test';
import { conflictHistoryFixture, historyFixture } from '../helpers/civUpdatesFixture';

const reader = (page: Page) => page.locator('[data-building-history]');
const events = (page: Page) => reader(page).locator('[data-event-id]');

test('#1084 building detail and overview project the same exact effects and keep all original entries', async ({ page }) => {
  await page.goto('/#/building/79?tab=history&histVersion=de-61321');
  await expect(reader(page)).toContainText('850');
  await expect(reader(page).locator('.civ-update-values .num')).toHaveText(['700 生命值', '850 生命值']);
  const ids = await events(page).evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-event-id')));
  await reader(page).getByText('来源覆盖与逐条处理', { exact: false }).click();
  await expect(reader(page).locator('.civ-update-processing article')).toHaveCount(29);
  await expect(reader(page)).toContainText('待核');
  await expect(reader(page)).toContainText('d464b9bb2412508a791a0063563fb95c157cf4ea03b56726d096cce382fd6bbf');
  await reader(page).getByRole('link', { name: '在更新历史总览查看' }).click();
  await expect(events(page)).toHaveCount(ids.length);
  expect(await events(page).evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-event-id')))).toEqual(ids);
  await expect(page).toHaveURL(/histVersion=de-61321/);
  await page.reload();
  await expect(reader(page)).toContainText('850');
});

test('#1084 sourced alias search, keyboard selection and honest coverage denominator', async ({ page }) => {
  await page.goto('/#/patches?histView=buildings');
  await page.getByRole('textbox', { name: '搜索建筑历史' }).fill('木墙');
  const choice = page.getByRole('navigation', { name: '选择精确建筑身份' }).getByRole('link', { name: /ID 72/ });
  await choice.focus();
  await page.keyboard.press('Enter');
  await expect(reader(page)).toHaveAttribute('data-building-history', 'building/72');
  await expect(reader(page)).toContainText('已定位、未检查');
  await page.goto('/#/patches?histView=buildingCoverage&buildingSourceState=processed');
  await expect(page.locator('.unit-coverage-list li')).toHaveCount(2);
  await expect(page.locator('summary').filter({ hasText: '全部建筑来源覆盖' })).toContainText('38 个当前目录 ID');
  await page.getByRole('combobox', { name: '建筑独立来源状态', exact: true }).selectOption('not-checked');
  await expect(page.locator('.unit-coverage-list li')).toHaveCount(36);
  await page.reload();
  await expect(page.locator('.unit-coverage-list li')).toHaveCount(36);
  await page.goBack();
  await expect(page.locator('.unit-coverage-list li')).toHaveCount(2);
});

test('#1084 source evidence, team provider and safe civilization return retain event location and filters', async ({ page }) => {
  await page.goto('/#/patches?histView=buildings&obj=building:72&histVersion=de-47820&histCondition=team&histCiv=Cumans');
  await expect(events(page)).toHaveCount(1);
  await expect(events(page)).toContainText('团队');
  await reader(page).getByRole('link', { name: '查看库曼文明历史' }).click();
  await expect(page).toHaveURL(/civ\/Cumans/);
  await expect(page).toHaveURL(/histReturn=/);
  await page.getByRole('link', { name: '返回上次历史结果' }).click();
  await expect(page).toHaveURL(/histEvent=/);
  await expect(page).toHaveURL(/histCondition=team/);
  await expect(events(page)).toHaveCount(1);
  await expect(events(page)).toBeInViewport();
  await page.goto('/#/patches?obj=building:87&histVersion=de-51737');
  await expect(events(page)).toHaveCount(1);
  await expect(events(page)).toContainText('绝对');
  await expect(events(page)).toContainText('100');
  await expect(events(page)).not.toContainText('75');
});

test('#1084 repeated invalid parameters recover locally; filtered empty and uncollected remain different', async ({ page }) => {
  await page.goto('/#/patches?obj=building:109&histVersion=de-34055&histQuery=城镇&histOrder=bad');
  await expect(page.getByRole('alert')).toContainText('histOrder');
  await page.getByRole('button', { name: '仅清除错误参数' }).click();
  await expect(page).toHaveURL(/histVersion=de-34055/);
  await expect(events(page)).toHaveCount(1);
  await page.goto('/#/patches?obj=building:109&obj=building:79');
  await expect(page.getByRole('alert')).toContainText('重复');
  await expect(events(page)).toHaveCount(0);
  await page.getByRole('link', { name: '选择瞭望箭塔' }).click();
  await expect(reader(page)).toHaveAttribute('data-building-history', 'building/79');
  await page.goto('/#/patches?obj=building:109&histVersion=de-47820');
  await expect(reader(page)).toContainText('没有符合筛选的记录');
  await page.goto('/#/patches?obj=building:104');
  await expect(reader(page)).toContainText('尚未收录此建筑的已映射事件');
  await expect(reader(page)).toContainText('已定位、未检查');
});

test('#1084 application failure retry and source failure preserve object, filters and prior evidence', async ({ page }) => {
  let attempts = 0;
  await page.route('**/civ-updates*.json', (route) => (++attempts === 1 ? route.fulfill({ status: 503, body: 'unavailable' }) : route.continue()));
  await page.goto('/#/patches?obj=building:109&histVersion=de-34055');
  await expect(page.getByRole('alert')).toContainText('建筑更新历史读取失败');
  await page.getByRole('button', { name: '重试建筑历史' }).click();
  await expect(reader(page)).toContainText('270 秒');
  expect(attempts).toBe(2);
  const data = historyFixture();
  const row = data.buildings!.rows.find((r) => r.entityId === 'building/109')!;
  row.sourceState = row.searchState = 'read-failed';
  row.reason = '测试夹具：来源重读失败，旧快照保留；不是生产故障。';
  await page.route('**/civ-updates*.json', (route) => route.fulfill({ json: data }));
  await page.reload();
  await expect(reader(page)).toContainText('以下保留既有快照');
  await expect(reader(page)).toContainText('270 秒');
  await reader(page).getByRole('button', { name: '重新读取应用快照' }).click();
  await expect(reader(page)).toContainText('来源读取失败（保留旧快照）');
  await expect(events(page)).toHaveCount(1);
});

test('#1084 narrow dark evidence, conflict atomicity and copy fallback stay operable', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));
  const data = conflictHistoryFixture();
  const conflict = data.events.find((e) => e.id === 'fixture-conflict')!;
  conflict.claims.forEach((c) =>
    c.effects.forEach((f) => {
      f.entityRefs = [{ entityId: 'building/79' }];
    }),
  );
  data.buildings!.rows.find((r) => r.entityId === 'building/79')!.eventIds.push(conflict.id);
  data.buildings!.relations.push({
    entityId: 'building/79',
    eventId: conflict.id,
    effectIds: conflict.claims.flatMap((c) => c.effects.map((f) => f.id)),
    relation: 'direct',
    note: '测试夹具：非真实游戏争议。',
  });
  await page.route('**/civ-updates*.json', (route) => route.fulfill({ json: data }));
  await page.goto('/#/patches?obj=building:79&histVerification=conflict&histCiv=Cumans');
  const event = events(page);
  await expect(event).toHaveCount(1);
  await expect(event.locator('.civ-update-claim')).toHaveCount(2);
  await event.locator('summary').click();
  await expect(event.locator('blockquote')).toHaveCount(2);
  await expect(event.locator('img[src="x"]')).toHaveCount(0);
  await reader(page).getByText('来源覆盖与逐条处理', { exact: false }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('fixture')) } }),
  );
  await reader(page).getByRole('button', { name: '复制历史分享地址' }).click();
  await expect(reader(page).getByRole('textbox', { name: '手动复制地址' })).toBeVisible();
  for (const control of await reader(page).locator('input,select,button').all()) {
    if (await control.isVisible()) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

test('#1084 retains migrated direct and related archive semantics without claiming independent source completion', async ({ page }) => {
  await page.goto('/#/building/1665?tab=history&histVersion=de-81058');
  await expect(events(page)).toHaveCount(1);
  await expect(events(page)).toContainText('训练长枪兵');
  await expect(events(page)).toContainText('前置');
  await expect(reader(page)).toContainText('已定位、未检查');
  await page.goto('/#/building/84?tab=history&histVersion=de-66692');
  await expect(events(page)).toHaveCount(2);
  await expect(reader(page)).toContainText('关联机制，不作为本建筑基础属性');
});

test('#1084 rejects invalid nested returns at the civilization reader and keeps the exact tower summary separate from related evidence', async ({ page }) => {
  for (const raw of ['/patches?histReturn=%2Fpatches', '/patches?histQuery=%00', '/patches?histQuery=a&histQuery=b', '/patches?histVersion=bad']) {
    const query = new URLSearchParams({ tab: 'history', histVersion: 'de-34055', histReturn: raw });
    await page.goto('/#/civ/Cumans?' + query.toString());
    await expect(page.getByRole('alert')).toContainText('返回地址');
    await expect(page.getByRole('link', { name: '返回上次历史结果' })).toHaveCount(0);
  }
  await page.goto('/#/building/79?tab=history&histVersion=de-81058');
  const card = reader(page).locator('[data-event-id="ev-legacy-81058-b056"]');
  await expect(card.getByRole('heading', { level: 4 })).toContainText('瞭望箭塔不再享有埃塞俄比亚的组队视野加成');
  await expect(card.getByRole('heading', { level: 4 })).not.toContainText('哨站');
  await expect(reader(page)).toContainText('关联机制，不作为本建筑基础属性');
  await card.locator('summary').click();
  await expect(card).toContainText('免除哨站石料费用');
  await expect(card).toContainText('哨站的视野+3且不消耗石头');
});
