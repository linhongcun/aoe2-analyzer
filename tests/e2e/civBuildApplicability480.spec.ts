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
  await expect(region.getByRole('link', { name: order('archers-19').name.zh, exact: true })).toHaveAttribute('href', '#/builds?bo=archers-19&civ=Tatars');
  await expect(region.locator('a[href*="bo=scouts-18"]')).toHaveCount(0);
  await expect(region).toContainText('资料标注适用的开局流程');
});

test('#480 regression Mayans exposes the listed archer opening despite eagle route text', async ({ page }) => {
  await page.goto('./#/civ/Mayans');
  const region = opening(page);
  await expect(region).toBeVisible();
  await expect(region.getByRole('link', { name: order('archers-19').name.zh, exact: true })).toHaveAttribute('href', '#/builds?bo=archers-19&civ=Mayans');
  await expect(region).toContainText('资料标注适用的开局流程');
});

test('#480 regression Varangians fallback is explicitly generic and preserves the requested civilization', async ({ page }) => {
  await page.goto('./#/civ/Varangians');
  const region = opening(page);
  const link = region.getByRole('link', { name: order('scouts-18').name.zh, exact: true });
  await expect(link).toBeVisible();
  await expect.soft(link).toHaveAttribute('href', '#/builds?bo=scouts-18&civ=Varangians');
  await expect.soft(region).toContainText('通用流程示意');
  await expect.soft(link.locator('..')).toContainText('通用示意');
});

test('#480 source links round-trip through the timeline and its listed civilizations', async ({ page }) => {
  await page.goto('./#/civ/Tatars');
  await opening(page)
    .getByRole('link', { name: order('archers-19').name.zh, exact: true })
    .click();
  await expect(applicability(page)).toBeVisible();
  await expect(page.locator('#builds')).toContainText('按鞑靼计');
  const civLinks = applicability(page).locator('a[href^="#/civ/"]');
  await expect(civLinks).toHaveCount(order('archers-19').civs.length);
  expect(await civLinks.evaluateAll((links) => links.map((link) => link.getAttribute('href')))).toEqual(order('archers-19').civs.map((civ) => `#/civ/${civ}`));
  await expect(applicability(page)).not.toContainText(genericNote);
  expect(
    await applicability(page).evaluate((region) => {
      const calculator = document.getElementById('builds');
      return !!calculator && !calculator.contains(region) && !!(region.compareDocumentPosition(calculator) & Node.DOCUMENT_POSITION_FOLLOWING);
    }),
  ).toBe(true);
  await page.reload();
  expect(new URLSearchParams(page.url().split('?')[1]).get('civ')).toBe('Tatars');
  await expect(page.locator('#builds')).toContainText('按鞑靼计');
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
  expect(await links.evaluateAll((elements) => elements.map((element) => element.getAttribute('href')))).toEqual(
    order('archers-19').civs.map((civ) => `#/civ/${civ}`),
  );
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
  await expect(region.getByRole('link', { name: '查看全部开局', exact: true })).toHaveAttribute('href', '#/builds');
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
      await page.goto('./#/civ/Varangians');
      const region = opening(page);
      await expect(region).toContainText('通用流程示意');
      await expect(region.locator('ol > li')).toHaveCount(2);
      const link = region.getByRole('link', { name: order('scouts-18').name.zh, exact: true });
      await touchTargets(region.locator('.civ-opening-links a'));
      await region.screenshot({ path: info.outputPath(`civ480-generic-${width}-${theme}.png`) });
      await link.focus();
      await link.press('Enter');
      const panel = applicability(page);
      await expect(panel).toContainText(genericNote);
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
