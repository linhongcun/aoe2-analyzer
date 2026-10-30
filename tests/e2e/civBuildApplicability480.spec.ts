import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import type { BuildOrder } from '../../src/domain/buildOrder';

const orders = readdirSync(new URL('../../src/data/build-orders/', import.meta.url))
  .filter((file) => file.endsWith('.json'))
  .map((file) => JSON.parse(readFileSync(new URL(`../../src/data/build-orders/${file}`, import.meta.url), 'utf8')) as BuildOrder);
const order = (id: string) => orders.find((entry) => entry.id === id)!;
const opening = (page: Page) => page.getByRole('region', { name: '推荐开局', exact: true });
const applicability = (page: Page) => page.getByRole('region', { name: '开局适用文明', exact: true });
const genericNote = '资料未列出该文明，当前作为通用示意';
const errors = new WeakMap<Page, string[]>();
const route = (pathname: string, params: Record<string, string> = {}) => pathname + (Object.keys(params).length ? '?' + new URLSearchParams(params) : '');
const normalizedRoute = (href: string) => {
  const [pathname, query = ''] = href.replace(/^#/, '').split('?');
  return { pathname, params: [...new URLSearchParams(query)].sort(([a], [b]) => a.localeCompare(b)) };
};
async function expectRoute(link: Locator, pathname: string, params: Record<string, string> = {}) {
  await expect(link).toHaveAttribute('href', /^#\//);
  expect(normalizedRoute((await link.getAttribute('href'))!)).toEqual(normalizedRoute(route(pathname, params)));
}
async function expectCivRoutes(links: Locator, civs: string[], params: Record<string, string>) {
  const actual = await links.evaluateAll((elements) => elements.map((element) => element.getAttribute('href')!));
  expect(actual.map(normalizedRoute)).toEqual(civs.map((civ) => normalizedRoute(route(`/civ/${civ}`, params))));
}

test.beforeEach(({ page }) => {
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

test('#480 regression Tatars uses its listed archer opening instead of the route-text scouts', async ({ page }) => {
  await page.goto('./#/civ/Tatars');
  const region = opening(page);
  await expect(region).toBeVisible();
  await expectRoute(region.getByRole('link', { name: order('archers-19').name.zh, exact: true }), '/builds', {
    bo: 'archers-19',
    civ: 'Tatars',
    ctxReturn: '/civ/Tatars',
  });
  await expect(region.locator('a[href*="bo=scouts-18"]')).toHaveCount(0);
  await expect(region).toContainText('资料标注适用的开局流程');
});

test('#480 regression Mayans exposes the listed archer opening despite eagle route text', async ({ page }) => {
  await page.goto('./#/civ/Mayans');
  const region = opening(page);
  await expect(region).toBeVisible();
  await expectRoute(region.getByRole('link', { name: order('archers-19').name.zh, exact: true }), '/builds', {
    bo: 'archers-19',
    civ: 'Mayans',
    ctxReturn: '/civ/Mayans',
  });
  await expect(region).toContainText('资料标注适用的开局流程');
});

test('#480 regression Varangians fallback is explicitly generic and preserves the requested civilization', async ({ page }) => {
  await page.goto('./#/civ/Varangians');
  const region = opening(page);
  const link = region.getByRole('link', { name: order('scouts-18').name.zh, exact: true });
  await expect(link).toBeVisible();
  await expectRoute(link, '/builds', { bo: 'scouts-18', civ: 'Varangians', ctxReturn: '/civ/Varangians' });
  await expect.soft(region).toContainText('通用流程示意');
  await expect.soft(link.locator('..')).toContainText('通用示意');
});

test('#480 source links round-trip through the timeline and its listed civilizations', async ({ page }) => {
  const pair = { me: 'Franks', opp: 'Britons' };
  const civSource = route('/civ/Tatars', { tab: 'ov', ...pair });
  await page.goto('./#' + route('/civ/Tatars', { tab: 'ov', ...pair, ctxReturn: '/duel?a=38.Franks.3..&b=4.Britons.3..&m=n' }));
  const openingLink = opening(page).getByRole('link', { name: order('archers-19').name.zh, exact: true });
  const target = { bo: 'archers-19', civ: 'Tatars', ...pair, ctxReturn: civSource };
  await expectRoute(openingLink, '/builds', target);
  await openingLink.click();
  await expect(applicability(page)).toBeVisible();
  expect(normalizedRoute(new URL(page.url()).hash)).toEqual(normalizedRoute(route('/builds', target)));
  await expect(page.locator('#builds')).toContainText('按鞑靼计');

  // The current simulation civilization differs from both original sides; its
  // complete settings must survive a civilization drill-down and direct reload.
  const settings = { bo: 'archers-19', civ: 'Tatars', dist: '7', house: '0', step: '3', ...pair };
  const buildSource = route('/builds', settings);
  await page.goto('./#' + route('/builds', { ...settings, ctxReturn: civSource }));
  await expect(applicability(page)).toBeVisible();
  const civLinks = applicability(page).locator('a[href^="#/civ/"]');
  await expect(civLinks).toHaveCount(order('archers-19').civs.length);
  await expectCivRoutes(civLinks, order('archers-19').civs, { ...pair, ctxReturn: buildSource });
  await expect(applicability(page)).not.toContainText(genericNote);
  expect(
    await applicability(page).evaluate((region) => {
      const calculator = document.getElementById('builds');
      return !!calculator && !calculator.contains(region) && !!(region.compareDocumentPosition(calculator) & Node.DOCUMENT_POSITION_FOLLOWING);
    }),
  ).toBe(true);
  await page.reload();
  expect(new URLSearchParams(page.url().split('?')[1]).get('civ')).toBe('Tatars');
  expect(normalizedRoute(new URL(page.url()).hash)).toEqual(normalizedRoute(route('/builds', { ...settings, ctxReturn: civSource })));
  await expect(page.locator('#builds')).toContainText('按鞑靼计');
  await expect(page.locator('.tl-steps > li[data-step="2"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.tl-steps > li[data-step="2"]').getByRole('region', { name: '步骤详情', exact: true })).toBeVisible();

  // A copied real href also works in a fresh tab, without an onClick handoff.
  const href = (await applicability(page).getByRole('link', { name: '鞑靼', exact: true }).getAttribute('href'))!;
  const tab = await page.context().newPage();
  const tabErrors: string[] = [];
  tab.on('pageerror', (error) => tabErrors.push(error.message));
  tab.on('console', (message) => {
    if (message.type() === 'error') tabErrors.push(message.text());
  });
  await tab.goto(page.url().split('#')[0] + href);
  await expect(tab.locator('#detail h1')).toContainText('鞑靼');
  await tab.reload();
  await expect(tab.locator('#detail h1')).toContainText('鞑靼');
  const back = tab.getByRole('navigation', { name: '当前分析情境', exact: true }).getByRole('link', { name: '回开局流程', exact: true });
  await expectRoute(back, '/builds', settings);
  await expectRoute(opening(tab).getByRole('link', { name: order('archers-19').name.zh, exact: true }), '/builds', {
    bo: 'archers-19',
    civ: 'Tatars',
    ...pair,
    ctxReturn: route('/civ/Tatars', pair),
  });
  await back.click();
  await expect(applicability(tab)).toBeVisible();
  expect(normalizedRoute(new URL(tab.url()).hash)).toEqual(normalizedRoute(buildSource));
  await expect(tab.locator('#builds')).toContainText('按鞑靼计');
  await expect(tab.locator('.tl-steps > li[data-step="2"]')).toHaveAttribute('aria-selected', 'true');
  await expect(tab.locator('.tl-steps > li[data-step="2"]').getByRole('region', { name: '步骤详情', exact: true })).toBeVisible();
  await tab.reload();
  await expect(applicability(tab)).toBeVisible();
  expect(normalizedRoute(new URL(tab.url()).hash)).toEqual(normalizedRoute(buildSource));
  expect(tabErrors).toEqual([]);
  expect(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await tab.close();
  await applicability(page).getByRole('link', { name: '鞑靼', exact: true }).click();
  await expect(page.locator('#detail h1')).toContainText('鞑靼');
});

test('#480 supported Poles remains outside the curated applicability recommendation', async ({ page }) => {
  await page.goto('./#/builds?bo=archers-19&civ=Poles');
  await expect(applicability(page)).toContainText(genericNote);
  await expect(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
  await expect(page.locator('#builds')).toContainText('按波兰计');
  await expect(page.locator('[data-t="civ-note"]')).toContainText('农田即时收获未计入');
  await expect(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
  await expect(applicability(page)).toContainText(genericNote);
  await page.reload();
  expect(new URLSearchParams(page.url().split('?')[1]).get('civ')).toBe('Poles');
  await expect(applicability(page)).toContainText(genericNote);
});

test('#480 reverse links belong in expanded details and empty source lists remain generic', async ({ page }) => {
  await page.goto('./#/builds');
  const details = page.locator('#bo-archers-19');
  const summary = details.locator('summary');
  await expect(summary.locator('a')).toHaveCount(0);
  await expect(summary.locator('[data-t="bo-civ"]')).toHaveCount(order('archers-19').civs.length);
  await summary.click();
  const links = details.locator('a[href^="#/civ/"]');
  await expectCivRoutes(links, order('archers-19').civs, { ctxReturn: '/builds' });
  await expect(summary.locator('a')).toHaveCount(0);
  const generic = page.locator('#bo-drush-fc');
  await generic.locator('summary').click();
  await expect(generic.locator('a[href^="#/civ/"]')).toHaveCount(0);
  await page.goto('./#/builds?bo=drush-fc&civ=Varangians');
  await expect(applicability(page)).toContainText('通用');
  await expect(applicability(page).locator('a[href^="#/civ/"]')).toHaveCount(0);
  await expect(applicability(page)).not.toContainText(genericNote);
});

test('#480 a civilization without a listed flow or first-stage match keeps an explicit empty state', async ({ page }) => {
  await page.goto('./#/civ/Incas');
  const region = opening(page);
  await expect(region).toContainText('暂无匹配');
  await expect(region.locator('a[href*="bo="]')).toHaveCount(0);
  await expectRoute(region.getByRole('link', { name: '查看全部开局', exact: true }), '/builds', { civ: 'Incas', ctxReturn: '/civ/Incas' });
});

test('#531 civilization list entry and list applicability preserve original sides and complete list conditions', async ({ page }) => {
  const pair = { me: 'Franks', opp: 'Britons' };
  const civSource = route('/civ/Tatars', { tab: 'ov', ...pair });
  await page.goto('./#' + route('/civ/Tatars', { tab: 'ov', ...pair, ctxReturn: '/production?civ=Franks&age=3' }));
  const all = opening(page).getByRole('link', { name: '查看全部开局', exact: true });
  await expectRoute(all, '/builds', { civ: 'Tatars', ...pair, ctxReturn: civSource });
  await all.click();
  await expect(page.locator('#builds h1')).toContainText('开局流程');
  expect(normalizedRoute(new URL(page.url()).hash)).toEqual(normalizedRoute(route('/builds', { civ: 'Tatars', ...pair, ctxReturn: civSource })));
  const settings = { civ: 'Tatars', dist: '7', house: '0', view: 'print', ...pair };
  const listSource = route('/builds', settings);
  await page.goto('./#' + route('/builds', { ...settings, ctxReturn: civSource }));
  const details = page.locator('#bo-archers-19');
  await details.locator('summary').click();
  await expectCivRoutes(details.locator('a[href^="#/civ/"]'), order('archers-19').civs, { ...pair, ctxReturn: listSource });
  await details.getByRole('link', { name: '玛雅', exact: true }).click();
  await expect(page.locator('#detail h1')).toContainText('玛雅');
  await page.reload();
  await expectRoute(
    page.getByRole('navigation', { name: '当前分析情境', exact: true }).getByRole('link', { name: '回开局流程', exact: true }),
    '/builds',
    settings,
  );
  await expectRoute(opening(page).getByRole('link', { name: order('archers-19').name.zh, exact: true }), '/builds', {
    bo: 'archers-19',
    civ: 'Mayans',
    ...pair,
    ctxReturn: route('/civ/Mayans', pair),
  });
});

test('#531 source snapshots retain original query bytes and only remove their own return', async ({ page }) => {
  const pair = { me: 'Franks', opp: 'Britons' };
  const civSource = '/civ/Tatars?tab=ov&me=Franks&opp=Britons&legacy=%ZZ&x=%2f&x=one+two';
  await page.goto('./#' + civSource + '&ctxReturn=%2Fmatchup%3Fme%3DFranks%26opp%3DBritons');
  await expectRoute(opening(page).getByRole('link', { name: order('archers-19').name.zh, exact: true }), '/builds', {
    bo: 'archers-19',
    civ: 'Tatars',
    ...pair,
    ctxReturn: civSource,
  });
  const listSource = '/builds?civ=Tatars&dist=7&house=0&me=Franks&opp=Britons&legacy=%ZZ&x=%2f&x=one+two';
  await page.goto('./#' + listSource + '&ctxReturn=%2Fciv%2FTatars');
  const details = page.locator('#bo-archers-19');
  await details.locator('summary').click();
  await expectCivRoutes(details.locator('a[href^="#/civ/"]'), order('archers-19').civs, { ...pair, ctxReturn: listSource });
  const buildSource = '/builds?bo=archers-19&civ=Tatars&dist=7&house=0&step=3&me=Franks&opp=Britons&legacy=%ZZ&x=%2f&x=one+two';
  await page.goto('./#' + buildSource + '&ctxReturn=%2Fciv%2FTatars');
  await expect(applicability(page)).toBeVisible();
  await expectCivRoutes(applicability(page).getByRole('link'), order('archers-19').civs, { ...pair, ctxReturn: buildSource });
});

async function touchTargets(links: Locator) {
  const undersized = await links.evaluateAll((elements) =>
    elements
      .map((element) => ({ text: element.textContent, width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }))
      .filter((box) => box.width < 43.5 || box.height < 43.5),
  );
  expect(undersized).toEqual([]);
}

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark']) {
    test(`#480 source applicability ${width} ${theme}: keyboard, touch targets and complete context`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const pair = { me: 'Franks', opp: 'Britons' };
      const civSource = route('/civ/Varangians', pair);
      await page.goto('./#' + route('/civ/Varangians', { ...pair, ctxReturn: '/matchup?me=Franks&opp=Britons' }));
      const region = opening(page);
      await expect(region).toContainText('通用流程示意');
      await expect(region.locator('ol > li')).toHaveCount(2);
      const link = region.getByRole('link', { name: order('scouts-18').name.zh, exact: true });
      await expectRoute(link, '/builds', { bo: 'scouts-18', civ: 'Varangians', ...pair, ctxReturn: civSource });
      await expectRoute(region.getByRole('link', { name: '查看全部开局', exact: true }), '/builds', { civ: 'Varangians', ...pair, ctxReturn: civSource });
      await touchTargets(region.locator('.civ-opening-links a'));
      await region.screenshot({ path: info.outputPath(`civ480-generic-${width}-${theme}.png`) });
      await link.focus();
      await link.press('Enter');
      const panel = applicability(page);
      await expect(panel).toContainText(genericNote);
      await expectCivRoutes(panel.getByRole('link'), order('scouts-18').civs, {
        ...pair,
        ctxReturn: route('/builds', { bo: 'scouts-18', civ: 'Varangians', ...pair }),
      });
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await touchTargets(panel.getByRole('link'));
      const panelBox = await panel.boundingBox();
      const calculatorBox = await page.locator('#builds').boundingBox();
      expect(panelBox!.width).toBeCloseTo(calculatorBox!.width, 1);
      const reverse = panel.getByRole('link');
      await reverse.first().focus();
      await reverse.first().press('Tab');
      await expect(reverse.nth(1)).toBeFocused();
      expect(await reverse.nth(1).evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
      expect((await new AxeBuilder({ page }).include('.build-applicability-panel').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`timeline480-generic-${width}-${theme}.png`), fullPage: true });

      await page.goto('./#/builds?bo=archers-19&civ=Poles');
      await expect(applicability(page)).toContainText(genericNote);
      await expect(page.locator('[data-t="civ-warn"]')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`timeline480-poles-${width}-${theme}.png`), fullPage: true });

      await page.goto('./#/builds?bo=drush-fc');
      await expect(applicability(page)).toContainText('通用');
      await expect(applicability(page).locator('a[href^="#/civ/"]')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await applicability(page).screenshot({ path: info.outputPath(`timeline480-empty-${width}-${theme}.png`) });
    });
  }
