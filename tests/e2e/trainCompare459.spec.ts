import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const comparison = '/production?mode=train-compare&v=1&unit=38&age=3&n=10&civs=Franks,Huns';
const rows = (page: Page) => page.getByTestId('train-compare-row');
const row = (page: Page, civ: string) => page.locator(`[data-testid="train-compare-row"][data-civ="${civ}"]`);
const copy = (page: Page) => page.getByRole('button', { name: '复制对照链接', exact: true });
const query = (page: Page) => new URLSearchParams(new URL(page.url()).hash.split('?')[1]);
const pins = JSON.parse(readFileSync(new URL('../../scripts/data_sources.json', import.meta.url), 'utf8')) as { patch: { build: number; date: string } };
const errors = new WeakMap<Page, { page: string[]; console: { text: string; url: string }[]; expectedFailures: Set<string> }>();

test.beforeEach(({ page }) => {
  const messages = { page: [] as string[], console: [] as { text: string; url: string }[], expectedFailures: new Set<string>() };
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.page.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') messages.console.push({ text: message.text(), url: message.location().url });
  });
});
test.afterEach(async ({ page }) => {
  const messages = errors.get(page)!;
  expect(messages.page).toEqual([]);
  expect(
    messages.console.filter((entry) => !(messages.expectedFailures.has(entry.url) && /Failed to load resource: net::ERR_FAILED/.test(entry.text))),
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('#459 regression a comparison URL restores its own unit, target and civilizations instead of the old villager calculator', async ({ page }) => {
  await page.goto(`./#${comparison}`);
  await expect(page.getByRole('heading', { level: 1, name: '跨文明训练对照', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: '对照单位', exact: true })).toHaveValue('38');
  await expect(page.getByRole('textbox', { name: '目标数量', exact: true })).toHaveValue('10');
  await expect(page.locator('[data-testid="train-compare-row"][data-civ="Franks"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="train-compare-row"][data-civ="Huns"]')).toHaveCount(1);
  await expect(page.getByTestId('production-total')).toHaveCount(0);
});

test('#459 regression unknown mode is an explicit link error and never opens legacy defaults', async ({ page }) => {
  await page.goto('./#/production?mode=unknown&v=1&unit=38&age=3&n=10&civs=Franks');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('production-total')).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe('#/production?mode=unknown&v=1&unit=38&age=3&n=10&civs=Franks');
});

test('#459 regression comparison-only parameters without mode cannot fall back to legacy defaults', async ({ page }) => {
  await page.goto('./#/production?unit=38&age=3&n=10&civs=Franks');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('production-total')).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe('#/production?unit=38&age=3&n=10&civs=Franks');
});

test('#459 regression an explicit empty civilization set stays empty instead of restoring legacy defaults', async ({ page }) => {
  await page.goto('./#/production?mode=train-compare&v=1&unit=38&age=3&n=10&civs=');
  await expect(page.getByRole('heading', { level: 1, name: '跨文明训练对照', exact: true })).toBeVisible();
  await expect(page.locator('main')).toContainText('选择文明后对照');
  await expect(page.getByTestId('train-compare-row')).toHaveCount(0);
  await expect(page.getByTestId('production-total')).toHaveCount(0);
  expect(new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('civs')).toBe('');
});

async function openCivilizations(page: Page) {
  const details = page
    .locator('main details')
    .filter({ has: page.locator('input[type="checkbox"]') })
    .first();
  if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
  return details;
}

test('#459 choosing a new form materializes the displayed default selection rather than replacing it', async ({ page }) => {
  await page.goto('./#/production?mode=train-compare&v=1&unit=38&age=3&n=10');
  await expect(rows(page).first()).toBeVisible();
  const before = await rows(page).evaluateAll((elements) => elements.map((element) => element.getAttribute('data-civ')!));
  expect(before.length).toBeGreaterThan(1);
  expect(query(page).has('civs')).toBe(false);
  await page.getByRole('combobox', { name: '对照单位', exact: true }).selectOption('283');
  expect(new Set(query(page).get('civs')!.split(','))).toEqual(new Set(before));
  await expect(row(page, 'Burgundians')).toBeVisible();
  await expect(page.locator('[data-testid="train-compare-unavailable"][data-civ="Franks"]')).toBeVisible();
  await expect(page.getByRole('combobox', { name: '对照单位', exact: true })).toHaveValue('283');
  await page.reload();
  expect(new Set(query(page).get('civs')!.split(','))).toEqual(new Set(before));
  await expect(page.locator('[data-testid="train-compare-unavailable"][data-civ="Franks"]')).toBeVisible();
});

test('#459 an empty selection remains empty across form, N and reload changes, with an explicit available-set action', async ({ page }) => {
  await page.goto(`./#${comparison}`);
  await openCivilizations(page);
  await page.getByRole('button', { name: '清空文明', exact: true }).click();
  await expect(rows(page)).toHaveCount(0);
  expect(query(page).get('civs')).toBe('');
  await page.getByRole('combobox', { name: '对照单位', exact: true }).selectOption('283');
  await page.getByRole('textbox', { name: '目标数量', exact: true }).fill('20');
  await page.getByRole('textbox', { name: '目标数量', exact: true }).press('Enter');
  expect(query(page).get('n')).toBe('20');
  expect(query(page).get('civs')).toBe('');
  await expect(page.locator('main')).toContainText('选择文明后对照');
  await page.reload();
  await expect(rows(page)).toHaveCount(0);
  expect(query(page).get('civs')).toBe('');
  await openCivilizations(page);
  await page.getByRole('button', { name: '选择当前可用文明', exact: true }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, 'Burgundians')).toBeVisible();
  expect(query(page).get('civs')).toBe('Burgundians');
});

