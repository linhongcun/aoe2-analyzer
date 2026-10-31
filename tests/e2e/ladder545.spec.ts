// #545 失败验收（路径 2）。不实现页面。当前 main 仍露出五档空 Elo 芯片和「分段胜率」，这些用例应红，直到实现 PR。
// 规格：docs/design/ladder-545/ladder-545.md §6。只覆盖当前快照「仅 all 有文明」能核对的视觉 AC。不做 360×主题矩阵。
// 快照一旦给其它 key 写入非空 civs，本文件会在收集阶段直接失败：那时应改测 radiogroup 回归，不要沿用只读 pill。不造这份数据。
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { DISPLAY_BRACKETS, formatPercent, viewBracket, type LadderSnapshot } from '../../src/domain/ladder';

const snapshot = JSON.parse(readFileSync('src/data/ladder-arabia-p162286.json', 'utf8')) as LadderSnapshot;
const all = snapshot.brackets.find((bracket) => bracket.key === 'all');
const romans = all?.civs.find((civ) => civ.en === 'Romans');
const franks = all?.civs.find((civ) => civ.en === 'Franks');
const visible = DISPLAY_BRACKETS.filter((item) => !viewBracket(snapshot, item.key).empty);
const hidden = DISPLAY_BRACKETS.filter((item) => viewBracket(snapshot, item.key).empty);
if (!all || !romans || !franks || visible.length !== 1 || visible[0]?.key !== 'all' || hidden.length === 0) {
  throw new Error('本文件只锁定「当前快照仅 all 有数据」的只读 pill。其它分段有文明后，应改测 radiogroup 回归（设计 §6），不要假装仍为空。');
}

const ENTRY_DESC = '阿拉伯 1v1 胜率、出场率与新手友好度';
const PAGE_DESC = `${ENTRY_DESC}。`;
const META_DESC = '查看阿拉伯 1v1 随机地图各文明的胜率、出场率与样本局数。';
const EMOJI = /\p{Extended_Pictographic}/u;
const soon = expect.configure({ timeout: 2_000, soft: true });

