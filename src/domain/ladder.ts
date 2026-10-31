/** #33 阿拉伯 1v1 天梯：排序、百分数展示、分段深链。数字只来自快照，这里不做换算。 */

export const LOW_SAMPLE = 300;

/** 页面上固定出现的 Elo 芯片。快照里还没有的分段保持空态，不推算。 */
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
}

export interface LadderBracket {
  key: string;
  label: string;
  games: number;
  civs: LadderCivStat[];
}

export interface LadderSnapshot {
  source: string;
  sourceUrl: string;
  map: string;
  mode: string;
  fetchedAt: string;
  patchNote?: string;
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

const BRACKET_KEYS = new Set<string>(DISPLAY_BRACKETS.map((bracket) => bracket.key));

export function resolveElo(raw: string | null): { elo: BracketKey; illegal: string | null } {
  if (raw == null || raw === '' || raw === 'all') return { elo: 'all', illegal: null };
  if (BRACKET_KEYS.has(raw)) return { elo: raw as BracketKey, illegal: null };
  return { elo: 'all', illegal: raw };
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

export function friendliness(en: string, entries: readonly BeginnerEntry[]) {
  const found = entries.find((entry) => entry.en === en);
  if (!found || found.tier === 'pending') return { tier: 'pending' as const, reason: '', bonusIdx: [] as number[] };
  return { tier: found.tier, reason: found.reason?.trim() ?? '', bonusIdx: found.bonusIdx ?? [] };
}

/** 保留快照里的百分数，最多两位小数，不乘 100。 */
export function formatPercent(value: number): string {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  const text = rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `${text}%`;
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
