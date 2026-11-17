import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { conflictHistoryFixture } from '../helpers/civUpdatesFixture';

const asset = /\/civ-updates(?:-[^/]+)?\.json(?:\?|$)/u;
const selection = (page: Page) => page.getByRole('region', { name: '对象时间线' });
const event = (page: Page, id: string) => page.locator('[data-history-event="' + id + '"]');
const path = (id: string, query = '', event?: string, back?: string) => {
  const params = new URLSearchParams({ obj: id.replace('/', ':') });
  new URLSearchParams(query).forEach((value, key) => params.set(key, value));
  if (event) params.set('histEvent', event);
  if (back) params.set('histReturn', back);
  return '/#/patches?' + params;
};
const showCoverage = async (page: Page) => {
  await page.getByRole('button', { name: '收录说明' }).click();
  const dialog = page.getByRole('dialog', { name: '收录说明' });
  await expect(dialog).toBeVisible();
  return dialog;
};

test('starts in one reader, opens a default node, and leaves multiple nodes open', async ({ page }) => {
  await page.goto('/#/patches');
  const search = page.getByRole('combobox', { name: '查找历史对象' });
  await search.fill('Cumans');
  await expect(search).toHaveAttribute('aria-activedescendant', /.+/u);
  await search.press('Enter');
  await expect(page).toHaveURL(/patches\?obj=civ%3ACumans/u);
  const nodes = selection(page).locator('.history-node > h3 > button');
  await expect(nodes.first()).toHaveAttribute('aria-expanded', 'true');
  await expect(nodes.nth(1)).toHaveAttribute('aria-expanded', 'false');
  await nodes.nth(1).focus();
  await nodes.nth(1).press('Space');
  await expect(nodes.nth(1)).toHaveAttribute('aria-expanded', 'true');
  await expect(nodes.first()).toHaveAttribute('aria-expanded', 'true');
  await selection(page).getByLabel('排序').selectOption('oldest');
  await expect(nodes.first()).toHaveAttribute('aria-expanded', 'true');
  await expect(nodes.nth(1)).toHaveAttribute('aria-expanded', 'false');
  const version = page.getByRole('button', { name: '按版本', exact: true });
  await version.click();
  const archiveList = page.getByTestId('patch-version-card');
  const archive = archiveList.first().getByRole('link').first();
  await expect(archive).toBeVisible();
  await archive.click();
  await page.getByRole('link', { name: '更新历史', exact: true }).last().click();
  await expect(archive).toBeFocused();
  await page.getByRole('button', { name: '按对象', exact: true }).click();
  await expect(selection(page).getByLabel('排序')).toHaveValue('oldest');
});

test('finds exact identities, a directory alias and a retired technology', async ({ page }) => {
  await page.goto(path('unit/1231'));
  await expect(selection(page)).toContainText('ID 1231');
  const search = page.getByRole('combobox', { name: '查找历史对象' });
  for (const [term, id] of [
    ['unit/1233', 'unit%3A1233'],
    ['unit/1260', 'unit%3A1260'],
    ['绞盘弩', 'tech%3A1452'],
    ['716@retired', 'tech%3A716%40retired'],
  ]) {
    await search.fill(term!);
    await expect(page.getByRole('listbox').getByRole('option', { selected: true })).toBeVisible();
    await search.press('Enter');
    await expect(page).toHaveURL(new RegExp('obj=' + id));
  }
  await expect(selection(page)).toContainText('退役');
  await page.goto(path('tech/10', 'histVersion=de-81058'));
  const bombard = event(page, 'ev-se-ecff8228-8cdd-4272-8a8b-f84f034c8a91');
  await expect(bombard).toContainText('黄金成本');
  await expect(bombard).toContainText('木材成本');
  await expect(bombard).toContainText('食物成本');
  await expect(bombard).toContainText('研究参数');
});

test.describe('touch object picker', () => {
  test.use({ hasTouch: true, viewport: { width: 360, height: 760 } });
  test('tapping the result selects an exact object without dismissing it first', async ({ page }) => {
    await page.goto('/#/patches');
    await page.getByRole('combobox', { name: '查找历史对象' }).fill('绞盘弩');
    await page.getByRole('option', { name: /1452/u }).tap();
    await expect(page).toHaveURL(/obj=tech%3A1452/u);
  });
});

