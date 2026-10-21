import { expect, test, type Locator, type Page } from '@playwright/test';

const entries = [
  ['一局与观赛', 'game-guide', 'game-guide-page'],
  ['手填复盘', 'match-review', 'match-review-page'],
  ['侦察辨析', 'scouting', 'scouting-page'],
] as const;
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') messages.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#259 学习入口及既有工具 ${width} ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/');
      const home = page.locator('#home');
      await expect(home.locator('.home-group')).toHaveCount(4);
      await expect(home.getByRole('region', { name: '新手入门', exact: true }).getByRole('link')).toHaveCount(5);
      await expect(home.getByRole('region', { name: '对局计划', exact: true }).getByRole('link')).toHaveCount(11);
      await page.screenshot({ path: info.outputPath(`learning259-${theme}-${width}.png`), fullPage: true });
      for (const [label, route, id] of entries) {
        const link = home.getByRole('link', { name: new RegExp(label) });
        expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
        await link.focus();
        await expect(link).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.getByTestId(id)).toBeVisible();
        expect(new URL(page.url()).hash.split('?')[0]).toBe('#/' + route);
        await page.goBack();
      }
    });

for (const [label, route, id] of entries) {
  test(`#259 搜索进入${label}`, async ({ page }) => {
    await page.goto('./#/');
    await page.getByRole('button', { name: '全局搜索', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '全局搜索' });
    await dialog.getByRole('combobox').fill(label);
    await expect(dialog.locator('.cmdk-t b', { hasText: label })).toBeVisible();
    await dialog.getByRole('combobox').press('Enter');
    await expect(page.getByTestId(id)).toBeVisible();
  });

  test(`#259 静态入口恢复${route}`, async ({ page }) => {
    await page.goto(`./${route}/`);
    await expect(page.getByTestId(id)).toBeVisible();
    await expect(page).toHaveTitle(/帝国时代/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.+/);
  });
}

for (const [route, id] of [
  ['game-guide', 'game-guide-page'],
  ['scouting', 'scouting-page'],
] as const)
  test(`#259 静态入口保留损坏条件 ${route}`, async ({ page }) => {
    await page.goto(`./${route}/?unrecognized=%ZZ`);
    await expect(page.getByTestId(id).getByRole('alert').first()).toBeVisible();
    expect(new URL(page.url()).hash).toContain('unrecognized=%ZZ');
  });

test('#259 入门卡复制出的完整静态链接恢复所有条件', async ({ page }) => {
  await page.goto('./#/game-guide');
  await page.getByRole('button', { name: /观赛关注点/ }).click();
  await page.getByRole('combobox', { name: '开局或模式', exact: true }).selectOption('nomad');
  await page.getByRole('combobox', { name: '胜利设置', exact: true }).selectOption('other');
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value: string) => localStorage.setItem('integration-guide-link', value) },
    }),
  );
  await page.getByRole('button', { name: '复制当前卡片链接', exact: true }).click();
  const copied = await page.evaluate(() => localStorage.getItem('integration-guide-link'));
  expect(copied).toBeTruthy();
  await page.goto(copied!);
  await expect(page.getByTestId('game-guide-unsupported')).toBeVisible();
  await expect(page.getByRole('combobox', { name: '开局或模式', exact: true })).toHaveValue('nomad');
  await expect(page.getByRole('combobox', { name: '胜利设置', exact: true })).toHaveValue('other');
  await expect(page.getByRole('button', { name: /观赛关注点/ })).toHaveAttribute('aria-pressed', 'true');
});

/** #269 起，观察的时间、范围与时效收进「补充…（可选）」折叠区，先展开再操作。 */
async function openOptional(observation: Locator) {
  const details = observation.locator('details');
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) await details.locator('summary').click();
}

