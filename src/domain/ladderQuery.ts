import { DISPLAY_BRACKETS, resolveElo, viewBracket, type LadderSnapshot } from './ladder';

export type LadderModeId = '4v4' | 'arabia1v1';
export type LadderPendingView = 'tiers' | 'meta';

export interface LadderLocation {
  mode: LadderModeId;
  elo: string;
  pendingView: LadderPendingView | null;
  toast: string | null;
  /** 这个模式和 Elo 没有文明数据。地址留着，页面不改展示另一档的胜率。 */
  missing: boolean;
}

/** 默认 4v4 切片不写 mode / elo / period / map。表视图不写 view。无数据组合保留 mode 和 elo。 */
export function canonicalLadderSearch(state: Pick<LadderLocation, 'mode' | 'elo' | 'pendingView'> & { missing?: boolean }): string {
  const params = new URLSearchParams();
  if (state.missing) {
    params.set('mode', state.mode);
    if (state.elo) params.set('elo', state.elo);
  } else {
    if (state.mode === 'arabia1v1') params.set('mode', 'arabia1v1');
    if (state.mode === 'arabia1v1' && state.elo !== 'all') params.set('elo', state.elo);
    if (state.mode === '4v4' && state.elo !== 'all') {
      params.set('mode', '4v4');
      params.set('elo', state.elo);
    }
  }
  if (state.pendingView) params.set('view', state.pendingView);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function resolveLadderLocation(search: string, arabia: LadderSnapshot, team?: LadderSnapshot): LadderLocation {
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
  if (mode === 'arabia1v1') {
    if (askedElo == null || askedElo === '' || askedElo === 'all') {
      elo = 'all';
    } else if (isLegalEloKey(askedElo)) {
      elo = askedElo;
      missing = viewBracket(arabia, askedElo).empty;
    } else {
      const resolved = resolveElo(askedElo, arabia);
      elo = resolved.elo;
      if (resolved.toast) toasts.push(resolved.toast);
    }
  } else if (!unrecognizedMode && askedElo != null && askedElo !== '' && askedElo !== 'all' && askedElo !== TEAM_ELO_KEY) {
    elo = askedElo;
    const filled = team != null && isLegalEloKey(askedElo) && !viewBracket(team, askedElo).empty;
    missing = !filled;
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

  return { mode, elo, pendingView, toast: toasts[0] ?? null, missing };
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

const LEGAL_ELO_KEYS = new Set<string>([...DISPLAY_BRACKETS.map((band) => band.key), TEAM_ELO_KEY]);

function isLegalEloKey(key: string): boolean {
  return LEGAL_ELO_KEYS.has(key);
}

function displayEloLabel(key: string, fallback: string): string {
  if (key === TEAM_ELO_KEY) return TEAM_ELO_LABEL;
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
      eloLabel: displayEloLabel(view.key, view.label),
      mapKey: 'all',
      mapLabel: '全图',
    };
  }
  const view = sliceBracket(mode, elo, arabia, team);
  return {
    mode,
    modeLabel: '阿拉伯 1v1',
    eloKey: view.key,
    eloLabel: displayEloLabel(view.key, view.label),
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
      label: displayEloLabel(band.key, band.label),
      mode,
      elo: queryElo(mode, band.key),
      enabled: !view.empty,
      current: isCurrentBand(mode, elo, mode, band.key),
    };
  });
}

/** 有快照的档，加上当前请求但本模式没有快照的那一档。其余空档不画芯片。 */
export function renderedEloOptions(options: readonly EloFilterOption[]): EloFilterOption[] {
  return options.filter((option) => option.enabled || option.current);
}
