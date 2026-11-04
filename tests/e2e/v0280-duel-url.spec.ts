import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expectedSide657, expectedDuel657, expectedShareUrl657 } from './champi657Expected';
import golden from './fixtures/v0280-golden.json' with { type: 'json' };
import duelUrl from './fixtures/v0280-duel-url.json' with { type: 'json' };
import { PK, capturePage, type Captured } from './v0280-golden-cases';
import { DUEL_URL } from './v0280-duel-url-cases';

/**
 * v0.28.0 验收 #281 ④：Duel URL 数值参数的界面级对照。Kent 写。
 * 1. 17 组 URL 边界（v0280-duel-url-cases.ts）：规范化后的地址与页面文字须与 main @ 4a3f89f 录下的字面量一致；
 *    再打开规范化后的地址，地址不再变化、页面文字相同（规范化是幂等的）。
 * 2. 金标准 28 组 PK：打开金标准里的规范化地址，地址与页面文字不变（往返一致）。
 */
const URL_GOLDEN = duelUrl.pages as Record<string, Captured>;
const PK_GOLDEN = golden.pages as Record<string, Captured>;

test('#657 @1280 原生单位PK提供显著参考身份的蔷琵入口', async ({ page }, info) => {
  await page.goto('./#/duel?a=2552.Muisca.3.c.&b=77.Franks.3.c.&m=1');
  await expect(page.locator('#duel-res')).toBeVisible();
  await expect(page.locator('#duel-res')).toContainText('平局（同时击杀）');
  console.log(
    JSON.stringify({
      source: '657-duel',
      version: await page.locator('[data-t="footer-app-version"]').innerText(),
      build: await page.locator('[data-t="footer-build"]').innerText(),
    }),
  );
  await page.screenshot({ path: info.outputPath('champi-duel-before.png'), fullPage: true });
  await expect(page.getByRole('heading', { name: '蔷琵线参考对照', exact: true })).toBeVisible();
});

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', (e) => list.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') list.push(m.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

test('用例清单与录制结果一一对应', () => {
  expect(Object.keys(URL_GOLDEN).sort()).toEqual(DUEL_URL.map((c) => c.id).sort());
  expect(DUEL_URL).toHaveLength(17);
});

test.describe('URL 边界：与 main 一致且规范化幂等', () => {
  for (const c of DUEL_URL)
    test(c.id, async ({ page }) => {
      const want = URL_GOLDEN[c.id]!;
      const got = await capturePage(page, c);
      expect(got.hash, `${c.id} 规范化后的地址`).toBe(want.hash);
      expect(got.lines, `${c.id} 页面文字与数值`).toEqual(want.lines);
      expect(await capturePage(page, { ...c, url: './' + want.hash }), `${c.id} 再次打开规范化地址`).toEqual(want);
    });
});

test.describe('金标准 PK：规范化地址往返一致', () => {
  for (const c of PK)
    test(c.id, async ({ page }) => {
      const want = PK_GOLDEN[c.id]!;
      expect(await capturePage(page, { ...c, url: './' + want.hash }), `${c.id} 打开规范化地址`).toEqual(want);
    });
});

const references657 = [
  { key: 'feudal', age: 2, a: 2588, b: 4, query: 'a=2588.Muisca.2.c.&b=4.Franks.2.c.&m=1', ageZh: '封建时代' },
  { key: 'castle', age: 3, a: 2552, b: 77, query: 'a=2552.Muisca.3.c.&b=77.Franks.3.c.&m=1', ageZh: '城堡时代' },
] as const;
const reference657 = (page: Page, key: string) => page.getByTestId('champi-presets').locator(`[data-champi-preset="${key}"]`);
async function configured657(page: Page, item: (typeof references657)[number]) {
  await expect(page.locator('#duel-res')).toBeVisible();
  expect(new URL(page.url()).hash).toBe(`#/duel?${item.query}`);
  const a = expectedSide657(item.a, 'Muisca', item.age),
    b = expectedSide657(item.b, 'Franks', item.age);
  const result = expectedDuel657(a, b);
  for (const [key, side, civ, civZh] of [
    ['a', a, 'Muisca', '穆伊斯卡'],
    ['b', b, 'Franks', '法兰克'],
  ] as const) {
    const panel = page.locator(`#duel-${key}`);
    await expect(panel.locator('.duel-head')).toContainText(side.unit.zh);
    await expect(panel.locator('.duel-head')).toContainText(civZh);
    await expect(panel.locator('.duel-age')).toHaveText(item.ageZh);
    await expect(page.locator(`#duel-${key}-civ`)).toHaveAttribute('data-value', civ);
    await expect(panel.getByRole('radio', { name: '当前时代满科技', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(panel.locator(`#duel-${key}-age`)).toHaveValue(String(item.age));
    const selected = await panel
      .locator('.simt:has(a[href*="#/tech/"]) input:checked')
      .evaluateAll((inputs) =>
        inputs.map((input) => Number(input.closest('label')!.querySelector('a')!.getAttribute('href')!.split('/').at(-1))).sort((x, y) => x - y),
      );
    expect(selected).toEqual(side.selected);
    await expect(panel.locator('.simg').filter({ hasText: '团队加成（开关）' }).locator('input:checked')).toHaveCount(0);
  }
  const row = (label: string) =>
    page
      .locator('#duel-res .duel-tab tr')
      .filter({ has: page.getByRole('cell', { name: label, exact: true }) })
      .locator('td');
  await expect(row('击杀所需次数')).toHaveText(['击杀所需次数', String(result.ab.hits), String(result.ba.hits)]);
  const time = (value: number | null) => (value === null ? '—' : `${Math.round(value * 10) / 10}s`);
  await expect(row('击杀用时')).toHaveText(['击杀用时', time(result.ab.time), time(result.ba.time)]);
  await expect(page.getByRole('radio', { name: '1v1', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#duel-res .duel-win')).toContainText(item.key === 'castle' ? '平局（同时击杀）' : 'A · 蔷琵步兵 获胜');
  await expect(page.locator('#duel')).toContainText('未建模的独特/特殊效果未计入');
}
async function transport657(page: Page) {
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
async function checkTransport657(page: Page, log: Awaited<ReturnType<typeof transport657>>, info: TestInfo) {
  await info.attach('champi-duel-transport.json', { body: JSON.stringify({ ...log, aborted: [...log.aborted] }, null, 2), contentType: 'application/json' });
  expect(log.page).toEqual([]);
  expect(log.console.filter((entry) => !(log.aborted.has(entry.url) && entry.text === 'Failed to load resource: net::ERR_FAILED'))).toEqual([]);
  expect(log.failed.filter((entry) => !(log.aborted.has(entry.url) && entry.error === 'net::ERR_FAILED'))).toEqual([]);
  expect(await page.evaluate(() => (window as typeof window & { champiUnhandled?: string[] }).champiUnhandled ?? [])).toEqual([]);
}
async function referenceLayout657(page: Page, root: Locator) {
  for (const element of await root.locator('a, button').all()) {
    const box = (await element.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  expect(
    await root
      .locator('*')
      .evaluateAll((elements) =>
        elements
          .filter((element) => element.getClientRects().length && Number.parseFloat(getComputedStyle(element).fontSize) < 12)
          .map((element) => element.outerHTML),
      ),
  ).toEqual([]);
  expect(
    await root
      .locator('.num, .nw')
      .evaluateAll((elements) =>
        elements
          .filter((element) => getComputedStyle(element).whiteSpace !== 'nowrap' || element.getClientRects().length > 1)
          .map((element) => element.textContent),
      ),
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test.describe('#657 current 蔷琵native参考和恢复', () => {
  const logs = new WeakMap<Page, Awaited<ReturnType<typeof transport657>>>();
  test.beforeEach(async ({ page }) => logs.set(page, await transport657(page)));
  test.afterEach(async ({ page }, info) => checkTransport657(page, logs.get(page)!, info));

  test('@1280 两条参考显著标文明且点击前不改当前PK；点击后同代真实计算无升代', async ({ page }) => {
    const dirty = 'a=569.Franks.4.f.0-1&b=359.Japanese.4.f.2&m=n&na=11&nb=7';
    await page.goto(`./#/duel?${dirty}`);
    await expect(page.locator('#duel-res')).toBeVisible();
    const root = page.getByTestId('champi-presets');
    await expect(root.locator('.champi-reference-card')).toHaveCount(2);
    await expect(root.locator('.champi-reference-context')).toContainText('参考：穆伊斯卡对法兰克，不代表你当前的对手；当前时代满科技、无团队加成、接触 1v1');
    expect(new URL(page.url()).hash).toBe(`#/duel?${dirty}`);
    for (const item of references657) {
      const card = reference657(page, item.key);
      await expect(card.locator('[data-side="a"]')).toContainText('穆伊斯卡');
      await expect(card.locator('[data-side="b"]')).toContainText('法兰克');
      await expect(card.getByRole('link', { name: '打开参考对照', exact: true })).toHaveAttribute('href', `#/duel?${item.query}`);
      await card.getByRole('link', { name: '打开参考对照', exact: true }).click();
      await configured657(page, item);
    }
    await page.reload();
    await configured657(page, references657[1]);
  });

  for (const item of references657)
    test(`@1280 ${item.key}真实clipboard完整baseURI分享链接在freshcontext重算`, async ({ browser, baseURL }, info) => {
      const context = await browser.newContext({ baseURL, permissions: ['clipboard-read', 'clipboard-write'], serviceWorkers: 'block' });
      const page = await context.newPage();
      const log = await transport657(page);
      let directContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
      try {
        await page.goto('./#/duel?a=38.Franks.3..&b=38.Byzantines.3..&m=1');
        await expect(page.locator('#duel-res')).toBeVisible();
        const before = page.url();
        const card = reference657(page, item.key);
        await card.getByRole('button', { name: /^复制链接：/ }).click();
        await expect(card.getByRole('status')).toHaveText('参考对照链接已复制。');
        const copied = await page.evaluate(() => navigator.clipboard.readText());
        const base = await page.evaluate(() => document.baseURI);
        expect(copied).toBe(expectedShareUrl657(item.query, base));
        expect(new URL(copied).pathname).toBe(new URL('./duel/', base).pathname);
        expect(new URL(copied).hash).toBe('');
        expect(new URL(copied).searchParams.toString()).toBe(item.query);
        expect(page.url()).toBe(before);
        directContext = await browser.newContext({ baseURL, serviceWorkers: 'block' });
        const direct = await directContext.newPage();
        const directLog = await transport657(direct);
        await direct.goto(copied);
        await configured657(direct, item);
        await direct.reload();
        await configured657(direct, item);
        await checkTransport657(direct, directLog, info);
      } finally {
        await checkTransport657(page, log, info);
        await directContext?.close();
        await context.close();
      }
    });

  test('@1280 clipboard拒绝暴露完整只读可全选fallback，切换输入清理旧反馈', async ({ browser, baseURL }, info) => {
    const context = await browser.newContext({ baseURL, serviceWorkers: 'block' });
    const page = await context.newPage();
    const log = await transport657(page);
    try {
      await page.addInitScript(() =>
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: {
            writeText: async () => {
              throw new Error('657 clipboard denied');
            },
          },
        }),
      );
      await page.goto('./#/duel?a=38.Franks.3..&b=38.Byzantines.3..&m=1');
      await expect(page.locator('#duel-res')).toBeVisible();
      const before = page.url(),
        base = await page.evaluate(() => document.baseURI);
      for (const item of references657) {
        const card = reference657(page, item.key);
        await card.getByRole('button', { name: /^复制链接：/ }).click();
        await expect(card.getByRole('status')).toHaveText('自动复制失败，请手动复制下方完整参考对照链接。');
        const fallback = card.getByRole('textbox', { name: '完整参考对照链接', exact: true });
        await expect(fallback).toHaveAttribute('readonly', '');
        await expect(fallback).toHaveValue(expectedShareUrl657(item.query, base));
        await fallback.focus();
        expect(
          await fallback.evaluate((element) => {
            const area = element as HTMLTextAreaElement;
            return [area.selectionStart, area.selectionEnd];
          }),
        ).toEqual([0, (await fallback.inputValue()).length]);
      }
      expect(page.url()).toBe(before);
      await page.getByRole('radio', { name: 'N vs M', exact: true }).click();
      await expect(page.getByTestId('champi-presets').getByRole('textbox')).toHaveCount(0);
      await expect(page.getByTestId('champi-presets').getByRole('status')).toHaveCount(0);
    } finally {
      await checkTransport657(page, log, info);
      await context.close();
    }
  });

  for (const width of [360, 375, 390, 1280])
    test(`@${width} 两参考与真实draw四宽可读、44px、12px、nowrap、axe`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((theme) => localStorage.setItem('aoe2-theme', theme), width === 390 ? 'dark' : 'light');
      await page.goto(`./#/duel?${references657[1].query}`);
      await configured657(page, references657[1]);
      const root = page.getByTestId('champi-presets');
      await referenceLayout657(page, root);
      expect((await new AxeBuilder({ page }).include('.champi-presets').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      await page.screenshot({ path: info.outputPath(`champi-duel-${width}.png`), fullPage: true });
    });

  // Deliberate transport failures live in independent pages. The original global zero-error hooks above are unchanged.
  for (const width of [360, 375, 390, 1280])
    for (const chunk of ['units', 'trees'] as const)
      test(`@${width} native ${chunk}冷失败无旧计算，解除后按钮重试保留a/b/m和数量`, async ({ browser, baseURL }, info) => {
        const context = await browser.newContext({ baseURL, serviceWorkers: 'block', viewport: { width, height: 900 } });
        const page = await context.newPage();
        const log = await transport657(page);
        const pattern = new RegExp(`/assets/${chunk}-[^/]+\\.js(?:\\?.*)?$`);
        const query = 'a=2552.Muisca.3.c.&b=77.Franks.3.c.&m=n&na=11&nb=7';
        try {
          await page.addInitScript((theme) => localStorage.setItem('aoe2-theme', theme), width === 390 ? 'dark' : 'light');
          await page.route(pattern, async (route) => {
            log.aborted.add(route.request().url());
            await route.abort('failed');
          });
          await page.goto(`./#/duel?${query}`);
          await expect(page.getByRole('alert')).toContainText('对局资料加载失败，已选文明保留。');
          await expect(page.locator('#duel-res, #duel-a, #duel-b, .champi-presets')).toHaveCount(0);
          expect(new URL(page.url()).hash).toBe(`#/duel?${query}`);
          await expect.poll(() => log.failed.length).toBe(1);
          expect(log.aborted.size).toBe(1);
          const retry = page.getByRole('button', { name: '重试资料', exact: true });
          const retryBox = (await retry.boundingBox())!;
          expect(retryBox.width).toBeGreaterThanOrEqual(44);
          expect(retryBox.height).toBeGreaterThanOrEqual(44);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          expect((await new AxeBuilder({ page }).include('[role="alert"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
          await page.screenshot({ path: info.outputPath(`champi-duel-${chunk}-failure.png`), fullPage: true });
          await page.unroute(pattern);
          const recovered = page.waitForResponse((response) => pattern.test(response.url()) && response.ok());
          await retry.click();
          await recovered;
          await expect(page.locator('#duel-res')).toBeVisible();
          await expect(page.getByRole('alert')).toHaveCount(0);
          expect(new URL(page.url()).hash).toBe(`#/duel?${query}`);
          await expect(page.locator('#duel-na')).toHaveValue('11');
          await expect(page.locator('#duel-nb')).toHaveValue('7');
          await expect(page.locator('#duel-a-civ')).toHaveAttribute('data-value', 'Muisca');
          await expect(page.locator('#duel-b-civ')).toHaveAttribute('data-value', 'Franks');
          await expect(page.getByTestId('champi-presets').locator('.champi-reference-card')).toHaveCount(2);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          await page.screenshot({ path: info.outputPath(`champi-duel-${chunk}-recovered.png`), fullPage: true });
        } finally {
          await checkTransport657(page, log, info);
          await context.close();
        }
      });

  for (const reject of [false, true])
    for (const leave of [false, true])
      test(`@1280 native pending改当前对照或离开，旧完成不能覆盖 ${leave ? 'unmount' : 'pair'} ${reject ? 'reject' : 'resolve'}`, async ({
        browser,
        baseURL,
      }, info) => {
        const context = await browser.newContext({ baseURL, serviceWorkers: 'block' });
        const page = await context.newPage();
        const log = await transport657(page);
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
          await page.goto(`./#/duel?${references657[0].query}`);
          await seen;
          await expect(page.locator('#duel-res, .champi-presets')).toHaveCount(0);
          await page.evaluate(
            (hash) => {
              location.hash = hash;
            },
            leave ? '/' : `/duel?${references657[1].query}`,
          );
          if (leave) await expect(page.locator('#duel')).toHaveCount(0);
          const completed = reject
            ? page.waitForEvent('requestfailed', (request) => /\/assets\/trees-[^/]+\.js$/.test(request.url()))
            : page.waitForResponse((response) => /\/assets\/trees-[^/]+\.js$/.test(response.url()) && response.ok());
          release();
          const transport = await completed;
          if ('finished' in transport) await transport.finished();
          await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
          if (leave) await expect(page.locator('#duel, #duel-res, .champi-presets')).toHaveCount(0);
          else if (reject) {
            await expect(page.getByRole('alert')).toContainText('对局资料加载失败，已选文明保留。');
            expect(new URL(page.url()).hash).toBe(`#/duel?${references657[1].query}`);
            await expect(page.locator('#duel-res, .champi-presets')).toHaveCount(0);
          } else await configured657(page, references657[1]);
        } finally {
          release();
          await checkTransport657(page, log, info);
          await context.close();
        }
      });
});
