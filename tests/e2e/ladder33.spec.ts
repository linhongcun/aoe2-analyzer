// #33 `#/ladder` 阿拉伯 1v1 天梯。不改 pageRegistry / v0*-acceptance。
// #545 锁定当前快照只露出有数据的分段：不再要求六枚芯片、可点空态，以及首页「分段胜率」。那些断言改到 tests/e2e/ladder545.spec.ts，在实现前应红。
// 设计：docs/design/ladder-33/ladder-33.md；空芯片与入口文案：docs/design/ladder-545/ladder-545.md。
// 锚点来自 #536 `src/data/ladder-arabia-p162286.json` @ 98bbf11。winRate/playRate 已是百分数，界面固定两位小数（51.4 → 51.40%），不得再乘 100。
// testid：ladder-page/context/bracket(data-elo)/source/patch-note/table/row-{En}/sort-{win|play|games|name|tier}/tier/expand/reason-{En}/fallback-toast/share/footer/empty。data-games < 300 标「样本少」。
import { existsSync, readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const SNAPSHOT_PATH = 'src/data/ladder-arabia-p162286.json';
/** 锚点抄自 #536 @ 98bbf11 的快照，不是编出来的。文件还没进本分支时仍用这些常量；文件在时下面会核对。 */
const FETCHED_AT = '2026-07-12';
const PATCH_162286 = '162286';
const ALL_GAMES = 504189;
const CIV_COUNT = 48;
const FRANKS = { en: 'Franks', winRate: 51.4, playRate: 5.15, games: 51920 };
const ROMANS = { en: 'Romans', winRate: 54.04, playRate: 1.67, games: 16815 };
const ABSENT = ['Jurchens', 'Khitans'] as const;

type SnapCiv = { en: string; winRate: number; playRate: number; games: number };
if (existsSync(SNAPSHOT_PATH)) {
  const snap = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as {
    fetchedAt: string;
    patchNote: string;
    brackets: { key: string; games: number; civs: SnapCiv[] }[];
  };
  const all = snap.brackets.find((bracket) => bracket.key === 'all');
  const drifted =
    !all ||
    snap.brackets.length !== 1 ||
    snap.fetchedAt !== FETCHED_AT ||
    !snap.patchNote.includes(PATCH_162286) ||
    all.games !== ALL_GAMES ||
    all.civs.length !== CIV_COUNT;
  if (drifted) throw new Error(`${SNAPSHOT_PATH} 与 all 锚点不一致`);
  for (const anchor of [FRANKS, ROMANS]) {
    const civ = all?.civs.find((item) => item.en === anchor.en);
    if (civ?.winRate !== anchor.winRate || civ.playRate !== anchor.playRate || civ.games !== anchor.games) throw new Error(`${anchor.en} 与快照不一致`);
  }
  for (const en of ABSENT) if (all?.civs.some((civ) => civ.en === en)) throw new Error(`${en} 不应出现在 all 快照里`);
}

const LOW_SAMPLE = 300;
const TIERS = ['易上手', '中等', '进阶', '待补'] as const;
const EMOJI = /\p{Extended_Pictographic}/u;

function hashParams(url: string): URLSearchParams {
  const hash = new URL(url).hash;
  const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  return new URLSearchParams(query);
}

function queryFlags(url: string) {
  const query = hashParams(url);
  return { elo: query.get('elo'), sort: query.get('sort'), dir: query.get('dir'), civ: query.get('civ') };
}

/** 当前 main 会停在「该模块规划中」：还没有 data-testid=ladder-page。 */
async function expectLadderPage(page: Page) {
  await expect(page.getByRole('heading', { name: '天梯数据' }).first()).toBeVisible();
  expect(await page.getByRole('heading', { name: '该模块规划中', exact: true }).count(), '#/ladder 仍是规划中占位').toBe(0);
  expect(await page.getByRole('heading', { level: 1, name: '找不到该页', exact: true }).count(), '#/ladder 应是天梯数据页').toBe(0);
  const root = page.getByTestId('ladder-page');
  await expect(root).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: /天梯数据/ })).toBeVisible();
  const crumbs = page.getByRole('navigation', { name: '面包屑' });
  await expect(crumbs).toContainText('资料');
  await expect(crumbs).toContainText('天梯数据');
  await expect(root).toContainText(/阿拉伯/);
  await expect(root).toContainText(/1v1/);
  await expect(root).toContainText(/新手友好/);
  await expect(root).not.toContainText('该模块规划中');
  await expect(root).not.toContainText('团战');
  await expect(root).not.toContainText('示意');
  expect(await root.innerText()).not.toMatch(EMOJI);
  const icons = root.locator('svg');
  const iconCount = await icons.count();
  for (let i = 0; i < iconCount; i++) await expect(icons.nth(i)).toHaveClass(/lucide/);
  const context = page.getByTestId('ladder-context');
  await expect(context).toContainText('阿拉伯');
  await expect(context).toContainText('Arabia');
  await expect(context).toContainText(/1v1/);
  await expect(context).toContainText(/随机地图|RM/);
  await expect(context.getByRole('link')).toHaveCount(0);
  await expect(context.getByRole('button')).toHaveCount(0);
  await expect(context.getByRole('combobox')).toHaveCount(0);
  await expect(context.getByRole('radio')).toHaveCount(0);
  // 当前快照的 Elo 芯片 / 只读 pill 由 #545 验收。这里只要求主表还在。
  const table = page.getByTestId('ladder-table');
  await expect(table).toBeVisible();
  await expect(page.getByRole('table', { name: /阿拉伯 1v1/ })).toBeVisible();
  await expect(page.locator('[data-testid^="ladder-row-"]')).toHaveCount(CIV_COUNT);
  await expect(table).not.toContainText('5140');
  await expect(table).not.toContainText('5404');
  return root;
}

