import { expect, test } from '@playwright/test';
import { conflictHistoryFixture, emptyHistoryFixture } from '../helpers/civUpdatesFixture';

test('migrated Bohemian citation opens its original official section', async ({ page }) => {
  await page.goto('/#/civ/Bohemians?tab=history&histVersion=de-185872&histSource=official');
  const event = page.locator('[data-event-id="ev-se-3e23ab97-d1dc-47c8-8d19-23c16ed94fbf"]');
  await event.locator('summary').click();
  await expect(event.getByRole('link', { name: '打开来源页面' })).toHaveCount(2);
  await expect(event.getByRole('region', { name: 'DE Update 185872 · 既有档案', exact: true }).getByRole('link', { name: '打开来源页面' })).toHaveAttribute(
    'href',
    'https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-185872/#6af4bb1a6d373',
  );
});

test('Cuman entity-name searches retain the cards showing those names', async ({ page }) => {
  await page.goto('/#/civ/Cumans?tab=history&histQuery=补给');
  await expect(page.locator('[data-event-id="ev-se-23238351-959c-42c5-872f-b6f1355ebc21"]')).toBeVisible();
  await page.getByTestId('civ-updates-reader').getByLabel('关键词').fill('木栅栏');
  await expect(page.locator('[data-event-id="ev-se-efeba570-f6ef-4f76-805e-a080f02f7487"]')).toBeVisible();
});

test('Saracen 95810 retains the flat old health bonus when switching to percent', async ({ page }) => {
  await page.goto('/#/civ/Saracens?tab=history&histVersion=de-95810');
  const event = page.locator('[data-event-id="ev-se-78a3783c-8ff1-4564-a815-4e5eab998ee7"]');
  await expect(event.locator('.civ-update-values .num')).toHaveText(['10 HP', '25 %']);
});

test('civilization history uses real multi-effect claims and sources at 360px', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/#/civ/Cumans?tab=history&histVersion=de-34055&histSource=community');
  const reader = page.getByTestId('civ-updates-reader');
  await expect(reader).toBeVisible();
  const hp = reader.getByTestId('civ-update-event').filter({ has: page.getByRole('heading', { name: '钦察普通与精锐形态生命值调整', exact: true }) });
  await expect(hp.locator('[data-effect-type="numeric"]')).toHaveCount(2);
  await expect(hp.locator('.civ-update-values .num')).toHaveText(['50 HP', '40 HP', '55 HP', '45 HP']);
  await hp.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(hp.locator('blockquote').first()).toContainText('34055版本后拥有40/45HP');
  await expect(hp.getByRole('link', { name: '打开来源页面' }).first()).toHaveAttribute('href', /^https:\/\/seicing\.com\/html\/aoe2\/2\//);
  await expect(hp).toContainText('事实核验：未核实');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await hp.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('civ-history-1082-360-sources.png'), fullPage: false });
  await reader.getByLabel('版本', { exact: true }).selectOption('de-36202');
  await expect(reader.getByTestId('civ-update-event').filter({ hasText: '草原枪兵基础攻击变化' })).toContainText('前后值未知');
  await reader.getByLabel('版本', { exact: true }).selectOption('de-61321');
  const mercenaries = reader.getByTestId('civ-update-event');
  await expect(mercenaries).toContainText('每个城堡生成数量');
  await expect(mercenaries).toContainText('5 个/城堡');
  await expect(mercenaries.locator('.civ-update-values').filter({ hasText: '12 秒' })).toContainText('未知');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByText('文明历史摘要', { exact: true }).click();
  await expect(page.getByTestId('civ-history')).toBeVisible();
  await expect(page.getByTestId('civ-history').getByRole('link', { name: /官方原文/ })).toBeVisible();
});

test('overview filters, complete return URL, reload, back/forward and clear round-trip', async ({ page }, testInfo) => {
  const query = new URLSearchParams({ histQuery: '库曼', histCoverage: 'partial', histSourceState: 'processed', histListOrder: 'name' });
  const returnPath = `/patches?${query.toString()}`;
  await page.goto(`/#${returnPath}`);
  const overview = page.getByTestId('civ-updates-overview');
  await expect(overview.locator('tbody tr')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('civ-history-1082-overview-1280.png'), fullPage: false });
  await overview.getByRole('link', { name: '查看库曼文明历史' }).click();
  const reader = page.getByTestId('civ-updates-reader');
  await expect(reader).toBeVisible();
  const router = () => new URL('https://test.invalid' + new URL(page.url()).hash.slice(1));
  const expectHistoryContext = () => {
    expect(router().searchParams.get('tab')).toBe('history');
    expect(router().searchParams.get('histReturn')).toBe(returnPath);
  };
  expectHistoryContext();
  await reader.getByLabel('来源类别').selectOption('community');
  expectHistoryContext();
  await page.reload();
  await expect(reader.getByLabel('来源类别')).toHaveValue('community');
  expectHistoryContext();
  await reader.getByRole('button', { name: '清除历史筛选' }).click();
  await expect(reader.getByLabel('来源类别')).toHaveValue('');
  expectHistoryContext();
  await page.goBack();
  await expect(reader.getByLabel('来源类别')).toHaveValue('community');
  expectHistoryContext();
  await page.goForward();
  await expect(reader.getByLabel('来源类别')).toHaveValue('');
  expectHistoryContext();
  await reader.getByRole('link', { name: '返回上次历史结果' }).click();
  await expect(overview.locator('tbody tr')).toHaveCount(1);
  expect(router().pathname + router().search).toBe(returnPath);
  await overview.getByLabel('来源章节状态').selectOption('no-log');
  await expect(overview).toContainText('没有符合筛选条件的文明');
  await page.goBack();
  await expect(overview.getByLabel('来源章节状态')).toHaveValue('processed');
  await expect(overview.locator('tbody tr')).toHaveCount(1);
});

