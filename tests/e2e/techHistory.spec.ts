import { expect, test, type Page } from '@playwright/test';
import { conflictHistoryFixture, historyFixture } from '../helpers/civUpdatesFixture';

const reader = (page: Page) => page.locator('[data-tech-history]');
const cards = (page: Page) => reader(page).locator('[data-event-id]');
const payload = /\/civ-updates(?:-[^/]+)?\.json(?:\?|$)/u;
const eventId = historyFixture().events.find((e) => e.summary === '大草原畜牧适用对象及效率')!.id;

test('#1085 same steppe event on detail/overview and exact unit projection with strict return', async ({ page }) => {
  await page.goto('/#/tech/689?tab=history&histVersion=de-36202&histCiv=Cumans');
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page)).toHaveAttribute('data-event-id', eventId);
  await expect(reader(page)).toContainText('80');
  await expect(reader(page)).toContainText('50');
  await reader(page).getByRole('link', { name: '在更新历史总览查看', exact: true }).click();
  await expect(cards(page)).toHaveAttribute('data-event-id', eventId);
  await reader(page).getByRole('link', { name: '查看草原枪兵单位历史', exact: true }).click();
  const unit = page.locator('[data-unit-history="unit/1370"]');
  const projected = unit.locator(`[data-event-id="${eventId}"]`);
  await expect(projected).toHaveCount(1);
  await expect(projected).toBeFocused();
  await expect(projected.locator('.civ-update-values')).toHaveCount(0);
  await unit.getByRole('button', { name: '清除历史筛选', exact: true }).click();
  await unit.getByRole('link', { name: '返回上次历史结果' }).click();
  await expect(reader(page)).toHaveAttribute('data-tech-history', 'tech/689');
  await expect(page).toHaveURL(/histEvent=/);
  await expect(cards(page)).toBeFocused();
  await page.reload();
  await expect(cards(page)).toHaveAttribute('data-event-id', eventId);
  await reader(page).getByRole('link', { name: '查看此科技来源覆盖' }).click();
  await expect(page.getByRole('region', { name: '科技历史来源目录' })).toContainText('199 个当前目录 ID');
  await page.getByRole('link', { name: '返回上次历史结果' }).click();
  await expect(cards(page)).toHaveAttribute('data-event-id', eventId);
});

test('#1085 contextual unit return survives technology traversal and malformed mixed-route recovery', async ({ page }) => {
  await page.goto('/#/unit/1370?tab=history&civ=Cumans&histVersion=de-36202');
  await page.getByRole('link', { name: '查看大草原畜牧科技历史', exact: true }).click();
  await reader(page).getByRole('link', { name: '返回上次历史结果' }).click();
  await expect(page).toHaveURL(/unit\/1370/);
  await expect(page).toHaveURL(/civ=Cumans/);
  const invalid = encodeURIComponent('/unit/1370?histView=techs');
  await page.goto('/#/tech/689?tab=history&histVersion=de-36202&histReturn=' + invalid);
  await expect(page.getByRole('alert')).toContainText('histReturn');
  await page.getByRole('button', { name: '仅清除错误参数' }).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(page).toHaveURL(/histVersion=de-36202/);
});

test('#1085 alias submission, keyboard selection and independent coverage denominator', async ({ page }) => {
  await page.goto('/#/patches?histView=techs');
  const input = page.getByRole('textbox', { name: '搜索科技历史' });
  await input.fill('供给');
  await expect(page).not.toHaveURL(/histQuery=/);
  await input.press('Enter');
  await expect(page).toHaveURL(/histQuery=/);
  const retired = page.getByRole('navigation', { name: '选择精确科技身份' }).getByRole('link', { name: /716/ });
  await retired.focus();
  await retired.press('Enter');
  await expect(reader(page)).toHaveAttribute('data-tech-history', 'tech/716@retired');
  await expect(reader(page).getByRole('link', { name: '打开科技详情' })).toHaveCount(0);
  await page.goto('/#/patches?histView=techCoverage&techIdentity=current');
  await expect(page.locator('.unit-coverage-list > li')).toHaveCount(199);
  await page.getByRole('combobox', { name: '科技身份范围', exact: true }).selectOption('retired');
  await expect(page.locator('.unit-coverage-list > li')).toHaveCount(3);
  await page.reload();
  await expect(page.locator('.unit-coverage-list > li')).toHaveCount(3);
  await page.goBack();
  await expect(page.locator('.unit-coverage-list > li')).toHaveCount(199);
});

