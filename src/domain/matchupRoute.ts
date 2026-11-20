/** S1 对阵路径：me/opp 始终指原对阵双方，civ 指当前页面所属文明。 */
import { civByEn } from '../data';
import { parseSide, type SideSpec } from './duelState';

const knownCiv = (en: string | null | undefined) => (typeof en === 'string' && civByEn(en) !== undefined ? en : undefined);

export const RUSH_NAMES = { militia: '民兵快攻', scouts: '肉马', archers: '步弓', towers: '塔爆' } as const;
export type RushId = keyof typeof RUSH_NAMES;
export const DEFAULT_RUSH: RushId = 'militia';

export function encodeRushPractice(me: string, opp: string, rush: RushId) {
  return new URLSearchParams({ practice: `${me}.${opp}.${rush}` });
}

/** 演练来源独立于会在 PK 中被编辑的战斗参数。 */
export function readRushPractice(params: URLSearchParams) {
  const [source, ...duplicates] = params.getAll('practice');
  if (!source || duplicates.length) return null;
  const [me, opp, rush, ...extra] = source.split('.');
  if (!me || !opp || !rush || extra.length || !isRushId(rush)) return null;
  const own = civByEn(me);
  const enemy = civByEn(opp);
  return own && enemy ? { own, enemy, rush } : null;
}

function isRushId(value: string): value is RushId {
  return Object.hasOwn(RUSH_NAMES, value);
}

export function readMatchupPair(params: URLSearchParams, sticky: { me: string; opp: string }) {
  if (params.has('pair')) {
    const valid =
      params.getAll('pair').length === 1 &&
      params.get('pair') === 'explicit' &&
      ['me', 'opp'].every((key) => params.getAll(key).length <= 1 && (!params.has(key) || knownCiv(params.get(key)) != null));
    return valid
      ? { me: knownCiv(params.get('me')) ?? null, opp: knownCiv(params.get('opp')) ?? null, invalid: false }
      : { me: null, opp: null, invalid: true };
  }
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

/** 显式部分对阵；不改变旧无marker调用者。 */
export function writeExplicitMatchupPair(params: URLSearchParams, me: string | null, opp: string | null) {
  const next = new URLSearchParams(params);
  next.set('pair', 'explicit');
  for (const [key, value] of [
    ['me', me],
    ['opp', opp],
  ] as const) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  return next;
}
export const explicitMatchupPath = (me: string | null, opp: string | null) => '/matchup?' + writeExplicitMatchupPair(new URLSearchParams(), me, opp);

export const matchupPracticePath = (me: string, opp: string, rush: RushId) => '/matchup?' + writeExplicitMatchupPair(new URLSearchParams({ rush }), me, opp);
