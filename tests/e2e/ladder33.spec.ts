// #33 文明强度 `#/ladder`：失败验收（Kent）。只编码 #535 @ 64f2631 已通过的设计 AC，不实现页面。
// 当前 main 上 `#/ladder` 仍是规划中占位（Planned），这些用例应红。不要改期望去凑绿，也不要改 tests/**/v0*-acceptance*。
// 本文件不改 pageRegistry。入口会红，直到 ladder 去掉 status:'planned'、lane 改为 secondary、group 仍为 reference。
//
// 契约（docs/design/ladder-33/ladder-33.md 第 7、10 节 + Steve 锁定项）：
//   深链只认 elo。默认分段 key 为 all（无查询时地址不带 elo，或显式 elo=all）。sort / dir / civ 不进地址。
//   data-testid：ladder-page、ladder-context、ladder-bracket（每个分段一个，带 data-elo）、
//   ladder-source、ladder-patch-note、ladder-table、ladder-row-{En}、ladder-sort-{win|play|games|name|tier}、
//   ladder-tier-{En}、ladder-expand-{En}、ladder-reason-{En}、ladder-fallback-toast、ladder-share、ladder-footer。
//   排序键用规格第 7 节的 win|play|games|name|tier（线框里的 wr/pr/n/civ 只是示意）。
//   行上 data-games 为该分段样本局数（非负整数，来自快照）。games < 300 时该行样本格含「样本少」，否则不含。
//   ladder-page[data-patch-mismatch]="true"|"false"：仅 true 时显示补丁提示条，且不挡住主表。
// 不写死胜率、出场率、样本局数或 fetchedAt。真实 ladder-arabia-*.json 落地前，这些用例保持红色。
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const LOW_SAMPLE = 300;
const TIERS = ['易上手', '中等', '进阶', '待补'] as const;
const EMOJI = /\p{Extended_Pictographic}/u;
const RATE = /^\d+\.\d\s*%$/;

function hashParams(url: string): URLSearchParams {
  const hash = new URL(url).hash;
  const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  return new URLSearchParams(query);
}

function queryFlags(url: string) {
  const query = hashParams(url);
  return {
    elo: query.get('elo'),
    sort: query.get('sort'),
    dir: query.get('dir'),
    civ: query.get('civ'),
  };
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
  const group = page.getByRole('radiogroup', { name: /天梯分段/ });
  await expect(group).toBeVisible();
  await expect(page.getByTestId('ladder-table')).toBeVisible();
  await expect(page.getByRole('table', { name: /阿拉伯 1v1/ })).toBeVisible();
  return root;
}

async function brackets(page: Page) {
  const group = page.getByRole('radiogroup', { name: /天梯分段/ });
  const chips = group.getByTestId('ladder-bracket');
  const count = await chips.count();
  const items: { elo: string; label: string; checked: boolean }[] = [];
  for (let i = 0; i < count; i++) {
    const chip = chips.nth(i);
    items.push({
      elo: (await chip.getAttribute('data-elo')) ?? '',
      label: ((await chip.innerText()) ?? '').replace(/\s+/g, ' ').trim(),
      checked: (await chip.getAttribute('aria-checked')) === 'true',
    });
  }
  return { group, chips, items };
}

async function bracket(page: Page, elo: string): Promise<Locator> {
  const { chips, items } = await brackets(page);
  const index = items.findIndex((item) => item.elo === elo);
  expect(index, `分段 ${elo}`).toBeGreaterThanOrEqual(0);
  return chips.nth(index);
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
  await expect(home).toContainText('阿拉伯 1v1 分段胜率、出场率与新手友好度');
  await expect(home).not.toContainText('团战');
  await expect(home).not.toContainText('规划中');
  await expect(tools).toContainText('天梯数据');
  await tools.click();
  await expect(page).toHaveURL(/#\/ladder\/?(?:\?|$)/);
  await expectLadderPage(page);
});