test('#1085 research resource dimensions, retired research time and unknown mercenary identity', async ({ page }) => {
  await page.goto('/#/tech/321?tab=history&histVersion=de-81058');
  await expect(reader(page)).toContainText('研究费用 · 食物');
  await expect(reader(page)).toContainText('研究费用 · 黄金');
  await expect(reader(page)).toContainText('研究费用 · 木材');
  await expect(reader(page)).toContainText('最终伤害还受目标护甲影响');
  await expect(reader(page)).toContainText('研究后效果 / 作用对象');
  await page.goto('/#/patches?histEntity=tech%2F716%40retired&histVersion=de-81058');
  await expect(reader(page)).toContainText('35');
  await expect(reader(page)).toContainText('20');
  await expect(reader(page)).toContainText('科技本体');
  await page.goto('/#/tech/690?tab=history&histVersion=de-61321&histCondition=team&histCiv=Cumans');
  await expect(reader(page).locator('.civ-update-effect')).toHaveCount(4);
  await expect(reader(page)).toContainText('每城堡');
  await expect(reader(page)).toContainText('12');
  await expect(reader(page)).toContainText('尚未解析');
  const unresolved = reader(page).locator('.civ-update-effect').filter({ hasText: '尚未解析' });
  await expect(unresolved).toHaveCount(3);
  await expect(unresolved.locator('a[href*="/unit/1260"], a[href*="/unit/1233"]')).toHaveCount(0);
});

test('#1085 local recovery and hidden focus keep valid object, context and filters', async ({ page }) => {
  await page.goto('/#/tech/689?tab=history&civ=Cumans&histVersion=de-36202&histVerification=bad&histCiv=Cumans');
  await page.getByRole('button', { name: '仅清除错误参数' }).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(page).toHaveURL(/civ=Cumans/);
  await expect(page).toHaveURL(/histVersion=de-36202/);
  await expect(page).not.toHaveURL(/histVerification/);
  await page.goto('/#/tech/689?tab=history&histVersion=de-81058&histOrder=oldest&histEvent=' + eventId);
  await expect(reader(page)).toContainText('关联记录被当前筛选隐藏');
  await reader(page).getByRole('button', { name: '显示这条关联记录' }).click();
  await expect(cards(page).filter({ has: page.locator('[data-effect-type="availability"]') })).toHaveCount(1);
  await expect(page).toHaveURL(/histOrder=oldest/);
  await expect(page).not.toHaveURL(/histVersion=de-81058/);
});

test('#1085 invalid duplicate identity and external return never render another technology', async ({ page }) => {
  await page.goto('/#/patches?histView=techs&obj=tech:689&obj=tech:690&histVersion=de-36202');
  await expect(page.getByRole('alert')).toContainText('obj');
  await expect(reader(page)).toHaveCount(0);
  await page.getByRole('button', { name: '仅清除错误参数' }).click();
  await expect(page).toHaveURL(/histVersion=de-36202/);
  await page.goto('/#/tech/689?tab=history&histVersion=de-36202&histReturn=https%3A%2F%2Fevil.example');
  await expect(page.getByRole('alert')).toContainText('histReturn');
  await expect(page.locator('a[href^="https://evil.example"]')).toHaveCount(0);
  await page.getByRole('button', { name: '仅清除错误参数' }).click();
  await expect(cards(page)).toHaveCount(1);
});

test('#1085 combined filters reveal the related event and unrelated unit/building focus repairs locally', async ({ page }) => {
  const id = 'ev-se-71636ab5-9a50-4128-bce9-8212abc5e6d7';
  await page.goto('/#/tech/463?tab=history&histCiv=Armenians&histCondition=civ&histOrder=oldest&histEvent=' + id);
  await reader(page).getByRole('button', { name: '显示这条关联记录' }).click();
  await expect(reader(page).locator(`[data-event-id="${id}"]`)).toBeVisible();
  await expect(reader(page).locator(`[data-event-id="${id}"]`)).toBeFocused();
  await expect(page).toHaveURL(/histOrder=oldest/);
  for (const [route, button] of [
    ['unit/4', '仅清除错误事件定位'],
    ['building/79', '仅清除错误参数'],
  ]) {
    await page.goto('/#/' + route + '?tab=history&civ=Cumans&histVersion=de-36202&histOrder=oldest&histEvent=' + eventId);
    await expect(page.getByRole('alert')).toContainText(/事件|histEvent/);
    await page.getByRole('button', { name: button, exact: true }).click();
    await expect(page).not.toHaveURL(/histEvent=/);
    await expect(page).toHaveURL(/histVersion=de-36202/);
    await expect(page).toHaveURL(/histOrder=oldest/);
    await expect(page).toHaveURL(/civ=Cumans/);
  }
});

