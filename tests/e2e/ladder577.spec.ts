// #577 失败验收（设计 #586 @ 6553d099 §11 A + §12 B）。不实现页面，不改 src/，不关 #577。
// 当前 main 仍是阿拉伯 1v1「全部」。这些用例应红，直到 A+B 按短稿落地。1280×900。不接 live，不读 aoe2scout。
// 不把线框示意胜率（51.00%、50.50%、中国/法兰克归类）写进断言或 JSON。
//
// 产品锁定的分层边界（Steve 2026-11-01，§7），实现不得另切：
//   S ≥ 52%；A ≥ 51% 且 < 52%；B ≥ 50% 且 < 51%；C ≥ 48% 且 < 50%；D < 48%。
//   恰好 52→S，51→A，50→B，48→C。
// 分布落在线上（§8）：胜率 ≥ 50% 算强；出场率 ≥ 当前可见文明中位数算常见。
// 象限只有：强且少见 / 强且常见 / 弱且少见 / 弱且常见。禁止 Pillars / Sleepers / Crowd-pleasers / Niche。
//
// 契约（§2–§8）。A 只做表时，分层/分布 disabled，点击不改地址和筛选；本文件同时挂 B，A+B 合入后这两枚必须可点。
//   ladder-filters；模式 radiogroup：ladder-mode-4v4「4v4 随机地图」、ladder-mode-arabia1v1「阿拉伯 1v1」
//   默认切片只读：ladder-period-static「近 90 天 · 当前快照」、ladder-elo-static「1200–1400 · 当前快照」、ladder-map-static「全图 · 当前快照」
//   阿拉伯：时段「整段快照 · 当前快照」，地图「阿拉伯 · 固定」，分段仍是 ladder-elo-static「全部」
//   ladder-view aria-label=视图；ladder-view-table / ladder-view-tiers / ladder-view-meta
// 无 4v4 文件：ladder-empty「这个切片暂无快照。不推算，不补数。」+「看阿拉伯 1v1」；不画 ladder-cutoff / data-fetched-at。有文件时 data-fetched-at=fetchedAt，样本句「本切片样本」（阿拉伯仍「本分段样本」）。
// ladder-hide-low 默认勾选，「隐藏低样本」不含 50，不进地址；data-threshold 缺省 LOW_SAMPLE（300）或切片 lowSampleGames。勾选后表、分层计数、气泡、中位线是同一批可见文明。
// 走势 ladder-trend-{En}：无序列写「无走势」且无折线。有序列：data-period / data-points / data-low-sample，门槛 ladder-trend-rules[data-min-games]。
// 分层 ladder-tier-band-S|A|B|C|D（data-band、data-count），空档「这一档没有文明」，药丸链 /civ/{en}。
// 分布 ladder-meta-map：win-line data-value=50，pick-line 为可见出场率中位数，bubble-{En} 可聚焦，aria-label 含英文名、胜率、出场率、局数，data-quadrant 为四句中文之一。
// 地址：无参数才是默认切片。?mode=arabia1v1 走旧快照。只带 elo 进入阿拉伯，elo=all 收成 mode=arabia1v1。快照认 src/data/ladder-*.json（4v4+RM、全图、1200–1400、约 90 天）。阿拉伯文件不能冒充。
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { formatPercent, LOW_SAMPLE } from '../../src/domain/ladder';
const FORMAT_4V4 = /4\s*v\s*4|4v4|4\s*对\s*4/i;
const FORMAT_1V1 = /1\s*v\s*1|1v1|1\s*对\s*1/i;
const PERIOD_TEXT = /近\s*90\s*天|最近\s*90\s*天|过去\s*90\s*天|(?:^|[^\d])90\s*天/;
const ALL_MAPS = /全图|全部地图|所有地图|不限地图/;
const MISSING_SNAPSHOT = /没有这份快照|无此切片快照|暂无该切片|暂无此切片|没有该切片|不展示胜率|暂无快照|这个切片暂无快照/;
const BANDS = ['S', 'A', 'B', 'C', 'D'] as const;
const QUADS = ['强且少见', '强且常见', '弱且少见', '弱且常见'] as const;
const ENGLISH_QUAD = /Pillars|Sleepers|Crowd-pleasers|Niche/i;
type Band = (typeof BANDS)[number];
const soon = expect.configure({ timeout: 2_000, soft: true });
type Json = Record<string, unknown>;
interface CivStat {
  en: string;
  winRate: number;
  games: number;
  playRate: number | null;
  trend: number[] | null;
}
interface SliceSnapshot {
  file: string;
  fetchedAt: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  windowDays: number | null;
  lowSampleGames: number;
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
    civs.set(en, { en, winRate, games, playRate: numOf(civ.playRate), trend: readTrend(civ) });
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
      lowSampleGames: numOf(record.lowSampleGames) ?? LOW_SAMPLE,
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
async function openFresh(page: Page, hash = '/ladder') {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`./#${hash}`);
  await expect(page.getByTestId('ladder-page')).toBeVisible();
  return errors;
}
function hashQuery(url: string): URLSearchParams {
  const hash = new URL(url).hash;
  const queryAt = hash.indexOf('?');
  return new URLSearchParams(queryAt === -1 ? '' : hash.slice(queryAt + 1));
}
/** 产品锁定边界。52→S，51→A，50→B，48→C，低于 48→D。 */
function tierOf(winRate: number): Band {
  if (winRate >= 52) return 'S';
  if (winRate >= 51) return 'A';
  if (winRate >= 50) return 'B';
  if (winRate >= 48) return 'C';
  return 'D';
}
function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const left = sorted[mid - 1];
  const right = sorted[mid];
  if (left == null || right == null) return null;
  return (left + right) / 2;
}
/** ≥50% 为强，≥中位数为常见。线上的点不掉进弱或少见。 */
function quadrantOf(winRate: number, playRate: number, pickMedian: number): (typeof QUADS)[number] {
  const strong = winRate >= 50;
  const common = playRate >= pickMedian;
  if (strong && common) return '强且常见';
  if (strong) return '强且少见';
  if (common) return '弱且常见';
  return '弱且少见';
}
async function plainText(page: Page, testId: string): Promise<string> {
  const root = page.getByTestId(testId);
  if ((await root.count()) !== 1 || !(await root.isVisible())) return '';
  return ((await root.innerText()) ?? '').replace(/\s+/g, '');
}
async function sliceSignature(page: Page) {
  const mode = page.locator('[data-testid^="ladder-mode-"][aria-checked="true"]');
  const hide = page.getByTestId('ladder-hide-low');
  const source = page.getByTestId('ladder-source');
  return {
    mode: (await mode.count()) === 1 ? await mode.getAttribute('data-testid') : '',
    period: await plainText(page, 'ladder-period-static'),
    elo: await plainText(page, 'ladder-elo-static'),
    map: await plainText(page, 'ladder-map-static'),
    hide: (await hide.count()) === 1 ? await hide.isChecked() : null,
    fetchedAt: (await source.count()) === 1 ? await source.getAttribute('data-fetched-at') : null,
  };
}
async function openArabia(page: Page): Promise<boolean> {
  const mode = page.getByTestId('ladder-mode-arabia1v1');
  const named = page
    .locator('button, a, [role="radio"], [role="tab"], select')
    .filter({ hasText: /阿拉伯|Arabia/ })
    .filter({ hasText: /1v1/ });
  const target = (await mode.count()) >= 1 ? mode.first() : (await named.count()) >= 1 ? named.first() : null;
  if (!target || !(await target.isVisible())) return false;
  if ((await target.evaluate((el) => el.tagName)) === 'SELECT') {
    const labels = await target.locator('option').allInnerTexts();
    const hit = labels.find((label) => /阿拉伯|Arabia/.test(label) && /1v1/.test(label));
    if (!hit) return false;
    await target.selectOption({ label: hit });
    return true;
  }
  await target.click();
  return true;
}
test('#577 打开 #/ladder 仍是天梯数据页，页脚保留「胜率不是平衡建议」', async ({ page }) => {
  const errors = await openFresh(page);
  await expect(page.getByRole('heading', { level: 1, name: /天梯数据/ })).toBeVisible();
  await expect(page.getByTestId('ladder-footer')).toContainText('胜率不是平衡建议');
  expect(errors, '打开天梯页不应有页面错误').toEqual([]);
});
test('#577 首次进入默认筛为 4v4 RM · Elo 1200–1400 · 近 90 天 · 全图', async ({ page }) => {
  await openFresh(page);
  const context = ((await page.getByTestId('ladder-context').innerText()) ?? '').replace(/\s+/g, ' ').trim();
  const filters = page.getByTestId('ladder-filters');
  const mode4 = await plainText(page, 'ladder-mode-4v4');
  const period = await plainText(page, 'ladder-period-static');
  const elo = await plainText(page, 'ladder-elo-static');
  const map = await plainText(page, 'ladder-map-static');
  const hide = page.getByTestId('ladder-hide-low');
  soon(await filters.count(), `应有 ladder-filters。现在上下文是「${context}」`).toBe(1);
  soon(hashQuery(page.url()).get('mode'), '无参数默认切片不写 mode=arabia1v1').not.toBe('arabia1v1');
  soon(mode4, 'ladder-mode-4v4 应为「4v4 随机地图」').toMatch(/4v4/);
  soon(mode4).toMatch(/随机地图/);
  const checked = page.getByTestId('ladder-mode-4v4');
  soon((await checked.count()) === 1 ? await checked.getAttribute('aria-checked') : null, '4v4 应选中').toBe('true');
  soon(period, `时段 pill 应为近 90 天 · 当前快照，实际「${period}」`).toContain('近90天');
  soon(period).toContain('当前快照');
  soon(eloOk(elo) && elo.includes('当前快照'), `分段 pill 应为 1200–1400 · 当前快照，实际「${elo}」`).toBe(true);
  soon(map.includes('全图') && map.includes('当前快照') && !/阿拉伯|Arabia/i.test(map), `地图 pill 应为全图，实际「${map}」`).toBe(true);
  if ((await filters.count()) === 1) {
    soon(await filters.getByRole('radiogroup').count(), '只有模式两档是 radiogroup，单档不要包一层').toBe(1);
    soon(await filters.getByRole('slider').count(), '不要 Elo 滑杆').toBe(0);
    const blob = (await filters.innerText()) ?? '';
    soon(blob, '不要 2v2 / 3v3 / 帝国战争').not.toMatch(/2v2|3v3|帝国战争/);
    soon(blob, '不要空的 7 天时段').not.toMatch(/7\s*天/);
  }
  soon(await hide.count(), '应有「隐藏低样本」，默认勾选，文案不含 50').toBe(1);
  if ((await hide.count()) === 1) {
    soon(await hide.isChecked()).toBe(true);
    soon(await hide.getAttribute('data-threshold'), `阈值缺省 ${LOW_SAMPLE}，或切片 lowSampleGames`).toBe(String(slice?.lowSampleGames ?? LOW_SAMPLE));
    const label = await hide.evaluate((el) => {
      const id = el.getAttribute('id');
      const explicit = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      return ((el.closest('label') ?? explicit)?.textContent ?? el.getAttribute('aria-label') ?? '').replace(/\s+/g, '');
    });
    soon(label).toContain('隐藏低样本');
    soon(label, '不要写成 aoe2scout 的 50').not.toMatch(/50/);
    soon(hashQuery(page.url()).has('hide') || hashQuery(page.url()).has('low'), '勾选不进地址').toBe(false);
  }
});
test('#577 来源条写明默认口径和截止；没有该切片快照时不展示胜率', async ({ page }) => {
  await openFresh(page);
  const source = ((await page.getByTestId('ladder-source').innerText()) ?? '').replace(/\s+/g, ' ').trim();
  const compact = source.replace(/\s+/g, '');
  // 口径在筛选条。来源条沿 #547：有文件才写截止；没有 4v4 文件就不编日期（§5 / §11）。
  const pageText = (await page.getByTestId('ladder-page').innerText()) ?? '';
  if (!slice) {
    soon(compact, '无默认切片快照时，来源条要写明没有这份快照 / 不展示胜率，不能只用阿拉伯 1v1 的统计截止充数').toMatch(MISSING_SNAPSHOT);
    if (arabia.fetchedAt) soon(source, `空态不要写阿拉伯快照日期 ${arabia.fetchedAt}`).not.toContain(arabia.fetchedAt);
    const leaked = [...arabia.civs.keys()].filter((en) => {
      const civ = arabia.civs.get(en);
      return civ != null && pageText.includes(formatPercent(civ.winRate));
    });
    soon(leaked.slice(0, 8), `无默认切片快照时不得展示阿拉伯 1v1 胜率（${arabia.file}），已看到 ${leaked.slice(0, 8).join(', ')}`).toEqual([]);
    const empty = page.getByTestId('ladder-empty');
    soon(await empty.count(), '4v4 文件缺失时应是空态，而不是阿拉伯表').toBe(1);
    if ((await empty.count()) === 1) {
      const emptyText = ((await empty.innerText()) ?? '').replace(/\s+/g, '');
      soon(emptyText).toContain('这个切片暂无快照');
      soon(emptyText).toContain('不推算，不补数');
    }
    soon(await page.getByRole('button', { name: '看阿拉伯 1v1' }).count(), '空态按钮应能进入阿拉伯 1v1').toBeGreaterThan(0);
    soon(await page.getByTestId('ladder-cutoff').count(), '没有 4v4 文件时不编截止日').toBe(0);
    const fetched =
      (await page.getByTestId('ladder-source').count()) === 1 ? await page.getByTestId('ladder-source').getAttribute('data-fetched-at') : 'missing';
    soon(fetched, '空态不要写 data-fetched-at').toBeNull();
    soon(compact, '空态不要用阿拉伯的「本分段样本」充数').not.toContain('本分段样本');
    return;
  }
  const cutoff = slice.dateTo ?? slice.fetchedAt;
  soon(cutoff, `${slice.file} 要有 dateTo 或 fetchedAt，来源条才能写截止`).toBeTruthy();
  if (cutoff) soon(source, `来源条截止应包含快照 ${cutoff}`).toContain(cutoff);
  soon(compact, '4v4 样本句是「本切片样本」').toContain('本切片样本');
  const fetchedAt = await page.getByTestId('ladder-source').getAttribute('data-fetched-at');
  soon(fetchedAt, 'ladder-source[data-fetched-at] 应等于这份快照').toBe(slice.fetchedAt);
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
  const period = await plainText(page, 'ladder-period-static');
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
    const row = page.getByTestId(`ladder-row-${civ.en}`);
    soon(await trend.count(), civ.en).toBe(1);
    if ((await trend.count()) !== 1 || !Number.isInteger(minGames)) continue;
    const info = await trend.evaluate((el) => ({
      host: el.closest('tr')?.getAttribute('data-testid') ?? '',
      period: el.getAttribute('data-period'),
      games: Number(el.getAttribute('data-games')),
      low: el.getAttribute('data-low-sample'),
      points: (el.getAttribute('data-points') ?? '').trim(),
      curves: el.querySelectorAll('svg polyline, svg path, canvas').length,
      text: `${el.textContent ?? ''} ${el.getAttribute('aria-label') ?? ''}`,
    }));
    const low = civ.games < minGames;
    const points = info.points
      ? info.points
          .split(/[,\s]+/)
          .filter(Boolean)
          .map(Number)
      : [];
    const shapeOk = info.host === `ladder-row-${civ.en}` && accepted.includes(info.period) && info.games === civ.games && info.low === (low ? 'true' : 'false');
    const curveOk = low
      ? points.length === 0 && info.curves === 0 && /样本不足|样本少/.test(info.text)
      : info.curves > 0 && sameSeries(points, civ.trend ?? []);
    soon(shapeOk, `${civ.en} 趋势应在行内，时段 ${accepted.join('/')}，样本 ${civ.games}，低样本=${low}。实际 ${JSON.stringify(info)}`).toBe(true);
    soon(curveOk, `${civ.en} ${low ? '低样本不画线' : '曲线应等于快照 trend'}`).toBe(true);
    soon(Number(await row.getAttribute('data-games')), `${civ.en} 行样本`).toBe(civ.games);
    soon(((await row.innerText()) ?? '').replace(/\s+/g, ''), `${civ.en} 胜率同源`).toContain(formatPercent(civ.winRate));
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
  soon((await plainText(page, 'ladder-period-static')).includes('近90天'), '切到阿拉伯后不要留下 4v4 的近 90 天').toBe(false);
  soon(eloOk(await plainText(page, 'ladder-elo-static')), '切到阿拉伯后不要留下 1200–1400').toBe(false);
  const arabiaMap = await plainText(page, 'ladder-map-static');
  soon(arabiaMap, '阿拉伯地图应为「阿拉伯 · 固定」').toMatch(/阿拉伯/);
  soon(arabiaMap).toContain('固定');
  soon(await plainText(page, 'ladder-period-static'), '时段应为整段快照').toContain('整段快照');
  const legacyTrend = [...arabia.civs.values()].some((civ) => civ.trend != null && civ.trend.length >= 2);
  const trends = page.locator('[data-testid^="ladder-trend-"]');
  if (!legacyTrend) {
    soon(await trends.count(), '走势列仍在；无序列时写「无走势」，不留默认切片的折线').toBeGreaterThan(0);
    if ((await trends.count()) > 0) {
      soon((await trends.first().innerText()) ?? '').toContain('无走势');
      soon(await trends.first().locator('svg polyline, svg path, canvas').count()).toBe(0);
    }
  }
  soon(await page.getByTestId('ladder-source').getAttribute('data-fetched-at'), '切回后来源截止等于阿拉伯快照').toBe(arabia.fetchedAt);
});
function sameSeries(actual: number[] | null, expected: number[]): boolean {
  if (!actual || actual.length !== expected.length) return false;
  return actual.every((point, index) => {
    const want = expected[index];
    return want != null && Math.abs(point - want) < 0.001;
  });
}
test('#577 §11 视图三枚都在；B 未启用时点分层/分布不改地址和筛选', async ({ page }) => {
  await openFresh(page);
  const view = page.getByTestId('ladder-view');
  const tiers = page.getByTestId('ladder-view-tiers');
  const meta = page.getByTestId('ladder-view-meta');
  for (const id of ['ladder-view', 'ladder-view-table', 'ladder-view-tiers', 'ladder-view-meta']) soon(await page.getByTestId(id).count(), id).toBe(1);
  if ((await view.count()) === 1) soon(await view.getAttribute('aria-label')).toBe('视图');
  if ((await tiers.count()) !== 1 || (await meta.count()) !== 1) return;
  const tiersOff = await tiers.isDisabled();
  const metaOff = await meta.isDisabled();
  soon(tiersOff === metaOff, '分层和分布应同时 disabled（只做了 A）或同时可点（B 已合）').toBe(true);
  if (!(tiersOff && metaOff)) return;
  const url = page.url();
  const before = await sliceSignature(page);
  await tiers.click({ force: true });
  await meta.click({ force: true });
  soon(page.url(), 'disabled 时不改地址').toBe(url);
  soon(await sliceSignature(page), 'disabled 时不改筛选').toEqual(before);
});
test('#577 §11 无参数不是阿拉伯；只带 elo 进入阿拉伯；mode=arabia1v1 读旧快照', async ({ page }) => {
  await openFresh(page);
  soon(hashQuery(page.url()).get('mode'), '无参数不是 mode=arabia1v1').not.toBe('arabia1v1');
  soon((await page.getByTestId('ladder-mode-4v4').count()) === 1 ? await page.getByTestId('ladder-mode-4v4').getAttribute('aria-checked') : null).toBe('true');
  await openFresh(page, '/ladder?elo=all');
  await soon.poll(() => hashQuery(page.url()).get('mode') ?? '', { timeout: 2_000 }).toBe('arabia1v1');
  soon(hashQuery(page.url()).has('elo'), 'elo=all 应收成 mode=arabia1v1，不再留 elo').toBe(false);
  await openFresh(page, '/ladder?elo=lt850');
  soon(hashQuery(page.url()).get('mode'), '只带 elo、没有 mode 时进入阿拉伯，不进 4v4').toBe('arabia1v1');
  const toast = page.getByTestId('ladder-fallback-toast');
  if (await toast.isVisible()) soon((await toast.innerText()) ?? '').toMatch(/暂无数据|未识别/);
  await openFresh(page, '/ladder?mode=arabia1v1');
  soon(hashQuery(page.url()).get('mode')).toBe('arabia1v1');
  soon(await plainText(page, 'ladder-map-static')).toMatch(/阿拉伯/);
  soon(await plainText(page, 'ladder-map-static')).toContain('固定');
  soon(await plainText(page, 'ladder-period-static')).toContain('整段快照');
  soon(await plainText(page, 'ladder-period-static'), '阿拉伯路径不保留近 90 天').not.toContain('近90天');
  soon(eloOk(await plainText(page, 'ladder-elo-static')), '阿拉伯分段今天仍是「全部」，不是 1200–1400').toBe(false);
  await expect(page.getByTestId('ladder-row-Franks')).toContainText(formatPercent(franks.winRate));
  soon(await page.getByTestId('ladder-source').getAttribute('data-fetched-at')).toBe(arabia.fetchedAt);
});
test('#577 §12 深链分层：五档都在，边界锁定，空档与文明药丸', async ({ page }) => {
  for (const [rate, band] of [
    [52, 'S'],
    [51.999, 'A'],
    [51, 'A'],
    [50.999, 'B'],
    [50, 'B'],
    [48, 'C'],
    [47.999, 'D'],
  ] as const)
    expect(tierOf(rate)).toBe(band);
  await openFresh(page, '/ladder?view=tiers');
  soon(hashQuery(page.url()).get('view'), 'view=tiers 应留在地址上并打开分层').toBe('tiers');
  soon(hashQuery(page.url()).get('mode'), '深链分层仍是默认切片，不是阿拉伯').not.toBe('arabia1v1');
  const root = page.getByTestId('ladder-tiers');
  soon(await root.count(), '应有 ladder-tiers').toBe(1);
  if ((await root.count()) !== 1) return;
  const hide = page.getByTestId('ladder-hide-low');
  const hidden = (await hide.count()) === 1 ? await hide.isChecked() : true;
  const threshold = Number((await hide.count()) === 1 ? await hide.getAttribute('data-threshold') : (slice?.lowSampleGames ?? LOW_SAMPLE));
  const visible = (slice?.civs ?? []).filter((civ) => !hidden || civ.games >= (Number.isInteger(threshold) ? threshold : LOW_SAMPLE));
  for (const band of BANDS) {
    const row = page.getByTestId(`ladder-tier-band-${band}`);
    soon(await row.count(), `应有 ${band} 行`).toBe(1);
    if ((await row.count()) !== 1) continue;
    soon(await row.getAttribute('data-band')).toBe(band);
    const mine = visible.filter((civ) => tierOf(civ.winRate) === band);
    soon(Number(await row.getAttribute('data-count')), `${band} 的 data-count 应等于这一档药丸数`).toBe(mine.length);
    const text = ((await row.innerText()) ?? '').replace(/\s+/g, '');
    if (mine.length === 0) soon(text, `${band} 空档应写「这一档没有文明」`).toContain('这一档没有文明');
    for (const civ of mine) soon(await row.locator(`a[href*="/civ/${civ.en}"]`).count(), `${civ.en} 应链到 /civ/${civ.en}`).toBeGreaterThan(0);
  }
  soon((await root.innerText()) ?? '', '分层说明不要和友好度混用，且不要英文象限名').not.toMatch(ENGLISH_QUAD);
});
test('#577 §12 分布象限、边界归强/常见，隐藏低样本与三视图同一批文明', async ({ page }) => {
  expect([quadrantOf(50, 2, 2), quadrantOf(50, 1.99, 2), quadrantOf(49.99, 2, 2), quadrantOf(49.99, 1.99, 2)]).toEqual([
    '强且常见',
    '强且少见',
    '弱且常见',
    '弱且少见',
  ]);
  await openFresh(page, '/ladder?view=meta');
  soon(hashQuery(page.url()).get('view')).toBe('meta');
  const root = page.getByTestId('ladder-meta-map');
  soon(await root.count(), '应有 ladder-meta-map').toBe(1);
  if ((await root.count()) !== 1) return;
  const text = (await root.innerText()) ?? '';
  soon(text).toMatch(/出场/);
  soon(text).toMatch(/胜率/);
  for (const label of QUADS) soon(text, `应有中文象限「${label}」`).toContain(label);
  soon(text, '不要 Pillars / Sleepers / Crowd-pleasers / Niche').not.toMatch(ENGLISH_QUAD);
  const winLine = root.getByTestId('ladder-meta-win-line');
  soon(await winLine.count(), '胜率虚线固定在 50%').toBe(1);
  if ((await winLine.count()) === 1) soon(await winLine.getAttribute('data-value')).toBe('50');
  const hide = page.getByTestId('ladder-hide-low');
  const threshold = Number((await hide.count()) === 1 ? await hide.getAttribute('data-threshold') : LOW_SAMPLE);
  const useThreshold = Number.isInteger(threshold) ? threshold : LOW_SAMPLE;
  const shown = (checked: boolean) => (slice?.civs ?? []).filter((civ) => civ.playRate != null && (!checked || civ.games >= useThreshold));
  const checked = (await hide.count()) === 1 ? await hide.isChecked() : true;
  const visible = shown(checked);
  soon(slice, '分布要和默认切片快照同源，不能用线框五点').not.toBeNull();
  if (!slice || visible.some((civ) => civ.playRate == null)) {
    soon(
      visible.every((civ) => civ.playRate != null),
      '每个可见文明都要有出场率，中位数才算得出来',
    ).toBe(true);
    return;
  }
  const median = medianOf(visible.map((civ) => civ.playRate ?? 0));
  const pickLine = root.getByTestId('ladder-meta-pick-line');
  soon(await pickLine.count(), '纵虚线是当前可见文明的出场率中位数').toBe(1);
  if (median != null && (await pickLine.count()) === 1) {
    soon(Math.abs(Number(await pickLine.getAttribute('data-value')) - median) < 0.001, `中位数应为 ${median}`).toBe(true);
  }
  for (const civ of visible) {
    const bubble = root.getByTestId(`ladder-meta-bubble-${civ.en}`);
    soon(await bubble.count(), civ.en).toBe(1);
    if ((await bubble.count()) !== 1 || civ.playRate == null || median == null) continue;
    const focusable = await bubble.evaluate((el) => el.matches('button, a, [tabindex="0"]'));
    soon(focusable, `${civ.en} 气泡应可聚焦`).toBe(true);
    const label = (await bubble.getAttribute('aria-label')) ?? '';
    soon(label, `${civ.en} 名称应含文明`).toContain(civ.en);
    soon(label).toContain(formatPercent(civ.winRate));
    soon(label).toContain(formatPercent(civ.playRate));
    soon(label.includes(String(civ.games)) || label.includes(civ.games.toLocaleString('en-US')), `${civ.en} 名称应含样本局数`).toBe(true);
    soon(await bubble.getAttribute('data-quadrant')).toBe(quadrantOf(civ.winRate, civ.playRate, median));
  }
  const bubbleCount = await root.locator('[data-testid^="ladder-meta-bubble-"]').count();
  soon(bubbleCount, '气泡数等于当前可见文明').toBe(visible.length);
});
test('#577 §12 表、分层、分布保持模式、时段、分段、地图、隐藏低样本和 fetchedAt', async ({ page }) => {
  await openFresh(page);
  const table = page.getByTestId('ladder-view-table');
  const tiers = page.getByTestId('ladder-view-tiers');
  const meta = page.getByTestId('ladder-view-meta');
  soon(await tiers.count(), '分层应可点').toBe(1);
  soon(await meta.count(), '分布应可点').toBe(1);
  if ((await tiers.count()) !== 1 || (await meta.count()) !== 1) return;
  soon(await tiers.isDisabled(), 'B 合入后分层不是 disabled').toBe(false);
  soon(await meta.isDisabled(), 'B 合入后分布不是 disabled').toBe(false);
  if ((await tiers.isDisabled()) || (await meta.isDisabled())) return;
  const before = await sliceSignature(page);
  soon(before.mode, '切换前应已选中 4v4，空签名不算「保持不变」').toBe('ladder-mode-4v4');
  await tiers.click();
  soon(hashQuery(page.url()).get('view')).toBe('tiers');
  soon(await sliceSignature(page), '点分层后筛选、勾选、fetchedAt 不变').toEqual(before);
  await meta.click();
  soon(hashQuery(page.url()).get('view')).toBe('meta');
  soon(await sliceSignature(page), '点分布后筛选、勾选、fetchedAt 不变').toEqual(before);
  if ((await table.count()) === 1) await table.click();
  soon(hashQuery(page.url()).get('view'), '回到表时 view 省略').toBeNull();
  soon(await sliceSignature(page)).toEqual(before);
  const hide = page.getByTestId('ladder-hide-low');
  if ((await hide.count()) !== 1) return;
  const checked = await hide.isChecked();
  await hide.click();
  soon(`${hashQuery(page.url())}`, '勾选不进地址').not.toMatch(/hide|low/);
  soon(await sliceSignature(page), '改隐藏低样本不改模式、时段、分段、地图、fetchedAt').toEqual({ ...before, hide: !checked });
});