function shownPercent(text: string) {
  const match = text.replace(/\s+/g, '').match(/^(\d+\.\d{2})%$/);
  expect(match, `百分数原文「${text}」应为两位小数，且不应再乘 100`).not.toBeNull();
  return Number(match?.[1]);
}

async function cellPercent(row: Locator, index: number) {
  const text = await row
    .getByRole('cell')
    .nth(index)
    .evaluate((el) => {
      const target = el.matches('.num') ? el : el.querySelector('.num');
      return (target?.textContent ?? '').trim();
    });
  const value = shownPercent(text);
  expect(value).toBeGreaterThan(0);
  expect(value).toBeLessThanOrEqual(100);
  return value;
}

function sortButton(page: Page, key: string) {
  return page.getByTestId(`ladder-sort-${key}`);
}

function sortHeader(page: Page, key: string) {
  return sortButton(page, key).locator('xpath=ancestor::th[1]');
}

async function rowOrder(page: Page) {
  return page.locator('[data-testid^="ladder-row-"]').evaluateAll((els) => els.map((el) => el.getAttribute('data-testid') ?? ''));
}

async function columnIndex(page: Page, pattern: RegExp) {
  const headers = page.getByTestId('ladder-table').getByRole('columnheader');
  const count = await headers.count();
  for (let i = 0; i < count; i++) {
    if (pattern.test(((await headers.nth(i).innerText()) ?? '').replace(/\s+/g, ''))) return i;
  }
  return -1;
}

