/** S1 对阵路径：me/opp 始终指原对阵双方，civ 指当前页面所属文明。 */
import civs from '../data/raw/civs';
import { parseSide, type SideSpec } from './duelState';

const knownCiv = (en: string | null | undefined) => (civs.some((c) => c.en === en) ? en! : undefined);

export function readMatchupPair(params: URLSearchParams, sticky: { me: string; opp: string }) {
  const me = knownCiv(params.get('me'));
  const opp = knownCiv(params.get('opp'));
  return {
    me: me ?? sticky.me,
    opp: opp ?? sticky.opp,
    invalid: (params.has('me') && !me) || (params.has('opp') && !opp),
  };
}

export function writeMatchupPair(params: URLSearchParams, me: string, opp: string) {
  const next = new URLSearchParams(params);
  next.set('me', me);
  next.set('opp', opp);
  return next;
}

export function matchupPath(me?: string | null, opp?: string | null) {
  const params = new URLSearchParams();
  if (me) params.set('me', me);
  if (opp) params.set('opp', opp);
  return '/matchup' + (params.size ? `?${params}` : '');
}

export function buildsPath(civ?: string, from?: 'duel') {
  const params = new URLSearchParams();
  if (civ) params.set('civ', civ);
  if (from) params.set('from', from);
  return '/builds' + (params.size ? `?${params}` : '');
}

export function matchupBuildPath(me: string, opp: string, side: 'me' | 'opp', bo?: string) {
  const params = new URLSearchParams({ civ: side === 'me' ? me : opp, from: 'matchup' });
  params.set(side === 'me' ? 'opp' : 'me', side === 'me' ? opp : me);
  if (bo) params.set('bo', bo);
  return `/builds?${params}`;
}

export function buildsMatchupReturn(params: URLSearchParams) {
  if (params.get('from') !== 'matchup' && !params.has('opp')) return null;
  return params.has('me') ? matchupPath(params.get('me'), params.get('civ')) : matchupPath(params.get('civ'), params.get('opp'));
}

export const matchupUnitPath = (id: number, me: string, opp: string) => `/unit/${id}?${new URLSearchParams({ civ: me, from: 'matchup', me, opp })}`;

const EMPTY_SIDE: SideSpec = { uid: 0, civ: '', age: 4, techs: [], team: [] };
export function duelCivs(params: URLSearchParams) {
  return { me: knownCiv(parseSide(params.get('a'), EMPTY_SIDE).civ), opp: knownCiv(parseSide(params.get('b'), EMPTY_SIDE).civ) };
}