test('#259 侦察卡复制出的完整静态链接恢复两组观察', async ({ page }) => {
  await page.goto('./#/scouting');
  const field = page.locator('[data-observation="military-building"]');
  await field.getByRole('combobox').first().selectOption('seen');
  await openOptional(field);
  await field.getByRole('textbox').fill('12:30');
  await field.getByRole('combobox').last().selectOption('enemy-front');
  await page.getByRole('combobox', { name: '情境', exact: true }).selectOption('walled');
  await page.getByRole('combobox', { name: '我的当前阶段', exact: true }).selectOption('castle');
  const second = page.locator('[data-observation="new-town-center"]');
  await second.getByRole('combobox').first().selectOption('seen');
  await openOptional(second);
  await second.getByRole('textbox').fill('25:00');
  await second.getByRole('combobox').last().selectOption('enemy-edge');
  await second.getByRole('checkbox').check();
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value: string) => localStorage.setItem('integration-scouting-link', value) },
    }),
  );
  await page.getByRole('button', { name: '复制情报链接', exact: true }).click();
  const copied = await page.evaluate(() => localStorage.getItem('integration-scouting-link'));
  expect(copied).toBeTruthy();
  await page.goto(copied!);
  await expect(page.getByTestId('scouting-page')).toBeVisible();
  await expect(page.getByRole('combobox', { name: '情境', exact: true })).toHaveValue('walled');
  await openOptional(second);
  await expect(second.getByRole('textbox')).toHaveValue('25:00');
  await expect(second.getByRole('checkbox')).toBeChecked();
  await page.getByRole('combobox', { name: '情境', exact: true }).selectOption('early');
  await expect(field.getByRole('combobox').first()).toHaveValue('seen');
  await openOptional(field);
  await expect(field.getByRole('textbox')).toHaveValue('12:30');
  await expect(field.getByRole('combobox').last()).toHaveValue('enemy-front');
});

const contexts = [
  ['/builds', '先看懂一局的目标与角色', 'game-guide-page'],
  ['/builds', '赛后整理事实与下局目标', 'match-review-page'],
  ['/glossary', '用六张卡看懂一局与观赛', 'game-guide-page'],
  ['/matchup', '先辨析侦察线索与缺失信息', 'scouting-page'],
  ['/matchup', '记录本局疑问与下次练习重点', 'match-review-page'],
] as const;
for (const [route, label, id] of contexts)
  test(`#259 上下文入口 ${label}`, async ({ page }) => {
    await page.goto('./#' + route);
    await page.getByRole('link', { name: label, exact: true }).click();
    await expect(page.getByTestId(id)).toBeVisible();
  });

for (const route of [
  '/match-review',
  '/match-review/',
  '/match-review//',
  '/match-review///',
  '/MATCH-REVIEW',
  '/Match-Review///',
  '/%6datch-review',
  '/match%2Dreview',
])
  test(`#259 复盘元信息不携带个人查询 ${route}`, async ({ page }) => {
    const privateText = '仅本机个人记录'.repeat(200);
    await page.goto('./#' + route + '?notes=' + encodeURIComponent(privateText));
    await expect(page.getByTestId('match-review-page')).toBeVisible();
    await expect(page).toHaveTitle(/手填复盘与下局目标/);
    const og = await page.locator('meta[property="og:url"]').getAttribute('content');
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(new URL(og!).pathname).toMatch(/\/match-review\/$/);
    expect(new URL(canonical!).pathname).toMatch(/\/match-review\/$/);
    expect(new URL(og!).search).toBe('');
    expect(new URL(canonical!).search).toBe('');
    expect(new URL(og!).hash).toBe('');
    expect(new URL(canonical!).hash).toBe('');
    expect(og).not.toContain(encodeURIComponent('仅本机'));
  });

for (const route of ['/TEAM-PLAN', '/%74eam-plan'])
  test(`#259 团战元信息不携带个人查询 ${route}`, async ({ page }) => {
    await page.goto('./#' + route + '?notes=' + encodeURIComponent('仅本机个人计划'.repeat(200)));
    await expect(page.getByTestId('team-plan-page')).toBeVisible();
    await expect(page).toHaveTitle(/团战分工/);
    for (const [selector, attribute] of [
      ['meta[property="og:url"]', 'content'],
      ['link[rel="canonical"]', 'href'],
    ] as const) {
      const url = new URL((await page.locator(selector).getAttribute(attribute))!);
      expect(url.pathname).toMatch(/\/team-plan\/$/);
      expect(url.search).toBe('');
      expect(url.hash).toBe('');
    }
  });
