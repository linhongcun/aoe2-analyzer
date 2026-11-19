import { expect, test, type Page } from '@playwright/test';
import { historyFixture } from '../helpers/civUpdatesFixture';

const asset = /\/civ-updates(?:-[^/]+)?\.json(?:\?|$)/u;
const history = (page: Page) => page.getByTestId('entity-history');
const fixture = historyFixture();
const samples = ['civ/Armenians', 'unit/1699', 'building/50', 'tech/463'];
const counts = [12, 7, 1, 2];

for (const id of samples) {
  test(`all events, keyboard expansion, evidence and round trip: ${id}`, async ({ page }) => {
    await page.goto('/#/' + id + '?tab=history');
    await expect(history(page)).toBeVisible();
    const buttons = history(page).locator('h3 > button');
    const total = await buttons.count();
    for (let index = 0; index < total; index++) {
      const button = buttons.nth(index);
      await expect(button).toHaveAttribute('aria-expanded', total <= 2 || index === 0 ? 'true' : 'false');
      if ((await button.getAttribute('aria-expanded')) === 'false') {
        await button.focus();
        await button.press('Space');
        await expect(button).toBeFocused();
      }
    }
    const cards = history(page).locator('[data-history-event]');
    await expect(cards).toHaveCount(counts[samples.indexOf(id)]!);
    const ids = await cards.evaluateAll((elements) => elements.map((element) => element.getAttribute('data-history-event')));
    expect(new Set(ids).size).toBe(ids.length);
    for (const eventId of ids) {
      const card = history(page).locator(`[data-history-event="${eventId}"]`);
      await expect(card).toBeVisible();
      const effects = await card
        .locator('[data-history-effect]')
        .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-history-effect')));
      const original = fixture.events.find((event) => event.id === eventId)!;
      expect(effects.length).toBeGreaterThan(0);
      expect(new Set(effects).size).toBe(effects.length);
      expect(original.claims.flatMap((claim) => claim.effects.map((effect) => effect.id))).toEqual(expect.arrayContaining(effects));
    }
    const evidence = cards.first().locator('summary');
    await evidence.focus();
    await evidence.press('Enter');
    await expect(evidence).toBeFocused();
    await expect(cards.first().locator('details')).toHaveAttribute('open', '');
    await evidence.press('Space');
    await expect(cards.first().locator('details')).not.toHaveAttribute('open', '');
    const link = history(page).getByRole('link', { name: '查看完整历史', exact: true });
    await link.click();
    await expect(page).toHaveURL(new RegExp('obj=' + encodeURIComponent(id.replace('/', ':'))));
    const readerNodes = page.locator('.history-node > h3 > button');
    await expect(page.getByTestId('patch-object')).toBeVisible();
    for (const node of await readerNodes.all()) {
      if ((await node.getAttribute('aria-expanded')) === 'false') await node.click();
    }
    await expect(page.locator('[data-history-event]')).toHaveCount(ids.length);
    expect(
      (await page.locator('[data-history-event]').evaluateAll((elements) => elements.map((element) => element.getAttribute('data-history-event')))).sort(),
    ).toEqual(ids.sort());
    await page.getByRole('link', { name: '返回来处' }).click();
    await expect(link).toBeFocused();
    for (let index = 0; index < total; index++) await expect(buttons.nth(index)).toHaveAttribute('aria-expanded', 'true');
  });
}

test('tech 463 has two versions, separate effects and missing date', async ({ page }) => {
  await page.goto('/#/tech/463?tab=history');
  await expect(history(page).locator('[data-history-event]')).toHaveCount(2);
  await expect(history(page).locator('h3').first()).toContainText('185872');
  await expect(history(page).locator('h3').first()).toContainText('日期未登记');
  await expect(history(page).locator('h3').nth(1)).toContainText('2023-04-11');
  await expect(history(page)).toContainText('700 食物');
  await expect(history(page)).toContainText('450 黄金');
  await expect(history(page).getByText('仅展示已收录的变化；历史数值不代表当前机制。', { exact: true })).toHaveCount(1);
});

