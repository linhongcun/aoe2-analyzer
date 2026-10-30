// #520 S1 失败验收（Kent Beck）。只编码验收，不实现功能；当前 main 应红。
// 规格：docs/design/site-linking-517/site-linking-517.md §3.2、§5.1–§5.3、§10 S1。
// 参数锁定（#520 产品裁定，以 §5.1 为准）：me/opp 始终是原始对阵双方。
//   我方开局 #/builds?civ={me}&from=matchup&opp={opp}
//   对手开局 #/builds?civ={opp}&from=matchup&me={me}（不要写成 opp={me}）
//   对手开局回助手：me 取 query.me，opp 取 query.civ
// 不覆盖 S2/S3。
import { expect, test, type Locator, type Page } from '@playwright/test';

const PAIR = './#/matchup?me=Mongols&opp=Chinese';
const DUEL = './#/duel?a=4.Mongols.2..&b=74.Chinese.2..&m=n&na=2&nb=3';
const ALLY_BUILDS = './#/builds?civ=Mongols&from=matchup&opp=Chinese';
const OPP_BUILDS = './#/builds?civ=Chinese&from=matchup&me=Mongols';
const INVALID_NOTE = '链接中的文明无效，已用上次选择';
const SHARE_HINT = '可复制地址栏链接分享这对阵';
const EMOJI = /\p{Extended_Pictographic}/u;

function hashParams(url: string): URLSearchParams {
  const hash = url.slice(url.indexOf('#') + 1);
  const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  return new URLSearchParams(query);
}

function expectQuery(href: string | null, path: RegExp, expected: Record<string, string | null>) {
  expect(href ?? '', href ?? '').toMatch(path);
  const query = hashParams(href ?? '');
  for (const [key, value] of Object.entries(expected)) expect(query.get(key), `${href} → ${key}`).toBe(value);
}

async function expectRealAnchor(link: Locator) {
  await expect(link).toHaveJSProperty('tagName', 'A');
  await expect(link).toHaveAttribute('href', /^#\//);
}

/**
 * 关键链接可新标签打开，对齐现有 React Router `<Link>`（真实 `#/` href，不设 target）。
 * Headless 对 hash 链接的 Ctrl+点击不会发出 popup，但也不会改当前页；target=_blank 则打开新标签。
 */
async function expectOpensInNewTab(page: Page, link: Locator) {
  await expect(link).toBeVisible();
  await expectRealAnchor(link);
  const href = (await link.getAttribute('href')) ?? '';
  const before = page.url();
  if ((await link.getAttribute('target')) === '_blank') {
    const popup = page.waitForEvent('popup');
    await link.click();
    const tab = await popup;
    await expect(tab).toHaveURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await expect(page).toHaveURL(before);
    await tab.close();
    return;
  }
  await link.click({ modifiers: ['Control'] });
  await expect(page).toHaveURL(before);
}

async function clickLink(link: Locator) {
  await expect(link).toBeVisible();
  await link.click();
}

async function expectNoEmoji(root: Locator) {
  await expect(root).toBeVisible();
  expect(await root.innerText()).not.toMatch(EMOJI);
  const icons = root.locator('svg');
  const count = await icons.count();
  for (let i = 0; i < count; i++) await expect(icons.nth(i)).toHaveClass(/lucide/);
}

async function expectNotClipped(loc: Locator) {
  await expect(loc).toBeVisible();
  const box = await loc.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el);
    const lines = [...range.getClientRects()];
    return {
      offLeft: rect.left < -1,
      offRight: rect.right > window.innerWidth + 1,
      textClipped: lines.some((line) => line.left < rect.left - 1 || line.right > rect.right + 1),
    };
  });
  expect(box).toEqual({ offLeft: false, offRight: false, textClipped: false });
}

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function pickCiv(page: Page, id: string, civ: string) {
  await page.locator(`#${id}`).click();
  await page.locator(`.cp-panel [data-civ="${civ}"]`).click();
  await expect(page.locator(`#${id}`)).toHaveAttribute('data-value', civ);
}