test('#33 #/ladder 不是规划中占位，资料分组的首页和工具菜单都有入口', async ({ page }) => {
  await page.goto('./#/ladder');
  await expect(page.getByRole('heading', { name: '天梯数据' }).first()).toBeVisible();
  const planned = await page.getByRole('heading', { name: '该模块规划中', exact: true }).count();
  const notFound = await page.getByRole('heading', { level: 1, name: '找不到该页', exact: true }).count();
  const feature = await page.getByTestId('ladder-page').count();
  await page.goto('./#/');
  await expect(page.locator('#home')).toBeVisible();
  const home = page.locator('#home section[aria-labelledby="home-reference"] a[data-k="ladder"]');
  await page.getByRole('button', { name: '工具', exact: true }).click();
  const menu = page.locator('#tools-menu');
  await expect(menu).toBeVisible();
  const tools = menu.locator('section[aria-labelledby="tools-reference"] a[data-t="ladder"]');
  expect({
    planned,
    notFound,
    feature,
    home: await home.count(),
    tools: await tools.count(),
  }).toEqual({ planned: 0, notFound: 0, feature: 1, home: 1, tools: 1 });
  await expect(home).toContainText('天梯数据');
  const homeText = ((await home.textContent()) ?? '').replace(/\s+/g, '');
  // #545：首页卡片改掉「分段胜率」。工具菜单只显示名称，整份菜单也不得再出现这句。
  const menuText = ((await menu.textContent()) ?? '').replace(/\s+/g, '');
  expect({
    homeHasOld: homeText.includes('分段胜率'),
    menuHasOld: menuText.includes('分段胜率'),
    homeDesc: homeText.includes('默认4v4随机地图胜率、出场率与走势'),
  }).toEqual({ homeHasOld: false, menuHasOld: false, homeDesc: true });
  await expect(home).not.toContainText('团战');
  await expect(home).not.toContainText('规划中');
  await expect(tools).toContainText('天梯数据');
  await tools.click();
  await expect(page).toHaveURL(/#\/ladder\/?(?:\?|$)/);
  await expect(page.getByTestId('ladder-mode-4v4')).toHaveAttribute('aria-checked', 'true');
});

test('#33 无查询是 4v4 默认切片；?elo=all 仍停在阿拉伯全部', async ({ page }) => {
  await page.goto('./#/ladder');
  await expect(page.getByTestId('ladder-page')).toBeVisible();
  await expect(page.getByTestId('ladder-mode-4v4')).toHaveAttribute('aria-checked', 'true');
  expect(queryFlags(page.url())).toEqual({ elo: null, sort: null, dir: null, civ: null });
  // #545：当前快照没有可切换的空分段，也不进入可点空态。
  await expect(page.getByRole('radiogroup', { name: /天梯分段/ })).toHaveCount(0);
  await expect(page.getByTestId('ladder-bracket')).toHaveCount(0);
  await expect(page.getByTestId('ladder-elo-static')).toBeVisible();
  await expect(page.getByTestId('ladder-empty')).toHaveCount(0);

  await page.goto('./#/ladder?elo=all');
  await expectLadderPage(page);
  expect(queryFlags(page.url())).toEqual({ elo: null, sort: null, dir: null, civ: null });
  await expect(page.getByTestId('ladder-empty')).toHaveCount(0);
  await expect(page.getByTestId('ladder-table')).toBeVisible();
});

test('#33 非法 elo 回落全部，sort/dir/civ 不保留', async ({ page }) => {
  await page.goto('./#/ladder?elo=not-a-bracket&sort=win&dir=asc&civ=Franks');
  await expectLadderPage(page);
  const toast = page.getByTestId('ladder-fallback-toast');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText(/未识别的分段/);
  await expect(toast).toContainText('not-a-bracket');
  await expect(toast).toContainText('全部');
  await expect.poll(() => queryFlags(page.url())).toEqual({ elo: null, sort: null, dir: null, civ: null });
  // #545：回落后是只读「全部」，不是一枚选中的 Elo 芯片，也不是空态。
  await expect(page.getByRole('radiogroup', { name: /天梯分段/ })).toHaveCount(0);
  await expect(page.getByTestId('ladder-elo-static')).toBeVisible();
  await expect(page.getByTestId('ladder-empty')).toHaveCount(0);
});

test('#33 来源条披露 aoestats 与更新日期，补丁提示条只在版本不一致时出现，页面不请求 aoestats', async ({ page }) => {
  const hits: string[] = [];
  page.on('request', (request) => {
    if (/aoestats\.io|web\.archive\.org/i.test(request.url())) hits.push(request.url());
  });
  await page.goto('./#/ladder?mode=arabia1v1');
  const root = await expectLadderPage(page);
  expect(hits).toEqual([]);
  const source = page.getByTestId('ladder-source');
  await expect(source).toBeVisible();
  const link = source.getByRole('link', { name: /aoestats/ });
  await expect(link).toHaveAttribute('href', /^https:\/\/aoestats\.io\/maps\/arabia\/?$/);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);
  await expect(source).toContainText('外部');
  await expect(source).toContainText(FETCHED_AT);
  await expect(source).toContainText('补丁');
  await expect(source).toContainText(PATCH_162286);
  await expect(source).toContainText('统计截止');
  await expect(source).not.toContainText(/wayback/i);
  await expect(source).not.toContainText('archive.org');
  await expect(source).not.toContainText('实时');
  await expect(root).not.toContainText(/wayback/i);
  await expect(root).not.toContainText('archive.org');
  await expect(source).toContainText(/本分段样本/);
  await expect(source).toContainText(/504[,，]?189/);
  await expect(source).toContainText('局');
  const footer = page.getByTestId('ladder-footer');
  await expect(footer).toContainText('aoestats');
  await expect(footer).toContainText(FETCHED_AT);
  await expect(footer).toContainText('静态快照');
  await expect(footer).toContainText('不实时抓取');
  await expect(footer).toContainText('不自建统计');
  await expect(footer).toContainText('胜率不是平衡建议');
  await expect(footer).toContainText('不是官方推荐');
  const sitePatch = String((JSON.parse(readFileSync('scripts/data_sources.json', 'utf8')) as { patch: { build: number } }).patch.build);
  const note = page.getByTestId('ladder-patch-note');
  const cutoff = page.getByTestId('ladder-cutoff');
  if (sitePatch === PATCH_162286) {
    await expect(note).toHaveCount(0);
    await expect(source).toHaveAttribute('data-cutoff', 'aligned');
    await expect(cutoff).toContainText('统计截止');
    await expect(cutoff).toContainText(FETCHED_AT);
    await expect(cutoff).toContainText('静态快照');
    await expect(cutoff).not.toContainText('非当前平衡');
  } else {
    expect(await root.getAttribute('data-patch-mismatch')).toBe('true');
    await expect(source).toHaveAttribute('data-cutoff', 'mismatch');
    await expect(cutoff).toContainText('非当前平衡');
    await expect(cutoff).toContainText('统计截止');
    await expect(cutoff).toContainText(FETCHED_AT);
    await expect(cutoff).toContainText(PATCH_162286);
    await expect(cutoff).toContainText('与本站 DE');
    await expect(cutoff).toContainText(sitePatch);
    await expect(note).toBeVisible();
    await expect(note).toContainText('胜率可能未反映最新平衡改动');
    await expect(note).not.toContainText(FETCHED_AT);
    await expect(note).not.toContainText(PATCH_162286);
    await expect(note).not.toContainText(sitePatch);
    await expect(page.getByTestId('ladder-table')).toBeVisible();
  }
  expect(hits).toEqual([]);
});