test('#1085 payload failure retries without losing context and distinguishes unrecorded/filter empty', async ({ page }) => {
  let attempts = 0;
  await page.route(payload, async (route) => {
    attempts++;
    if (attempts === 1) await route.fulfill({ status: 503, body: 'fixture failure' });
    else await route.fulfill({ json: historyFixture() });
  });
  await page.goto('/#/tech/689?tab=history&histVersion=de-36202');
  await expect(page.getByRole('alert')).toContainText('科技历史加载失败');
  await page.getByRole('button', { name: '重试科技历史' }).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(page).toHaveURL(/histVersion=de-36202/);
  const empty = historyFixture().techs!.rows.find((r) => r.eventIds.length === 0)!;
  await page.goto('/#/tech/' + empty.entityId.split('/')[1] + '?tab=history');
  await expect(reader(page)).toContainText('尚未收录该科技的更新历史');
  await page.goto('/#/tech/689?tab=history&histVersion=de-81058');
  await expect(reader(page)).toContainText('没有符合筛选条件的记录');
});

test('#1085 building overview selection retains a valid return while dropping stale event focus', async ({ page }) => {
  const data = historyFixture();
  const id = data.buildings!.relations.find(
    (r) => r.entityId === 'building/79' && !data.buildings!.relations.some((t) => t.entityId === 'building/234' && t.eventId === r.eventId),
  )!.eventId;
  await page.goto('/#/building/79?tab=history&histOrder=oldest&histEvent=' + id);
  const building = page.locator('[data-building-history]');
  await building.getByRole('link', { name: '在更新历史总览查看', exact: true }).click();
  const back = new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('histReturn');
  expect(back).toContain('/building/79');
  await building.getByText('切换建筑', { exact: true }).click();
  await page.getByRole('textbox', { name: '搜索建筑历史' }).fill('234');
  await page
    .getByRole('navigation', { name: '选择精确建筑身份' })
    .getByRole('link', { name: /ID 234/ })
    .click();
  await expect(building).toHaveAttribute('data-building-history', 'building/234');
  const changed = new URLSearchParams(new URL(page.url()).hash.split('?')[1]);
  expect(changed.get('histReturn')).toBe(back);
  expect(changed.has('histEvent')).toBe(false);
  expect(changed.get('histOrder')).toBe('oldest');
  expect(changed.get('histQuery')).toBe('234');
  await building.getByRole('link', { name: '返回上次历史结果' }).click();
  await expect(page.locator(`[data-event-id="${id}"]`)).toBeFocused();
});

test('#1085 synthetic conflict keeps both claims and narrow display contains long evidence', async ({ page }) => {
  const fixture = conflictHistoryFixture();
  const event = fixture.events.find((e) => e.id === 'fixture-conflict')!;
  const effectIds = event.claims.flatMap((c) => c.effects.map((f) => f.id));
  fixture.techs!.relations.push({ entityId: 'tech/689', eventId: event.id, effectIds, relation: 'related', note: '合成测试夹具' });
  fixture.techs!.rows.find((r) => r.entityId === 'tech/689')!.eventIds.push(event.id);
  for (const id of effectIds) fixture.techs!.effectKinds[id] = 'effect';
  await page.route(payload, (route) => route.fulfill({ json: fixture }));
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/#/tech/689?tab=history&histVerification=conflict');
  await expect(reader(page).locator('.civ-update-claim')).toHaveCount(2);
  await reader(page).getByText('来源与原文', { exact: false }).click();
  await expect(reader(page)).toContainText('测试原文A');
  await expect(reader(page)).toContainText('测试原文B');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.goto('/#/tech/690?tab=history&histVersion=de-61321');
  await reader(page).getByText('来源与原文', { exact: false }).click();
  await expect(reader(page).locator('.civ-update-source time').first()).toBeVisible();
  expect(
    await reader(page)
      .locator('.civ-update-source')
      .evaluateAll((cards) => cards.every((card) => card.scrollWidth <= card.clientWidth + 1)),
  ).toBe(true);
});
