/** 阿拉伯 1v1 天梯：排序、百分数展示、分段深链。只露出有文明数据的分段。数字只来自快照，这里不做换算。 */

export const LOW_SAMPLE = 300;

/** 分段名单与顺序。没有文明数据的档不画芯片，深链回到「全部」。 */
export const DISPLAY_BRACKETS = [
  { key: 'all', label: '全部' },
  { key: 'lt850', label: '<850' },
  { key: '850-1000', label: '850-1000' },
  { key: '1000-1200', label: '1000-1200' },
  { key: '1200+', label: '1200+' },
  { key: '1900+', label: '1900+' },
] as const;

export type BracketKey = (typeof DISPLAY_BRACKETS)[number]['key'];

export interface LadderCivStat {
  en: string;
  /** 已经是 0–100 的百分数，展示时不再乘 100。 */
  winRate: number;
  playRate: number;
  games: number;
  wins?: number;
  ci95Low?: number;
  ci95High?: number;
  trend?: LadderTrendPoint[];
}

export interface LadderBracket {
  key: string;
  label: string;
  games: number;
  civs: LadderCivStat[];
}

export interface LadderTrendPoint {
  period: string;
  winRate: number;
  games?: number;
}

export interface LadderSnapshot {
  source: string;
  sourceUrl: string;
  map: string;
  mode: string;
  fetchedAt: string;
  patchNote?: string;
  period?: { key: string; from: string; to: string };
  elo?: { min: number; max: number };
  sample?: { unit: string; note?: string };
  lowSampleGames?: number;
  brackets: LadderBracket[];
}

export type BeginnerTier = 'easy' | 'mid' | 'advanced' | 'pending';

export const TIER_LABEL: Record<BeginnerTier, string> = {
  easy: '易上手',
  mid: '中等',
  advanced: '进阶',
  pending: '待补',
};

export const TIER_RANK: Record<BeginnerTier, number> = {
  easy: 0,
  mid: 1,
  advanced: 2,
  pending: 3,
};

export interface BeginnerEntry {
  en: string;
  tier: BeginnerTier;
  reason?: string;
  bonusIdx?: number[];
}

export interface BeginnerNotes {
  note?: string;
  entries: BeginnerEntry[];
}

export type SortKey = 'name' | 'win' | 'play' | 'games' | 'tier';
export type SortDir = 'asc' | 'desc';

export interface SortableCiv extends LadderCivStat {
  nameKey: string;
  tierRank: number;
}

/** 深链分段。无参数、空串和 all 留在「全部」且不提示。未知 key、以及名单内但没有文明数据的档，都回到「全部」并复用同一条 toast。 */
export function resolveElo(raw: string | null, snapshot: LadderSnapshot): { elo: BracketKey; toast: string | null } {
  if (raw == null || raw === '' || raw === 'all') return { elo: 'all', toast: null };
  const preset = DISPLAY_BRACKETS.find((bracket) => bracket.key === raw);
  if (!preset) return { elo: 'all', toast: `未识别的分段「${raw}」，已显示「全部」。` };
  if (viewBracket(snapshot, preset.key).empty) return { elo: 'all', toast: `「${preset.label}」暂无数据，已显示「全部」。` };
  return { elo: preset.key, toast: null };
}

/** 默认分段不写入查询串。sort / dir / civ 一律不进地址。 */
export function canonicalSearch(elo: string): string {
  if (elo === 'all') return '';
  const next = new URLSearchParams();
  next.set('elo', elo);
  return `?${next.toString()}`;
}

export function viewBracket(snapshot: LadderSnapshot, key: string) {
  const preset = DISPLAY_BRACKETS.find((bracket) => bracket.key === key);
  const data = snapshot.brackets.find((bracket) => bracket.key === key);
  const civs = data?.civs ?? [];
  const empty = civs.length === 0;
  return {
    key,
    label: (empty ? preset?.label : data?.label) || preset?.label || key,
    games: empty ? 0 : (data?.games ?? 0),
    civs,
    empty,
  };
}

/** 有文明数据的分段，顺序与 DISPLAY_BRACKETS 相同。 */
export function visibleBrackets(snapshot: LadderSnapshot) {
  return DISPLAY_BRACKETS.filter((bracket) => !viewBracket(snapshot, bracket.key).empty);
}

export function friendliness(en: string, entries: readonly BeginnerEntry[]) {
  const found = entries.find((entry) => entry.en === en);
  if (!found || found.tier === 'pending') return { tier: 'pending' as const, reason: '', bonusIdx: [] as number[] };
  return { tier: found.tier, reason: found.reason?.trim() ?? '', bonusIdx: found.bonusIdx ?? [] };
}

/** 快照百分数原样取两位小数，不乘 100。51.4 显示为 51.40%。 */
export function formatPercent(value: number): string {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return `${rounded.toFixed(2)}%`;
}

export function formatGames(games: number): string {
  return new Intl.NumberFormat('en-US').format(games);
}

export function isLowSample(games: number): boolean {
  return games < LOW_SAMPLE;
}

export function snapshotPatchBuild(patchNote: string | undefined): string | null {
  return patchNote?.match(/\d{5,}/)?.[0] ?? null;
}

export function isPatchMismatch(patchNote: string | undefined, siteBuild: number): boolean {
  const patch = snapshotPatchBuild(patchNote);
  return patch != null && patch !== String(siteBuild);
}

/** 解析不出补丁号时 `isPatchMismatch` 为 false，但仍不是本站当前平衡。 */
export function isBalanceAligned(patchNote: string | undefined, siteBuild: number): boolean {
  const patch = snapshotPatchBuild(patchNote);
  return patch != null && patch === String(siteBuild);
}