function hashLocation(url: string) {
  const hash = new URL(url).hash;
  const queryAt = hash.indexOf('?');
  const path = (queryAt === -1 ? hash : hash.slice(0, queryAt)).replace(/^#/, '');
  const elo = new URLSearchParams(queryAt === -1 ? '' : hash.slice(queryAt + 1)).get('elo');
  return { path, elo };
}

async function expectSettled(page: Page) {
  await expect(page.getByTestId('ladder-page')).toBeVisible();
  await expect(page.getByTestId('ladder-table').or(page.getByTestId('ladder-empty'))).toBeVisible();
}

async function expectCanonicalAll(page: Page) {
  await soon.poll(() => hashLocation(page.url())).toEqual({ path: '/ladder', elo: null });
}

async function expectNoEloChrome(page: Page) {
  const keys = await page.locator('[data-elo]').evaluateAll((els) => els.map((el) => el.getAttribute('data-elo')));
  const leaked = hidden.map((item) => item.key).filter((key) => keys.includes(key));
  soon(leaked, 'lt850 / 850-1000 / 1000-1200 / 1200+ / 1900+ 不应再有芯片').toEqual([]);
  soon(await page.getByTestId('ladder-bracket').count(), '不应再渲染 ladder-bracket').toBe(0);
  soon(await page.getByTestId('ladder-page').getByRole('radiogroup').count(), '可见分段少于 2 时不要 radiogroup').toBe(0);
  soon(await page.getByTestId('ladder-page').getByRole('radio').count()).toBe(0);
  soon(await page.getByTestId('ladder-page').innerText()).not.toContain('天梯分段（Elo）');
}

async function expectStaticAllPill(page: Page) {
  const pill = page.getByTestId('ladder-context').getByTestId('ladder-elo-static');
  const count = await pill.count();
  soon(count, '上下文行应有只读 pill ladder-elo-static').toBe(1);
  if (count !== 1) return;
  const text = ((await pill.textContent()) ?? '').replace(/\s+/g, '');
  soon(text).toContain('天梯分段');
  soon(text).toContain('全部');
  soon(text).toContain('当前快照');
  const nw = pill.locator('.nw');
  const fixed = pill.locator('.ladder-fixed');
  soon(await nw.count(), '「全部」放在 .nw 里，避免数字折行').toBe(1);
  soon(await fixed.count(), '「当前快照」与地图「固定」同一 muted 写法').toBe(1);
  if ((await nw.count()) === 1) soon(((await nw.textContent()) ?? '').trim()).toBe('全部');
  if ((await fixed.count()) === 1) soon(((await fixed.textContent()) ?? '').trim()).toBe('当前快照');
  const tag = await pill.evaluate((el) => el.tagName);
  soon(tag).toBe('SPAN');
  soon(await pill.locator('button').count()).toBe(0);
  const insideButton = await pill.evaluate((el) => Boolean(el.closest('button')));
  soon(insideButton).toBe(false);
  const role = await pill.getAttribute('role');
  soon(role === 'radio' || role === 'button').toBe(false);
  soon(await pill.getAttribute('aria-checked')).toBeNull();
  soon((await pill.getAttribute('class')) ?? '').toMatch(/ladder-pill/);
  soon((await pill.getAttribute('class')) ?? '').not.toMatch(/ladder-bracket/);
  const paint = await pill.evaluate((el) => {
    const read = (name: string) => {
      const probe = document.createElement('span');
      probe.style.backgroundColor = `var(${name})`;
      el.append(probe);
      const value = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return value;
    };
    const style = getComputedStyle(el);
    return {
      background: style.backgroundColor,
      surface2: read('--color-surface-2'),
      accentSoft: read('--color-accent-soft'),
      borderWidth: Number.parseFloat(style.borderTopWidth),
      border: style.borderTopColor,
      accent: read('--color-accent'),
    };
  });
  soon(paint.background, '只读 pill 用 surface-2，不要选中芯片的 accent 底').toBe(paint.surface2);
  soon(paint.background).not.toBe(paint.accentSoft);
  if (paint.borderWidth > 0) soon(paint.border, '只读 pill 不要 accent 描边').not.toBe(paint.accent);
}

async function expectAllTable(page: Page) {
  soon(await page.getByTestId('ladder-empty').count(), '主区应是全部文明表，不是空态').toBe(0);
  const table = page.getByTestId('ladder-table');
  soon(await table.count()).toBe(1);
  if ((await table.count()) !== 1) return;
  soon(await page.locator('[data-testid^="ladder-row-"]').count()).toBe(all?.civs.length ?? 0);
  soon(((await table.locator('caption').textContent()) ?? '').replace(/\s+/g, '')).toContain('阿拉伯1v1全部');
  const romansRow = page.getByTestId('ladder-row-Romans');
  const franksRow = page.getByTestId('ladder-row-Franks');
  soon(await romansRow.count()).toBe(1);
  soon(await franksRow.count()).toBe(1);
  if ((await romansRow.count()) === 1) soon((await romansRow.innerText()).replace(/\s+/g, '')).toContain(formatPercent(romans?.winRate ?? Number.NaN));
  if ((await franksRow.count()) === 1) soon((await franksRow.innerText()).replace(/\s+/g, '')).toContain(formatPercent(franks?.winRate ?? Number.NaN));
}

test('#545 当前快照打开 #/ladder：没有空分段芯片，只读 pill，主表是全部', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => void (message.type() === 'error' && errors.push(message.text())));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/ladder');
  await expectSettled(page);
  await expectNoEloChrome(page);
  await expectStaticAllPill(page);
  await expectAllTable(page);
  await expectCanonicalAll(page);
  soon(await page.getByTestId('ladder-fallback-toast').count()).toBe(0);
  soon(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '1280 无横向滚动').toBe(true);
  const root = page.getByTestId('ladder-page');
  soon(await root.innerText()).not.toMatch(EMOJI);
  const icons = root.locator('svg');
  const iconCount = await icons.count();
  soon(iconCount).toBeGreaterThan(0);
  for (let i = 0; i < iconCount; i++) await soon(icons.nth(i)).toHaveClass(/lucide/);
  soon(errors).toEqual([]);
});

