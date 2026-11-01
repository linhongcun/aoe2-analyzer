// #571 失败验收。只编码模式 / Elo 筛选，不实现功能，不改快照，不改 CivDetail。
// 当前 main 应红：模式芯片能切表，但来源条不写模式和 Elo；Elo 仍是只读 pill；
// 无快照的组合会 toast 后继续展示另一档胜率。实现折入 #571 后应收绿，不要放宽断言，也不要单独合并这条红 PR。
// 自有切片只有两份：4v4 × 1200–1400，阿拉伯 1v1 × 全部。不画 2v2 / 3v3 / 帝国战争，不做地图多图快照。
// PC 1280。数字只从 src/data/ladder-*.json 读。不改 tests/**/v0*-acceptance*。
// #545 在「单份快照只有一档」时锁了只读 pill。本文件把两份快照里有文明的 Elo 当成可切换筛选；实现 PR 再对齐 #545，这里不动它。
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { formatGames, formatPercent, snapshotCutoff, type LadderCivStat, type LadderSnapshot } from '../../src/domain/ladder';

const team = JSON.parse(readFileSync('src/data/ladder-4v4-rm-e1200-1400-90d.json', 'utf8')) as LadderSnapshot;
const arabia = JSON.parse(readFileSync('src/data/ladder-arabia-p185872.json', 'utf8')) as LadderSnapshot;
const ELO_1200_1400 = /1200\s*(?:–|-)\s*1400/;
const LIVE_HOST = /aoestats\.io|ageofnotes\.com|aoe2scout\.com|web\.archive\.org/i;
const WIN_RATE = /\d+\.\d{2}%/;

function filledBracket(snapshot: LadderSnapshot, key: string) {
  const found = snapshot.brackets.find((item) => item.key === key && item.civs.length > 0);
  if (!found) throw new Error(`快照没有非空分段 ${key}`);
  return found;
}

function civOf(snapshot: LadderSnapshot, key: string, en: string): LadderCivStat {
  const found = filledBracket(snapshot, key).civs.find((item) => item.en === en);
  if (!found) throw new Error(`${key} 缺少 ${en}`);
  return found;
}

const teamBracket = filledBracket(team, '1200-1400');
const arabiaBracket = filledBracket(arabia, 'all');
const teamFranks = civOf(team, '1200-1400', 'Franks');
const arabiaFranks = civOf(arabia, 'all', 'Franks');
if (teamFranks.games === arabiaFranks.games || teamFranks.winRate === arabiaFranks.winRate || teamBracket.games === arabiaBracket.games) {
  throw new Error('两份自有快照的法兰克或样本量相同，切换断言分不出切片');
}
if (team.brackets.some((item) => item.key === 'lt850' && item.civs.length > 0)) throw new Error('4v4 已有 <850，无数据组合要换一档');
if (arabia.brackets.some((item) => item.key === '1200-1400' && item.civs.length > 0)) throw new Error('阿拉伯快照已有 1200-1400，无数据组合要换一档');

interface SliceView {
  mode: RegExp;
  elo: RegExp;
  snapshot: LadderSnapshot;
  sample: number;
  civ: LadderCivStat;
}

const teamSlice: SliceView = {
  mode: /4v4/,
  elo: ELO_1200_1400,
  snapshot: team,
  sample: teamBracket.games,
  civ: teamFranks,
};
const arabiaSlice: SliceView = {
  mode: /阿拉伯|1v1/,
  elo: /全部/,
  snapshot: arabia,
  sample: arabiaBracket.games,
  civ: arabiaFranks,
};

const pageErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  pageErrors.length = 0;
  page.on('pageerror', (error) => pageErrors.push(error.message));
});

test.afterEach(() => {
  expect(pageErrors, '天梯页不应有页面错误').toEqual([]);
});

async function openLadder(page: Page, hash = '/ladder') {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`./#${hash}`);
  await expect(page.getByTestId('ladder-page')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: /天梯数据/ })).toBeVisible();
}

function eloGroup(page: Page) {
  return page.getByTestId('ladder-page').getByRole('radiogroup', { name: /天梯分段/ });
}

function bandOption(page: Page, key: string, label: RegExp) {
  return page
    .locator(`[data-elo="${key}"]`)
    .or(page.getByRole('radio', { name: label }))
    .or(page.getByRole('option', { name: label }));
}

/** 表必须对上快照。来源条的模式 / Elo 用软断言，这样切换路径也会跑到，缺字仍让整条失败。 */
const sourceGap = expect.configure({ timeout: 1_000, soft: true });

async function expectOwnedSlice(page: Page, slice: SliceView) {
  const row = page.getByTestId(`ladder-row-${slice.civ.en}`);
  await expect(row).toHaveAttribute('data-games', String(slice.civ.games));
  await expect(row).toContainText(formatPercent(slice.civ.winRate));
  const source = page.getByTestId('ladder-source');
  await sourceGap(source, '来源条应写明当前模式').toContainText(slice.mode);
  await sourceGap(source, '来源条应写明当前 Elo').toContainText(slice.elo);
  await sourceGap(source, '来源条应保留统计截止').toContainText(snapshotCutoff(slice.snapshot));
  await sourceGap(page.getByTestId('ladder-sample'), '样本量应是这一档的快照样本').toContainText(formatGames(slice.sample));
}

