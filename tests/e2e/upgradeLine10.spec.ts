import { test, expect, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expectedUnits657 as units, expectedSide657 } from './champi657Expected';

test('#657 @1280 蔷琵单位详情提供两条同代参考入口', async ({ page }, info) => {
  await page.goto('./#/unit/2588/Muisca');
  await expect(page.locator('#unit h1')).toContainText('蔷琵步兵');
  console.log(
    JSON.stringify({
      source: '657-unit',
      version: await page.locator('[data-t="footer-app-version"]').innerText(),
      build: await page.locator('[data-t="footer-build"]').innerText(),
    }),
  );
  await page.screenshot({ path: info.outputPath('champi-unit-before.png'), fullPage: true });
  await expect(page.getByRole('heading', { name: '蔷琵线参考对照', exact: true })).toBeVisible();
});

test('#10 波斯重装骑士：升级路线末级萨瓦尔带「萨瓦尔 · 波斯」灰色小标签', async ({ page }) => {
  await page.goto('./#/unit/283/Persians');
  const line = page.locator('.uline.vline');
  const tag = line.locator('[data-t="uu-tag"]');
  await expect(tag).toHaveText('萨瓦尔 · 波斯');
  await expect(tag.locator('img.ico')).toHaveCount(1);
  expect(await tag.evaluate((e) => getComputedStyle(e).fontSize)).toBe('12px');
  await expect(line.locator('a.ulink', { hasText: '萨瓦尔' })).toHaveAttribute('href', /unit\/1813$/);
});

test('#10 通用重装骑士：末级游侠，没有独特单位标签', async ({ page }) => {
  await page.goto('./#/unit/283');
  const line = page.locator('.uline.vline');
  await expect(line).toContainText('游侠');
  await expect(line.locator('[data-t="uu-tag"]')).toHaveCount(0);
});

const unitReferences657 = [
  { key: 'feudal', query: 'a=2588.Muisca.2.c.&b=4.Franks.2.c.&m=1' },
  { key: 'castle', query: 'a=2552.Muisca.3.c.&b=77.Franks.3.c.&m=1' },
] as const;
async function unitTransport657(page: Page) {
  const log = {
    page: [] as string[],
    console: [] as { text: string; url: string }[],
    failed: [] as { url: string; error: string | null }[],
    aborted: new Set<string>(),
  };
  page.on('pageerror', (error) => log.page.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') log.console.push({ text: message.text(), url: message.location().url });
  });
  page.on('requestfailed', (request) => log.failed.push({ url: request.url(), error: request.failure()?.errorText ?? null }));
  await page.addInitScript(() => {
    const target = window as typeof window & { champiUnhandled: string[] };
    target.champiUnhandled = [];
    window.addEventListener('unhandledrejection', (event) => target.champiUnhandled.push(String(event.reason)));
  });
  return log;
}
async function checkUnitTransport657(page: Page, log: Awaited<ReturnType<typeof unitTransport657>>, info: TestInfo) {
  await info.attach('champi-unit-transport.json', { body: JSON.stringify({ ...log, aborted: [...log.aborted] }, null, 2), contentType: 'application/json' });
  expect(log.page).toEqual([]);
  expect(log.console.filter((entry) => !(log.aborted.has(entry.url) && entry.text === 'Failed to load resource: net::ERR_FAILED'))).toEqual([]);
  expect(log.failed.filter((entry) => !(log.aborted.has(entry.url) && entry.error === 'net::ERR_FAILED'))).toEqual([]);
  expect(await page.evaluate(() => (window as typeof window & { champiUnhandled?: string[] }).champiUnhandled ?? [])).toEqual([]);
}
async function unitReferencesVisible657(page: Page) {
  const module = page.getByTestId('champi-unit-entry');
  await expect(module.getByRole('heading', { name: '蔷琵线参考对照', exact: true })).toBeVisible();
  await expect(module.locator('.champi-reference-context')).toContainText('参考：穆伊斯卡对法兰克，不代表你当前的对手');
  await expect(module.locator('.champi-reference-card')).toHaveCount(2);
  for (const item of unitReferences657) {
    const card = module.locator(`[data-champi-preset="${item.key}"]`);
    await expect(card.locator('[data-side="a"]')).toContainText('穆伊斯卡');
    await expect(card.locator('[data-side="b"]')).toContainText('法兰克');
    await expect(card.getByRole('link', { name: '打开参考对照', exact: true })).toHaveAttribute('href', `#/duel?${item.query}`);
  }
}
async function basicUnit657(page: Page, id: number) {
  const unit = units.find((entry) => entry.id === id)!;
  await expect(page.locator('#unit h1')).toContainText(unit.zh);
  const cost = page.getByRole('region', { name: '造价与生产', exact: true });
  await expect(cost).toBeVisible();
  for (const amount of Object.values(unit.cost)) await expect(cost).toContainText(String(amount));
  const stats = page.getByRole('region', { name: '基础属性', exact: true });
  await expect(stats).toBeVisible();
  for (const key of ['hp', 'atk', 'ma', 'pa', 'rng', 'spd'] as const)
    await expect(stats.locator(`[data-stat="${key}"] [data-t="stat-value"]`)).toHaveText(String(unit[key]));
}

