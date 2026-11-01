import { resolveElo, type LadderSnapshot } from './ladder';

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