test('#33 主表默认按胜率降序，点击表头只改排序指示，不把 sort/dir/civ 写进地址', async ({ page }) => {
  await page.goto('./#/ladder?mode=arabia1v1');
  await expectLadderPage(page);
  await expect(sortHeader(page, 'win')).toHaveAttribute('aria-sort', 'descending');
  await expect(sortHeader(page, 'play')).toHaveAttribute('aria-sort', 'none');
  await expect(sortHeader(page, 'games')).toBeVisible();
  await expect(sortHeader(page, 'name')).toHaveAttribute('aria-sort', 'none');
  await expect(sortHeader(page, 'tier')).toHaveAttribute('aria-sort', 'none');
  const initial = await rowOrder(page);
  expect(initial).toHaveLength(CIV_COUNT);
  expect(initial[0]).toBe(`ladder-row-${ROMANS.en}`);

  await sortButton(page, 'play').click();
  await expect(sortHeader(page, 'play')).toHaveAttribute('aria-sort', 'descending');
  await expect(sortHeader(page, 'win')).toHaveAttribute('aria-sort', 'none');
  await sortButton(page, 'play').click();
  await expect(sortHeader(page, 'play')).toHaveAttribute('aria-sort', 'ascending');
  expect(queryFlags(page.url())).toEqual({ elo: null, sort: null, dir: null, civ: null });

  await sortButton(page, 'name').click();
  await expect(sortHeader(page, 'name')).toHaveAttribute('aria-sort', 'ascending');
  const ascending = await rowOrder(page);
  await sortButton(page, 'name').click();
  await expect(sortHeader(page, 'name')).toHaveAttribute('aria-sort', 'descending');
  const descending = await rowOrder(page);
  expect(descending).toEqual([...ascending].reverse());
  expect(queryFlags(page.url()).sort).toBeNull();
  expect(queryFlags(page.url()).dir).toBeNull();
  expect(queryFlags(page.url()).civ).toBeNull();
});

