import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const rush = (page: Page) => page.getByRole('region', { name: '应对早期进攻', exact: true });
const duel = (page: Page) => rush(page).getByRole('link', { name: /打开 PK 演练/ });
const build = (page: Page) => rush(page).getByRole('link', { name: /参考开局/ });
const query = (href: string) => new URLSearchParams(href.split('?')[1]);
const errors = new WeakMap<Page, { page: string[]; console: { text: string; url: string }[]; expectedFailedUrls: Set<string> }>();

test.beforeEach(({ page }) => {
  const messages = { page: [] as string[], console: [] as { text: string; url: string }[], expectedFailedUrls: new Set<string>() };
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
    messages.console.filter((entry) => !(messages.expectedFailedUrls.has(entry.url) && /Failed to load resource: net::ERR_FAILED/.test(entry.text))),
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

async function pick(page: Page, id: 'ma' | 'me', civ: string) {
  await page.locator(`#${id}`).click();
  await page.locator(`.cp-panel [data-civ="${civ}"]`).click();
  await expect(page.locator(`#${id}`)).toHaveAttribute('data-value', civ);
}

async function matchup(page: Page, own = 'Franks', enemy = 'Britons', pressure = 'militia') {
  await page.goto(`./#/matchup?rush=${pressure}`);
  await expect(page.locator('#mres')).toBeVisible();
  await pick(page, 'ma', own);
  await pick(page, 'me', enemy);
  await expect(rush(page).getByRole('combobox')).toHaveCount(1);
  await expect(rush(page).getByRole('combobox')).toHaveValue(pressure);
}

test('#469 regression Franks versus Britons keeps the selected civilizations in both destination links', async ({ page }) => {
  await matchup(page);
  const params = query((await duel(page).getAttribute('href'))!);
  expect.soft(params.get('a')).toBe('4.Franks.2..');
  expect.soft(params.get('b')).toBe('74.Britons.2..');
  expect.soft(params.get('na')).toBe('2');
  expect.soft(params.get('nb')).toBe('3');
  const buildParams = query((await build(page).getAttribute('href'))!);
  expect.soft(buildParams.get('bo')).toBe('archers-19');
  expect.soft(buildParams.get('civ')).toBe('Franks');
});

test('#469 regression an Incas militia pressure cannot create a substituted current-matchup drill', async ({ page }) => {
  await matchup(page, 'Franks', 'Incas');
  await expect(duel(page)).toHaveCount(0);
  await expect(rush(page).getByRole('combobox')).toHaveValue('militia');
  await expect(rush(page)).toContainText('印加');
  await expect(rush(page)).toContainText(/不可用|无法|不适用/);
});

test('#469 regression Mayans scout defense keeps a legal spear drill but omits the unavailable scout build', async ({ page }) => {
  await matchup(page, 'Mayans', 'Britons', 'scouts');
  await expect(duel(page)).toHaveCount(1);
  await expect(build(page)).toHaveCount(0);
  await expect(rush(page)).toContainText(/开局|流程/);
  await expect(rush(page)).toContainText(/不可用|无法|不适用/);
});

test('#469 regression Mayans supplemental advice does not recommend unavailable cavalry', async ({ page }) => {
  await matchup(page, 'Mayans', 'Britons', 'archers');
  const supplemental = page.locator('#mres > p.note').filter({ hasText: /^弓手：/ });
  await expect(supplemental).toHaveCount(1);
  await expect(supplemental).not.toContainText(/骑兵|轻骑|骑射/);
});

test('#469 switching either civilization updates links and never replaces an unavailable enemy scout', async ({ page }) => {
  await matchup(page);
  await pick(page, 'ma', 'Britons');
  await pick(page, 'me', 'Franks');
  let params = query((await duel(page).getAttribute('href'))!);
  expect(params.get('a')).toBe('4.Britons.2..');
  expect(params.get('b')).toBe('74.Franks.2..');
  expect(query((await build(page).getAttribute('href'))!).get('civ')).toBe('Britons');
  await rush(page).getByRole('combobox').selectOption('scouts');
  await pick(page, 'me', 'Mayans');
  await expect(duel(page)).toHaveCount(0);
  await expect(rush(page).getByRole('combobox')).toHaveValue('scouts');
  await expect(rush(page)).toContainText('玛雅');
  await expect(rush(page)).toContainText(/不可用|无法|不适用/);
  await pick(page, 'me', 'Franks');
  params = query((await duel(page).getAttribute('href'))!);
  expect(params.get('a')).toBe('93.Britons.2..');
  expect(params.get('b')).toBe('448.Franks.2..');
});

async function assertRestoredDuel(page: Page) {
  await expect(page.locator('#duel-a-civ')).toHaveAttribute('data-value', 'Franks');
  await expect(page.locator('#duel-b-civ')).toHaveAttribute('data-value', 'Britons');
  await expect(page.locator('#duel-a .duel-age')).toHaveText('封建时代');
  await expect(page.locator('#duel-b .duel-age')).toHaveText('封建时代');
  await expect(page.locator('#duel-a .duel-tech summary')).toContainText('已选 0 项');
  await expect(page.locator('#duel-b .duel-tech summary')).toContainText('已选 0 项');
  await expect(page.locator('#duel-res .duel-tab')).toContainText('A 2');
  await expect(page.locator('#duel-res .duel-tab')).toContainText('B 3');
  const params = query(page.url());
  expect(params.get('a')).toBe('4.Franks.2..');
  expect(params.get('b')).toBe('74.Britons.2..');
  expect(params.get('m')).toBe('n');
}

test('#469 destination URL restores the current drill after prior PK state, reload and a fresh tab', async ({ page, context }) => {
  await page.goto('./#/duel?a=38.Magyars.4.f.&b=38.Franks.4.f.&m=n&na=9&nb=9');
  await expect(page.locator('#duel-a-civ')).toHaveAttribute('data-value', 'Magyars');
  await page.evaluate(() => {
    location.hash = '/matchup?rush=militia';
  });
  await pick(page, 'ma', 'Franks');
  await pick(page, 'me', 'Britons');
  const href = (await duel(page).getAttribute('href'))!;
  await duel(page).focus();
  await duel(page).press('Enter');
  await assertRestoredDuel(page);
  await page.reload();
  await assertRestoredDuel(page);
  const direct = await context.newPage();
  await direct.goto(new URL(href, page.url()).href);
  await assertRestoredDuel(direct);
  await direct.close();
});

test('#469 tower drill carries only the legal Loom technology for the actual two civilizations', async ({ page }) => {
  await matchup(page, 'Mayans', 'Incas', 'towers');
  const params = query((await duel(page).getAttribute('href'))!);
  expect(params.get('a')).toBe('83.Mayans.2.22.');
  expect(params.get('b')).toBe('83.Incas.2.22.');
  expect(params.get('na')).toBe('6');
  expect(params.get('nb')).toBe('5');
  await expect(rush(page)).toContainText('仅研究织布机');
  await duel(page).click();
  await expect(page.locator('#duel-a-civ')).toHaveAttribute('data-value', 'Mayans');
  await expect(page.locator('#duel-b-civ')).toHaveAttribute('data-value', 'Incas');
  await expect(page.locator('#duel-a .duel-tech summary')).toContainText('已选 1 项');
  await expect(page.locator('#duel-b .duel-tech summary')).toContainText('已选 1 项');
});

async function touchTargets(elements: Locator) {
  expect(
    await elements.evaluateAll((nodes) =>
      nodes
        .map((node) => ({ text: node.textContent, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }))
        .filter((box) => box.width < 43.5 || box.height < 43.5),
    ),
  ).toEqual([]);
}

async function nowrap(region: Locator) {
  expect(
    await region.locator('.num, .nw, .rush-count').evaluateAll((nodes) =>
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
    test(`#469 current matchup ${width} ${theme}: legal, unavailable and no-build states`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await matchup(page, 'Franks', 'Britons', 'scouts');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(duel(page)).toHaveCount(1);
      await expect(build(page)).toHaveCount(1);
      await touchTargets(rush(page).locator('a:visible, select:visible, summary:visible'));
      await nowrap(rush(page));
      await duel(page).focus();
      await duel(page).press('Tab');
      await expect(build(page)).toBeFocused();
      expect(await build(page).evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe('none');
      expect((await new AxeBuilder({ page }).include('.rush-defense').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      await rush(page).screenshot({ path: info.outputPath(`rush469-legal-${width}-${theme}.png`) });

      await rush(page).getByRole('combobox').selectOption('militia');
      await pick(page, 'me', 'Incas');
      await expect(duel(page)).toHaveCount(0);
      await expect(rush(page)).toContainText('印加');
      await expect(rush(page).getByRole('combobox')).toHaveValue('militia');
      await nowrap(rush(page));
      await rush(page).screenshot({ path: info.outputPath(`rush469-unavailable-${width}-${theme}.png`) });

      await pick(page, 'ma', 'Mayans');
      await pick(page, 'me', 'Britons');
      await rush(page).getByRole('combobox').selectOption('scouts');
      await expect(duel(page)).toHaveCount(1);
      await expect(build(page)).toHaveCount(0);
      await nowrap(rush(page));
      await rush(page).screenshot({ path: info.outputPath(`rush469-no-build-${width}-${theme}.png`) });

      await rush(page).getByRole('combobox').selectOption('archers');
      await expect(page.locator('#mres > p.note').filter({ hasText: /^弓手：/ })).not.toContainText(/骑兵|轻骑|骑射/);
      await page.screenshot({ path: info.outputPath(`matchup469-advice-${width}-${theme}.png`), fullPage: true });
    });
  }

test('#469 pending data keeps selectable pressure but exposes no verified drill or build link', async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 900 });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let intercepted = false;
  let markIntercepted!: () => void;
  const requestIntercepted = new Promise<void>((resolve) => {
    markIntercepted = resolve;
  });
  await page.route('**/assets/trees-*.js', async (route) => {
    intercepted = true;
    markIntercepted();
    await gate;
    await route.continue();
  });
  await page.goto('./#/matchup?rush=scouts');
  await expect(rush(page)).toContainText('正在核对双方文明的单位和科技');
  await requestIntercepted;
  expect(intercepted).toBe(true);
  await expect(duel(page)).toHaveCount(0);
  await expect(build(page)).toHaveCount(0);
  await rush(page).getByRole('combobox').selectOption('towers');
  await expect(rush(page).getByRole('combobox')).toHaveValue('towers');
  await rush(page).screenshot({ path: info.outputPath('rush469-pending-360.png') });
  release();
  await expect(page.locator('#mres')).toBeVisible();
  await expect(duel(page)).toHaveCount(1);
});

test('#469 a genuine data load failure is caught without creating verified fallback links', async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 900 });
  const failures: string[] = [];
  page.on('requestfailed', (request) => {
    if (/\/assets\/trees-[^/]+\.js$/.test(request.url())) failures.push(request.url());
  });
  await page.route('**/assets/trees-*.js', async (route) => {
    errors.get(page)!.expectedFailedUrls.add(route.request().url());
    await route.abort('failed');
  });
  await page.goto('./#/matchup?rush=archers');
  await expect(page.getByRole('alert')).toContainText('对局资料加载失败，暂时无法核对演练和开局。请刷新页面重试。');
  expect(failures).toHaveLength(1);
  await expect(duel(page)).toHaveCount(0);
  await expect(build(page)).toHaveCount(0);
  await expect(page.locator('#mres')).toHaveCount(0);
  await rush(page).getByRole('combobox').selectOption('towers');
  await expect(rush(page).getByRole('combobox')).toHaveValue('towers');
  await expect(duel(page)).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('matchup469-load-failure-360.png'), fullPage: true });
});