test('#459 committed changes support history, copied direct pages and reload without sticky-state substitution', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`./#${comparison}`);
  await expect(rows(page)).toHaveCount(2);
  await page.getByRole('textbox', { name: '目标数量', exact: true }).fill('20');
  await page.getByRole('textbox', { name: '目标数量', exact: true }).press('Enter');
  expect(query(page).get('n')).toBe('20');
  await page.getByRole('combobox', { name: '对照单位', exact: true }).selectOption('283');
  expect(query(page).get('unit')).toBe('283');
  await page.goBack();
  await expect(page.getByRole('combobox', { name: '对照单位', exact: true })).toHaveValue('38');
  await expect(page.getByRole('textbox', { name: '目标数量', exact: true })).toHaveValue('20');
  await page.goBack();
  await expect(page.getByRole('textbox', { name: '目标数量', exact: true })).toHaveValue('10');
  await page.goForward();
  await expect(page.getByRole('textbox', { name: '目标数量', exact: true })).toHaveValue('20');
  await copy(page).click();
  await expect(page.getByRole('status')).toContainText('已复制');
  const href = await page.evaluate(() => navigator.clipboard.readText());
  const direct = await context.newPage();
  await direct.goto(href);
  await expect(direct.getByRole('combobox', { name: '对照单位', exact: true })).toHaveValue('38');
  await expect(direct.getByRole('textbox', { name: '目标数量', exact: true })).toHaveValue('20');
  await expect(rows(direct)).toHaveCount(2);
  await direct.reload();
  await expect(row(direct, 'Huns')).toContainText(/500\s*秒/);
  await direct.close();
  await expect(rows(page)).toHaveCount(2);
});

test('#459 clipboard failure supplies the entire current link and stale manual feedback does not survive a change', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('test clipboard denial')) } });
  });
  await page.goto(`./#${comparison}`);
  await copy(page).click();
  const manual = page.getByRole('textbox', { name: '手动复制对照链接', exact: true });
  await expect(manual).toBeVisible();
  const href = await manual.inputValue();
  const restored = new URLSearchParams(new URL(href).hash.split('?')[1]);
  expect(restored.get('unit')).toBe('38');
  expect(restored.get('n')).toBe('10');
  expect(new Set(restored.get('civs')!.split(','))).toEqual(new Set(['Franks', 'Huns']));
  await page.getByRole('textbox', { name: '目标数量', exact: true }).fill('bad');
  await expect(manual).toHaveCount(0);
  await expect(rows(page)).toHaveCount(0);
  await expect(copy(page)).toBeDisabled();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('combobox', { name: '对照单位', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: '目标数量', exact: true }).fill('11');
  await expect(rows(page)).toHaveCount(0);
  await expect(copy(page)).toBeDisabled();
  await page.getByRole('textbox', { name: '目标数量', exact: true }).press('Enter');
  await expect(manual).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(rows(page)).toHaveCount(2);
  await page.goBack();
  await expect(page.getByRole('textbox', { name: '目标数量', exact: true })).toHaveValue('10');
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.goForward();
  await expect(page.getByRole('textbox', { name: '目标数量', exact: true })).toHaveValue('11');
  await expect(row(page, 'Huns')).toContainText(/275\s*秒/);
});