test('opens the evidence as one inert modal and returns focus via all close controls', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto(path('building/79', 'histVersion=de-81058', 'ev-legacy-81058-b056'));
  const tower = event(page, 'ev-legacy-81058-b056');
  await expect(tower).toContainText('提供者：埃塞俄比亚');
  const trigger = tower.getByRole('button', { name: '依据与原文' });
  for (const method of ['Escape', 'top', 'bottom']) {
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: '依据与原文' });
    await expect(dialog).toBeVisible();
    await expect(page.locator('dialog[open]')).toHaveCount(1);
    await expect(page.locator('html')).toHaveCSS('overflow', 'hidden');
    const top = dialog.getByRole('button', { name: '关闭', exact: true }).first();
    const bottom = dialog.getByRole('button', { name: '关闭', exact: true }).last();
    await expect(top).toBeFocused();
    await expect(dialog).toContainText('来源发布日期');
    expect(await top.boundingBox()).toMatchObject({ width: expect.any(Number), height: expect.any(Number) });
    const hit = (await top.boundingBox())!;
    expect(Math.min(hit.width, hit.height)).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Shift+Tab');
    await expect(bottom).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(top).toBeFocused();
    await page.mouse.click(2, 2);
    await expect(dialog).toBeVisible();
    if (method === 'Escape') await page.keyboard.press('Escape');
    else await (method === 'top' ? top : bottom).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden');
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test('keeps building source processing separate and locates a filtered event without clearing unrelated state', async ({ page }) => {
  await page.goto(path('building/79', 'histVersion=de-61321&histOrder=oldest'));
  const dialog = await showCoverage(page);
  await expect(dialog).toContainText('已关联 19 条');
  await expect(dialog).toContainText('待核 8 条');
  await expect(dialog).toContainText('已排除 2 条');
  await dialog.getByRole('button', { name: '逐条处置' }).click();
  await expect(dialog).toContainText('处理状态，不是事实核验');
  const locate = dialog.getByRole('button', { name: /^定位/u }).first();
  await locate.click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: '清除冲突筛选并定位' })).toBeVisible();
  await expect(page.locator('#history-target-warning')).toBeFocused();
  await page.getByRole('button', { name: '清除冲突筛选并定位' }).click();
  await expect(page).toHaveURL(/histOrder=oldest&histEvent=/u);
  const targetId = new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('histEvent');
  await expect(event(page, targetId!)).toBeFocused();
});

test('restores encyclopedia and browser visits without merging same-URL entries', async ({ page }) => {
  await page.goto('/#/civ/Cumans?tab=history#patches');
  const link = page.getByRole('link', { name: '查看完整历史' });
  await expect(link).toBeVisible();
  await link.click();
  const nodes = selection(page).locator('.history-node > h3 > button');
  await nodes.nth(1).click();
  await page.getByRole('link', { name: '返回来处' }).click();
  await expect(link).toBeFocused();
  await page.goForward();
  await expect(nodes.nth(1)).toHaveAttribute('aria-expanded', 'true');
  await page.goBack();
  await link.click();
  await expect(nodes.nth(1)).toHaveAttribute('aria-expanded', 'false');
});

