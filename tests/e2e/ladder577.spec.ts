// #577 切片 A 失败验收。不实现页面，不改产品代码，不改 src/data 快照，不关 #577。
// 当前 main 首次进入仍是阿拉伯 1v1「全部」（ladder-arabia-p162286.json），表行没有趋势。这些用例应红，直到实现 PR。
// 只覆盖 AC-A：默认筛 + 来源条口径/截止 + 无快照不展示假胜率 + 表行趋势（时段、样本量门槛、与表同源）+ 可切回阿拉伯 1v1。
// AC-B（Tiers / Meta Map）只记在文件末尾，不写会失败的用例。1280×900，不做窄屏。不接 live，不读 aoe2scout。
//
// 实现契约（没有短稿时按可测行为锁定，不要为了变绿放宽）：
// 筛选当前值用这些 testid，节点本身可见。组内用 aria-pressed / aria-checked / aria-selected 标出当前项；没有时整段文字当作当前值（不要把未选项混进来）。
//   ladder-filter-format  4v4（可写 4对4），不能是 1v1
//   ladder-filter-mode    随机地图或 RM
//   ladder-filter-elo     1200–1400，不是「全部」
//   ladder-filter-period  「近 90 天 / 最近 90 天 / 90 天」，或起止日期跨 80–100 天（含约 89 天）
//   ladder-filter-map     全图 / 全部地图 / 所有地图 / 不限地图，当前值不要带阿拉伯
// 来源条 ladder-source 写明上述口径，并有「截止」或「截至」。无默认切片快照时写明没有这份快照，且页面不出现阿拉伯 1v1 的胜率百分数。
// 默认切片快照认 src/data/ladder-*.json 的根对象（不要改阿拉伯文件来冒充）：
//   format/mode/teamSize 含 4v4，mode 含 RM 或「随机地图」，map 为 all / __all__ / 全图 / 全部地图 / 所有地图 / 不限地图，
//   eloMin=1200 且 eloMax=1400，windowDays 或 dateFrom–dateTo 在 80–100 天。
//   civs[].{en,winRate,games,trend}；trend 为至少两个百分数，或 {winRate} 点。civs 也可放在 brackets[].civs。
// 趋势：行内 [data-testid="ladder-trend-{En}"]，且落在 ladder-row-{En} 里。
//   data-period  与时段筛一致：90d，或 YYYY-MM-DD/YYYY-MM-DD（跨度 80–100 天），或快照 windowDays/dateFrom/dateTo 的同一写法
//   data-games   与该行 data-games、快照 games 相同
//   data-points  逗号或空白分隔的百分数，与该文明 trend 相同；低样本为空
//   data-low-sample  "true" / "false"，等于 data-games < 门槛
//   门槛在 [data-testid="ladder-trend-rules"][data-min-games]（正整数）。文案含该数字、「趋势」和「样本」。
//   达到门槛：可见 svg polyline/path 或 canvas。低于门槛：不画曲线，文案或 aria-label 含「样本不足」或「样本少」。
// 切回：data-testid="ladder-open-arabia"，或可见 button/radio/link/tab/select，名称同时有「阿拉伯」（或 Arabia）和「1v1」。
// 切回后表内胜率等于阿拉伯快照。该文件没有 trend[] 时，不要把默认切片的曲线留在这张表上。
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { formatPercent } from '../../src/domain/ladder';

const FORMAT_4V4 = /4\s*v\s*4|4v4|4\s*对\s*4/i;
const FORMAT_1V1 = /1\s*v\s*1|1v1|1\s*对\s*1/i;
const PERIOD_TEXT = /近\s*90\s*天|最近\s*90\s*天|过去\s*90\s*天|(?:^|[^\d])90\s*天/;
const ALL_MAPS = /全图|全部地图|所有地图|不限地图/;
const MISSING_SNAPSHOT = /没有这份快照|无此切片快照|暂无该切片|暂无此切片|没有该切片|不展示胜率|暂无快照/;
const soon = expect.configure({ timeout: 2_000, soft: true });