test('#571 模式筛选覆盖已承诺的 4v4 与阿拉伯 1v1，切换后表和来源条落到对应快照', async ({ page }) => {
  await openLadder(page);
  const modes = page.getByTestId('ladder-mode');
  await expect(modes).toBeVisible();
  const modeIds = await page.locator('[data-testid^="ladder-mode-"]').evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')).sort());
  expect(modeIds, '站内已承诺的模式就是这两份快照，不要另画 2v2 / 3v3 / 帝国战争').toEqual(['ladder-mode-4v4', 'ladder-mode-arabia1v1']);
  await expect(modes).not.toContainText(/2v2|3v3|帝国战争/);
  await expect(page.getByTestId('ladder-mode-4v4')).toHaveAttribute('aria-checked', 'true');
  await expectOwnedSlice(page, teamSlice);

  await page.getByTestId('ladder-mode-arabia1v1').click();
  await expect(page.getByTestId('ladder-mode-arabia1v1')).toHaveAttribute('aria-checked', 'true');
  await expectOwnedSlice(page, arabiaSlice);

  await page.getByTestId('ladder-mode-4v4').click();
  await expect(page.getByTestId('ladder-mode-4v4')).toHaveAttribute('aria-checked', 'true');
  await expectOwnedSlice(page, teamSlice);
});

test('#571 Elo 分段可切换，胜率与样本量改为另一份自有快照', async ({ page }) => {
  await openLadder(page);
  const group = eloGroup(page);
  await expect(group, 'Elo 应是可切换的天梯分段，而不是只读「当前快照」').toBeVisible();
  const current = group.getByRole('radio', { name: ELO_1200_1400 });
  const other = group.getByRole('radio', { name: /全部/ });
  await expect(current).toHaveAttribute('aria-checked', 'true');
  await expect(other, '「全部」在阿拉伯快照里有数，不能禁用').toBeEnabled();
  const before = await page.getByTestId('ladder-row-Franks').getAttribute('data-games');
  await other.click();
  await expect(other).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('ladder-mode-arabia1v1'), 'Elo 落到哪份快照，模式芯片就跟哪份，不能 4v4 配阿拉伯胜率').toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('ladder-row-Franks')).toHaveAttribute('data-games', String(arabiaFranks.games));
  await expect(page.getByTestId('ladder-row-Franks')).toContainText(formatPercent(arabiaFranks.winRate));
  expect(before).not.toBe(String(arabiaFranks.games));
  await expect(page.getByTestId('ladder-sample')).toContainText(formatGames(arabiaBracket.games));
  await expect(page.getByTestId('ladder-sample')).not.toContainText(formatGames(teamBracket.games));
  const source = page.getByTestId('ladder-source');
  await expect(source).toContainText(/全部/);
  await expect(source).toContainText(/阿拉伯|1v1/);
  await expect(source).toContainText(snapshotCutoff(arabia));
  await expect(source).not.toContainText(ELO_1200_1400);
});

async function expectMissingCombo(page: Page, hash: string, key: string, label: RegExp) {
  await openLadder(page, hash);
  const option = bandOption(page, key, label);
  const optionCount = await option.count();
  let disabled = false;
  if (optionCount > 0) {
    const node = option.first();
    disabled = (await node.isDisabled()) || (await node.getAttribute('aria-disabled')) === 'true';
  }
  const empty = page.getByTestId('ladder-empty');
  const emptyVisible = await empty.isVisible();
  const tableCount = await page.getByTestId('ladder-table').count();
  expect(disabled || emptyVisible, `「${key}」没有这份切片：应禁用选项或明确空态，不能回落后继续展示别的胜率（table=${tableCount}）`).toBe(true);
  if (emptyVisible) {
    await expect(empty).toContainText(/暂无/);
    await expect(page.getByTestId('ladder-table')).toHaveCount(0);
    await expect(page.locator('[data-testid^="ladder-row-"]')).toHaveCount(0);
    const text = ((await page.getByTestId('ladder-page').innerText()) ?? '').replace(/\s+/g, '');
    expect(text, '空态不能留下两位小数胜率').not.toMatch(WIN_RATE);
  }
  if (disabled) {
    await expect(option.first()).not.toHaveAttribute('aria-checked', 'true');
  }
}

test('#571 无快照组合不展示假胜率：4v4 × <850', async ({ page }) => {
  await expectMissingCombo(page, '/ladder?mode=4v4&elo=lt850', 'lt850', /<\s*850/);
});

test('#571 无快照组合不展示假胜率：阿拉伯 1v1 × 1200–1400', async ({ page }) => {
  await expectMissingCombo(page, '/ladder?mode=arabia1v1&elo=1200-1400', '1200-1400', ELO_1200_1400);
});

test('#571 不实时抓取；地图行在时来源条仍保留模式、Elo 与截止', async ({ page }) => {
  const hits: string[] = [];
  page.on('request', (request) => {
    if (LIVE_HOST.test(request.url())) hits.push(request.url());
  });
  await openLadder(page);
  const map = page.getByTestId('ladder-map-static');
  await expect(map).toBeVisible();
  await expect(map).toContainText('全图');
  await expectOwnedSlice(page, teamSlice);
  expect(hits, '筛选不得请求统计站').toEqual([]);

  await page.getByTestId('ladder-mode-arabia1v1').click();
  await expect(page.getByTestId('ladder-map-static')).toContainText('阿拉伯');
  await expectOwnedSlice(page, arabiaSlice);
  await expect(page.getByTestId('ladder-source')).not.toContainText(ELO_1200_1400);
  await expect(page.getByTestId('ladder-cutoff')).toContainText(snapshotCutoff(arabia));
  await expect(page.getByTestId('ladder-cutoff')).not.toContainText(snapshotCutoff(team));
  expect(hits, '切到阿拉伯后仍不得请求统计站').toEqual([]);
});