test('#33 无查询时默认分段是 all，深链 ?elo= 能还原且不写入 sort/dir/civ', async ({ page }) => {
  await page.goto('./#/ladder');
  await expectLadderPage(page);
  const initial = await brackets(page);
  const elos = initial.items.map((item) => item.elo);
  expect(new Set(elos).size).toBe(elos.length);
  expect(elos).toContain('all');
  expect(elos.length).toBeGreaterThanOrEqual(3);
  expect(initial.items.find((item) => item.elo === 'all')?.label).toMatch(/全部/);
  expect(initial.items.filter((item) => item.checked).map((item) => item.elo)).toEqual(['all']);
  for (const item of initial.items) expect(item.label.length).toBeGreaterThan(0);
  const flags = queryFlags(page.url());
  expect(flags.elo === null || flags.elo === 'all').toBe(true);
  expect(flags.sort).toBeNull();
  expect(flags.dir).toBeNull();
  expect(flags.civ).toBeNull();

  await page.goto('./#/ladder?elo=all');
  await expectLadderPage(page);
  await expect(await bracket(page, 'all')).toHaveAttribute('aria-checked', 'true');

  const otherElo = initial.items.find((item) => item.elo !== 'all')?.elo ?? '';
  expect(otherElo).not.toBe('');
  const before = await page.evaluate(() => history.length);
  await (await bracket(page, otherElo)).click();
  await expect.poll(() => queryFlags(page.url())).toEqual({ elo: otherElo, sort: null, dir: null, civ: null });
  await expect(await bracket(page, otherElo)).toHaveAttribute('aria-checked', 'true');
  await expect(await bracket(page, 'all')).toHaveAttribute('aria-checked', 'false');
  expect(await page.evaluate(() => history.length)).toBe(before);
  await page.reload();
  await expect(await bracket(page, otherElo)).toHaveAttribute('aria-checked', 'true');
  expect(queryFlags(page.url())).toEqual({ elo: otherElo, sort: null, dir: null, civ: null });

  await page.goto(`./#/ladder?elo=${encodeURIComponent(otherElo)}`);
  await expectLadderPage(page);
  await expect(await bracket(page, otherElo)).toHaveAttribute('aria-checked', 'true');
  expect(queryFlags(page.url()).sort).toBeNull();
  expect(queryFlags(page.url()).dir).toBeNull();
  expect(queryFlags(page.url()).civ).toBeNull();
});

test('#33 非法 elo 回落全部，sort/dir/civ 不保留', async ({ page }) => {
  await page.goto('./#/ladder?elo=not-a-bracket&sort=win&dir=asc&civ=Franks');
  await expectLadderPage(page);
  const toast = page.getByTestId('ladder-fallback-toast');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText(/未识别的分段/);
  await expect(toast).toContainText('not-a-bracket');
  await expect(toast).toContainText('全部');
  await expect(await bracket(page, 'all')).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => queryFlags(page.url())).toEqual({ elo: null, sort: null, dir: null, civ: null });
});

test('#33 来源条披露 aoestats 与更新日期，补丁提示条只在版本不一致时出现，页面不请求 aoestats', async ({ page }) => {
  const hits: string[] = [];
  page.on('request', (request) => {
    if (/aoestats\.io/i.test(request.url())) hits.push(request.url());
  });
  await page.goto('./#/ladder');
  const root = await expectLadderPage(page);
  expect(hits).toEqual([]);
  const source = page.getByTestId('ladder-source');
  await expect(source).toBeVisible();
  const link = source.getByRole('link', { name: /aoestats/ });
  await expect(link).toHaveAttribute('href', /^https:\/\/aoestats\.io\/?$/);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);
  await expect(source).toContainText('外部');
  await expect(source).toContainText(/统计更新\s*\d{4}-\d{2}-\d{2}/);
  await expect(source).toContainText(/本分段样本/);
  await expect(source).toContainText('局');
  const footer = page.getByTestId('ladder-footer');
  await expect(footer).toContainText('aoestats');
  await expect(footer).toContainText(/统计更新\s*\d{4}-\d{2}-\d{2}/);
  await expect(footer).toContainText('静态快照');
  await expect(footer).toContainText('不实时抓取');
  await expect(footer).toContainText('不自建统计');
  await expect(footer).toContainText('胜率不是平衡建议');
  await expect(footer).toContainText('不是官方推荐');
  const mismatch = await root.getAttribute('data-patch-mismatch');
  expect(mismatch, 'ladder-page 要用 data-patch-mismatch 标明快照补丁是否不同于本站数据版本').toMatch(/^(true|false)$/);
  const note = page.getByTestId('ladder-patch-note');
  if (mismatch === 'true') {
    await expect(note).toBeVisible();
    await expect(note).toContainText('统计补丁');
    await expect(note).toContainText('数据版本');
    await expect(note).toContainText('胜率可能未反映最新平衡改动');
    await expect(page.getByTestId('ladder-table')).toBeVisible();
  } else {
    await expect(note).toHaveCount(0);
  }
  expect(hits).toEqual([]);
});