test('related objects preserve exact event ownership and one return at a time', async ({ page }) => {
  const id = 'ev-se-73d7a54c-b4cb-44a0-84c3-f58ec2a048fb';
  const speed = 'ev-unit-kipchak-34055-speed';
  await page.goto(path('unit/1231', 'histVersion=de-34055', speed));
  const regular = event(page, speed);
  await regular.getByText('继续阅读', { exact: true }).click();
  const cuman = regular.getByRole('link', { name: '库曼 · 文明' });
  await cuman.click();
  await expect(selection(page).getByRole('heading', { name: '库曼', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '返回来处' }).click();
  await expect(cuman).toBeFocused();
  await cuman.click();
  const node = selection(page).getByRole('button', { name: /DE Update 34055/u }).first();
  if ((await node.getAttribute('aria-expanded')) === 'false') await node.click();
  const card = event(page, id);
  await card.getByText('继续阅读', { exact: true }).click();
  await card.getByRole('link', { name: '精锐钦察 · 单位' }).click();
  await expect(page).toHaveURL(/obj=unit%3A1233.*histEvent=/u);
  const back = new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('histReturn');
  expect(back).toMatch(/obj=civ%3ACumans/u);
  expect(back).not.toContain('histReturn');
  await page.goBack();
  await expect(card.getByRole('link', { name: '精锐钦察 · 单位' })).toBeFocused();
  await page.goForward();
  await expect(card.locator('.civ-update-values .num')).toHaveText(['55 HP', '45 HP']);
});

for (const [detail, id] of [
  ['/unit/1231', 'unit%3A1231'],
  ['/building/79', 'building%3A79'],
  ['/tech/10', 'tech%3A10'],
  ['/tech/716', 'tech%3A716%40retired'],
]) {
  test('keeps one history entry and exact return on ' + detail, async ({ page }) => {
    await page.goto('/#' + detail + '?tab=history');
    await expect(page.getByRole('heading', { name: '更新历史', exact: true })).toHaveCount(1);
    await page.getByRole('link', { name: '查看完整历史' }).click();
    await expect(page).toHaveURL(new RegExp('obj=' + id));
    await page.getByRole('link', { name: '返回来处' }).click();
    await expect(page.getByRole('link', { name: '查看完整历史' })).toBeFocused();
  });
}

test('restores archive search, focus and raw dates from a separate set', async ({ page }) => {
  await page.goto('/#/patches');
  await page.getByRole('button', { name: '按版本', exact: true }).click();
  const archives = page.getByTestId('patch-version-card');
  await expect(archives).toHaveCount(5);
  await expect(archives.filter({ hasText: '185872' })).toContainText('类别未知');
  await expect(archives.filter({ hasText: '185872' })).toContainText('档案日期：2026-09-23');
  await expect(archives.filter({ hasText: '188329' })).toContainText('2026-10-27T10:04:41-07:00');
  await expect(archives.filter({ hasText: '188329' })).toContainText('网页发布时间：2026-10-28');
  await archives.filter({ hasText: '81058' }).getByRole('link').click();
  await page.getByText('筛选本版').click();
  await page.getByRole('button', { name: '建筑', exact: true }).click();
  await expect(page).toHaveURL(/type=building/u);
  const history = page.getByRole('link', { name: '在对象时间线阅读' }).first();
  await history.click();
  await expect(selection(page)).toBeVisible();
  await page.getByRole('link', { name: '返回来处' }).click();
  await expect(page).toHaveURL(/patches\/81058\?type=building/u);
  await expect(history).toBeFocused();
});

test('keeps valid empty and invalid input distinct and copies without an unsafe return', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('fixture')) } }),
  );
  await page.goto(path('unit/759'));
  await expect(selection(page)).toContainText('尚未收录该对象');
  await page.goto(path('tech/10', 'histVerification=conflict', undefined, '//external.invalid/'));
  await expect(selection(page)).toContainText('当前筛选下没有变化');
  await expect(page.getByText('返回地址不可用')).toBeVisible();
  await expect(page.getByRole('link', { name: '返回来处' })).toHaveCount(0);
  await page.getByRole('button', { name: '复制链接' }).click();
  const manual = page.getByRole('textbox', { name: '手动复制链接' });
  await expect(manual).toHaveValue(/obj=tech%3A10&histVerification=conflict$/u);
  await page.goto(await manual.inputValue());
  await page.reload();
  await expect(selection(page)).toContainText('当前筛选下没有变化');
  await page.goto('/#/patches?obj=unit%3A1231&obj=unit%3A1233');
  await expect(page.getByRole('alert')).toContainText('多个对象');
  await expect(selection(page)).toHaveCount(0);
});

test('retries a failed shared read while retaining the address and independent archives', async ({ page }) => {
  await page.route(asset, (route) => route.abort(), { times: 1 });
  await page.goto(path('tech/10', 'histVersion=de-81058'));
  await expect(page.getByRole('alert')).toContainText('共享历史加载失败');
  await page.getByRole('button', { name: '按版本', exact: true }).click();
  await expect(page.getByTestId('patch-version-card').first()).toBeVisible();
  await expect(page.getByTestId('patch-version-card')).toHaveCount(5);
  await page.getByRole('button', { name: '按对象', exact: true }).click();
  await page.getByRole('button', { name: '重试共享历史' }).click();
  await expect(selection(page)).toContainText('火炮术');
  await expect(page).toHaveURL(/histVersion=de-81058/u);
});