/** 玩家看到的统计截止。有窗口时用窗口最后一天，不用取回日。 */
export function snapshotCutoff(snapshot: { fetchedAt: string; period?: { to?: string } }): string {
  return snapshot.period?.to || snapshot.fetchedAt;
}

/** 快照没有样本量时的占位。不留空白。 */
export const SAMPLE_UNLISTED = '样本未收录';

/** 0 是收录了的零。缺字段、空值和非数字才算未收录。 */
export function sampleGames(games: number | null | undefined): number | null {
  if (typeof games !== 'number' || !Number.isFinite(games)) return null;
  return games;
}

export type RelativeFreshness =
  { kind: 'missing' } | { kind: 'future' } | { kind: 'today' } | { kind: 'under-hour' } | { kind: 'hours'; count: number } | { kind: 'days'; count: number };

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))$/;

function isValidYmd(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

/**
 * 相对快照 `fetchedAt` 的新鲜度。只有日期时按本机日历算天数；带时间才分小时。
 * 不满 1 小时不再往下拆，避免秒级「近实时」。不自动刷新。
 */
export function relativeFreshness(fetchedAt: string, now: Date): RelativeFreshness {
  const raw = fetchedAt.trim();
  const dateOnly = DATE_ONLY.exec(raw);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    if (!isValidYmd(year, month, day)) return { kind: 'missing' };
    const fetched = Date.UTC(year, month - 1, day);
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((today - fetched) / 86_400_000);
    if (days < 0) return { kind: 'future' };
    if (days === 0) return { kind: 'today' };
    return { kind: 'days', count: days };
  }
  if (!DATE_TIME.test(raw)) return { kind: 'missing' };
  const instant = Date.parse(raw);
  if (!Number.isFinite(instant)) return { kind: 'missing' };
  const elapsed = now.getTime() - instant;
  if (elapsed < 0) return { kind: 'future' };
  const hour = 3_600_000;
  if (elapsed < hour) return { kind: 'under-hour' };
  if (elapsed < 24 * hour) return { kind: 'hours', count: Math.floor(elapsed / hour) };
  return { kind: 'days', count: Math.floor(elapsed / (24 * hour)) };
}

/** 给测试和纯文本断言用。界面上的数字另包 `.num`。 */
export function freshnessText(value: RelativeFreshness): string {
  if (value.kind === 'missing') return '更新时间未收录';
  if (value.kind === 'future') return '更新日晚于本机';
  if (value.kind === 'today') return '更新于今天';
  if (value.kind === 'under-hour') return '更新于不到 1 小时';
  if (value.kind === 'hours') return `更新于 ${value.count} 小时前`;
  return `更新于 ${value.count} 天前`;
}

export function isPlayerSample(unit: string | undefined): boolean {
  return unit === 'player';
}

/** 来源字段若是站点名，不印到界面上。 */
export function visibleSourceLabel(source: string): string {
  return /aoe2scout/i.test(source) ? '来源' : source;
}

export type WinBand = 'S' | 'A' | 'B' | 'C' | 'D';

/** 产品锁定：S≥52，A≥51，B≥50，C≥48，其余 D。线上归上一档。 */
export function winBand(winRate: number): WinBand {
  if (winRate >= 52) return 'S';
  if (winRate >= 51) return 'A';
  if (winRate >= 50) return 'B';
  if (winRate >= 48) return 'C';
  return 'D';
}

export function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const left = sorted[mid - 1];
  const right = sorted[mid];
  if (left == null || right == null) return null;
  return (left + right) / 2;
}

export type MetaQuadrant = '强且少见' | '强且常见' | '弱且少见' | '弱且常见';

/** 胜率 ≥50 算强，出场率 ≥中位数算常见。线上不掉进弱或少见。 */
export function metaQuadrant(winRate: number, playRate: number, pickMedian: number): MetaQuadrant {
  const strong = winRate >= 50;
  const common = playRate >= pickMedian;
  if (strong && common) return '强且常见';
  if (strong) return '强且少见';
  if (common) return '弱且常见';
  return '弱且少见';
}

/** 胜率减去 50 个百分点。正负用色，零保持 muted。 */
export function formatWinDelta(winRate: number): { text: string; tone: 'good' | 'bad' | 'muted' } {
  const delta = Math.round((winRate - 50) * 100) / 100;
  const abs = Math.abs(delta).toFixed(2);
  if (delta > 0) return { text: `+${abs}`, tone: 'good' };
  if (delta < 0) return { text: `−${abs}`, tone: 'bad' };
  return { text: abs, tone: 'muted' };
}

export function firstSortDir(key: SortKey): SortDir {
  return key === 'name' || key === 'tier' ? 'asc' : 'desc';
}

export function toggleSort(current: { key: SortKey; dir: SortDir }, key: SortKey): { key: SortKey; dir: SortDir } {
  if (current.key !== key) return { key, dir: firstSortDir(key) };
  return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
}

export function compareLadder(a: SortableCiv, b: SortableCiv, key: SortKey, dir: SortDir): number {
  const sign = dir === 'asc' ? 1 : -1;
  const primary =
    key === 'win'
      ? a.winRate - b.winRate
      : key === 'play'
        ? a.playRate - b.playRate
        : key === 'games'
          ? a.games - b.games
          : key === 'tier'
            ? a.tierRank - b.tierRank
            : a.nameKey.localeCompare(b.nameKey, 'en');
  const diff = primary === 0 ? a.en.localeCompare(b.en, 'en') : primary;
  return diff * sign;
}

export function sortLadder<T extends SortableCiv>(rows: readonly T[], key: SortKey, dir: SortDir): T[] {
  return [...rows].sort((a, b) => compareLadder(a, b, key, dir));
}