test('#459 invalid raw links and quantity drafts stop results and copying until explicitly repaired', async ({ page }) => {
  const invalid = '/production?mode=train-compare&v=1&unit=1813&age=3&n=10&civs=Franks';
  await page.goto(`./#${invalid}`);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  expect((await copy(page).count()) === 0 || (await copy(page).isDisabled())).toBe(true);
  expect(new URL(page.url()).hash).toBe('#' + invalid);
  const raw = page.getByRole('textbox', { name: '原始对照参数', exact: true });
  await expect(raw).toHaveValue(/unit=1813/);
  await raw.fill(comparison.split('?')[1]!);
  await page.getByRole('button', { name: '应用参数', exact: true }).click();
  await expect(rows(page)).toHaveCount(2);
  await page.getByRole('textbox', { name: '目标数量', exact: true }).fill('0');
  await page.getByRole('textbox', { name: '目标数量', exact: true }).press('Enter');
  expect(query(page).get('n')).toBe('0');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: '原始对照参数', exact: true })).toHaveValue(/n=0/);
  await page.getByRole('button', { name: '重置对照', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: '对照单位', exact: true })).toHaveValue('38');
  await expect(page.getByRole('textbox', { name: '目标数量', exact: true })).toHaveValue('10');
});

test('#459 all original row warnings and production attribution stay visible with Castle exclusions', async ({ page }) => {
  await page.goto('./#/production?mode=train-compare&v=1&unit=38&age=3&n=10&civs=Poles,Huns');
  await expect(page.locator('main')).toContainText('征招');
  await expect(page.locator('main')).toContainText('骑士精神');
  await expect(page.locator('main')).toContainText('帝王');
  await expect(page.locator('main')).toContainText('不计入');
  await expect(page.locator('main')).toContainText(`DE Update ${pins.patch.build}`);
  await expect(page.locator('main')).toContainText(pins.patch.date);
  await row(page, 'Poles').locator('summary').click();
  await expect(row(page, 'Poles')).toContainText('贵族特权');
  await expect(row(page, 'Poles')).toContainText('未计入');
  await row(page, 'Huns').locator('summary').click();
  await expect(row(page, 'Huns')).toContainText('本文明团队训练加成');
  await expect(rows(page)).toHaveCount(2);
});