test('retries an archive read without changing the object visit', async ({ page }) => {
  await page.route(/\/185872(?:-[^/]+)?\.json(?:\?|$)/u, (route) => route.abort(), { times: 1 });
  await page.goto(path('tech/10', 'histVersion=de-81058'));
  await expect(selection(page)).toContainText('火炮术');
  await page.getByRole('button', { name: '按版本', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('版本档案加载失败');
  await page.getByRole('button', { name: '重试版本档案' }).click();
  await expect(page.getByTestId('patch-version-card').first()).toBeVisible();
  await page.getByRole('button', { name: '按对象', exact: true }).click();
  await expect(selection(page)).toBeVisible();
  await expect(page).toHaveURL(/histVersion=de-81058/u);
});

test('keeps both conflict claims and escapes long original evidence in dark mode', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await page.emulateMedia({ colorScheme: 'dark' });
  const fixture = conflictHistoryFixture();
  fixture.sourceEntries.find((entry) => entry.id === 'fixture-entry-0')!.originalText += '\n+12 HP\n' + '长原文'.repeat(900);
  fixture.sourceEntries.find((entry) => entry.id === 'fixture-entry-1')!.originalText = null;
  await page.route(asset, (route) => route.fulfill({ json: fixture }));
  const conflict = fixture.events.find((e) => e.verification === 'conflict')!;
  const civ = conflict.civRelations[0]!.civId;
  await page.goto(path('civ/' + civ, 'histVerification=conflict', conflict.id));
  const card = event(page, conflict.id);
  await expect(card).toContainText('说法 1');
  await expect(card).toContainText('说法 2');
  await card.getByRole('button', { name: '依据与原文' }).click();
  const dialog = page.getByRole('dialog', { name: '依据与原文' });
  await expect(dialog).toContainText('说法 1');
  await expect(dialog).toContainText('说法 2');
  await expect(dialog.getByText(/<img src=x/)).toBeVisible();
  await expect(dialog.locator('blockquote img')).toHaveCount(0);
  await expect(dialog.locator('blockquote .num.nw').getByText('+12 HP', { exact: true })).toHaveCSS('white-space', 'nowrap');
  await expect(dialog.getByText(/来源链接缺失/)).toHaveCount(2);
  await expect(dialog.getByText(/此来源未保存原文/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  const body = dialog.locator('.history-dialog-body');
  expect(await body.evaluate((node) => node.scrollHeight > node.clientHeight && node.scrollWidth <= node.clientWidth)).toBe(true);
  await expect(dialog.getByRole('button', { name: '关闭', exact: true }).last()).toBeInViewport();
  const result = await new AxeBuilder({ page }).include('dialog').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
});

test('keeps fixed civilization values and original official citations', async ({ page }) => {
  await page.goto(path('civ/Saracens', 'histVersion=de-95810', 'ev-se-78a3783c-8ff1-4564-a815-4e5eab998ee7'));
  const health = event(page, 'ev-se-78a3783c-8ff1-4564-a815-4e5eab998ee7');
  await expect(health.locator('.civ-update-values .num')).toHaveText(['10 HP', '25 %']);
  const id = 'ev-se-3e23ab97-d1dc-47c8-8d19-23c16ed94fbf';
  await page.goto(path('civ/Bohemians', 'histVersion=de-185872&histSource=official', id));
  await event(page, id).getByRole('button', { name: '依据与原文' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('link', { name: '打开原始来源' })).toHaveCount(1);
  await expect(dialog.locator('a[href$="#6af4bb1a6d373"]')).toHaveAttribute(
    'href', 'https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-185872/#6af4bb1a6d373',
  );
  await page.keyboard.press('Escape');
  await page.goto(path('civ/Bohemians', 'histVersion=de-185872', id));
  await event(page, id).getByRole('button', { name: '依据与原文' }).click();
  await expect(dialog.getByRole('link', { name: '打开原始来源' })).toHaveCount(2);
});

test('stages advanced filters before applying and resets only advanced conditions', async ({ page }) => {
  await page.goto(path('tech/10', 'histVersion=de-81058&histOrder=oldest'));
  const reader = selection(page);
  const count = await reader.getByRole('status').innerText();
  await reader.getByText('进阶筛选', { exact: true }).click();
  await reader.getByRole('combobox', { name: '来源', exact: true }).selectOption('community');
  await expect(reader.getByRole('status')).toHaveText(count);
  await expect(page).not.toHaveURL(/histSource/u);
  await reader.getByRole('button', { name: '应用筛选' }).click();
  await expect(page).toHaveURL(/histSource=community/u);
  await reader.getByText(/进阶筛选/u).first().click();
  await expect(reader.getByRole('button', { name: /来源.*社区/u })).toBeVisible();
  await reader.getByText(/进阶筛选/u).first().click();
  await reader.getByRole('button', { name: '重置进阶项' }).click();
  await reader.getByRole('button', { name: '应用筛选' }).click();
  await expect(page).not.toHaveURL(/histSource/u);
  await expect(page).toHaveURL(/histVersion=de-81058&histOrder=oldest/u);
});