async function openMatchup(page: Page, route = PAIR) {
  await page.goto(route);
  await expect(page.locator('#mres')).toBeVisible();
}

function civTitleLink(title: Locator, zh: string) {
  return title.getByRole('link', { name: new RegExp(zh) });
}

function sideBuildLink(root: Locator, zh: string) {
  return root.getByRole('link', { name: new RegExp(`${zh}\\s*开局`) });
}

function matchupChips(page: Page) {
  return page.getByRole('navigation').filter({ has: page.getByRole('link', { name: '单位 PK', exact: true }) });
}

function civHeading(page: Page) {
  return page.getByRole('heading').filter({ hasText: '蒙古' }).filter({ hasText: '中国' });
}

function contextBar(page: Page) {
  return page.getByRole('navigation').filter({ has: page.getByRole('link', { name: '回对局助手', exact: true }) });
}

async function expectCurrentCivLink(page: Page, zh: string, en: string) {
  const links = page.getByRole('link', { name: zh, exact: true });
  const count = await links.count();
  let found = 0;
  for (let i = 0; i < count; i++) {
    const link = links.nth(i);
    const listed = await link.evaluate((el) => !!el.closest('.build-applicability, [data-t="bo-civ"]'));
    if (listed) continue;
    found += 1;
    expectQuery(await link.getAttribute('href'), new RegExp(`^#/civ/${en}$`), {});
    await expectRealAnchor(link);
  }
  expect(found, `「${zh}」应有当前文明名链接，适用文明名单里的旧链接不算`).toBeGreaterThan(0);
}

