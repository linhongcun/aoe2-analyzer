import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expectedCivs657 as civRecords, expectedSide657, expectedDuel657 } from './champi657Expected';

test('#657 @1280 实际双方的蔷琵线按时代对照入口', async ({ page }, info) => {
  await page.goto('./#/matchup?me=Franks&opp=Muisca&pair=explicit');
  await expect(page.locator('#mres')).toBeVisible();
  await expect(page.locator('#ma')).toHaveAttribute('data-value', 'Franks');
  await expect(page.locator('#me')).toHaveAttribute('data-value', 'Muisca');
  console.log(
    JSON.stringify({
      source: '657-matchup',
      version: await page.locator('[data-t="footer-app-version"]').innerText(),
      build: await page.locator('[data-t="footer-build"]').innerText(),
    }),
  );
  await page.screenshot({ path: info.outputPath('champi-matchup-before.png'), fullPage: true });
  await expect(page.getByRole('heading', { name: '应对对手的蔷琵线', exact: true })).toBeVisible();
});

async function pick(page: Page, id: string, civ: string) {
  await page.locator(`#${id}`).click();
  await page.locator(`.cp-panel [data-civ="${civ}"]`).click();
  await expect(page.locator(`#${id}`)).toHaveAttribute('data-value', civ);
}
async function assertSim(page: Page, civ: string, name: string) {
  await expect(page.locator('#unit h1')).toContainText(name);
  await expect(page.locator('#simciv')).toHaveAttribute('data-value', civ);
  await expect(page.locator('#simage')).toHaveValue('4');
  await expect(page.locator('#sim input[type="checkbox"]:checked')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: '科技模拟器', exact: true })).toHaveAttribute('aria-selected', 'true');
}

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#424 文明模拟入口 ${theme} ${width}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (e) => {
        if (e.type() === 'error') errors.push(e.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/matchup');
      await pick(page, 'ma', 'Franks');
      await pick(page, 'me', 'Britons');
      const generic = page.locator('.matchup-counter-link').filter({ hasText: /^骑士$/ });
      await expect(generic).toHaveAttribute('href', '#/unit/38?civ=Franks&from=matchup&me=Franks&opp=Britons');
      await generic.click();
      await expect(page).toHaveURL(/#\/unit\/38\?civ=Franks&from=matchup&me=Franks&opp=Britons$/);
      await expect(page.getByRole('tab', { name: '概览', exact: true })).toHaveAttribute('aria-selected', 'true');
      await page.goBack();
      const sim = page.getByRole('link', { name: '骑士：用法兰克模拟', exact: true });
      await expect(sim).toHaveAttribute('href', '#/unit/38/Franks/4/?tab=sim');
      await expect(page.locator('#mres')).toContainText('默认帝王时代，未勾选科技与团队加成');
      await generic.focus();
      await generic.press('Tab');
      await expect(sim).toBeFocused();
      expect(await sim.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
      const box = (await sim.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect((await new AxeBuilder({ page }).include('.matchup-counter-list').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`matchup-sim-${width}-${theme}.png`), fullPage: true });
      await sim.press('Enter');
      await assertSim(page, 'Franks', '骑士');
      await page.reload();
      await assertSim(page, 'Franks', '骑士');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });

test('#424 旧单位/文明/科技状态不覆盖入口，切换本方与直接深链一致', async ({ page, context }) => {
  await page.goto('./#/unit/38/Britons/3//?tab=sim');
  await expect(page.locator('#simciv')).toHaveAttribute('data-value', 'Britons');
  await page.getByRole('button', { name: '满科技', exact: true }).click();
  expect(await page.locator('#sim input[type="checkbox"]:checked').count()).toBeGreaterThan(0);
  // 仅切hash保留真实应用session，不能用goto重建文档掩盖干扰。
  await page.evaluate(() => {
    location.hash = '/matchup';
  });
  await pick(page, 'ma', 'Franks');
  await pick(page, 'me', 'Britons');
  await page.getByRole('link', { name: '骑士：用法兰克模拟', exact: true }).click();
  await assertSim(page, 'Franks', '骑士');
  await page.evaluate(() => {
    location.hash = '/unit/4/Britons/4//?tab=sim';
  });
  await expect(page.locator('#simciv')).toHaveAttribute('data-value', 'Britons');
  await page.evaluate(() => {
    location.hash = '/civ/Mayans';
  });
  await expect(page.locator('#detail h1')).toContainText('玛雅');
  await page.evaluate(() => {
    location.hash = '/matchup';
  });
  await pick(page, 'ma', 'Berbers');
  const next = page.getByRole('link', { name: '骑士：用柏柏尔模拟', exact: true });
  const href = await next.getAttribute('href');
  await expect(next).toHaveAttribute('href', '#/unit/38/Berbers/4/?tab=sim');
  await next.click();
  await assertSim(page, 'Berbers', '骑士');
  const direct = await context.newPage();
  await direct.goto(new URL(href!, page.url()).href);
  await assertSim(direct, 'Berbers', '骑士');
  await direct.close();
  await page.evaluate(() => {
    location.hash = '/matchup';
  });
  await pick(page, 'ma', 'Mayans');
  await pick(page, 'me', 'Franks');
  await expect(page.locator('.matchup-counter-list')).not.toContainText(/骑士|骆驼/);
  const rows = page.locator('.matchup-counter-list li');
  expect(await rows.count()).toBeGreaterThan(0);
  for (const row of await rows.all()) {
    const unitHref = await row.locator('.matchup-counter-link').getAttribute('href');
    expect(unitHref).toMatch(/^#\/unit\/\d+\?civ=Mayans&from=matchup&me=Mayans&opp=Franks$/);
    const unitPath = unitHref!.split('?')[0];
    await expect(row.locator('.matchup-sim-link')).toHaveAttribute('href', `${unitPath}/Mayans/4/?tab=sim`);
  }
});

// #657 uses the current build; the historical #372 suites and #424 assertions above stay intact.
async function champiDiagnostics(page: Page) {
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
async function assertChampiDiagnostics(page: Page, log: Awaited<ReturnType<typeof champiDiagnostics>>, info: TestInfo) {
  await info.attach('champi-transport.json', {
    body: JSON.stringify({ ...log, aborted: [...log.aborted] }, null, 2),
    contentType: 'application/json',
  });
  expect(log.page).toEqual([]);
  expect(log.console.filter((entry) => !(log.aborted.has(entry.url) && entry.text === 'Failed to load resource: net::ERR_FAILED'))).toEqual([]);
  expect(log.failed.filter((entry) => !(log.aborted.has(entry.url) && entry.error === 'net::ERR_FAILED'))).toEqual([]);
  expect(await page.evaluate(() => (window as typeof window & { champiUnhandled?: string[] }).champiUnhandled ?? [])).toEqual([]);
}
const ages657 = [
  { age: 2, champi: 2588, main: 75, candidates: [75, 448, 4] },
  { age: 3, champi: 2552, main: 38, candidates: [38, 77, 24] },
  { age: 4, champi: 2554, main: 567, candidates: [567, 5, 546] },
] as const;
const number657 = (value: number) => String(Number(value.toFixed(3)));
async function candidate657(card: Locator, candidateId: number, champiId: number, age: number, me = 'Franks', opp = 'Muisca', ownChampi = false) {
  const a = expectedSide657(ownChampi ? champiId : candidateId, me, age);
  const b = expectedSide657(ownChampi ? candidateId : champiId, opp, age);
  const result = expectedDuel657(a, b);
  const outcome = result.winner === 'draw' ? 'draw' : result.winner === (ownChampi ? 'b' : 'a') ? 'win' : 'loss';
  const row = card.locator(`[data-champi-candidate="${candidateId}"]`);
  await expect(row).toHaveAttribute('data-outcome', outcome);
  await expect(row).toContainText(outcome === 'win' ? '本组接触对照有优势' : outcome === 'draw' ? '接触对照：同时击杀' : '接触对照：未占优');
  for (const [index, side, attack] of [
    [0, a, result.ab],
    [1, b, result.ba],
  ] as const) {
    const identity = row.locator('.champi-age-side').nth(index);
    await expect(identity).toContainText(side.unit.zh);
    await expect(identity.locator('.num')).toHaveText([
      `${attack.hits} 次攻击`,
      `${number657(attack.time!)} 秒`,
      number657(side.stats.ma),
      number657(side.stats.pa),
      `${number657(side.stats.spd)} 格/秒`,
    ]);
  }
  const query = new URLSearchParams({ a: `${a.unit.id}.${me}.${age}.c.`, b: `${b.unit.id}.${opp}.${age}.c.`, m: '1' });
  await expect(row.getByRole('link', { name: '打开本时代 PK', exact: true })).toHaveAttribute('href', `#/duel?${query}`);
  return row;
}
async function champiLayout(root: Locator, page: Page) {
  for (const element of await root.locator('a, button, summary').all()) {
    if (!(await element.isVisible())) continue;
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

test.describe('#657 current 蔷琵时代对照', () => {
  const logs = new WeakMap<Page, Awaited<ReturnType<typeof champiDiagnostics>>>();
  test.beforeEach(async ({ page }) => logs.set(page, await champiDiagnostics(page)));
  test.afterEach(async ({ page }, info) => assertChampiDiagnostics(page, logs.get(page)!, info));

  test('@1280 三时代主项与全部有限候选按独立引擎重算，不能把draw/loss写成优势', async ({ page }) => {
    await page.goto('./#/matchup?me=Franks&opp=Muisca&pair=explicit');
    const module = page.locator('.champi-ages');
    await expect(module.getByRole('heading', { name: '应对对手的蔷琵线', exact: true })).toBeVisible();
    await expect(module).toContainText('只核对三条常见路线；同数量不等于同资源投入');
    await expect(module).toContainText('双方当前时代已建模科技全选，无团队加成');
    for (const item of ages657) {
      const card = page.getByTestId(`champi-age-${item.age}`);
      await expect(card.locator(':scope > .champi-age-candidate')).toHaveAttribute('data-champi-candidate', String(item.main));
      await expect(card.locator(':scope > .champi-age-candidate')).toHaveAttribute('data-outcome', 'win');
      await card.locator('summary').click();
      await expect(card.locator('[data-champi-candidate]')).toHaveCount(3);
      for (const id of item.candidates) await candidate657(card, id, item.champi, item.age);
    }
    await expect(page.locator('[data-champi-candidate="77"]')).toHaveAttribute('data-outcome', 'draw');
    for (const id of [4, 24, 5, 546]) await expect(page.locator(`[data-champi-candidate="${id}"]`)).toHaveAttribute('data-outcome', 'loss');
    await expect(page.locator('[data-champi-candidate="24"]')).toContainText('未模拟射程先手与风筝');
    await expect(page.locator('[data-champi-candidate="75"]')).toContainText('接触优势不代表能追上');
  });

  for (const ownChampi of [false, true])
    test(`@1280 动态PK A=原我方/B=原对手并原序回助手 ${ownChampi ? '我方蔷琵' : '敌方蔷琵'}`, async ({ page }) => {
      const me = ownChampi ? 'Muisca' : 'Franks',
        opp = ownChampi ? 'Franks' : 'Muisca';
      await page.goto(`./#/matchup?me=${me}&opp=${opp}&pair=explicit`);
      const card = page.getByTestId('champi-age-3');
      const row = await candidate657(card, 38, 2552, 3, me, opp, ownChampi);
      if (ownChampi) await expect(page.locator('.champi-ages')).toContainText('下方优势标签描述对手候选，不是给我方的推荐');
      await row.getByRole('link', { name: '打开本时代 PK', exact: true }).click();
      await expect(page.locator('#duel-res')).toBeVisible();
      await expect(page.locator('#duel-a-civ')).toHaveAttribute('data-value', me);
      await expect(page.locator('#duel-b-civ')).toHaveAttribute('data-value', opp);
      const query = new URLSearchParams(new URL(page.url()).hash.split('?')[1]);
      expect(query.get('a')).toBe(`${ownChampi ? 2552 : 38}.${me}.3.c.`);
      expect(query.get('b')).toBe(`${ownChampi ? 38 : 2552}.${opp}.3.c.`);
      await page.getByRole('link', { name: '回对局助手', exact: true }).click();
      await expect(page.locator('#ma')).toHaveAttribute('data-value', me);
      await expect(page.locator('#me')).toHaveAttribute('data-value', opp);
      await expect(page.locator('.champi-age-card')).toHaveCount(3);
    });

  test('@1280 双方有线优先对手；真实穆伊斯卡帝王无候选；双方无线隐藏', async ({ page }) => {
    await page.goto('./#/matchup?me=Muisca&opp=Muisca&pair=explicit');
    await expect(page.getByRole('heading', { name: '应对对手的蔷琵线', exact: true })).toBeVisible();
    await expect(page.locator('.champi-ages')).toHaveCount(1);
    const imperial = page.getByTestId('champi-age-4');
    await expect(imperial.getByRole('status')).toContainText('本卡三条候选中暂无本文明可用的已核对路线');
    await imperial.locator('summary').click();
    await expect(imperial.locator('[data-champi-candidate]')).toHaveCount(3);
    for (const id of [567, 5, 546]) {
      const row = imperial.locator(`[data-champi-candidate="${id}"]`);
      await expect(row).toContainText('本时代不可用');
      await expect(row.getByRole('link')).toHaveCount(0);
    }
    await expect(imperial).not.toContainText('法兰克');
    await pick(page, 'ma', 'Franks');
    await pick(page, 'me', 'Britons');
    await expect(page.locator('#mres')).toBeVisible();
    await expect(page.locator('.champi-ages')).toHaveCount(0);
  });

  test('@1280 #672 explicit部分/双空/invalid从已显示卡切换也不注入默认或旧结果', async ({ page }) => {
    await page.goto('./#/matchup?me=Franks&opp=Muisca&pair=explicit');
    await expect(page.locator('.champi-age-card')).toHaveCount(3);
    for (const item of [
      { query: 'me=Muisca&pair=explicit', me: 'Muisca', opp: '', copy: '请补选对手文明' },
      { query: 'opp=Muisca&pair=explicit', me: '', opp: 'Muisca', copy: '请补选我方文明' },
      { query: 'pair=explicit', me: '', opp: '', copy: '请补选双方文明' },
      { query: 'me=&opp=&pair=explicit', me: '', opp: '', copy: '链接中的对阵信息无效' },
      { query: 'me=Muisca&opp=not-a-civ&pair=explicit', me: '', opp: '', copy: '链接中的对阵信息无效' },
      { query: 'me=Franks&me=Muisca&opp=Muisca&pair=explicit', me: '', opp: '', copy: '链接中的对阵信息无效' },
      { query: 'me=Franks&opp=Muisca&pair=explicit&pair=explicit', me: '', opp: '', copy: '链接中的对阵信息无效' },
      { query: 'me=Franks&opp=Muisca&pair=wrong', me: '', opp: '', copy: '链接中的对阵信息无效' },
    ]) {
      await page.evaluate((query) => {
        location.hash = `/matchup?${query}`;
      }, item.query);
      await expect(page.locator('#matchup')).toContainText(item.copy);
      await expect(page.locator('#ma')).toHaveAttribute('data-value', item.me);
      await expect(page.locator('#me')).toHaveAttribute('data-value', item.opp);
      await expect(page.locator('#mres, .champi-age-card, .champi-age-link')).toHaveCount(0);
      expect(new URL(page.url()).hash).toBe(`#/matchup?${item.query}`);
    }
    await page.evaluate(() => {
      location.hash = '/';
    });
    await expect(page.locator('#matchup')).toHaveCount(0);
    await page.evaluate(() => {
      location.hash = '/matchup';
    });
    await expect(page.locator('#ma')).toHaveAttribute('data-value', 'Franks');
    await expect(page.locator('#me')).toHaveAttribute('data-value', 'Muisca');
    await page.evaluate(() => {
      location.hash = '/matchup?me=Muisca&pair=explicit';
    });
    await expect(page.locator('#matchup')).toContainText('请补选对手文明');
    await pick(page, 'me', 'Franks');
    await expect(page.getByRole('heading', { name: '我方蔷琵线：查看对手接触对照', exact: true })).toBeVisible();
    expect(new URL(page.url()).hash).toContain('pair=explicit');
    await page.goBack();
    await expect(page.locator('#matchup')).toContainText('请补选对手文明');
    await expect(page.locator('.champi-ages')).toHaveCount(0);
  });

  test('@1280 #672 default/legacy/sticky与picker/history保持真实pair，无stale卡', async ({ page }) => {
    await page.goto('./#/matchup');
    await expect(page.locator('#ma')).toHaveAttribute('data-value', civRecords[16]!.en);
    await expect(page.locator('#me')).toHaveAttribute('data-value', civRecords[5]!.en);
    expect(new URL(page.url()).hash).toBe('#/matchup');
    await page.evaluate(() => {
      location.hash = '/matchup?me=Franks&opp=Muisca';
    });
    await expect(page.locator('.champi-age-card')).toHaveCount(3);
    expect(new URL(page.url()).hash).not.toContain('pair=');
    await pick(page, 'me', 'Britons');
    await expect(page.locator('.champi-ages')).toHaveCount(0);
    await page.goBack();
    await expect(page.locator('#me')).toHaveAttribute('data-value', 'Muisca');
    await expect(page.locator('.champi-age-card')).toHaveCount(3);
    await page.goForward();
    await expect(page.locator('#me')).toHaveAttribute('data-value', 'Britons');
    await expect(page.locator('.champi-ages')).toHaveCount(0);
    await page.evaluate(() => {
      location.hash = '/';
    });
    await expect(page.locator('#matchup')).toHaveCount(0);
    await page.evaluate(() => {
      location.hash = '/matchup';
    });
    await expect(page.locator('#ma')).toHaveAttribute('data-value', 'Franks');
    await expect(page.locator('#me')).toHaveAttribute('data-value', 'Britons');
    expect(new URL(page.url()).hash).toBe('#/matchup');
  });

  for (const width of [360, 375, 390, 1280])
    test(`@${width} 四宽卡片、触点、数字、无溢出及正式axe`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((theme) => localStorage.setItem('aoe2-theme', theme), width === 390 ? 'dark' : 'light');
      await page.goto('./#/matchup?me=Franks&opp=Muisca&pair=explicit');
      const module = page.locator('.champi-ages');
      await expect(module.locator('.champi-age-card')).toHaveCount(3);
      const boxes = await module
        .locator('.champi-age-card')
        .evaluateAll((cards) => cards.map((card) => ({ x: card.getBoundingClientRect().x, y: card.getBoundingClientRect().y })));
      if (width === 1280) {
        expect(new Set(boxes.map((box) => Math.round(box.y))).size).toBe(1);
        expect(new Set(boxes.map((box) => Math.round(box.x))).size).toBe(3);
      } else expect(new Set(boxes.map((box) => Math.round(box.x))).size).toBe(1);
      for (const item of ages657) await candidate657(page.getByTestId(`champi-age-${item.age}`), item.main, item.champi, item.age);
      await champiLayout(module, page);
      for (const picker of [page.locator('#ma'), page.locator('#me')]) {
        const box = (await picker.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
      expect((await new AxeBuilder({ page }).include('.champi-ages').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      await page.screenshot({ path: info.outputPath(`champi-matchup-${width}.png`), fullPage: true });
      await pick(page, 'ma', 'Muisca');
      await pick(page, 'me', 'Franks');
      await expect(module.getByRole('heading', { name: '我方蔷琵线：查看对手接触对照', exact: true })).toBeVisible();
      await champiLayout(module, page);
      await page.screenshot({ path: info.outputPath(`champi-own-${width}.png`), fullPage: true });
      await pick(page, 'me', 'Muisca');
      await expect(page.getByTestId('champi-age-4').getByRole('status')).toBeVisible();
      await page.screenshot({ path: info.outputPath(`champi-no-candidate-${width}.png`), fullPage: true });
      await page.evaluate(() => {
        location.hash = '/matchup?me=Muisca&pair=explicit';
      });
      await expect(page.locator('#matchup')).toContainText('请补选对手文明');
      await expect(page.locator('.champi-ages')).toHaveCount(0);
      await page.screenshot({ path: info.outputPath(`champi-partial-${width}.png`), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
});

for (const width of [360, 375, 390, 1280])
  for (const chunk of ['units', 'trees'] as const)
    test(`#657 @${width} native ${chunk} 冷失败被捕获且按钮恢复当前pair和表单`, async ({ browser, baseURL }, info) => {
      const context = await browser.newContext({ baseURL, serviceWorkers: 'block', viewport: { width, height: 900 } });
      const page = await context.newPage();
      const log = await champiDiagnostics(page);
      const pattern = new RegExp(`/assets/${chunk}-[^/]+\\.js(?:\\?.*)?$`);
      try {
        await page.addInitScript((theme) => localStorage.setItem('aoe2-theme', theme), width === 390 ? 'dark' : 'light');
        await page.route(pattern, async (route) => {
          log.aborted.add(route.request().url());
          await route.abort('failed');
        });
        await page.goto('./#/matchup?me=Franks&opp=Muisca&pair=explicit&rush=archers');
        const errorRegion = page.getByTestId('matchup-data-error');
        await expect(errorRegion.getByRole('alert')).toHaveText('对局资料加载失败，暂时无法核对演练和开局。请刷新页面重试。');
        await expect(errorRegion).toContainText('已选文明保留。');
        await expect(errorRegion.getByRole('button', { name: '重试资料', exact: true })).toBeVisible();
        await expect(page.locator('#mres, .champi-age-card')).toHaveCount(0);
        await expect.poll(() => log.failed.length).toBe(1);
        expect(log.aborted.size).toBe(1);
        const retry = page.getByRole('button', { name: '重试资料', exact: true });
        const retryBox = (await retry.boundingBox())!;
        expect(retryBox.width).toBeGreaterThanOrEqual(44);
        expect(retryBox.height).toBeGreaterThanOrEqual(44);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect((await new AxeBuilder({ page }).include('[data-testid="matchup-data-error"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
        await pick(page, 'ma', 'Muisca');
        await pick(page, 'me', 'Franks');
        await page.getByRole('combobox', { name: '对手打法' }).selectOption('towers');
        const failedUrl = page.url();
        await page.screenshot({ path: info.outputPath(`champi-matchup-${chunk}-failure.png`), fullPage: true });
        await page.unroute(pattern);
        const recovered = page.waitForResponse((response) => pattern.test(response.url()) && response.ok());
        await retry.click();
        await recovered;
        await expect(page.getByRole('heading', { name: '我方蔷琵线：查看对手接触对照', exact: true })).toBeVisible();
        expect(page.url()).toBe(failedUrl);
        await expect(page.locator('#ma')).toHaveAttribute('data-value', 'Muisca');
        await expect(page.locator('#me')).toHaveAttribute('data-value', 'Franks');
        await expect(page.getByRole('combobox', { name: '对手打法' })).toHaveValue('towers');
        await expect(page.getByRole('alert')).toHaveCount(0);
        await candidate657(page.getByTestId('champi-age-3'), 38, 2552, 3, 'Muisca', 'Franks', true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: info.outputPath(`champi-matchup-${chunk}-recovered.png`), fullPage: true });
      } finally {
        await assertChampiDiagnostics(page, log, info);
        await context.close();
      }
    });

for (const reject of [false, true])
  for (const leave of [false, true])
    test(`#657 @1280 native pending换pair或离开后旧请求完成不能复活 ${leave ? 'unmount' : 'pair'} ${reject ? 'reject' : 'resolve'}`, async ({
      browser,
      baseURL,
    }, info) => {
      const context = await browser.newContext({ baseURL, serviceWorkers: 'block' });
      const page = await context.newPage();
      const log = await champiDiagnostics(page);
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
        await page.goto('./#/matchup?me=Franks&opp=Muisca&pair=explicit');
        await seen;
        await expect(page.locator('#mres, .champi-age-card')).toHaveCount(0);
        if (leave) {
          await page.evaluate(() => {
            location.hash = '/';
          });
          await expect(page.locator('#matchup')).toHaveCount(0);
        } else {
          await pick(page, 'ma', 'Muisca');
          await pick(page, 'me', 'Franks');
        }
        const completed = reject
          ? page.waitForEvent('requestfailed', (request) => /\/assets\/trees-[^/]+\.js$/.test(request.url()))
          : page.waitForResponse((response) => /\/assets\/trees-[^/]+\.js$/.test(response.url()) && response.ok());
        release();
        const transport = await completed;
        if ('finished' in transport) await transport.finished();
        await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        if (leave) {
          await expect(page.locator('#matchup, .champi-ages')).toHaveCount(0);
          if (reject) return;
          await page.evaluate(() => {
            location.hash = '/matchup?me=Franks&opp=Britons&pair=explicit';
          });
          await expect(page.locator('#mres')).toBeVisible();
          await expect(page.locator('.champi-ages')).toHaveCount(0);
        } else if (reject) {
          const errorRegion = page.getByTestId('matchup-data-error');
          await expect(errorRegion.getByRole('alert')).toHaveText('对局资料加载失败，暂时无法核对演练和开局。请刷新页面重试。');
          await expect(errorRegion).toContainText('已选文明保留。');
          await expect(errorRegion.getByRole('button', { name: '重试资料', exact: true })).toBeVisible();
          await expect(page.locator('#ma')).toHaveAttribute('data-value', 'Muisca');
          await expect(page.locator('#me')).toHaveAttribute('data-value', 'Franks');
          await expect(page.locator('#mres, .champi-ages')).toHaveCount(0);
        } else {
          await expect(page.getByRole('heading', { name: '我方蔷琵线：查看对手接触对照', exact: true })).toBeVisible();
          await candidate657(page.getByTestId('champi-age-3'), 38, 2552, 3, 'Muisca', 'Franks', true);
        }
      } finally {
        release();
        await assertChampiDiagnostics(page, log, info);
        await context.close();
      }
    });
