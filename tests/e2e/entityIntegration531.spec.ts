import { expect, test, type Page } from '@playwright/test';

function query(href: string) {
  return new URL(href.replace(/^#/, ''), 'https://example.test').searchParams;
}

const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

async function treeReady(page: Page) {
  await expect(page.locator('#tree .tcell').first()).toBeVisible();
}

test('科技树 URL 恢复差异条件，单位钻取保留树文明和原对局', async ({ page }) => {
  await page.goto('./#/tree/Mongols?mode=2&compare=Chinese&me=Franks&opp=Britons');
  await treeReady(page);
  await expect(page.locator('#trm')).toHaveValue('2');
  await expect(page.locator('#trb')).toHaveAttribute('data-value', 'Chinese');
  const unit = page.locator('#tree .tcell[href*="/unit/4?"]').first();
  const href = await unit.getAttribute('href');
  const q = query(href!);
  expect(q.get('civ')).toBe('Mongols');
  expect(q.get('me')).toBe('Franks');
  expect(q.get('opp')).toBe('Britons');
  expect(q.get('ctxReturn')).toContain('/tree/Mongols?');
  await unit.click();
  await expect(page.locator('#unit')).toBeVisible();
  const back = page.locator('#unit a[href^="#/tree/Mongols?"]').first();
  await expect(back).toBeVisible();
  await back.click();
  await treeReady(page);
  await expect(page.locator('#trm')).toHaveValue('2');
  await expect(page.locator('#trb')).toHaveAttribute('data-value', 'Chinese');
});

test('科技收益入口沿用当前文明与时代，保留目标与原对局', async ({ page }) => {
  await page.goto('./#/tech/202?civ=Mongols&age=3&me=Franks&opp=Britons');
  const link = page.getByRole('link', { name: '查看经济科技收益与研究投入', exact: true });
  await expect(link).toBeVisible();
  const q = query((await link.getAttribute('href'))!);
  expect(q.get('civ')).toBe('Mongols');
  expect(q.get('target')).toBe('202');
  expect(q.get('age')).toBe('3');
  expect(q.get('me')).toBe('Franks');
  expect(q.get('opp')).toBe('Britons');
  expect(q.get('ctxReturn')).toContain('/tech/202?');
});

test('单位当前模拟可以进入待配置的生产方案，不填入建筑数量', async ({ page }) => {
  await page.goto('./#/unit/38/Franks/3//?tab=sim&me=Mongols&opp=Chinese');
  const link = page.getByRole('link', { name: '按当前单位规划生产', exact: true });
  await expect(link).toBeVisible();
  const q = query((await link.getAttribute('href'))!);
  expect(q.get('civ')).toBe('Franks');
  expect(q.get('age')).toBe('3');
  expect(q.get('rows')).toMatch(/^38:\d+:$/);
  expect(q.get('me')).toBe('Mongols');
  expect(q.get('opp')).toBe('Chinese');
  expect(q.get('ctxReturn')).toContain('/unit/38/Franks/3/');
});

test('科技与建筑继续探索保留当前文明和上一工具', async ({ page }) => {
  await page.goto('./#/tech/202?civ=Mongols&me=Franks&opp=Britons');
  const building = page.locator('#tech a[href^="#/building/"]').first();
  await expect(building).toBeVisible();
  expect(query((await building.getAttribute('href'))!).get('civ')).toBe('Mongols');
  await building.click();
  await expect(page.locator('#building')).toBeVisible();
  await expect(page.locator('#building a[href^="#/tech/202?"]').first()).toBeVisible();
});

test('文明独特单位与科技入口保留本页文明和原对局', async ({ page }) => {
  await page.goto('./#/civ/Franks?me=Mongols&opp=Chinese');
  const unit = page.locator('.dside a[href^="#/unit/"]').first();
  await expect(unit).toBeVisible();
  const q = query((await unit.getAttribute('href'))!);
  expect(q.get('civ')).toBe('Franks');
  expect(q.get('me')).toBe('Mongols');
  expect(q.get('opp')).toBe('Chinese');
  expect(q.get('ctxReturn')).toContain('/civ/Franks?');
});

test('不可用文明与无效查询不被模拟器静默替换', async ({ page }) => {
  for (const civ of ['Aztecs', 'Unknown']) {
    await page.goto(`./#/unit/38?civ=${civ}&tab=sim`);
    await expect(page.locator('#unit')).toBeVisible();
    await expect(page.locator('#unit p[role="status"]')).toContainText(civ === 'Aztecs' ? '阿兹特克无法生产该单位' : '文明无效');
    expect(new URL(page.url()).hash).toContain(`/unit/38?civ=${civ}`);
    await expect(page.locator('#simciv')).toHaveCount(0);
  }
});

test('科技树选择写入可独立恢复的 URL，保留未知参数和原对局', async ({ page, context }) => {
  await page.goto('./#/tree/Mongols?tracking=one&tracking=two&me=Franks&opp=Britons');
  await treeReady(page);
  await page.locator('#trm').selectOption('3');
  const p = new URLSearchParams(new URL(page.url()).hash.split('?')[1]);
  expect(p.get('mode')).toBe('3');
  expect(p.getAll('tracking')).toEqual(['one', 'two']);
  expect(p.get('me')).toBe('Franks');
  expect(p.get('opp')).toBe('Britons');
  const fresh = await context.newPage();
  await fresh.goto(page.url());
  await expect(fresh.locator('#trm')).toHaveValue('3');
  await fresh.reload();
  await expect(fresh.locator('#trm')).toHaveValue('3');
  await fresh.close();
});

test('浏览原对手文明时回助手不反转对局，不完整来源不猜对手', async ({ page }) => {
  for (const source of ['me=Franks&opp=Britons', 'opp=Franks', 'me=Franks']) {
    await page.goto('./#/civ/Britons?' + source);
    const link = page.locator('#detail').getByRole('navigation', { name: '本页相关工具', exact: true }).getByRole('link', { name: '对局助手', exact: true });
    await expect(link).toBeVisible();
    const p = query((await link.getAttribute('href'))!);
    expect(p.get('me')).toBe(source.includes('&') ? 'Franks' : 'Britons');
    expect(p.get('opp')).toBe(source.includes('&') ? 'Britons' : null);
    expect(p.get('ctxReturn')).toBe('/civ/Britons?' + source);
  }
});

test('建筑模拟调整保留导航，施工入口使用当前条件和原对局', async ({ page }) => {
  const source = '/unit/38?civ=Franks';
  await page.goto('./#/building/101?' + new URLSearchParams({ civ: 'Franks', age: '3', tab: 'sim', me: 'Mongols', opp: 'Chinese', ctxReturn: source }));
  await expect(page.locator('#simciv')).toHaveAttribute('data-value', 'Franks');
  await page.locator('#simage').selectOption('4');
  const p = new URLSearchParams(new URL(page.url()).hash.split('?')[1]);
  expect(p.get('me')).toBe('Mongols');
  expect(p.get('opp')).toBe('Chinese');
  expect(p.get('ctxReturn')).toBe(source);
  const next = page.getByRole('link', { name: '按当前文明与科技比较施工', exact: true });
  const target = query((await next.getAttribute('href'))!);
  expect(target.get('civ')).toBe('Franks');
  expect(target.get('age')).toBe('4');
  expect(target.get('me')).toBe('Mongols');
  expect(target.get('opp')).toBe('Chinese');
  expect(target.get('ctxReturn')).toContain('/building/101?');
});

test('建筑不属于当前文明时保留选择并暂停模拟', async ({ page }) => {
  await page.goto('./#/building/1251?civ=Britons&tab=sim');
  await expect(page.locator('#building p[role="status"]')).toContainText('不列颠无法建造该建筑');
  await expect(page.locator('#simciv')).toHaveCount(0);
  expect(new URL(page.url()).hash).toContain('civ=Britons');
});

test('建筑明确时代不足时保留输入，主动选择后才打开可用时代模拟', async ({ page }) => {
  await page.goto('./#/building/82?civ=Britons&age=2&tab=sim&me=Franks&opp=Mongols');
  await expect(page.locator('#building p[role="status"]')).toContainText('当前时代尚未解锁该建筑');
  await expect(page.locator('#simage')).toHaveCount(0);
  expect(new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('age')).toBe('2');
  await page.getByRole('link', { name: '按可用时代查看模拟', exact: true }).click();
  await expect(page.locator('#simage')).toHaveValue('3');
  const p = new URLSearchParams(new URL(page.url()).hash.split('?')[1]);
  expect(p.get('me')).toBe('Franks');
  expect(p.get('opp')).toBe('Mongols');
});

test('提前可用单位与属性模型支持范围分开说明，生产默认使用实际可用时代', async ({ page }) => {
  await page.goto('./#/unit/75?civ=Armenians&age=1&tab=sim&me=Franks&opp=Mongols');
  await expect(page.locator('#unit p[role="status"]')).toContainText('属性模拟模型暂不支持当前时代');
  await expect(page.locator('#unit p[role="status"]')).not.toContainText('未解锁');
  await expect(page.locator('#simage')).toHaveCount(0);
  expect(new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('age')).toBe('1');
  const next = page.getByRole('link', { name: '按当前单位规划生产', exact: true });
  expect(query((await next.getAttribute('href'))!).get('age')).toBe('1');
  await page.getByRole('link', { name: '按模型支持时代查看模拟', exact: true }).click();
  await expect(page.locator('#simage')).toHaveValue('2');
  expect(new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('me')).toBe('Franks');
  await page.goto('./#/unit/75?civ=Armenians');
  await expect(next).toBeVisible();
  expect(query((await next.getAttribute('href'))!).get('age')).toBe('1');
});

test('没有明确时代的既有默认模拟模式保持', async ({ page }) => {
  await page.goto('./#/building/82?civ=Britons&tab=sim');
  await expect(page.locator('#simage')).toHaveValue('4');
  await page.goto('./#/unit/75?civ=Armenians&tab=sim');
  await expect(page.locator('#simage')).toHaveValue('4');
});