test('#545 五个空分段深链回落全部，toast 写出显示名、暂无数据、全部', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const item of hidden) {
    await page.goto(`./#/ladder?elo=${encodeURIComponent(item.key)}`);
    await expectSettled(page);
    await expectCanonicalAll(page);
    const toast = page.getByTestId('ladder-fallback-toast');
    const shown = await toast.isVisible();
    soon(shown, `${item.key} 应出现 ladder-fallback-toast`).toBe(true);
    if (shown) {
      await soon(toast).toHaveAttribute('role', 'status');
      await soon(toast).toHaveText(`「${item.label}」暂无数据，已显示「全部」。`);
    }
    await expectNoEloChrome(page);
    await expectStaticAllPill(page);
    await expectAllTable(page);
  }
});

test('#545 未识别分段仍提示未识别，地址去掉 elo，页面是只读全部', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/ladder?elo=not-a-bracket');
  await expectSettled(page);
  const toast = page.getByTestId('ladder-fallback-toast');
  await soon(toast).toBeVisible();
  await soon(toast).toHaveAttribute('role', 'status');
  await soon(toast).toHaveText('未识别的分段「not-a-bracket」，已显示「全部」。');
  await expectCanonicalAll(page);
  await expectNoEloChrome(page);
  await expectStaticAllPill(page);
  await expectAllTable(page);
});

test('#545 无参数、空 elo、elo=all 不提示，地址没有 elo', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const url of ['./#/ladder', './#/ladder?elo=', './#/ladder?elo=all']) {
    await page.goto(url);
    await expectSettled(page);
    soon(await page.getByTestId('ladder-fallback-toast').count(), url).toBe(0);
    await expectCanonicalAll(page);
    await expectNoEloChrome(page);
    await expectStaticAllPill(page);
    await expectAllTable(page);
  }
});

test('#545 首页资料卡和工具菜单不再写分段胜率', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/');
  await expect(page.locator('#home')).toBeVisible();
  const home = page.locator('#home section[aria-labelledby="home-reference"] a[data-k="ladder"]');
  await page.getByRole('button', { name: '工具', exact: true }).click();
  const tools = page.locator('#tools-menu section[aria-labelledby="tools-reference"] a[data-t="ladder"]');
  await expect(home).toBeVisible();
  await expect(tools).toBeVisible();
  const homeText = ((await home.textContent()) ?? '').replace(/\s+/g, '');
  // 工具菜单条目只渲染 label。整份菜单（含隐藏文本）仍不得出现「分段胜率」。
  const menuText = ((await page.locator('#tools-menu').textContent()) ?? '').replace(/\s+/g, '');
  expect({
    homeHasOld: homeText.includes('分段胜率'),
    menuHasOld: menuText.includes('分段胜率'),
    homeDesc: homeText.includes(ENTRY_DESC.replace(/\s+/g, '')),
    toolsLabel: ((await tools.textContent()) ?? '').includes('天梯数据'),
  }).toEqual({ homeHasOld: false, menuHasOld: false, homeDesc: true, toolsLabel: true });
});

test('#545 页内说明和分享描述去掉分段胜率，标题仍是天梯数据', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/ladder');
  await expect(page.getByRole('heading', { level: 1, name: /天梯数据/ })).toBeVisible();
  await expect(page.locator('.ladder-desc')).toBeVisible();
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /阿拉伯 1v1/);
  soon((await page.locator('.ladder-desc').innerText()).trim()).toBe(PAGE_DESC);
  soon(await page.locator('meta[name="description"]').getAttribute('content')).toBe(META_DESC);
  soon(await page.locator('meta[property="og:description"]').getAttribute('content')).toBe(META_DESC);
});

test('#545 空态组件仍在，默认页和空分段深链都到不了', async ({ page }) => {
  const source = readFileSync('src/features/ladder/Ladder.tsx', 'utf8');
  expect(source).toContain('data-testid="ladder-empty"');
  expect(source).toContain('这个分段暂无数据');
  expect(source).toContain('不推算');
  expect(source).toContain('不补数');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/ladder');
  await expectSettled(page);
  soon(await page.getByTestId('ladder-empty').count(), '#/ladder').toBe(0);
  await page.goto('./#/ladder?elo=lt850');
  await expectSettled(page);
  soon(await page.getByTestId('ladder-empty').count(), '#/ladder?elo=lt850').toBe(0);
});
