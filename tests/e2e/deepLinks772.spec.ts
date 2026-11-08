import { expect, test, type Page } from '@playwright/test';

const NOTE_COMPARE_INVALID = '链接中的文明无效，已整组回退为默认对比。';
const NOTE_DUEL_INVALID = '链接中的单位或科技无效，已回退为默认对决；地址栏已写成实际使用的参数。';
const NOTE_BUILDS_INVALID = '链接中的开局无效，已显示全部开局。';
const SHARE_HINT = '可复制地址栏链接分享这对阵';

const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', (error) => list.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') list.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

const hashQuery = (page: Page) => new URLSearchParams(new URL(page.url()).hash.split('?')[1] ?? '');
const observeHealthy = async (page: Page) => {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
};

test('#772 compare 缺 b 时补第一个不同文明并说明，非法参数回退有 muted note', async ({ page }) => {
  await page.goto('./#/compare?a=Britons');
  await expect(page.locator('#compare')).toBeVisible();
  await expect(page.locator('#ca')).toHaveAttribute('data-value', 'Britons');
  // 缺 b 不再回落固定不列颠、也不变成自比；取目录里第一个 ≠ a 的文明。
  await expect(page.locator('#cb')).toHaveAttribute('data-value', 'Armenians');
  await expect.poll(() => [hashQuery(page).get('a'), hashQuery(page).get('b')]).toEqual(['Britons', 'Armenians']);
  const autoNote = page.locator('#compare .note[role="status"]');
  await expect(autoNote).toContainText('链接缺少对手文明，已自动选择「亚美尼亚」');
  await observeHealthy(page);

  await page.goto('./#/compare?a=Unknown&b=Mapuche');
  await expect.poll(() => [hashQuery(page).get('a'), hashQuery(page).get('b')]).toEqual(['Franks', 'Britons']);
  await expect(page.locator('#compare .note[role="status"]')).toHaveText(NOTE_COMPARE_INVALID);
  // 地址栏已写回完整默认对：刷新后仍是同一个默认对（提示是否保留不是验收点）。
  await page.reload();
  await expect(page.locator('#ca')).toHaveAttribute('data-value', 'Franks');
  await expect(page.locator('#cb')).toHaveAttribute('data-value', 'Britons');
  await observeHealthy(page);
});

test('#772 duel 坏深链给出 role=status 提示并把实际使用的单位/文明写回地址栏', async ({ page }) => {
  await page.goto('./#/duel?a=999999.Unknown.9.zzz.xxx&b=0&m=zzz&na=-5');
  const duelNote = page.locator('#duel p[role="status"]').filter({ hasText: '链接中的单位或科技无效' });
  await expect(duelNote).toHaveText(NOTE_DUEL_INVALID);
  await expect(page.locator('#duel-res, #duel-one, #duel-group').first()).toBeVisible();
  await expect
    .poll(() => {
      const q = hashQuery(page);
      return [q.get('a'), q.get('b'), q.get('m')];
    })
    .toEqual(['569.Franks.4.f.', '359.Japanese.4.f.', '1']);
  await observeHealthy(page);

  // 单位有效但科技字段是乱码：同样提示，并把乱码科技写成空（无科技）。
  await page.goto('./#/duel?a=38.Franks.3.zzz&b=359.Japanese.4.f&m=1');
  await expect(page.locator('#duel p[role="status"]').filter({ hasText: '链接中的单位或科技无效' })).toHaveText(NOTE_DUEL_INVALID);
  await expect.poll(() => hashQuery(page).get('a')).toBe('38.Franks.3..');
  await observeHealthy(page);

  // 正常链接不出现提示，也不改地址。
  await page.goto('./#/duel?a=38.Franks.3.f.&b=359.Japanese.4.f.&m=1');
  await expect(page.getByText(NOTE_DUEL_INVALID, { exact: true })).toHaveCount(0);
  await expect.poll(() => hashQuery(page).get('a')).toBe('38.Franks.3.f.');
  await observeHealthy(page);
});

test('#772 builds 无效 bo 提示并 replace 清掉，合法 bo 不受影响', async ({ page }) => {
  await page.goto('./#/builds?bo=nope');
  await expect(page.locator('#builds h1')).toHaveText('开局流程');
  await expect(page.getByText(NOTE_BUILDS_INVALID, { exact: true })).toBeVisible();
  await expect.poll(() => hashQuery(page).has('bo')).toBe(false);
  // 其它查询参数保留（不扩范围地清理）。
  await page.goto('./#/builds?bo=nope&civ=Franks');
  await expect(page.getByText(NOTE_BUILDS_INVALID, { exact: true })).toBeVisible();
  await expect.poll(() => [hashQuery(page).has('bo'), hashQuery(page).get('civ')]).toEqual([false, 'Franks']);
  await observeHealthy(page);

  await page.goto('./#/builds?bo=scouts-18');
  await expect(page.getByText(NOTE_BUILDS_INVALID, { exact: true })).toHaveCount(0);
  await expect(page.locator('#builds h1, #builds h2').first()).toBeVisible();
  await observeHealthy(page);
});

test('#772 matchup 地址栏没有参数时不承诺可复制分享，选齐文明后才出现', async ({ page }) => {
  await page.goto('./#/matchup');
  await expect(page.locator('#matchup')).toBeVisible();
  await expect(page.getByText(SHARE_HINT, { exact: true })).toHaveCount(0);

  await page.locator('#ma').click();
  const meDialog = page.getByRole('dialog', { name: '我的文明', exact: true });
  await meDialog.locator('[role="option"][data-civ="Mongols"]').click();
  await expect.poll(() => hashQuery(page).get('me')).toBe('Mongols');
  await page.locator('#me').click();
  const oppDialog = page.getByRole('dialog', { name: '对手文明', exact: true });
  await oppDialog.locator('[role="option"][data-civ="Chinese"]').click();
  await expect.poll(() => [hashQuery(page).get('me'), hashQuery(page).get('opp')]).toEqual(['Mongols', 'Chinese']);
  await expect(page.getByText(SHARE_HINT, { exact: true })).toBeVisible();
  const url = page.url();
  await page.goto(url);
  await expect(page.locator('#ma')).toHaveAttribute('data-value', 'Mongols');
  await expect(page.locator('#me')).toHaveAttribute('data-value', 'Chinese');
  await observeHealthy(page);
});

test('#772 四页 360 宽坏链接无横向溢出、无 console error', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  for (const route of ['/compare?a=Britons', '/duel?a=999999.Unknown.9.zzz.xxx&b=0&m=zzz&na=-5', '/builds?bo=nope', '/matchup']) {
    await page.goto('./#' + route);
    await expect(page.locator('main')).not.toBeEmpty();
    await observeHealthy(page);
  }
});
