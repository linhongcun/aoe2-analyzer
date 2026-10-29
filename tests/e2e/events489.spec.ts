import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { eventCatalogState } from './events489Catalog';

const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const recorded: string[] = [];
  errors.set(page, recorded);
  page.on('pageerror', (error) => recorded.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') recorded.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

async function loaded(page: Page) {
  await expect(page.getByRole('heading', { level: 1, name: '赛事公告', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'The Garrison 2026', exact: true })).toBeVisible();
  await expect(page.locator('[data-event="the-garrison-2026"] [data-participant]')).toHaveCount(3);
}

async function sourcesOpen(page: Page) {
  await loaded(page);
  const summary = page.getByTestId('events-page').locator('summary');
  await summary.click();
  const details = summary.locator('..');
  await expect(details).toHaveAttribute('open', '');
  await expect(details.getByRole('link', { name: '主办方公布名单', exact: true })).toBeVisible();
  return details;
}

test('赛事公告直接地址呈现已加载的真实卡片', async ({ page }) => {
  await page.goto('/#/events');
  await expect(page.getByRole('heading', { level: 1, name: '赛事公告', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'The Garrison 2026', exact: true })).toBeVisible();
  await expect(page.getByText('2026-11-25', { exact: true })).toBeVisible();
  await expect(page.getByText('2026-11-29', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Hera', exact: true })).toBeVisible();
});

test('公告保留逐人角色、直接来源和未知发布日期', async ({ page }) => {
  await page.goto('./#/events');
  await loaded(page);
  const main = page.getByTestId('events-page');
  await expect(main).toContainText('部分已公布参赛选手');
  await expect(main).toContainText('人工维护；以主办方最新公告为准');
  for (const id of ['hera', 'liereyy']) {
    const participant = main.locator(`[data-participant="${id}"]`);
    await expect(participant).toContainText('1v1 赛事');
    await expect(participant).toContainText('The League 3v3 决赛 · Team Vitality');
  }
  const viper = main.locator('[data-participant="theviper"]');
  await expect(viper).toContainText('The League 3v3 决赛 · Onimaru Capybaras');
  await expect(viper).not.toContainText('1v1');
  const sources = await sourcesOpen(page);
  for (const [label, url] of [
    ['官方赛事公告', 'https://www.ageofempires.com/events/the-garrison-2026/'],
    ['主办方公告', 'https://beingesports.com/en/aoe2/news/thegarrison2026'],
    ['主办方公布名单', 'https://beingesports.com/en/aoe2/news/everyone-attending-the-garrison-2026'],
  ]) {
    const link = sources.getByRole('link', { name: label, exact: true });
    await expect(link).toHaveAttribute('href', url!);
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
  await expect(sources.getByText(/发布日期未核实/)).toHaveCount(3);
  await expect(sources).toContainText('2026-10-29');
  await expect(main).not.toContainText(/Hamburg|汉堡|Online|奖金|奖池|直播中|已结束|即将开始|UTC|北京时间：2026-11/);
  await expect(main.locator('iframe,video,audio,embed,object')).toHaveCount(0);
});

test('赛事到每位真实选手、具体对局文明以及前后退和刷新', async ({ page }) => {
  for (const [id, name, civ] of [
    ['hera', 'Hera', 'Armenians'],
    ['liereyy', 'Liereyy', 'Franks'],
    ['theviper', 'TheViper', 'Vikings'],
  ]) {
    await page.goto('./#/events');
    await loaded(page);
    const link = page.getByTestId('events-page').getByRole('link', { name, exact: true });
    const href = await link.getAttribute('href');
    expect(new URL(href!, page.url()).hash).toBe(`#/players/${id}`);
    await link.click();
    await expect(page.locator('main h1')).toHaveText(name!);
    await page.locator(`main a[href="#/civ/${civ}"]`).click();
    await expect(page).toHaveURL(new RegExp(`#/civ/${civ}$`));
    await expect(page.locator('#detail h1')).toBeVisible();
    await page.goBack();
    await expect(page.locator('main h1')).toHaveText(name!);
    if (id === 'hera') {
      await page.getByRole('link', { name: 'Hera 原视频视角', exact: true }).click();
      await expect(page.getByRole('tabpanel', { name: '职业选手视角', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: '查看原视频', exact: true })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=AaxJADJGjvU');
      await page.goBack();
    }
    await page.goBack();
    await loaded(page);
    await page.goForward();
    await expect(page.locator('main h1')).toHaveText(name!);
    await page.goBack();
    await page.reload();
    await loaded(page);
  }
});

test('首页资料导航与中文、拼音和缩写搜索均进入唯一赛事页', async ({ page }) => {
  await page.goto('./#/');
  const reference = page.locator('main').getByRole('link', { name: /赛事公告/ });
  await expect(reference).toHaveCount(1);
  await reference.click();
  await loaded(page);
  for (const query of ['赛事公告', 'saishigonggao', 'ssgg']) {
    await page.keyboard.press('ControlOrMeta+k');
    const input = page.getByRole('combobox', { name: '全局搜索', exact: true });
    await input.fill(query);
    const option = page.getByRole('option').filter({ hasText: '赛事公告' });
    await expect(option).toHaveCount(1);
    await option.click();
    await loaded(page);
  }
  const group = page.getByRole('button', { name: '工具', exact: true });
  await group.click();
  await expect(
    page
      .locator('#tools-menu')
      .getByRole('region', { name: '资料', exact: true })
      .getByRole('link', { name: /赛事公告/ }),
  ).toBeVisible();
});

test('静态赛事入口、元信息、OG图片与sitemap从登记生成，未知详情仍未找到', async ({ page, request }) => {
  const response = await request.get('./events/');
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain('<title>赛事公告 |');
  expect(html).toContain('name="description" content="查看人工维护的赛事公告、公布日期范围、部分参赛选手与主办方来源。"');
  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
  expect(canonical).toBeDefined();
  expect(new URL(canonical!).pathname.endsWith('/events/')).toBe(true);
  expect(html).toContain(`property="og:url" content="${canonical}"`);
  const imageUrl = /property="og:image" content="([^"]+)"/.exec(html)?.[1];
  expect(new URL(imageUrl!).pathname).toMatch(/\/og\/default\.png$/);
  const png = await (await request.get('og/default.png')).body();
  expect(png.readUInt32BE(16)).toBe(1200);
  expect(png.readUInt32BE(20)).toBe(630);
  const sitemap = await (await request.get('sitemap.xml')).text();
  expect(sitemap).toContain('/events/</loc>');
  expect(sitemap).not.toContain('/events/the-garrison-2026/');
  await page.goto('./events/');
  await loaded(page);
  await expect(page).toHaveTitle(/赛事公告/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/events\/$/);
  await page.getByRole('link', { name: 'Hera', exact: true }).click();
  await expect(page.locator('main h1')).toHaveText('Hera');
  await page.goto('./#/events/the-garrison-2026');
  await expect(page.locator('main h1')).toHaveText('找不到该页');
  await expect(page.locator('[data-event]')).toHaveCount(0);
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`真实公告与展开来源 ${width} ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/events');
      await sourcesOpen(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      for (const target of await page.getByTestId('events-page').locator('a,summary').all()) {
        if (!(await target.isVisible())) continue;
        const box = await target.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      for (const number of await page.getByTestId('events-page').locator('.num,.nw').all()) {
        if (!(await number.isVisible())) continue;
        expect(await number.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe('nowrap');
        expect(await number.evaluate((element) => [...element.getClientRects()].every((rect, _index, all) => Math.abs(rect.top - all[0]!.top) < 2))).toBe(true);
      }
      const summary = page.getByTestId('events-page').locator('summary');
      await page.keyboard.press('Tab');
      await summary.focus();
      await expect(summary).toBeFocused();
      expect(await summary.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
      expect((await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      await page.screenshot({ path: info.outputPath(`events-${width}-${theme}.png`), fullPage: true });
    });

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    for (const state of ['empty', 'unavailable'] as const)
      test(`实际读取边界 ${state} ${width} ${theme}`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
        const intercepted = await eventCatalogState(page, state);
        await page.goto('./#/events');
        const status = page.getByTestId('events-page').getByRole('status');
        await expect(status).toHaveText(state === 'empty' ? '暂无已核对赛事。' : '赛事资料暂不可用，请稍后再查看。');
        expect(intercepted()).toBe(true);
        await expect(page.getByTestId('events-page').locator('[data-event],a[href^="https://"],a[href*="/players/"]')).toHaveCount(0);
        await expect(page.getByTestId('events-page')).toContainText('人工维护；以主办方最新公告为准');
        expect((await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
        await page.screenshot({ path: info.outputPath(`events-${state}-${width}-${theme}.png`), fullPage: true });
      });