type Json = Record<string, unknown>;

interface CivStat {
  en: string;
  winRate: number;
  games: number;
  trend: number[] | null;
}

interface SliceSnapshot {
  file: string;
  fetchedAt: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  windowDays: number | null;
  civs: CivStat[];
  trendReady: boolean;
}

function asRecord(value: unknown): Json | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function daysBetween(from: string, to: string): number | null {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

function readWindow(record: Json): number | null {
  const explicit = numOf(record.windowDays);
  const from = textOf(record.dateFrom);
  const to = textOf(record.dateTo);
  const span = from && to ? daysBetween(from, to) : null;
  const candidates = [explicit, span].filter((value): value is number => value != null);
  if (candidates.length === 0 || candidates.some((value) => value < 80 || value > 100)) return null;
  return candidates[0] ?? null;
}

function sliceBlob(record: Json): string {
  return [record.format, record.mode, record.teamSize, record.size, record.ladder, record.mapPool].map((item) => String(item ?? '')).join(' ');
}

function matchesDefaultSlice(record: Json): boolean {
  const blob = sliceBlob(record);
  if (!FORMAT_4V4.test(blob) || FORMAT_1V1.test(blob)) return false;
  if (!/随机地图|\bRM\b|rm_4v4/i.test(blob)) return false;
  const map = textOf(record.map) || textOf(record.maps);
  const allMaps = /^(?:all|__all__|any|\*)$/i.test(map) || ALL_MAPS.test(map);
  if (!allMaps || /阿拉伯|Arabia/i.test(map)) return false;
  if (numOf(record.eloMin) !== 1200 || numOf(record.eloMax) !== 1400) return false;
  return readWindow(record) != null;
}

function readTrend(civ: Json): number[] | null {
  const raw = civ.trend ?? civ.series ?? civ.points;
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const points = raw.map((item) => {
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    const point = asRecord(item);
    return point ? numOf(point.winRate) : null;
  });
  if (points.some((point) => point == null)) return null;
  return points as number[];
}

function readCivs(record: Json): CivStat[] {
  const lists: unknown[] = [];
  if (Array.isArray(record.civs)) lists.push(...record.civs);
  if (Array.isArray(record.brackets)) {
    for (const item of record.brackets) {
      const bracket = asRecord(item);
      if (bracket && Array.isArray(bracket.civs)) lists.push(...bracket.civs);
    }
  }
  const civs = new Map<string, CivStat>();
  for (const item of lists) {
    const civ = asRecord(item);
    const en = civ ? textOf(civ.en) : '';
    const winRate = civ ? numOf(civ.winRate) : null;
    const games = civ ? numOf(civ.games) : null;
    if (!civ || !en || winRate == null || games == null) continue;
    civs.set(en, { en, winRate, games, trend: readTrend(civ) });
  }
  return [...civs.values()];
}

function ladderFiles(): string[] {
  return readdirSync('src/data')
    .filter((name) => /^ladder-.*\.json$/.test(name) && name !== 'ladder-beginner.json')
    .sort();
}

function loadArabia(): { file: string; fetchedAt: string; civs: Map<string, CivStat> } {
  const name = ladderFiles().find((file) => file.includes('arabia'));
  if (!name) throw new Error('找不到 src/data/ladder-arabia-*.json，无法验收切回路径');
  const record = asRecord(JSON.parse(readFileSync(join('src/data', name), 'utf8')));
  if (!record) throw new Error(`${name} 不是对象`);
  const civs = new Map(readCivs(record).map((civ) => [civ.en, civ]));
  if (!civs.has('Franks') || !civs.has('Romans')) throw new Error(`${name} 缺少 Franks 或 Romans`);
  return { file: name, fetchedAt: textOf(record.fetchedAt), civs };
}

function loadDefaultSlice(): SliceSnapshot | null {
  const found: SliceSnapshot[] = [];
  for (const file of ladderFiles()) {
    const record = asRecord(JSON.parse(readFileSync(join('src/data', file), 'utf8')));
    if (!record || !matchesDefaultSlice(record)) continue;
    const civs = readCivs(record);
    if (civs.length === 0) continue;
    found.push({
      file,
      fetchedAt: textOf(record.fetchedAt) || null,
      dateFrom: textOf(record.dateFrom) || null,
      dateTo: textOf(record.dateTo) || null,
      windowDays: readWindow(record),
      civs,
      trendReady: civs.every((civ) => civ.trend != null && civ.trend.length >= 2),
    });
  }
  if (found.length > 1) throw new Error(`默认切片快照多于一份：${found.map((item) => item.file).join(', ')}`);
  return found[0] ?? null;
}

const arabia = loadArabia();
const slice = loadDefaultSlice();
const franks = arabia.civs.get('Franks');
const romans = arabia.civs.get('Romans');
if (!franks || !romans) throw new Error('阿拉伯快照缺少 Franks 或 Romans');

function periodOk(text: string): boolean {
  if (PERIOD_TEXT.test(text)) return true;
  const dates = text.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  if (dates.length < 2) return false;
  const span = daysBetween(dates[0] ?? '', dates[1] ?? '');
  return span != null && span >= 80 && span <= 100;
}

function eloOk(text: string): boolean {
  const compact = text.replace(/\s+/g, '');
  return /1200\D{0,8}1400|1400\D{0,8}1200/.test(compact);
}

function acceptedPeriods(filterText: string): string[] {
  const accepted = new Set<string>();
  if (PERIOD_TEXT.test(filterText) || slice?.windowDays === 90) accepted.add('90d');
  if (slice?.windowDays) accepted.add(`${slice.windowDays}d`);
  const dates = filterText.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  if (dates.length >= 2) accepted.add(`${dates[0]}/${dates[1]}`);
  if (slice?.dateFrom && slice.dateTo) accepted.add(`${slice.dateFrom}/${slice.dateTo}`);
  return [...accepted];
}

async function openFresh(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/ladder');
  await expect(page.getByTestId('ladder-page')).toBeVisible();
  return errors;
}

async function selectedText(page: Page, testId: string): Promise<string> {
  const root = page.getByTestId(testId);
  if ((await root.count()) !== 1 || !(await root.isVisible())) return '';
  const selected = root.locator('[aria-pressed="true"], [aria-checked="true"], [aria-selected="true"]');
  const count = await selected.count();
  const text = count >= 1 ? (await selected.allInnerTexts()).join(' ') : await root.innerText();
  return text.replace(/\s+/g, ' ').trim();
}

async function openArabia(page: Page): Promise<boolean> {
  const byId = page.getByTestId('ladder-open-arabia');
  if ((await byId.count()) >= 1 && (await byId.first().isVisible())) {
    await byId.first().click();
    return true;
  }
  const named = page
    .locator('button, a, [role="radio"], [role="tab"]')
    .filter({ hasText: /阿拉伯|Arabia/ })
    .filter({ hasText: /1v1/ });
  if ((await named.count()) >= 1 && (await named.first().isVisible())) {
    await named.first().click();
    return true;
  }
  const selects = page.locator('select');
  const count = await selects.count();
  for (let i = 0; i < count; i++) {
    const labels = await selects.nth(i).locator('option').allInnerTexts();
    const hit = labels.find((label) => /阿拉伯|Arabia/.test(label) && /1v1/.test(label));
    if (!hit) continue;
    await selects.nth(i).selectOption({ label: hit });
    return true;
  }
  return false;
}

test('#577 打开 #/ladder 仍是天梯数据页，页脚保留「胜率不是平衡建议」', async ({ page }) => {
  const errors = await openFresh(page);
  await expect(page.getByRole('heading', { level: 1, name: /天梯数据/ })).toBeVisible();
  await expect(page.getByTestId('ladder-footer')).toContainText('胜率不是平衡建议');
  expect(errors, '打开天梯页不应有页面错误').toEqual([]);
});

test('#577 首次进入默认筛为 4v4 RM · Elo 1200–1400 · 近 90 天 · 全图', async ({ page }) => {
  await openFresh(page);
  const format = await selectedText(page, 'ladder-filter-format');
  const mode = await selectedText(page, 'ladder-filter-mode');
  const elo = await selectedText(page, 'ladder-filter-elo');
  const period = await selectedText(page, 'ladder-filter-period');
  const map = await selectedText(page, 'ladder-filter-map');
  const context = ((await page.getByTestId('ladder-context').innerText()) ?? '').replace(/\s+/g, ' ').trim();
  soon(format, `ladder-filter-format 当前值应为 4v4。现在上下文是「${context}」`).toMatch(FORMAT_4V4);
  if (format) soon(format, '默认格式不能是 1v1').not.toMatch(FORMAT_1V1);
  soon(mode, 'ladder-filter-mode 当前值应为随机地图 / RM').toMatch(/随机地图|\bRM\b/i);
  soon(eloOk(elo), `ladder-filter-elo 当前值应为 1200–1400，实际「${elo}」`).toBe(true);
  soon(periodOk(period), `ladder-filter-period 当前值应为近 90 天或 80–100 天的起止日期，实际「${period}」`).toBe(true);
  soon(ALL_MAPS.test(map) && !/阿拉伯|Arabia/i.test(map), `ladder-filter-map 当前值应为全图，实际「${map}」`).toBe(true);
  soon(
    FORMAT_4V4.test(format) && /随机地图|\bRM\b/i.test(mode) && eloOk(elo) && periodOk(period) && ALL_MAPS.test(map),
    `首次进入仍不是 4v4 RM · Elo 1200–1400 · 近 90 天 · 全图。上下文：「${context}」`,
  ).toBe(true);
});

test('#577 来源条写明默认口径和截止；没有该切片快照时不展示胜率', async ({ page }) => {
  await openFresh(page);
  const source = ((await page.getByTestId('ladder-source').innerText()) ?? '').replace(/\s+/g, ' ').trim();
  const compact = source.replace(/\s+/g, '');
  soon(compact, `来源条要写明 4v4。实际：「${source}」`).toMatch(FORMAT_4V4);
  soon(/随机地图|\bRM\b/i.test(source), '来源条要写明随机地图 / RM').toBe(true);
  soon(eloOk(source), '来源条要写明 Elo 1200–1400').toBe(true);
  soon(periodOk(source), '来源条要写明近 90 天，或 80–100 天的起止日期').toBe(true);
  soon(ALL_MAPS.test(source), '来源条要写明全图 / 全部地图 / 所有地图 / 不限地图').toBe(true);
  soon(source, '来源条要有截止或截至').toMatch(/截止|截至/);
  const pageText = (await page.getByTestId('ladder-page').innerText()) ?? '';
  if (!slice) {
    soon(compact, '无默认切片快照时，来源条要写明没有这份快照 / 不展示胜率，不能只用阿拉伯 1v1 的统计截止充数').toMatch(MISSING_SNAPSHOT);
    if (arabia.fetchedAt && source.includes(arabia.fetchedAt)) {
      soon(source, `来源条写了阿拉伯快照日期 ${arabia.fetchedAt}，但没有标明它不是默认切片`).toMatch(/阿拉伯|1v1|不是默认/);
    }
    const leaked = [...arabia.civs.keys()].filter((en) => {
      const civ = arabia.civs.get(en);
      return civ != null && pageText.includes(formatPercent(civ.winRate));
    });
    soon(leaked.slice(0, 8), `无默认切片快照时不得展示阿拉伯 1v1 胜率（${arabia.file}），已看到 ${leaked.slice(0, 8).join(', ')}`).toEqual([]);
    return;
  }
  const cutoff = slice.dateTo ?? slice.fetchedAt;
  soon(cutoff, `${slice.file} 要有 dateTo 或 fetchedAt，来源条才能写截止`).toBeTruthy();
  if (cutoff) soon(source, `来源条截止应包含快照 ${cutoff}`).toContain(cutoff);
  for (const civ of slice.civs) {
    const row = page.getByTestId(`ladder-row-${civ.en}`);
    soon(await row.count(), `${civ.en} 应在默认表中`).toBe(1);
    if ((await row.count()) !== 1) continue;
    const shown = ((await row.innerText()) ?? '').replace(/\s+/g, '');
    soon(shown, `${civ.en} 胜率应来自 ${slice.file}`).toContain(formatPercent(civ.winRate));
  }
});

test('#577 默认表每一行有与筛同期的趋势，低样本门槛可测，且与表同源', async ({ page }) => {
  await openFresh(page);
  const rows = page.locator('[data-testid^="ladder-row-"]');
  const trends = page.locator('[data-testid^="ladder-trend-"]');
  const rowCount = await rows.count();
  const trendCount = await trends.count();
  soon(slice, 'src/data/ladder-*.json 没有 4v4 RM · Elo 1200–1400 · 约 90 天 · 全图的快照。阿拉伯 1v1 文件不能充当趋势来源。').not.toBeNull();
  soon(rowCount, '默认切片应有文明表，空态不算趋势已完成').toBeGreaterThan(0);
  soon(trendCount, `表行 ${rowCount} 行，趋势节点 ${trendCount} 个。每一行都要有 ladder-trend-{En}`).toBe(rowCount);
  if (!slice || !slice.trendReady) {
    soon(slice?.trendReady ?? false, `${slice?.file ?? '无快照'} 的每个文明都要有 trend[]（至少 2 个点），曲线才能与表同源`).toBe(true);
    return;
  }
  const period = await selectedText(page, 'ladder-filter-period');
  const accepted = acceptedPeriods(period);
  const rules = page.getByTestId('ladder-trend-rules');
  soon(await rules.count(), '应有 ladder-trend-rules 写明样本量门槛').toBe(1);
  const minRaw = (await rules.count()) === 1 ? await rules.getAttribute('data-min-games') : null;
  const minGames = Number(minRaw);
  soon(Number.isInteger(minGames) && minGames >= 1, `data-min-games 应为正整数，实际「${minRaw}」`).toBe(true);
  if ((await rules.count()) === 1) {
    const rulesText = (await rules.innerText()) ?? '';
    soon(rulesText, '门槛文案要包含 data-min-games').toContain(String(minGames));
    soon(rulesText, '门槛文案要写明这是趋势').toMatch(/趋势/);
    soon(rulesText, '门槛文案要写明样本').toMatch(/样本/);
  }
  for (const civ of slice.civs) {
    const trend = page.getByTestId(`ladder-trend-${civ.en}`);
    soon(await trend.count(), civ.en).toBe(1);
    if ((await trend.count()) !== 1 || !Number.isInteger(minGames)) continue;
    const row = page.getByTestId(`ladder-row-${civ.en}`);
    const host = await trend.evaluate((el) => el.closest('[data-testid^="ladder-row-"]')?.getAttribute('data-testid') ?? '');
    soon(host, `${civ.en} 的趋势应在该行内`).toBe(`ladder-row-${civ.en}`);
    const dataPeriod = await trend.getAttribute('data-period');
    soon(accepted, `${civ.en} data-period「${dataPeriod}」应与时段筛一致，接受 ${accepted.join(' 或 ')}`).toContain(dataPeriod);
    const games = Number(await trend.getAttribute('data-games'));
    const rowGames = Number(await row.getAttribute('data-games'));
    soon(games, `${civ.en} 趋势样本应等于快照 ${civ.games}`).toBe(civ.games);
    soon(rowGames, `${civ.en} 行样本应与趋势相同`).toBe(games);
    const low = games < minGames;
    soon(await trend.getAttribute('data-low-sample'), `${civ.en} data-low-sample 应反映门槛 ${minGames}`).toBe(low ? 'true' : 'false');
    const points = await readPoints(trend);
    const curves = await trend.locator('svg polyline, svg path, canvas').count();
    if (low) {
      soon(points, `${civ.en} 低于 ${minGames} 局不应画出趋势点`).toEqual([]);
      soon(curves, `${civ.en} 低于门槛不应有曲线`).toBe(0);
      const label = `${(await trend.innerText()) ?? ''} ${await trend.getAttribute('aria-label')}`;
      soon(label, `${civ.en} 低样本应写明样本不足或样本少`).toMatch(/样本不足|样本少/);
    } else {
      soon(curves, `${civ.en} 达到门槛应有 svg 曲线或 canvas`).toBeGreaterThan(0);
      soon(sameSeries(points, civ.trend ?? []), `${civ.en} data-points 应等于快照 trend`).toBe(true);
    }
    const shown = ((await row.innerText()) ?? '').replace(/\s+/g, '');
    soon(shown, `${civ.en} 表内胜率应与趋势同源（${slice.file}）`).toContain(formatPercent(civ.winRate));
  }
});

test('#577 可以切回现有阿拉伯 1v1 快照，且不借用默认切片的曲线', async ({ page }) => {
  await openFresh(page);
  const before = (await page.getByTestId('ladder-page').innerText()) ?? '';
  const alreadyArabia = before.includes(formatPercent(franks.winRate));
  const opened = await openArabia(page);
  soon(opened, '要能切回阿拉伯 1v1：可见的 ladder-open-arabia，或按钮/单选/链接/标签/下拉同时写明阿拉伯与 1v1').toBe(true);
  soon(alreadyArabia, `首次进入不应已经展示阿拉伯 1v1 胜率（${formatPercent(franks.winRate)}）。那是切回之后的路径`).toBe(false);
  if (!opened || alreadyArabia) return;
  await expect(page.getByTestId('ladder-row-Franks')).toContainText(formatPercent(franks.winRate));
  await expect(page.getByTestId('ladder-row-Romans')).toContainText(formatPercent(romans.winRate));
  const caption = ((await page.getByTestId('ladder-table').locator('caption').innerText()) ?? '').replace(/\s+/g, '');
  const source = ((await page.getByTestId('ladder-source').innerText()) ?? '').replace(/\s+/g, '');
  soon(`${caption}${source}`, '切回后来源或表题应标明阿拉伯与 1v1').toMatch(/阿拉伯|Arabia/);
  soon(`${caption}${source}`).toMatch(FORMAT_1V1);
  const legacyTrend = [...arabia.civs.values()].some((civ) => civ.trend != null && civ.trend.length >= 2);
  if (!legacyTrend) {
    soon(await page.locator('[data-testid^="ladder-trend-"]').count(), '阿拉伯 1v1 快照没有 trend[]，切回后不要留下默认切片的曲线').toBe(0);
  }
});

async function readPoints(trend: Locator): Promise<number[] | null> {
  const attr = await trend.getAttribute('data-points');
  if (attr == null || !attr.trim()) return [];
  const parts = attr
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((item) => Number(item));
  if (parts.some((part) => !Number.isFinite(part))) return null;
  return parts;
}

function sameSeries(actual: number[] | null, expected: number[]): boolean {
  if (!actual || actual.length !== expected.length) return false;
  return actual.every((point, index) => {
    const want = expected[index];
    return want != null && Math.abs(point - want) < 0.001;
  });
}

// TODO(#577 AC-B)：本文件不测，避免 Tiers / Meta Map 未做时挡住切片 A。
// 同一切片下 Table / Tiers / Meta Map 数据同源，切视图不丢筛选。
// Tiers：每个文明只进一档，档界可测。
// Meta Map：胜率 × 出场可测，象限规则与图例可测。
// 仍不接 live，不扒 aoe2scout，不抄对方图或数字。