test.describe('#657 current 单位详情参考与局部资源', () => {
  const logs = new WeakMap<Page, Awaited<ReturnType<typeof unitTransport657>>>();
  test.beforeEach(async ({ page }) => logs.set(page, await unitTransport657(page)));
  test.afterEach(async ({ page }, info) => checkUnitTransport657(page, logs.get(page)!, info));

  for (const id of [2550, 2588, 2552, 2554])
    test(`@1280 真实形态${id}有civ/无civ/不能训练civ均显著保留固定参考身份`, async ({ page }) => {
      const unit = units.find((entry) => entry.id === id)!;
      for (const suffix of ['/Muisca', '', '/Franks']) {
        const hash = `#/unit/${id}${suffix}?tab=ov&me=Britons&opp=Japanese`;
        await page.goto(`./${hash}`);
        await expect(page.locator('#unit h1')).toContainText(unit.zh);
        await unitReferencesVisible657(page);
        expect(new URL(page.url()).hash).toBe(hash);
        await expect(page.getByRole('tab', { name: '概览', exact: true })).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByTestId('champi-unit-entry')).not.toContainText('参考：不列颠');
      }
    });

  test('@1280 非蔷琵单位没有参考模块且原升级路线仍在', async ({ page }) => {
    for (const path of ['/unit/38/Franks?tab=ov', '/unit/93?tab=ov']) {
      await page.goto(`./#${path}`);
      await expect(page.locator('#unit h1')).toBeVisible();
      await expect(page.getByTestId('champi-unit-entry')).toHaveCount(0);
      await expect(page.locator('.uline.vline')).toBeVisible();
    }
  });

  test('@1280 单位详情参考打开城堡真实draw，并保持两方同代身份', async ({ page }) => {
    await page.goto('./#/unit/2550?tab=ov');
    await unitReferencesVisible657(page);
    await page.getByTestId('champi-unit-entry').locator('[data-champi-preset="castle"]').getByRole('link', { name: '打开参考对照', exact: true }).click();
    await expect(page.locator('#duel-res')).toContainText('平局（同时击杀）');
    expect(new URL(page.url()).hash).toBe(`#/duel?${unitReferences657[1].query}`);
    await expect(page.locator('#duel-a-civ')).toHaveAttribute('data-value', 'Muisca');
    await expect(page.locator('#duel-b-civ')).toHaveAttribute('data-value', 'Franks');
    await expect(page.locator('#duel-a .duel-age, #duel-b .duel-age')).toHaveText(['城堡时代', '城堡时代']);
  });

  for (const width of [360, 375, 390, 1280])
    test(`@${width} 单位参考四宽44px/12px/不换行/无溢出/正式axe`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((theme) => localStorage.setItem('aoe2-theme', theme), width === 390 ? 'dark' : 'light');
      await page.goto('./#/unit/2588/Muisca?tab=ov');
      await basicUnit657(page, 2588);
      await unitReferencesVisible657(page);
      const module = page.getByTestId('champi-unit-entry');
      for (const action of await module.locator('a, button').all()) {
        const box = (await action.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
      expect(
        await module
          .locator('*')
          .evaluateAll((elements) =>
            elements
              .filter((element) => element.getClientRects().length && Number.parseFloat(getComputedStyle(element).fontSize) < 12)
              .map((element) => element.outerHTML),
          ),
      ).toEqual([]);
      expect(
        await module
          .locator('.num, .nw')
          .evaluateAll((elements) =>
            elements
              .filter((element) => getComputedStyle(element).whiteSpace !== 'nowrap' || element.getClientRects().length > 1)
              .map((element) => element.textContent),
          ),
      ).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).include('.champi-unit-entry').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      await page.screenshot({ path: info.outputPath(`champi-unit-${width}.png`), fullPage: true });
    });
});

