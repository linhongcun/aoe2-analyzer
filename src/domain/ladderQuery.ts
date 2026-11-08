import { DISPLAY_BRACKETS, resolveElo, viewBracket, type LadderSnapshot } from './ladder';
import { INSIGHTS_MAP_KEYS, type InsightsMapKey } from './ladderInsights';

export type LadderModeId = '4v4' | 'arabia1v1';
export type LadderPendingView = 'tiers' | 'meta';

export interface LadderLocation {
  mode: LadderModeId;
  elo: string;
  pendingView: LadderPendingView | null;
  toast: string | null;
  /** 这个模式和 Elo 没有文明数据。地址留着，页面不改展示另一档的胜率。 */
  missing: boolean;
  /** RM 1v1 的 Insights 地图。空表示仍用原来的 4v4 或阿拉伯固定快照。 */
  insightsMap: InsightsMapKey | null;
}

/** 默认 4v4 切片不写 mode / elo / period / map。表视图不写 view。无数据组合保留 mode 和 elo。 */
export function canonicalLadderSearch(
  state: Pick<LadderLocation, 'mode' | 'elo' | 'pendingView'> & { missing?: boolean; insightsMap?: InsightsMapKey | null },
): string {
  const params = new URLSearchParams();
  if (state.missing) {
    params.set('mode', state.mode);
    if (state.elo && state.elo !== 'all') params.set('elo', state.elo);
  } else {
    if (state.mode === 'arabia1v1') params.set('mode', 'arabia1v1');
    if (state.mode === 'arabia1v1' && state.elo !== 'all' && !state.insightsMap) params.set('elo', state.elo);
  }
  if (state.insightsMap) params.set('map', state.insightsMap);
  if (state.pendingView) params.set('view', state.pendingView);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function resolveLadderLocation(search: string, arabia: LadderSnapshot, options?: { insightsMaps?: readonly InsightsMapKey[] }): LadderLocation {
  const available = options?.insightsMaps ?? INSIGHTS_MAP_KEYS;
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const rawMode = params.get('mode');
  const rawView = params.get('view');
  const rawElo = params.get('elo');
  const toasts: string[] = [];
  const askedElo = rawElo?.replaceAll('–', '-') ?? null;

  let mode: LadderModeId;
  if (rawMode == null || rawMode === '') mode = rawElo != null ? 'arabia1v1' : '4v4';
  else if (rawMode === '4v4' || rawMode === 'arabia1v1') mode = rawMode;
  else {
    mode = '4v4';
    toasts.push(`未识别的模式「${rawMode}」，已显示「4v4 随机地图」。`);
  }

  let pendingView: LadderPendingView | null = null;
  if (rawView == null || rawView === '' || rawView === 'table') pendingView = null;
  else if (rawView === 'tiers' || rawView === 'meta') pendingView = rawView;
  else toasts.push(`未识别的视图「${rawView}」，已显示「表」。`);

  let elo = 'all';
  let missing = false;
  const unrecognizedMode = rawMode != null && rawMode !== '' && rawMode !== '4v4' && rawMode !== 'arabia1v1';
  const teamOnlyElo = askedElo === '1200-1400';
  if (mode === 'arabia1v1' && teamOnlyElo) {
    elo = '1200-1400';
    missing = true;
  } else if (mode === 'arabia1v1') {
    const resolved = resolveElo(rawElo, arabia);
    elo = resolved.elo;
    if (resolved.toast) toasts.push(resolved.toast);
  } else if (!unrecognizedMode && askedElo != null && askedElo !== '' && askedElo !== 'all' && askedElo !== '1200-1400') {
    elo = askedElo;
    missing = true;
  }

  const rawMap = params.get('map');
  let insightsMap: InsightsMapKey | null = null;
  if (rawMap === 'rm-arabia' || rawMap === 'arena') {
    insightsMap = rawMap;
    const present = available.includes(rawMap);
    for (let index = toasts.length - 1; index >= 0; index -= 1) {
      if (toasts[index]?.includes('已显示')) toasts.splice(index, 1);
    }
    if (mode !== 'arabia1v1' || !present) {
      missing = true;
    } else {
      missing = false;
      elo = 'all';
      if (askedElo != null && askedElo !== '' && askedElo !== 'all') toasts.unshift('该地图快照未分 Elo，已显示未筛选。');
    }
  } else if (mode === '4v4' && !unrecognizedMode) {
    const period = params.get('period');
    if (period != null && period !== '' && period !== '90d') toasts.push(`「${period}」暂无数据，已显示「近 90 天」。`);
    if (rawMap != null && rawMap !== '' && rawMap !== 'all') toasts.push(`「${rawMap}」暂无数据，已显示「全图」。`);
  } else if (mode === 'arabia1v1') {
    const period = params.get('period');
    if (period != null && period !== '') toasts.push(`「${period}」暂无数据，已显示「整段快照」。`);
    if (rawMap != null && rawMap !== '' && rawMap !== 'arabia') toasts.push(`「${rawMap}」暂无数据，已显示「阿拉伯」。`);
  }

  return { mode, elo, pendingView, toast: toasts[0] ?? null, missing, insightsMap };
}

/** 4v4 自有快照只有这一档。其它 Elo 段没有对应文件，不能编胜率。 */
export const TEAM_ELO_KEY = '1200-1400';
const TEAM_ELO_LABEL = '1200–1400';

export interface SliceFacts {
  mode: LadderModeId;
  modeLabel: string;
  eloKey: string;
  eloLabel: string;
  mapKey: string;
  mapLabel: string;
}

export interface EloFilterOption {
  key: string;
  label: string;
  mode: LadderModeId;
  /** 默认档写成 all，规范地址会省略。 */
  elo: string;
  enabled: boolean;
  current: boolean;
}

function teamEloKey(elo: string): string {
  if (elo === 'all' || elo === '' || elo === TEAM_ELO_KEY) return TEAM_ELO_KEY;
  return elo;
}

function displayEloLabel(mode: LadderModeId, key: string, fallback: string): string {
  if (mode === '4v4' && key === TEAM_ELO_KEY) return TEAM_ELO_LABEL;
  return fallback;
}

function queryElo(mode: LadderModeId, key: string): string {
  if (mode === '4v4' && key === TEAM_ELO_KEY) return 'all';
  if (mode === 'arabia1v1' && key === 'all') return 'all';
  return key;
}

function isCurrentBand(pageMode: LadderModeId, pageElo: string, mode: LadderModeId, key: string): boolean {
  if (pageMode !== mode) return false;
  if (mode === '4v4') return key === teamEloKey(pageElo);
  return key === pageElo;
}

/** 表用的那一档。没有文明数据时 civs 为空，调用方不得补胜率。 */
export function sliceBracket(mode: LadderModeId, elo: string, arabia: LadderSnapshot, team: LadderSnapshot) {
  if (mode === '4v4') return viewBracket(team, teamEloKey(elo));
  return viewBracket(arabia, elo);
}

/** 来源条上的模式、Elo、地图。三字段分开，换 Elo 不会把地图从这条里抹掉。 */
export function sliceFacts(mode: LadderModeId, elo: string, arabia: LadderSnapshot, team: LadderSnapshot): SliceFacts {
  if (mode === '4v4') {
    const view = sliceBracket(mode, elo, arabia, team);
    return {
      mode,
      modeLabel: '4v4 随机地图',
      eloKey: view.key,
      eloLabel: view.empty && view.key === TEAM_ELO_KEY ? TEAM_ELO_LABEL : displayEloLabel(mode, view.key, view.label),
      mapKey: 'all',
      mapLabel: '全图',
    };
  }
  const view = sliceBracket(mode, elo, arabia, team);
  return {
    mode,
    modeLabel: '阿拉伯 1v1',
    eloKey: view.key,
    eloLabel: view.label,
    mapKey: 'arabia',
    mapLabel: '阿拉伯',
  };
}

/** Elo 只筛当前模式；另一模式持有的数据不代表此组合可用。两模式保持同一分段顺序。 */
export function eloFilterOptions(mode: LadderModeId, elo: string, arabia: LadderSnapshot, team: LadderSnapshot): EloFilterOption[] {
  const bands = [...DISPLAY_BRACKETS.slice(0, 4), { key: TEAM_ELO_KEY, label: TEAM_ELO_LABEL }, ...DISPLAY_BRACKETS.slice(4)];
  const snapshot = mode === '4v4' ? team : arabia;
  return bands.map((band) => {
    const view = viewBracket(snapshot, band.key);
    return {
      key: band.key,
      label: displayEloLabel(mode, band.key, band.label),
      mode,
      elo: queryElo(mode, band.key),
      enabled: !view.empty,
      current: !view.empty && isCurrentBand(mode, elo, mode, band.key),
    };
  });
}

export interface MapFilterOption {
  key: InsightsMapKey;
  label: string;
  note: string;
  enabled: boolean;
  /** 地址选中了这张图。没有快照时仍选中，但表格不得改用别的图。 */
  current: boolean;
}

const MAP_LABEL: Record<InsightsMapKey, string> = { 'rm-arabia': '阿拉伯', arena: '竞技场' };

/** 地图不改写模式。4v4 没有这两张图的快照，按钮禁用。 */
export function insightsMapOptions(mode: LadderModeId, insightsMap: InsightsMapKey | null, available: readonly InsightsMapKey[]): MapFilterOption[] {
  return INSIGHTS_MAP_KEYS.map((key) => {
    const enabled = mode === 'arabia1v1' && available.includes(key);
    return {
      key,
      label: MAP_LABEL[key],
      note: '全时段',
      enabled,
      current: insightsMap === key,
    };
  });
}