test('#33 主表默认按胜率降序，点击表头只改排序指示，不把 sort/dir/civ 写进地址', async ({ page }) => {
  await page.goto('./#/ladder');
  await expectLadderPage(page);
  await expect(sortHeader(page, 'win')).toHaveAttribute('aria-sort', 'descending');
  await expect(sortHeader(page, 'play')).toHaveAttribute('aria-sort', 'none');
  await expect(sortHeader(page, 'games')).toBeVisible();
  await expect(sortHeader(page, 'name')).toHaveAttribute('aria-sort', 'none');
  await expect(sortHeader(page, 'tier')).toHaveAttribute('aria-sort', 'none');
  const initial = await rowOrder(page);
  expect(initial.length).toBeGreaterThan(1);

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
  await page.goto('./#/ladder');
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

test('#33 样本局数低于 300 标「样本少」，不写死胜率或样本数字', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/ladder');
  await expectLadderPage(page);
  const { items } = await brackets(page);
  let sawRow = false;
  for (const item of items) {
    if (item.elo !== 'all') await (await bracket(page, item.elo)).click();
    if ((await page.getByTestId('ladder-empty').count()) > 0) {
      await expect(page.getByTestId('ladder-empty')).toContainText(/暂无数据/);
      await expect(page.getByTestId('ladder-empty')).toContainText(/不推算|不补数/);
      await expect(page.getByTestId('ladder-table')).toHaveCount(0);
      continue;
    }
    await expect(page.getByTestId('ladder-table')).toBeVisible();
    const gamesIndex = await columnIndex(page, /样本局数/);
    const winIndex = await columnIndex(page, /胜率/);
    const playIndex = await columnIndex(page, /出场率/);
    expect(gamesIndex).toBeGreaterThanOrEqual(0);
    expect(winIndex).toBeGreaterThanOrEqual(0);
    expect(playIndex).toBeGreaterThanOrEqual(0);
    const rows = page.locator('[data-testid^="ladder-row-"]');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    sawRow = true;
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const en = ((await row.getAttribute('data-testid')) ?? '').slice('ladder-row-'.length);
      const gamesAttr = await row.getAttribute('data-games');
      expect(gamesAttr, en).toMatch(/^\d+$/);
      const games = Number(gamesAttr);
      const sample = ((await row.getByRole('cell').nth(gamesIndex).innerText()) ?? '').replace(/[,\s]/g, '');
      expect(sample, en).toContain(String(games));
      if (games < LOW_SAMPLE) expect(sample, en).toContain('样本少');
      else expect(sample, en).not.toContain('样本少');
      const tier = ((await page.getByTestId(`ladder-tier-${en}`).innerText()) ?? '').trim();
      expect([...TIERS], en).toContain(tier);
      for (const [index, label] of [
        [winIndex, '胜率'],
        [playIndex, '出场率'],
      ] as const) {
        const text = await row
          .getByRole('cell')
          .nth(index)
          .evaluate((el) => {
            const target = el.matches('.num') ? el : el.querySelector('.num');
            return (target?.textContent ?? '').trim();
          });
        expect(text, `${en} ${label}`).toMatch(RATE);
      }
    }
  }
  expect(sawRow).toBe(true);
});

for (const width of [360, 375, 390, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`#33 ${theme} @${width} 无横向滚动、数字不折行、触控不小于 44`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/ladder');
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
            return {
              name: (el.getAttribute('aria-label') || labelled || el.textContent || el.tagName).replace(/\s+/g, ' ').trim(),
              width: rect.width,
              height: rect.height,
            };
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
