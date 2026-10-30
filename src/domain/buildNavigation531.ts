/** 开局导航只更改路线与视图，不重置来源对阵和兼容的模拟设置。 */
import civs from '../data/raw/civs';

type BuildQuery = URLSearchParams | string;
const knownCiv = (value: string | null) => (civs.some((civ) => civ.en === value) ? value : null);

/** 兼容 S1：civ 是本页文明，单独的 me 或 opp 表示原对阵另一侧。 */
export function buildNavigationParams(query: BuildQuery): URLSearchParams {
  const next = new URLSearchParams(query);
  const civ = next.getAll('civ').length === 1 ? knownCiv(next.get('civ')) : null;
  if (!civ || (next.get('from') !== 'matchup' && !next.has('opp'))) return next;
  if (!next.has('me') && next.getAll('opp').length === 1 && knownCiv(next.get('opp'))) next.set('me', civ);
  else if (!next.has('opp') && next.getAll('me').length === 1 && knownCiv(next.get('me'))) next.set('opp', civ);
  return next;
}

export function buildOrderPath(query: BuildQuery, id: string, view: 'practice' | 'print' | null = null): string {
  const next = buildNavigationParams(query);
  const resetStep = next.has('step') && next.has('bo') && next.get('bo') !== id;
  next.set('bo', id);
  next.delete('step');
  if (view) next.set('view', view);
  else next.delete('view');
  if (resetStep) next.set('ctxStepReset', '1');
  return `/builds?${next}`;
}

export function buildListPath(query: BuildQuery): string {
  const next = buildNavigationParams(query);
  for (const key of ['bo', 'step', 'view', 'ctxStepReset']) next.delete(key);
  return '/builds' + (next.size ? `?${next}` : '');
}

/** 控件内编辑保留当前视图；换路线后旧步骤索引不再等价。 */
export function patchBuildParams(query: BuildQuery, patch: Record<string, string | null>): URLSearchParams {
  const next = buildNavigationParams(query);
  if (patch.bo && patch.bo !== next.get('bo')) {
    if (next.has('step')) next.set('ctxStepReset', '1');
    next.delete('step');
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  if ('step' in patch) next.delete('ctxStepReset');
  return next;
}