async function touchTargets(elements: Locator) {
  expect(
    await elements.evaluateAll((nodes) =>
      nodes
        .filter((node) => node.closest('.production-mode-nav, .train-compare-page'))
        .map((node) => ({ text: node.textContent, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }))
        .filter((box) => box.width < 43.5 || box.height < 43.5),
    ),
  ).toEqual([]);
}
async function nowrap(page: Page) {
  const elements = page.locator('main .num, main .nw');
  expect(await elements.count()).toBeGreaterThan(0);
  expect(
    await elements.evaluateAll((nodes) =>
      nodes.flatMap((node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        const tops = [...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top));
        return new Set(tops).size > 1 ? [node.textContent] : [];
      }),
    ),
  ).toEqual([]);
}

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark']) {
    test(`#459 long unknown parameter ${width} ${theme}: bounded diagnostic preserves the complete raw query`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      for (const key of ['x'.repeat(200), '9'.repeat(200)]) {
        const raw = comparison + '&' + key + '=1';
        await page.goto('./#' + raw);
        await expect(page.getByRole('alert')).toContainText('未知参数');
        await expect(rows(page)).toHaveCount(0);
        await expect(copy(page)).toBeDisabled();
        expect(new URL(page.url()).hash).toBe('#' + raw);
        await expect(page.getByRole('textbox', { name: '原始对照参数', exact: true })).toHaveValue(raw.slice(raw.indexOf('?')));
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      await page.screenshot({ path: info.outputPath(`train459-long-unknown-${width}-${theme}.png`), fullPage: true });
    });

    test(`#459 comparison ${width} ${theme}: complete table, empty, unavailable and bad-link states`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/production?mode=train-compare&v=1&unit=38&age=3&n=10&civs=Franks,Huns,Berbers,Portuguese,Poles');
      await expect(rows(page)).toHaveCount(5);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByRole('columnheader')).toHaveCount(4);
      await expect(row(page, 'Huns').getByRole('row').first().getByRole('cell').nth(0)).toContainText(/25\s*秒/);
      await expect(row(page, 'Huns').getByRole('row').first().getByRole('cell').nth(2)).toContainText(/250\s*秒/);
      await touchTargets(page.locator('main').locator('a:visible, button:visible, select:visible, input[type="text"]:visible, summary:visible'));
      await nowrap(page);
      await page.getByRole('textbox', { name: '目标数量', exact: true }).focus();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: '应用数量', exact: true })).toBeFocused();
      expect(await page.getByRole('button', { name: '应用数量', exact: true }).evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe('none');
      expect((await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      await page.screenshot({ path: info.outputPath(`train459-valid-${width}-${theme}.png`), fullPage: true });
      await row(page, 'Poles').locator('summary').click();
      await expect(row(page, 'Poles')).toContainText('贵族特权');
      await expect(row(page, 'Poles')).toContainText('未计入');
      await nowrap(page);
      await row(page, 'Poles').screenshot({ path: info.outputPath(`train459-source-${width}-${theme}.png`) });
      await page.goto('./#/production?mode=train-compare&v=1&unit=38&age=3&n=10&civs=');
      await expect(page.locator('main')).toContainText('选择文明后对照');
      await expect(rows(page)).toHaveCount(0);
      await page.screenshot({ path: info.outputPath(`train459-empty-${width}-${theme}.png`), fullPage: true });
      await page.goto('./#/production?mode=train-compare&v=1&unit=569&age=3&n=10&civs=Franks,Burgundians');
      await expect(rows(page)).toHaveCount(0);
      await expect(page.getByTestId('train-compare-unavailable')).toHaveCount(2);
      await expect(page.locator('main')).toContainText('不可用');
      await expect(page.locator('main')).not.toContainText(/NaN|Infinity/);
      await page.screenshot({ path: info.outputPath(`train459-unavailable-${width}-${theme}.png`), fullPage: true });
      await page.goto('./#/production?mode=train-compare&v=1&unit=38&age=3&n=0&civs=Franks');
      await expect(page.getByRole('alert')).toBeVisible();
      await expect(rows(page)).toHaveCount(0);
      await page.screenshot({ path: info.outputPath(`train459-invalid-${width}-${theme}.png`), fullPage: true });
    });

    test(`#459 pending data ${width} ${theme}: no unverified comparison or copy`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let intercepted = false;
      await page.route('**/assets/trees-*.js', async (route) => {
        intercepted = true;
        await gate;
        await route.continue();
      });
      await page.goto(`./#${comparison}`);
      await expect(page.getByRole('link', { name: '持续生产', exact: true })).toBeVisible();
      expect(intercepted).toBe(true);
      await expect(rows(page)).toHaveCount(0);
      expect((await copy(page).count()) === 0 || (await copy(page).isDisabled())).toBe(true);
      await page.screenshot({ path: info.outputPath(`train459-pending-${width}-${theme}.png`), fullPage: true });
      release();
      await expect(rows(page)).toHaveCount(2);
    });

    test(`#459 genuine data failure ${width} ${theme}: switching to legacy stays caught`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const failed: string[] = [];
      page.on('requestfailed', (request) => {
        if (/\/assets\/trees-[^/]+\.js$/.test(request.url())) failed.push(request.url());
      });
      await page.route('**/assets/trees-*.js', async (route) => {
        errors.get(page)!.expectedFailures.add(route.request().url());
        await route.abort('failed');
      });
      await page.goto(`./#${comparison}`);
      await expect(page.getByRole('alert')).toContainText('生产资料加载失败，请刷新页面重试。');
      expect(failed).toHaveLength(1);
      await expect(rows(page)).toHaveCount(0);
      expect((await copy(page).count()) === 0 || (await copy(page).isDisabled())).toBe(true);
      await page.getByRole('link', { name: '持续生产', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('生产资料加载失败，请刷新页面重试。');
      await expect(page.getByTestId('production-total')).toHaveCount(0);
      await expect(page.getByRole('button', { name: '刷新重试', exact: true })).toBeVisible();
      await page.screenshot({ path: info.outputPath(`train459-failure-legacy-${width}-${theme}.png`), fullPage: true });
    });
  }
