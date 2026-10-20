import { expect, test, type Page } from '@playwright/test';

const entries = [
  ['内容与购买', 'content-guide', 'content-guide-page'],
  ['混兵情境', 'mixed-army', 'mixed-army-page'],
  ['团战分工', 'team-plan', 'team-plan-page'],
  ['战役入门', 'campaigns', 'campaigns-page'],
  ['圣物收益', 'relic-income', 'relic-income-page'],
] as const;
const messages = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  messages.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(messages.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#249 首页五入口及旧规划入口 ${width} ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/');
      const nav = page.getByRole('navigation', { name: '社区新工具', exact: true });
      await expect(nav.getByRole('link')).toHaveCount(5);
      await expect(page.getByRole('navigation', { name: '入门与实战', exact: true }).getByRole('link')).toHaveCount(3);
      await expect(page.getByRole('navigation', { name: '更多规划工具', exact: true }).getByRole('link')).toHaveCount(4);
      await page.screenshot({ path: info.outputPath(`community249-${theme}-${width}.png`), fullPage: true });
      for (const [label, route, id] of entries) {
        const link = nav.getByRole('link', { name: label, exact: true });
        const box = await link.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(44);
        await link.focus();
        await expect(link).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.getByTestId(id)).toBeVisible();
        expect(new URL(page.url()).hash.split('?')[0]).toBe('#/' + route);
        await page.goBack();
      }
    });

for (const [label, route, id] of entries) {
  test(`#249 全局搜索进入${label}`, async ({ page }) => {
    await page.goto('./#/');
    await page.getByRole('button', { name: '全局搜索', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '全局搜索' });
    await dialog.getByRole('textbox').fill(label);
    await expect(dialog.locator('.cmdk-t b', { hasText: label })).toBeVisible();
    await dialog.getByRole('textbox').press('Enter');
    await expect(page.getByTestId(id)).toBeVisible();
  });
  test(`#249 干净静态入口${route}保留损坏参数`, async ({ page }) => {
    await page.goto(`./${route}/`);
    await expect(page.getByTestId(id)).toBeVisible();
    await expect(page).toHaveTitle(/帝国时代/);
    await page.goto(`./${route}/?unrecognized=%ZZ`);
    await expect(page.getByTestId(id).getByRole('alert').first()).toBeVisible();
    expect(new URL(page.url()).hash).toContain('unrecognized=%ZZ');
  });
}

const contexts = [
  ['/dlc', '查看当前内容与购买导航', 'content-guide-page'],
  ['/builds', '先从教程与战役认识游戏', 'campaigns-page'],
  ['/matchup', '按敌军组合查看混兵情境', 'mixed-army-page'],
  ['/production', '在团战计划中约定主副兵种', 'team-plan-page'],
  ['/team-bonuses', '按明确来源预览圣物收益', 'relic-income-page'],
  ['/building/104?tab=garrison', '按已生效数量预览圣物收益', 'relic-income-page'],
] as const;
for (const [route, label, id] of contexts)
  test(`#249 上下文入口${label}`, async ({ page }) => {
    await page.goto('./#' + route);
    await page.getByRole('link', { name: label, exact: true }).click();
    await expect(page.getByTestId(id)).toBeVisible();
  });

test('#249 历史首发目录仍显示原映射且购买导航独立', async ({ page }) => {
  await page.goto('./#/dlc');
  await expect(page.locator('#dlcs .dlct tr')).toHaveCount(14);
  await expect(page.locator('#dlcs')).toContainText('不代表购买要求');
  await page.getByRole('link', { name: '查看当前内容与购买导航', exact: true }).click();
  await expect(page.getByTestId('content-guide-page')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#dlcs .dlct tr')).toHaveCount(14);
});

for (const route of ['/team-plan', '/team-plan/'])
  test(`#249 团战元信息不将长片段移入HTTP查询 ${route}`, async ({ page }) => {
    await page.goto('./#' + route + '?version=1&plan=' + 'p'.repeat(12000));
    await expect(page.getByTestId('team-plan-page')).toBeVisible();
    const og = page.locator('meta[property="og:url"]');
    await expect(og).toHaveAttribute('content', /\/team-plan\/$/);
    expect(new URL((await og.getAttribute('content'))!).search).toBe('');
    expect(new URL((await page.locator('link[rel="canonical"]').getAttribute('href'))!).search).toBe('');
    expect(new URL(page.url()).hash).toContain('p'.repeat(12000));
  });
