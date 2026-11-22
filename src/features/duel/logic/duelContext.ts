import { civByEn } from '../../../data';
import { DEFAULT_RUSH, matchupPath, matchupPracticePath, readRushPractice, RUSH_NAMES } from '../../../domain/matchupRoute';

/**
 * 五条语境链在规范化写回之后要读已经写入的查询串。
 * 返回 null 表示这一轮不用改 context。不改 duelCivs 怎么解析文明。
 * 这只补「写回之后没有再读」这一处，不表示语境链的其它问题已经查完。
 */
export function contextSearchAfterCanon(seen: string, incoming: string, canon: string): string | null {
  if (canon !== incoming) return canon;
  if (seen !== incoming) return incoming;
  return null;
}

export interface DuelMatchupContext {
  returnTo: string;
  practiceReturnLabel: string | null;
  civs: string[];
}

export interface DuelSourceParams {
  me?: string;
  opp?: string;
  practice?: string;
}

function singleKnownCiv(sp: URLSearchParams, key: 'me' | 'opp'): string | null {
  const all = sp.getAll(key);
  if (all.length !== 1) return null;
  const value = all[0];
  return value && civByEn(value) ? value : null;
}

/**
 * issue 1279：抽取校验后的对局来源参数，用于单兵 ↔ 混编应用内切换时通过 history state 透传（不写入混编 URL）。
 */
export function extractDuelSourceParams(sp: URLSearchParams): DuelSourceParams | null {
  const practice = readRushPractice(sp);
  const hasDup = sp.getAll('me').length > 1 || sp.getAll('opp').length > 1;
  const me = hasDup ? null : singleKnownCiv(sp, 'me');
  const opp = hasDup ? null : singleKnownCiv(sp, 'opp');
  if (!practice && !me && !opp) return null;
  return {
    ...(me ? { me } : {}),
    ...(opp ? { opp } : {}),
    ...(practice ? { practice: sp.get('practice')! } : {}),
  };
}

/**
 * issue 1279：从 React Router location.state 读取并二次校验应用内透传的对局来源参数。
 */
export function readDuelSourceState(state: unknown): DuelSourceParams | null {
  if (!state || typeof state !== 'object') return null;
  const raw = (state as { duelSource?: unknown }).duelSource;
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as { me?: unknown; opp?: unknown; practice?: unknown };
  const me = typeof source.me === 'string' && civByEn(source.me) ? source.me : undefined;
  const opp = typeof source.opp === 'string' && civByEn(source.opp) ? source.opp : undefined;
  const practice = typeof source.practice === 'string' && readRushPractice(new URLSearchParams({ practice: source.practice })) ? source.practice : undefined;
  if (!me && !opp && !practice) return null;
  return { ...(me ? { me } : {}), ...(opp ? { opp } : {}), ...(practice ? { practice } : {}) };
}

/**
 * issue 1279：仅当 URL 显式携带合法对局助手来源参数（practice 或单值合法 me/opp）时返回返回条上下文；
 * 直接从首页/导航进入或仅含 a/b 的独立链接返回 null，不占首屏空间。
 */
export function readDuelMatchupContext(sp: URLSearchParams): DuelMatchupContext | null {
  const practice = readRushPractice(sp);
  const hasDup = sp.getAll('me').length > 1 || sp.getAll('opp').length > 1;
  const me = hasDup ? null : singleKnownCiv(sp, 'me');
  const opp = hasDup ? null : singleKnownCiv(sp, 'opp');
  if (!practice && !me && !opp) return null;

  const returnTo = practice ? matchupPracticePath(practice.own.en, practice.enemy.en, practice.rush) : matchupPath(me, opp);
  const practiceReturnLabel = practice && practice.rush !== DEFAULT_RUSH ? `${practice.own.zh} 对 ${practice.enemy.zh} · ${RUSH_NAMES[practice.rush]}` : null;

  const rawCivs = me || opp ? [me, opp] : practice ? [practice.own.en, practice.enemy.en] : [];
  const civs = [...new Set(rawCivs.filter((civ): civ is string => Boolean(civ)))];
  return { returnTo, practiceReturnLabel, civs };
}