test('#33 行展开显示四档新手友好度，并链到加成与文明详情', async ({ page }) => {
  await page.goto('./#/ladder?mode=arabia1v1');
  const root = await expectLadderPage(page);
  await expect(page.getByTestId('ladder-share')).toBeVisible();
  const aside = root.locator('aside');
  for (const tier of TIERS) await expect(aside.getByText(tier, { exact: true }).first()).toBeVisible();
  const order = await rowOrder(page);
  expect(order.length).toBeGreaterThan(1);
  const ens = order.map((id) => id.slice('ladder-row-'.length));
  const first = ens[0] ?? '';
  const second = ens[1] ?? '';
  expect(first).not.toBe('');
  expect(second).not.toBe('');

  async function open(en: string) {
    const tier = ((await page.getByTestId(`ladder-tier-${en}`).innerText()) ?? '').trim();
    expect(TIERS, en).toContain(tier);
    const trigger = page.getByTestId(`ladder-expand-${en}`);
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const reason = page.getByTestId(`ladder-reason-${en}`);
    await expect(reason).toBeVisible();
    await expect(reason).toContainText(tier);
    await expect(reason).not.toContainText('官方推荐');
    if (tier === '待补') {
      await expect(reason).toContainText(/新手友好度理由还没写/);
      await expect(reason).toContainText(/不影响上面的胜率/);
    } else {
      await expect(reason).toContainText('编辑口径');
      await expect(reason).toContainText('不由胜率推导');
    }
    await expect(reason.getByRole('link', { name: /全部文明加成/ })).toHaveAttribute('href', /#\/bonuses\/?$/);
    await expect(reason.getByRole('link', { name: /文明详情/ })).toHaveAttribute('href', `#/civ/${en}`);
    const bonusLinks = reason.locator('a[href*="/bonus/"]');
    const bonusCount = await bonusLinks.count();
    for (let i = 0; i < bonusCount; i++) await expect(bonusLinks.nth(i)).toHaveAttribute('href', new RegExp(`^#/civ/${en}/bonus/\\d+$`));
    expect(queryFlags(page.url()).civ).toBeNull();
    return reason;
  }

  await open(first);
  await open(second);
  await expect(page.getByTestId(`ladder-reason-${first}`)).toBeHidden();
  await expect(page.getByTestId(`ladder-expand-${first}`)).toHaveAttribute('aria-expanded', 'false');
});

test('#33 all 分段对照快照原百分数，不乘 100；样本少于 300 才标样本少', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/ladder?elo=all');
  await expectLadderPage(page);
  const winIndex = await columnIndex(page, /胜率/);
  const playIndex = await columnIndex(page, /出场率/);
  const gamesIndex = await columnIndex(page, /样本局数/);
  expect(winIndex).toBeGreaterThanOrEqual(0);
  expect(playIndex).toBeGreaterThanOrEqual(0);
  expect(gamesIndex).toBeGreaterThanOrEqual(0);
  for (const anchor of [FRANKS, ROMANS]) {
    const row = page.getByTestId(`ladder-row-${anchor.en}`);
    await expect(row).toHaveAttribute('data-games', String(anchor.games));
    expect(await cellPercent(row, winIndex)).toBeCloseTo(anchor.winRate, 2);
    expect(await cellPercent(row, playIndex)).toBeCloseTo(anchor.playRate, 2);
    const sample = ((await row.getByRole('cell').nth(gamesIndex).innerText()) ?? '').replace(/[,，\s]/g, '');
    expect(sample).toContain(String(anchor.games));
    await expect(row).not.toContainText('样本少');
  }
  for (const en of ABSENT) await expect(page.getByTestId(`ladder-row-${en}`)).toHaveCount(0);
  const rows = page.locator('[data-testid^="ladder-row-"]');
  const count = await rows.count();
  expect(count).toBe(CIV_COUNT);
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const en = ((await row.getAttribute('data-testid')) ?? '').slice('ladder-row-'.length);
    const gamesAttr = await row.getAttribute('data-games');
    expect(gamesAttr, en).toMatch(/^\d+$/);
    const games = Number(gamesAttr);
    const sample = ((await row.getByRole('cell').nth(gamesIndex).innerText()) ?? '').replace(/[,，\s]/g, '');
    expect(sample, en).toContain(String(games));
    if (games < LOW_SAMPLE) expect(sample, en).toContain('样本少');
    else expect(sample, en).not.toContain('样本少');
    expect(await cellPercent(row, winIndex), en).toBeLessThanOrEqual(100);
    expect(await cellPercent(row, playIndex), en).toBeLessThanOrEqual(100);
    const tier = ((await page.getByTestId(`ladder-tier-${en}`).innerText()) ?? '').trim();
    expect([...TIERS], en).toContain(tier);
  }
});