for (const width of [360, 375, 390, 1280])
  for (const chunk of ['units', 'trees'] as const)
    test(`#657 @${width} native ${chunk}冷失败保留基本详情/局部tab，按钮重试不重置query`, async ({ browser, baseURL }, info) => {
      const context = await browser.newContext({ baseURL, serviceWorkers: 'block', viewport: { width, height: 900 } });
      const page = await context.newPage();
      const log = await unitTransport657(page);
      const pattern = new RegExp(`/assets/${chunk}-[^/]+\\.js(?:\\?.*)?$`);
      const selected = expectedSide657(2552, 'Muisca', 3).selected.slice(0, 2);
      try {
        await page.addInitScript((theme) => localStorage.setItem('aoe2-theme', theme), width === 390 ? 'dark' : 'light');
        await page.route(pattern, async (route) => {
          log.aborted.add(route.request().url());
          await route.abort('failed');
        });
        await page.goto(`./#/unit/2552/Muisca/3/${selected.join(',')}/?tab=ov&me=Muisca&opp=Franks&probe=657`);
        const alert = page.getByRole('alert');
        await expect(alert).toContainText(chunk === 'trees' ? '科技树资料加载失败，基础资料仍可查看。' : '单位资料加载失败，当前地址保留。');
        await expect.poll(() => log.failed.length).toBe(1);
        expect(log.aborted.size).toBe(1);
        const retry = page.getByRole('button', { name: chunk === 'trees' ? '重试科技树' : '重试资料', exact: true });
        const box = (await retry.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect((await new AxeBuilder({ page }).include('[role="alert"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
        await expect(page.getByTestId('champi-unit-entry')).toHaveCount(0);
        if (chunk === 'trees') {
          await basicUnit657(page, 2552);
          await page.locator('#unit h1').evaluate((element) => element.setAttribute('data-retry-identity', '657'));
          const upgrade = page.locator('.sideblk').filter({ has: page.getByRole('heading', { name: '升级路线', exact: true }) });
          await expect(upgrade.getByRole('link')).toHaveCount(0);
          await expect(upgrade).toContainText('科技树资料暂不可用');
          const related = page.locator('.sideblk').filter({ has: page.getByRole('heading', { name: '相关科技', exact: true }) });
          await expect(related.locator('[data-t="unit-related-techs"]')).toHaveCount(0);
          await page.getByRole('tab', { name: '科技模拟器', exact: true }).click();
          await expect(page.locator('#sim')).toHaveCount(0);
          await expect(page.getByRole('tabpanel')).toContainText('科技树资料暂不可用');
          await page.getByRole('tab', { name: '相关', exact: true }).click();
          await expect(page.getByRole('tabpanel')).toContainText('科技树资料暂不可用');
          await page.getByRole('tab', { name: '科技模拟器', exact: true }).click();
        } else await expect(page.locator('#unit, #sim')).toHaveCount(0);
        const failedUrl = page.url();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: info.outputPath(`champi-unit-${chunk}-${width}-failure.png`), fullPage: true });
        await page.unroute(pattern);
        const recovered = page.waitForResponse((response) => pattern.test(response.url()) && response.ok());
        await retry.click();
        await recovered;
        await unitReferencesVisible657(page);
        await expect(page.getByRole('alert')).toHaveCount(0);
        expect(page.url()).toBe(failedUrl);
        if (chunk === 'trees') {
          await expect(page.locator('#unit h1')).toHaveAttribute('data-retry-identity', '657');
          await expect(page.getByRole('tab', { name: '科技模拟器', exact: true })).toHaveAttribute('aria-selected', 'true');
          await expect(page.locator('#sim')).toBeVisible();
          await expect(page.locator('#simciv')).toHaveAttribute('data-value', 'Muisca');
          await expect(page.locator('#simage')).toHaveValue('3');
          const actual = await page
            .locator('#sim .simt:has(a[href^="#/tech/"]) input:checked')
            .evaluateAll((inputs) =>
              inputs.map((input) => Number(input.closest('label')!.querySelector('a')!.getAttribute('href')!.split('/').at(-1))).sort((a, b) => a - b),
            );
          expect(actual).toEqual(selected);
          await expect(page.locator('.uline.vline')).toBeVisible();
          await expect(page.locator('.sideblk [data-t="unit-related-techs"]')).toBeVisible();
        } else {
          await expect(page.getByRole('tab', { name: '概览', exact: true })).toHaveAttribute('aria-selected', 'true');
          await basicUnit657(page, 2552);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: info.outputPath(`champi-unit-${chunk}-${width}-recovered.png`), fullPage: true });
      } finally {
        await checkUnitTransport657(page, log, info);
        await context.close();
      }
    });

for (const reject of [false, true])
  for (const leave of [false, true])
    test(`#657 @1280 native树pending改单位/离开后完成不复活旧详情 ${leave ? 'unmount' : 'unit'} ${reject ? 'reject' : 'resolve'}`, async ({
      browser,
      baseURL,
    }, info) => {
      const context = await browser.newContext({ baseURL, serviceWorkers: 'block' });
      const page = await context.newPage();
      const log = await unitTransport657(page);
      let release!: () => void, intercepted!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const seen = new Promise<void>((resolve) => {
        intercepted = resolve;
      });
      try {
        await page.route(/\/assets\/trees-[^/]+\.js$/, async (route) => {
          intercepted();
          await gate;
          if (reject) {
            log.aborted.add(route.request().url());
            await route.abort('failed');
          } else await route.continue();
        });
        await page.goto('./#/unit/2588/Muisca?tab=ov');
        await seen;
        await basicUnit657(page, 2588);
        await expect(page.getByTestId('champi-unit-entry')).toHaveCount(0);
        await page.evaluate(
          (hash) => {
            location.hash = hash;
          },
          leave ? '/' : '/unit/2554/Muisca/4/67/?tab=sim&probe=657',
        );
        if (leave) await expect(page.locator('#unit')).toHaveCount(0);
        else await expect(page.locator('#unit h1')).toContainText('精锐蔷琵战士');
        const completed = reject
          ? page.waitForEvent('requestfailed', (request) => /\/assets\/trees-[^/]+\.js$/.test(request.url()))
          : page.waitForResponse((response) => /\/assets\/trees-[^/]+\.js$/.test(response.url()) && response.ok());
        release();
        const transport = await completed;
        if ('finished' in transport) await transport.finished();
        await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        if (leave) await expect(page.locator('#unit, .champi-unit-entry')).toHaveCount(0);
        else if (reject) {
          await expect(page.getByRole('alert')).toContainText('科技树资料加载失败，基础资料仍可查看。');
          await expect(page.locator('#unit h1')).toContainText('精锐蔷琵战士');
          await expect(page.getByRole('tab', { name: '科技模拟器', exact: true })).toHaveAttribute('aria-selected', 'true');
          await expect(page.locator('#sim, .champi-unit-entry')).toHaveCount(0);
          expect(new URL(page.url()).hash).toContain('probe=657');
        } else {
          await unitReferencesVisible657(page);
          await expect(page.locator('#unit h1')).toContainText('精锐蔷琵战士');
          await expect(page.getByRole('tab', { name: '科技模拟器', exact: true })).toHaveAttribute('aria-selected', 'true');
          await expect(page.locator('#simciv')).toHaveAttribute('data-value', 'Muisca');
          await expect(page.locator('#simage')).toHaveValue('4');
          expect(new URL(page.url()).hash).toContain('/unit/2554/Muisca/4/67/');
          expect(new URL(page.url()).hash).toContain('probe=657');
        }
      } finally {
        release();
        await checkUnitTransport657(page, log, info);
        await context.close();
      }
    });
