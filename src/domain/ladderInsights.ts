/** AoE2 Insights 地图快照。页面只读静态文件；这里不做网络请求，也不把缺失值补成 0。 */

export const INSIGHTS_MAP_KEYS = ['rm-arabia', 'arena'] as const;
export type InsightsMapKey = (typeof INSIGHTS_MAP_KEYS)[number];

export interface InsightsRow {
  civilization: string;
  aggWinRate: number;
  aggPlayRate: number;
  aggNMatches: number;
  nRows: number;
  aggNWon: number;
}

export interface InsightsSnapshot {
  kind: 'aoe2insights-match-ups';
  source: string;
  sourceUrl: string;
  queryUrl: string;
  fetchedAt: string;
  fetchedAtOrigin: 'http-date' | 'local-receipt';
  rawSha256: string;
  rawFile: string;
  ladder: { id: number; label: string };
  map: { id: number; key: InsightsMapKey; en: string; zh: string };
  elo: { filtered: boolean; note: string };
  patch: { filtered: boolean; id: number | null; dateStatus: 'absent' | 'unconfirmed' | 'official'; note: string; date?: string };
  period: { filtered: boolean; note: string };
  sample: { field: string; unit: 'row' | 'unconfirmed'; unitStatus: 'verified-equal-n_rows' | 'unconfirmed'; note: string };
  lowSample: { threshold: number; field: string; status: 'pending'; note: string };
  rows: InsightsRow[];
}

export type InsightsRead = { ok: true; snapshot: InsightsSnapshot } | { ok: false; reason: string };

const SHA = /^[0-9a-f]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function filtersOf(queryUrl: string): { field: string; value: unknown }[] {
  const url = new URL(queryUrl);
  return url.searchParams.getAll('filter').map((item) => {
    const parsed: unknown = JSON.parse(item);
    if (!isRecord(parsed) || typeof parsed.field !== 'string') throw new Error('filter');
    return { field: parsed.field, value: parsed.value };
  });
}

/** 来源条口径必须和查询 URL 里的 filter 一致。对不上就整份拒绝。 */
export function queryAgrees(snapshot: Pick<InsightsSnapshot, 'queryUrl' | 'ladder' | 'map' | 'elo' | 'patch' | 'period'>): boolean {
  let filters: { field: string; value: unknown }[];
  try {
    filters = filtersOf(snapshot.queryUrl);
  } catch {
    return false;
  }
  const ladder = filters.find((item) => item.field === 'ladder');
  const map = filters.find((item) => item.field === 'map');
  if (!ladder || ladder.value !== snapshot.ladder.id || !map || map.value !== snapshot.map.id) return false;
  const extra = filters.filter((item) => item.field !== 'ladder' && item.field !== 'map');
  if (extra.length > 0) return false;
  if (!snapshot.elo.filtered && filters.some((item) => item.field === 'elo_group')) return false;
  if (!snapshot.patch.filtered && filters.some((item) => item.field === 'patch')) return false;
  if (!snapshot.period.filtered && filters.some((item) => item.field === 'started_time' || item.field === 'month')) return false;
  return true;
}

function readRow(value: unknown): InsightsRow | null {
  if (!isRecord(value)) return null;
  const civilization = value.civilization;
  const aggWinRate = value.aggWinRate;
  const aggPlayRate = value.aggPlayRate;
  const aggNMatches = value.aggNMatches;
  const nRows = value.nRows;
  const aggNWon = value.aggNWon;
  if (typeof civilization !== 'string' || civilization.trim() === '') return null;
  if (typeof aggWinRate !== 'number' || !Number.isFinite(aggWinRate) || aggWinRate < 0 || aggWinRate > 1) return null;
  if (typeof aggPlayRate !== 'number' || !Number.isFinite(aggPlayRate) || aggPlayRate < 0 || aggPlayRate > 1) return null;
  if (!Number.isInteger(aggNMatches) || (aggNMatches as number) < 0) return null;
  if (!Number.isInteger(nRows) || (nRows as number) < 0) return null;
  if (!Number.isInteger(aggNWon) || (aggNWon as number) < 0) return null;
  return {
    civilization,
    aggWinRate,
    aggPlayRate,
    aggNMatches: aggNMatches as number,
    nRows: nRows as number,
    aggNWon: aggNWon as number,
  };
}