test('keeps the loading status while the shared event renderer chunk is pending', async ({ page }) => {
  let release!: () => void;
  let entered!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const intercepted = new Promise<void>((resolve) => {
    entered = resolve;
  });
  await page.route(/\/CivUpdates-[^/]+\.js$/, async (route) => {
    entered();
    await held;
    await route.continue();
  });
  await page.goto('/#/tech/463?tab=history');
  await intercepted;
  await expect(page.getByRole('status').filter({ hasText: '正在加载更新历史…' })).toHaveAttribute('aria-busy', 'true');
  await expect(history(page)).toHaveCount(0);
  release();
  await expect(history(page).locator('[data-history-event]')).toHaveCount(2);
});

async function switchTech(page: Page) {
  await page.evaluate(() => {
    location.hash = '/tech/3?tab=history';
  });
  await expect(page.getByRole('heading', { level: 1 })).toContainText('英皇侍卫');
}

async function noHistory(page: Page) {
  await expect(page.getByRole('heading', { level: 1 })).toContainText('英皇侍卫');
  await expect(page.locator('#tech-history')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '更新历史', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '查看完整历史', exact: true })).toHaveCount(0);
  await expect(page.getByText('从未改动', { exact: false })).toHaveCount(0);
}

test('zero history direct and switching 463 to 3 clears expanded records', async ({ page }) => {
  await page.goto('/#/tech/3?tab=history');
  await noHistory(page);
  await page.goto('/#/tech/463?tab=history');
  await history(page).locator('summary').first().click();
  await switchTech(page);
  await noHistory(page);
});

for (const fail of [false, true]) {
  test(`late ${fail ? 'error' : 'success'} cannot replace tech 3`, async ({ page }) => {
    let requests = 0;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const intercepted = new Promise<void>((resolve) => {
      entered = resolve;
    });
    await page.route(asset, async (route) => {
      requests++;
      if (requests === 1) return route.fulfill({ status: 503, body: '{}' });
      if (requests === 2) {
        entered();
        await held;
        if (fail) await route.fulfill({ status: 503, body: '{}' });
        else await route.fulfill({ json: fixture });
      } else await route.fulfill({ json: fixture });
    });
    await page.goto('/#/tech/463?tab=history');
    await expect(page.getByRole('alert')).toHaveText('更新历史加载失败，请重试。');
    await page.getByRole('button', { name: '重试', exact: true }).click();
    await intercepted;
    await expect(page.getByRole('status').filter({ hasText: '正在加载更新历史…' })).toHaveAttribute('aria-busy', 'true');
    await switchTech(page);
    await expect.poll(() => requests).toBe(3);
    await noHistory(page);
    const completed = page.waitForResponse(asset);
    release();
    await (await completed).finished();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await noHistory(page);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}

for (const ownsFocus of [true, false]) {
  test(`zero history removal ${ownsFocus ? 'hands focus to h1' : 'does not steal unrelated focus'}`, async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(asset, async (route) => {
      await held;
      await route.fulfill({ json: fixture });
    });
    await page.goto('/#/tech/3?tab=history');
    const focused = ownsFocus ? page.locator('#tech-history > summary') : page.getByRole('button', { name: '研究', exact: true });
    await focused.focus();
    await expect(focused).toBeFocused();
    release();
    await noHistory(page);
    await expect(ownsFocus ? page.getByRole('heading', { level: 1 }) : focused).toBeFocused();
  });
}

for (const id of ['463', '3']) {
  test(`retry reloads only current tech ${id}`, async ({ page }) => {
    let requests = 0;
    await page.route(asset, (route) => {
      requests++;
      return requests === 1 ? route.fulfill({ status: 503, body: '{}' }) : route.fulfill({ json: fixture });
    });
    await page.goto('/#/tech/' + id + '?tab=history');
    await expect(page.getByRole('alert')).toHaveText('更新历史加载失败，请重试。');
    await page.getByRole('button', { name: '重试', exact: true }).click();
    if (id === '3') await noHistory(page);
    else await expect(history(page).locator('[data-history-event]')).toHaveCount(2);
    expect(requests).toBe(2);
    await expect(page).toHaveURL(new RegExp('/tech/' + id));
  });
}

test('360 dark history and evidence stay single column without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));
  for (const id of ['tech/463', 'unit/1699']) {
    await page.goto('/#/' + id + '?tab=history');
    await history(page).locator('summary').first().click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const button = history(page).locator('h3 > button').first();
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(history(page).locator('.num.nw').first()).toHaveCSS('white-space', 'nowrap');
  }
});