for (const width of [360, 375, 390, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`#33 ${theme} @${width} 无横向滚动、数字不折行、触控不小于 44`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => void (message.type() === 'error' && errors.push(message.text())));
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/ladder?mode=arabia1v1');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const root = await expectLadderPage(page);
      if (width >= 960) {
        await expect(root.getByRole('heading', { level: 1 })).toContainText('Ladder Stats');
        await expect(root.getByRole('columnheader', { name: /样本局数/ })).toBeVisible();
      } else {
        await expect(root.getByRole('columnheader', { name: /样本局数/ })).toHaveCount(0);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const metrics = root.locator('.num');
      const metricCount = await metrics.count();
      expect(metricCount).toBeGreaterThan(0);
      for (let i = 0; i < metricCount; i++) {
        const lines = await metrics.nth(i).evaluate((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
        });
        expect(lines).toBeLessThanOrEqual(1);
      }
      const targets = await root.locator('button, input, select, [role="radio"], [role="checkbox"], [role="switch"]').evaluateAll((els) =>
        els
          .filter((el) => {
            const style = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
          })
          .map((el) => {
            const rect = el.getBoundingClientRect();
            const labelled = el instanceof HTMLInputElement || el instanceof HTMLSelectElement ? el.labels?.[0]?.textContent : '';
            const name = (el.getAttribute('aria-label') || labelled || el.textContent || el.tagName).replace(/\s+/g, ' ').trim();
            return { name, width: rect.width, height: rect.height };
          }),
      );
      expect(targets.length).toBeGreaterThan(0);
      for (const target of targets) {
        expect(target.width, target.name).toBeGreaterThanOrEqual(44);
        expect(target.height, target.name).toBeGreaterThanOrEqual(44);
      }
      if ((width === 1280 && theme === 'light') || (width === 360 && theme === 'dark')) {
        const violations = (await new AxeBuilder({ page }).include('[data-testid="ladder-page"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations;
        expect(violations).toEqual([]);
      }
      expect(errors).toEqual([]);
    });
  }
}