/** 缺字段、空行、查询和声明不一致都整份拒绝，不补 0、不改用另一张图。 */
export function readInsightsSnapshot(value: unknown): InsightsRead {
  if (!isRecord(value)) return { ok: false, reason: '快照不是对象' };
  if (value.kind !== 'aoe2insights-match-ups') return { ok: false, reason: '快照类型不符' };
  if (typeof value.rawSha256 !== 'string' || !SHA.test(value.rawSha256)) return { ok: false, reason: '缺少 sha256' };
  if (typeof value.fetchedAt !== 'string' || value.fetchedAt.trim() === '') return { ok: false, reason: '缺少采集时间' };
  if (!isRecord(value.ladder) || !isRecord(value.map) || !isRecord(value.sample) || !isRecord(value.lowSample)) {
    return { ok: false, reason: '缺少口径' };
  }
  if (!isRecord(value.elo) || !isRecord(value.patch) || !isRecord(value.period)) return { ok: false, reason: '缺少筛选声明' };
  if (!Array.isArray(value.rows)) return { ok: false, reason: '缺少行' };
  if (value.rows.length === 0) return { ok: false, reason: '没有文明行' };
  const rows: InsightsRow[] = [];
  for (const item of value.rows) {
    const row = readRow(item);
    if (!row) return { ok: false, reason: '行里有缺失或非法统计' };
    rows.push(row);
  }
  const names = new Set(rows.map((row) => row.civilization));
  if (names.size !== rows.length) return { ok: false, reason: '文明重复' };
  const threshold = value.lowSample.threshold;
  if (!Number.isInteger(threshold) || (threshold as number) < 0) return { ok: false, reason: '低样本阈值无效' };
  const patchId = value.patch.id;
  if (patchId !== null && !Number.isInteger(patchId)) return { ok: false, reason: '补丁号无效' };
  const mapKey = value.map.key;
  const mapId = value.map.id;
  if ((mapKey !== 'rm-arabia' || mapId !== 9) && (mapKey !== 'arena' || mapId !== 29)) return { ok: false, reason: '地图编号不符' };
  if (value.sample.unitStatus !== 'verified-equal-n_rows' && value.sample.unitStatus !== 'unconfirmed') {
    return { ok: false, reason: '样本单位声明无效' };
  }
  const snapshot = value as unknown as InsightsSnapshot;
  const checked: InsightsSnapshot = { ...snapshot, rows };
  if (checked.sample.unitStatus === 'verified-equal-n_rows') {
    if (checked.sample.unit !== 'row' || rows.some((row) => row.aggNMatches !== row.nRows)) {
      return { ok: false, reason: 'agg_n_matches 与 n_rows 不一致' };
    }
  }
  if (!checked.patch.filtered && (checked.patch.id !== null || checked.patch.dateStatus !== 'absent')) {
    return { ok: false, reason: '全时段快照不能带补丁号' };
  }
  if (!queryAgrees(checked)) return { ok: false, reason: '查询 URL 和筛选声明不一致' };
  return { ok: true, snapshot: checked };
}

/** 0–1 的来源比率显示成百分数。不是重新估算。极小值避免被舍成 0.00%。 */
export function formatRatioPercent(ratio: number): string {
  const percent = ratio * 100;
  const rounded2 = Math.round((percent + Number.EPSILON) * 100) / 100;
  if (ratio !== 0 && rounded2 === 0) {
    const rounded4 = Math.round((percent + Number.EPSILON) * 10000) / 10000;
    return `${rounded4.toFixed(4)}%`;
  }
  return `${rounded2.toFixed(2)}%`;
}

/** 样本缺失或为 0 时不把胜率显示成可靠数字。真实 0 胜率在样本大于 0 时保留。 */
export function presentWin(rate: number | null | undefined, sample: number | null | undefined): { text: string; reliable: boolean } {
  if (typeof sample !== 'number' || !Number.isFinite(sample) || sample === 0) return { text: '未收录', reliable: false };
  if (typeof rate !== 'number' || !Number.isFinite(rate)) return { text: '未收录', reliable: false };
  return { text: formatRatioPercent(rate), reliable: true };
}

/** 阈值 T 本身不标低样本。比较的是调用方声明的字段，这里不换算。 */
export function isLowSampleCount(sample: number | null | undefined, threshold: number): boolean {
  return typeof sample === 'number' && Number.isFinite(sample) && sample > 0 && sample < threshold;
}

export function sampleHeading(sample: InsightsSnapshot['sample']): string {
  if (sample.unitStatus === 'verified-equal-n_rows' && sample.unit === 'row') return '玩家行';
  return `${sample.field} · 单位待确认`;
}

/** 没有官方对应时只留补丁号。全时段不写日期，也不借用别的补丁。 */
export function patchLabel(patch: { filtered: boolean; id: number | null; dateStatus: string; date?: string }): string {
  if (!patch.filtered || patch.id == null || patch.dateStatus === 'absent') return '未按补丁筛选';
  if (patch.dateStatus !== 'official' || !patch.date) return String(patch.id);
  return `${patch.id} · ${patch.date}`;
}

export function collectedLabel(fetchedAt: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})Z$/.exec(fetchedAt.trim());
  if (!match) return fetchedAt;
  return `${match[1]} ${match[2]} UTC`;
}
