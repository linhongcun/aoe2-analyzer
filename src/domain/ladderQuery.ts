import { DISPLAY_BRACKETS, resolveElo, viewBracket, type LadderSnapshot } from './ladder';

export type LadderModeId = '4v4' | 'arabia1v1';
export type LadderPendingView = 'tiers' | 'meta';

export interface LadderLocation {
  mode: LadderModeId;
  elo: string;
  pendingView: LadderPendingView | null;
  toast: string | null;
}

/** 默认 4v4 切片不写 mode / elo / period / map。表视图不写 view。分层和分布先留在地址上。 */
export function canonicalLadderSearch(state: Pick<LadderLocation, 'mode' | 'elo' | 'pendingView'>): string {
  const params = new URLSearchParams();
  if (state.mode === 'arabia1v1') params.set('mode', 'arabia1v1');
  if (state.mode === 'arabia1v1' && state.elo !== 'all') params.set('elo', state.elo);
  if (state.pendingView) params.set('view', state.pendingView);
  const query = params.toString();
  return query ? `?${query}` : '';
}

function bracketLabel(raw: string): string {
  if (raw === 'lt850') return '<850';
  if (raw === '850-1000') return '850-1000';
  if (raw === '1000-1200') return '1000-1200';
  if (raw === '1200+') return '1200+';
  if (raw === '1900+') return '1900+';
  return raw;
}

export function resolveLadderLocation(search: string, arabia: LadderSnapshot): LadderLocation {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const rawMode = params.get('mode');
  const rawView = params.get('view');
  const rawElo = params.get('elo');
  const toasts: string[] = [];

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
  const unrecognizedMode = rawMode != null && rawMode !== '' && rawMode !== '4v4' && rawMode !== 'arabia1v1';
  if (mode === 'arabia1v1') {
    const resolved = resolveElo(rawElo, arabia);
    elo = resolved.elo;
    if (resolved.toast) toasts.push(resolved.toast);
  } else if (!unrecognizedMode && rawElo != null && rawElo !== '' && rawElo !== '1200-1400') {
    toasts.push(`「${bracketLabel(rawElo)}」暂无数据，已显示「1200–1400」。`);
  }

  if (mode === '4v4' && !unrecognizedMode) {
    const period = params.get('period');
    if (period != null && period !== '' && period !== '90d') toasts.push(`「${period}」暂无数据，已显示「近 90 天」。`);
    const map = params.get('map');
    if (map != null && map !== '' && map !== 'all') toasts.push(`「${map}」暂无数据，已显示「全图」。`);
  }
  if (mode === 'arabia1v1') {
    const period = params.get('period');
    if (period != null && period !== '') toasts.push(`「${period}」暂无数据，已显示「整段快照」。`);
    const map = params.get('map');
    if (map != null && map !== '' && map !== 'arabia') toasts.push(`「${map}」暂无数据，已显示「阿拉伯」。`);
  }

  return { mode, elo, pendingView, toast: toasts[0] ?? null };
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

/**
 * 有文明数据的档可以选，并切到持有该档的快照。
 * 站内已定义、但两份快照都没有的档保持停用。
 * 缺的文件：阿拉伯 `lt850` / `850-1000` / `1000-1200` / `1200+` / `1900+`，以及 4v4 除 `1200-1400` 以外的 Elo。
 */
export function eloFilterOptions(mode: LadderModeId, elo: string, arabia: LadderSnapshot, team: LadderSnapshot): EloFilterOption[] {
  const owned: EloFilterOption[] = [];
  const taken = new Set<string>();
  const addSnapshot = (snapshot: LadderSnapshot, owner: LadderModeId) => {
    for (const bracket of snapshot.brackets) {
      const view = viewBracket(snapshot, bracket.key);
      const id = `${owner}:${bracket.key}`;
      if (view.empty || taken.has(id)) continue;
      taken.add(id);
      taken.add(bracket.key);
      owned.push({
        key: bracket.key,
        label: displayEloLabel(owner, bracket.key, view.label),
        mode: owner,
        elo: queryElo(owner, bracket.key),
        enabled: true,
        current: isCurrentBand(mode, elo, owner, bracket.key),
      });
    }
  };
  if (mode === '4v4') {
    addSnapshot(team, '4v4');
    addSnapshot(arabia, 'arabia1v1');
  } else {
    addSnapshot(arabia, 'arabia1v1');
    addSnapshot(team, '4v4');
  }
  const missing = DISPLAY_BRACKETS.filter((band) => !taken.has(band.key)).map((band) => ({
    key: band.key,
    label: band.label,
    mode,
    elo: band.key,
    enabled: false,
    current: false,
  }));
  return [...owned, ...missing];
}