test('Japanese pending count stays visible with source processing collapsed', async ({ page }) => {
  await page.goto('/#/civ/Japanese?tab=history');
  const reader = page.getByTestId('civ-updates-reader');
  await expect(reader.getByTestId('civ-update-processing')).not.toHaveAttribute('open');
  await expect(reader.locator('.civ-update-warning')).toBeVisible();
  await expect(reader.locator('.civ-update-warning')).toContainText('待核 1 条');
});

test('new payload failure retries independently while the old version archive stays available', async ({ page }) => {
  let attempts = 0;
  let releaseFirst!: () => void;
  const firstResponse = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  await page.route('**/civ-updates*.json', async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await firstResponse;
      await route.fulfill({ status: 503, body: 'unavailable' });
    } else await route.continue();
  });
  await page.goto('/#/patches');
  const overview = page.getByTestId('civ-updates-overview');
  await expect(overview.getByRole('status')).toContainText('正在读取文明更新历史');
  releaseFirst();
  await expect(overview.getByRole('alert')).toContainText('文明更新历史读取失败');
  await expect(page.getByTestId('patch-version-card').first()).toBeVisible();
  await overview.getByRole('button', { name: '重试文明历史' }).click();
  await expect(overview.locator('tbody tr').first()).toBeVisible();
  expect(attempts).toBe(2);
});

test('labelled conflict fixture retains both claims, unknown values and escaped source text', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));
  const data = conflictHistoryFixture();
  await page.route('**/civ-updates*.json', (route) => route.fulfill({ json: data }));
  await page.goto('/#/civ/Cumans?tab=history&histVerification=conflict');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const reader = page.getByTestId('civ-updates-reader');
  const event = reader.getByTestId('civ-update-event');
  await expect(event).toHaveCount(1);
  await expect(event).toContainText('测试夹具：来源范围冲突');
  await expect(event).toContainText('来源冲突，尚未确认');
  await expect(event.locator('[data-effect-type="numeric"]')).toHaveCount(2);
  await expect(event.locator('.civ-update-values .num')).toHaveText(['0', '1']);
  await expect(event.locator('.civ-update-values').first()).toContainText('未知');
  await expect(event.getByRole('link', { name: '测试未识别实体' })).toHaveCount(0);
  await event.locator('summary').click();
  await expect(event.getByText('<img src=x onerror=alert(1)> 测试原文A', { exact: true })).toBeVisible();
  await expect(event.locator('img[src="x"]')).toHaveCount(0);
  await expect(event.getByText('来源链接未登记')).toHaveCount(2);
});

test('labelled empty fixture separates no-log, no records and invalid query recovery', async ({ page }) => {
  const data = emptyHistoryFixture();
  const missing = data.civilizations.find((row) => row.civId === 'Saxons')!;
  data.sections = data.sections.filter((section) => !missing.sectionIds.includes(section.id));
  missing.sectionIds = [];
  missing.sourceState = 'page-not-found';
  missing.reason = '测试夹具：在限定索引中未找到来源页面。';
  await page.route('**/civ-updates*.json', (route) => route.fulfill({ json: data }));
  await page.goto('/#/patches?histCoverage=none&histSourceState=no-log');
  const overview = page.getByTestId('civ-updates-overview');
  await expect(overview.locator('tbody tr')).toHaveCount(1);
  await overview.getByRole('link', { name: '查看丹麦人文明历史' }).click();
  const reader = page.getByTestId('civ-updates-reader');
  await expect(reader).toContainText('指定来源页面存在，但日志章节暂无记录');
  await expect(reader).toContainText('尚未收录该文明的更新历史');
  await page.goto('/#/civ/Cumans?tab=history&histReturn=https%3A%2F%2Fevil.example');
  await expect(reader.getByRole('alert')).toContainText('返回地址无法识别');
  await reader.getByRole('button', { name: '清除历史筛选' }).click();
  await expect(reader.getByRole('alert')).toHaveCount(0);
  await expect(reader).toContainText('来源章节仍有导入待核条目');
  await page.goto('/#/civ/Saxons?tab=history');
  await expect(reader).toContainText('在已登记来源查找范围中未找到页面');
  await reader.getByTestId('civ-update-processing').locator('summary').click();
  await expect(reader).toContainText('测试夹具：在限定索引中未找到来源页面。');
});
