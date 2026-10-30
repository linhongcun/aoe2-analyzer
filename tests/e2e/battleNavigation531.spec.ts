import { test, expect, type Page } from '@playwright/test';

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
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
const params = (page: Page) => new URLSearchParams(new URL(page.url()).hash.split('?')[1]);

test('#531 对比明确选择我方，原对比配置可返回', async ({ page }) => {
  await page.goto('./#/compare?a=Mongols&b=Chinese&x=1&x=2');
  await page.getByRole('link', { name: '以左侧为我方分析', exact: true }).click();
  await expect(page.locator('#ma')).toHaveAttribute('data-value', 'Mongols');
  expect(params(page).get('opp')).toBe('Chinese');
  const back = page.getByRole('link', { name: '回文明对比', exact: true });
  await back.click();
  await expect(page.locator('#ca')).toHaveAttribute('data-value', 'Mongols');
  expect(params(page).getAll('x')).toEqual(['1', '2']);
});

test('#531 对局推荐模拟保留原对阵及回程', async ({ page }) => {
  await page.goto('./#/matchup?me=Mongols&opp=Chinese');
  const entry = page.getByRole('link', { name: /：用蒙古模拟/ }).first();
  await expect(entry).toHaveAttribute('href', /me=Mongols/);
  await expect(entry).toHaveAttribute('href', /opp=Chinese/);
  await entry.click();
  await expect(page.locator('#simciv')).toHaveAttribute('data-value', 'Mongols');
  await page.getByRole('link', { name: '回对局助手', exact: true }).click();
  await expect(page.locator('#me')).toHaveAttribute('data-value', 'Chinese');
});

test('#531 PK两侧显式进入生产，军队数量不作为生产建筑数量', async ({ page }) => {
  const duel = '/duel?a=38.Franks.3..&b=4.Britons.3..&m=n&na=23&nb=8&me=Mongols&opp=Chinese';
  for (const [side, unit, civ] of [
    ['A', '38', 'Franks'],
    ['B', '4', 'Britons'],
  ]) {
    await page.goto('./#' + duel);
    await page.getByRole('link', { name: `按 ${side} 方规划生产`, exact: true }).click();
    await expect(page.getByRole('combobox', { name: '生产文明', exact: true })).toHaveValue(civ!);
    expect(params(page).get('rows')?.split(':')[0]).toBe(unit);
    expect(params(page).get('rows')?.split(':')[2]).toBe('');
    expect(params(page).get('me')).toBe('Mongols');
    expect(params(page).get('opp')).toBe('Chinese');
    expect(params(page).get('ctxReturn')).toContain('na=23&nb=8');
    await page.getByRole('link', { name: '回单位 PK', exact: true }).click();
    expect(params(page).get('na')).toBe('23');
    expect(params(page).get('nb')).toBe('8');
  }
});

test('#531 上一对局来源与原对局不同，不将两者误标为同一配置', async ({ page }) => {
  const p = new URLSearchParams({ civ: 'Franks', me: 'Franks', opp: 'Britons', ctxReturn: '/matchup?me=Mongols&opp=Chinese' });
  await page.goto('./#/production?' + p);
  await expect(page.getByRole('link', { name: '回上一对局配置', exact: true })).toHaveAttribute('href', '#/matchup?me=Mongols&opp=Chinese');
  await expect(page.getByRole('link', { name: '回对局助手', exact: true })).toHaveAttribute('href', '#/matchup?me=Franks&opp=Britons');
});

test('#531 显式损坏的原对阵不与PK默认一侧拼接', async ({ page }) => {
  await page.goto('./#/duel?a=38.Franks.3..&b=4.Britons.3..&me=unknown&opp=Chinese');
  await expect(page.getByRole('link', { name: '回对局助手', exact: true })).toHaveAttribute('href', '#/matchup');
  await expect(page.getByText('来源链接不可用，当前设置已保留。')).toBeVisible();
  await expect(page.getByText('原对局：法兰克 对 中国')).toHaveCount(0);
  const source = new URLSearchParams({ me: 'unknown', opp: 'Chinese', ctxReturn: '/matchup?me=Mongols&opp=Chinese&rush=archers' });
  await page.goto('./#/duel?a=38.Franks.3..&b=4.Britons.3..&' + source);
  const back = page.getByRole('link', { name: '回对局助手', exact: true });
  await expect(back).toHaveCount(1);
  await expect(back).toHaveAttribute('href', '#/matchup?me=Mongols&opp=Chinese&rush=archers');
});

test('#531 正文演练保留rush选择并原样返回', async ({ page }) => {
  await page.goto('./#/matchup?me=Franks&opp=Britons&rush=archers');
  await page.getByRole('link', { name: /打开 PK 演练/ }).click();
  await page.getByRole('link', { name: '回对局助手', exact: true }).click();
  await expect(page.getByLabel('对手打法')).toHaveValue('archers');
});

test('#531 从单位资料进入练习记录只预览，不推断新的实战事实', async ({ page }) => {
  await page.goto('./#/unit/38?civ=Franks&me=Franks&opp=Britons');
  await page.getByRole('link', { name: '记录一个练习问题', exact: true }).click();
  await expect(page.getByTestId('review-source-preview')).toBeVisible();
  expect(params(page).get('ctxReturn')).toBe('/unit/38?civ=Franks&me=Franks&opp=Britons');
  await expect(page.getByRole('button', { name: '仅补入空白字段', exact: true })).toBeVisible();
});

for (const [path, heading] of [
  ['trade-income', '商路供给规划'],
  ['construction', '多人施工'],
  ['relic-income', '圣物收益'],
]) {
  test(`#531 ${path}导航隔离、复制保留与严格未知字段拒绝`, async ({ page }) => {
    const p = new URLSearchParams({ me: 'Franks', opp: 'Britons', ctxReturn: '/duel?a=38.Franks.3..&b=4.Britons.3..' });
    await page.goto('./?outside531=1#/' + path + '?' + p);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    const copy = page.getByRole('button', { name: '复制方案链接', exact: true });
    await expect(copy).toBeEnabled();
    await page.evaluate(() =>
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            document.documentElement.dataset.copied531 = text;
          },
        },
      }),
    );
    await copy.click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.copied531)).toContain('ctxReturn=');
    const shared = new URL((await page.evaluate(() => document.documentElement.dataset.copied531))!);
    if (path === 'relic-income') expect(shared.search).toBe('');
    await page.goto(shared.href);
    await expect(page.getByRole('link', { name: '回单位 PK', exact: true })).toBeVisible();
    await page.goto(shared.href + '&untrusted531=1');
    await expect(copy).toBeDisabled();
  });
}