async function expectBack(page: Page, me: string, opp: string) {
  const back = page.getByRole('link', { name: '回对局助手', exact: true });
  await expect(back).toBeVisible();
  expectQuery(await back.getAttribute('href'), /^#\/matchup\?/, { me, opp });
  await expectRealAnchor(back);
  return back;
}

async function expectBuildsPage(page: Page) {
  await expect(page.locator('#builds, [aria-label="开局适用文明"]').first()).toBeVisible();
}

async function expectMatchupPair(page: Page, me: string, opp: string) {
  await expect(page.locator('#mres')).toBeVisible();
  expectQuery(page.url(), /#\/matchup\?/, { me, opp });
  await expect(page.locator('#ma')).toHaveAttribute('data-value', me);
  await expect(page.locator('#me')).toHaveAttribute('data-value', opp);
}

test('#520 刷新后 #/matchup?me=Mongols&opp=Chinese 双方选择与 URL 一致', async ({ page }) => {
  await openMatchup(page);
  await expect(page.locator('#ma')).toHaveAttribute('data-value', 'Mongols');
  await expect(page.locator('#me')).toHaveAttribute('data-value', 'Chinese');
  expectQuery(page.url(), /#\/matchup\?/, { me: 'Mongols', opp: 'Chinese' });
  await page.reload();
  await expectMatchupPair(page, 'Mongols', 'Chinese');
});

test('#520 更改 CivPicker 后地址栏 me/opp 同步，刷新仍可分享', async ({ page }) => {
  await openMatchup(page, './#/matchup');
  await pickCiv(page, 'ma', 'Mongols');
  await expect.poll(() => hashParams(page.url()).get('me')).toBe('Mongols');
  await pickCiv(page, 'me', 'Chinese');
  await expect.poll(() => hashParams(page.url()).get('me')).toBe('Mongols');
  await expect.poll(() => hashParams(page.url()).get('opp')).toBe('Chinese');
  await page.reload();
  await expectMatchupPair(page, 'Mongols', 'Chinese');
});

test('#520 标题「蒙古」「中国」是指向文明页的真链接', async ({ page }) => {
  await openMatchup(page);
  const title = civHeading(page);
  const mongols = civTitleLink(title, '蒙古');
  const chinese = civTitleLink(title, '中国');
  await expect(mongols).toBeVisible();
  await expect(chinese).toBeVisible();
  expectQuery(await mongols.getAttribute('href'), /^#\/civ\/Mongols$/, {});
  expectQuery(await chinese.getAttribute('href'), /^#\/civ\/Chinese$/, {});
  await expectRealAnchor(mongols);
  await expectRealAnchor(chinese);
  await expect(title.getByRole('link', { name: 'vs', exact: true })).toHaveCount(0);
});

test('#520 情境 chips、开局参数与推荐单位链', async ({ page }) => {
  await openMatchup(page);
  const chips = matchupChips(page);
  const chip = (name: string) => chips.getByRole('link', { name, exact: true });
  for (const name of ['单位 PK', '我方开局', '对手开局', '我方文明', '对手文明']) await expect(chip(name)).toBeVisible();

  const pk = await chip('单位 PK').getAttribute('href');
  expectQuery(pk, /^#\/duel\?/, {});
  expect(
    hashParams(pk ?? '')
      .get('a')
      ?.split('.')[1],
  ).toBe('Mongols');
  expect(
    hashParams(pk ?? '')
      .get('b')
      ?.split('.')[1],
  ).toBe('Chinese');

  expectQuery(await chip('我方开局').getAttribute('href'), /^#\/builds\?/, {
    civ: 'Mongols',
    from: 'matchup',
    opp: 'Chinese',
    me: null,
  });
  expectQuery(await chip('对手开局').getAttribute('href'), /^#\/builds\?/, {
    civ: 'Chinese',
    from: 'matchup',
    me: 'Mongols',
    opp: null,
  });
  expectQuery(await chip('我方文明').getAttribute('href'), /^#\/civ\/Mongols$/, {});
  expectQuery(await chip('对手文明').getAttribute('href'), /^#\/civ\/Chinese$/, {});
  await expect(page.getByText(SHARE_HINT, { exact: true })).toBeVisible();

  const counters = page.locator('a.matchup-counter-link');
  await expect(counters.first()).toBeVisible();
  const total = await counters.count();
  for (let i = 0; i < total; i++) {
    expectQuery(await counters.nth(i).getAttribute('href'), /^#\/unit\/\d+\?/, {
      civ: 'Mongols',
      from: 'matchup',
      me: 'Mongols',
      opp: 'Chinese',
    });
  }
  await expectNoEmoji(chips);
});

test('#520 #/duel 回对局助手还原 me/opp，双方文明与开局可进', async ({ page }) => {
  await page.goto(DUEL);
  await expect(page.getByRole('radiogroup', { name: '模式' })).toBeVisible();
  const bar = contextBar(page);
  const back = await expectBack(page, 'Mongols', 'Chinese');
  await expect(back.locator('svg.lucide-arrow-left')).toHaveCount(1);
  const mongols = bar.getByRole('link', { name: '蒙古', exact: true });
  const chinese = bar.getByRole('link', { name: '中国', exact: true });
  const allyOpen = sideBuildLink(bar, '蒙古');
  const oppOpen = sideBuildLink(bar, '中国');
  await expect(mongols).toBeVisible();
  await expect(chinese).toBeVisible();
  await expect(allyOpen).toBeVisible();
  await expect(oppOpen).toBeVisible();
  expectQuery(await mongols.getAttribute('href'), /^#\/civ\/Mongols$/, {});
  expectQuery(await chinese.getAttribute('href'), /^#\/civ\/Chinese$/, {});
  expectQuery(await allyOpen.getAttribute('href'), /^#\/builds\?/, { civ: 'Mongols', from: 'duel' });
  expectQuery(await oppOpen.getAttribute('href'), /^#\/builds\?/, { civ: 'Chinese', from: 'duel' });
  await expectNoEmoji(bar);

  await clickLink(allyOpen);
  await expect(page.locator('#builds, [aria-label="开局适用文明"]').first()).toBeVisible();
  expectQuery(page.url(), /#\/builds\?/, { civ: 'Mongols', from: 'duel' });
  await page.goto(DUEL);
  await expect(page.getByRole('radiogroup', { name: '模式' })).toBeVisible();
  await clickLink(sideBuildLink(contextBar(page), '中国'));
  expectQuery(page.url(), /#\/builds\?/, { civ: 'Chinese', from: 'duel' });

  await page.goto(DUEL);
  await expect(page.getByRole('radiogroup', { name: '模式' })).toBeVisible();
  await clickLink(contextBar(page).getByRole('link', { name: '蒙古', exact: true }));
  await expect(page).toHaveURL(/#\/civ\/Mongols$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('蒙古');

  await page.goto(DUEL);
  await expect(page.getByRole('radiogroup', { name: '模式' })).toBeVisible();
  await clickLink(contextBar(page).getByRole('link', { name: '回对局助手', exact: true }));
  await expectMatchupPair(page, 'Mongols', 'Chinese');
});

test('#520 #/builds 文明名回文明页，from=matchup 回助手，查看全部开局保留 civ', async ({ page }) => {
  await page.goto(ALLY_BUILDS);
  await expect(page.locator('#builds')).toBeVisible();
  await expectCurrentCivLink(page, '蒙古', 'Mongols');
  const allyBack = await expectBack(page, 'Mongols', 'Chinese');
  await expectNoEmoji(contextBar(page));
  await clickLink(allyBack);
  await expectMatchupPair(page, 'Mongols', 'Chinese');

  await page.goto(OPP_BUILDS);
  await expect(page.locator('#builds')).toBeVisible();
  await expectCurrentCivLink(page, '中国', 'Chinese');
  const oppBack = await expectBack(page, 'Mongols', 'Chinese');
  await clickLink(oppBack);
  await expectMatchupPair(page, 'Mongols', 'Chinese');

  await page.goto('./#/builds?bo=scouts-18&civ=Mongols&from=matchup&opp=Chinese');
  await expect(page.getByRole('region', { name: '开局适用文明' })).toBeVisible();
  await expectCurrentCivLink(page, '蒙古', 'Mongols');
  await expectBack(page, 'Mongols', 'Chinese');
  const allBuilds = page.getByRole('link', { name: '查看全部开局', exact: true });
  await expect(allBuilds).toBeVisible();
  expectQuery(await allBuilds.getAttribute('href'), /^#\/builds\?/, {
    civ: 'Mongols',
    bo: null,
  });
});

test('#520 未知 me/opp 不崩溃，并有 muted 提示', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./#/matchup?me=NotACiv&opp=AlsoFake');
  await expect(page.locator('#mres')).toBeVisible();
  expect(errors).toEqual([]);
  const hint = page.locator('.note').getByText(INVALID_NOTE, { exact: true });
  await expect(hint).toBeVisible();
  await expect(page.locator('#ma')).not.toHaveAttribute('data-value', 'NotACiv');
  await expect(page.locator('#me')).not.toHaveAttribute('data-value', 'AlsoFake');
  const hintBox = await hint.boundingBox();
  const resultsBox = await page.locator('#mres').boundingBox();
  expect(hintBox && resultsBox && hintBox.y < resultsBox.y).toBe(true);
  await page.reload();
  await expect(page.locator('#mres')).toBeVisible();
  await expect(hint).toBeVisible();
  expect(errors).toEqual([]);

  await page.goto('./#/matchup?me=Mongols&opp=NotACiv');
  await expect(page.locator('#mres')).toBeVisible();
  await expect(page.locator('#ma')).toHaveAttribute('data-value', 'Mongols');
  await expect(page.locator('#me')).not.toHaveAttribute('data-value', 'NotACiv');
  await expect(hint).toBeVisible();
  expect(errors).toEqual([]);
});

test('#520 新界面无 emoji，关键链接可用新标签打开', async ({ page }) => {
  await openMatchup(page);
  const chips = matchupChips(page);
  await expectNoEmoji(chips);
  await expectNoEmoji(civHeading(page));
  await expectOpensInNewTab(page, civTitleLink(civHeading(page), '蒙古'));
  await expectOpensInNewTab(page, chips.getByRole('link', { name: '我方文明', exact: true }));

  await page.goto(DUEL);
  await expect(page.getByRole('radiogroup', { name: '模式' })).toBeVisible();
  const bar = contextBar(page);
  await expectNoEmoji(bar);
  await expectOpensInNewTab(page, bar.getByRole('link', { name: '回对局助手', exact: true }));

  await page.goto('./#/builds?bo=scouts-18&civ=Mongols&from=matchup&opp=Chinese');
  await expectNoEmoji(contextBar(page));
  await expectOpensInNewTab(page, page.getByRole('link', { name: '查看全部开局', exact: true }));
});

for (const width of [390, 1280])
  test(`#520 @${width}：情境 chips 可换行，主操作不被水平裁切`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openMatchup(page);
    const chips = matchupChips(page);
    for (const name of ['单位 PK', '我方开局', '对手开局', '我方文明', '对手文明']) await expectNotClipped(chips.getByRole('link', { name, exact: true }));
    const title = civHeading(page);
    await expectNotClipped(civTitleLink(title, '蒙古'));
    await expectNotClipped(civTitleLink(title, '中国'));
    const chipBox = await chips.boundingBox();
    const titleBox = await title.boundingBox();
    expect(chipBox && titleBox && chipBox.y > titleBox.y).toBe(true);
    await noHorizontalScroll(page);

    await page.goto(DUEL);
    await expect(page.getByRole('radiogroup', { name: '模式' })).toBeVisible();
    const bar = contextBar(page);
    for (const link of [
      bar.getByRole('link', { name: '回对局助手', exact: true }),
      bar.getByRole('link', { name: '蒙古', exact: true }),
      bar.getByRole('link', { name: '中国', exact: true }),
      sideBuildLink(bar, '蒙古'),
      sideBuildLink(bar, '中国'),
    ])
      await expectNotClipped(link);
    await noHorizontalScroll(page);

    await page.goto(ALLY_BUILDS);
    await expect(page.locator('#builds')).toBeVisible();
    const buildsBar = contextBar(page);
    await expectNotClipped(buildsBar.getByRole('link', { name: '回对局助手', exact: true }));
    await expectNotClipped(buildsBar.getByRole('link', { name: '蒙古', exact: true }));
    await page.goto('./#/builds?bo=scouts-18&civ=Mongols&from=matchup&opp=Chinese');
    await expectNotClipped(page.getByRole('link', { name: '查看全部开局', exact: true }));
    await expectNotClipped(page.getByRole('link', { name: '回对局助手', exact: true }));
    await noHorizontalScroll(page);
  });

test('#520 往返保持 me/opp，开局页保持 civ', async ({ page }) => {
  await openMatchup(page);
  await clickLink(matchupChips(page).getByRole('link', { name: '我方开局', exact: true }));
  await expectBuildsPage(page);
  expectQuery(page.url(), /#\/builds\?/, { civ: 'Mongols', from: 'matchup', opp: 'Chinese', me: null });
  await clickLink(page.getByRole('link', { name: '回对局助手', exact: true }));
  await expectMatchupPair(page, 'Mongols', 'Chinese');

  await clickLink(matchupChips(page).getByRole('link', { name: '对手开局', exact: true }));
  await expectBuildsPage(page);
  expectQuery(page.url(), /#\/builds\?/, { civ: 'Chinese', from: 'matchup', me: 'Mongols', opp: null });
  await clickLink(page.getByRole('link', { name: '回对局助手', exact: true }));
  await expectMatchupPair(page, 'Mongols', 'Chinese');

  await clickLink(matchupChips(page).getByRole('link', { name: '单位 PK', exact: true }));
  await expect(page.getByRole('radiogroup', { name: '模式' })).toBeVisible();
  const duel = hashParams(page.url());
  expect(duel.get('a')?.split('.')[1]).toBe('Mongols');
  expect(duel.get('b')?.split('.')[1]).toBe('Chinese');
  await clickLink(page.getByRole('link', { name: '回对局助手', exact: true }));
  await expectMatchupPair(page, 'Mongols', 'Chinese');
});
