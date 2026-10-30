import civs from '../../data/raw/civs';
import { PAGES } from './pageRegistry';

export type NavigationSearch = string | URLSearchParams;
export type EntityContext = { civ?: string; age?: number; search?: NavigationSearch; source?: string };
export const RETURN_LIMIT = 8192;
const NAV_KEYS = ['ctxReturn', 'me', 'opp'] as const;
const knownCiv = (value: string | null | undefined) => (civs.some((c) => c.en === value) ? value! : undefined);
const paramsOf = (search: NavigationSearch) => new URLSearchParams(search);
const asSearch = (params: URLSearchParams) => (params.size ? '?' + params : '');
const hasControls = (value: string, includeSpace = false) =>
  [...value].some((char) => char.charCodeAt(0) <= (includeSpace ? 32 : 31) || char.charCodeAt(0) === 127);

function registeredPath(path: string): boolean {
  // Decode before inspecting segments: URL() would silently normalize traversal.
  let decoded = path;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return false;
    }
  }
  if (!decoded.startsWith('/') || decoded.startsWith('//') || /[\\#?:%]/u.test(decoded) || hasControls(decoded, true)) return false;
  if (decoded.split('/').some((part) => part === '.' || part === '..')) return false;
  return PAGES.some((page) => {
    const pattern = page.path
      .split('/')
      .map((part) => (part === '*' ? '.+' : part.startsWith(':') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      .join('/');
    return new RegExp('^' + pattern + '/?$', 'i').test(decoded);
  });
}

function validReturn(raw: string | null): string | null {
  if (!raw || raw.length > RETURN_LIMIT || /[\\#]/u.test(raw) || hasControls(raw)) return null;
  const cut = raw.indexOf('?');
  const path = cut < 0 ? raw : raw.slice(0, cut);
  if (!registeredPath(path)) return null;
  const query = new URLSearchParams(cut < 0 ? '' : raw.slice(cut + 1));
  if ([...query.keys()].some((key) => key.toLowerCase() === 'ctxreturn')) return null;
  return raw;
}

/** Only a previous tool snapshot is stored. No recursive navigation history. */
export function returnSnapshot(source: string): string | null {
  const cut = source.indexOf('?');
  const path = cut < 0 ? source : source.slice(0, cut);
  const query = new URLSearchParams(cut < 0 ? '' : source.slice(cut + 1));
  for (const key of [...query.keys()]) if (key.toLowerCase() === 'ctxreturn') query.delete(key);
  return validReturn(path + asSearch(query));
}

export function readNavigation(search: NavigationSearch) {
  const params = paramsOf(search);
  const unique = (key: string) => params.getAll(key).length <= 1;
  const back = unique('ctxReturn') ? validReturn(params.get('ctxReturn')) : null;
  const me = unique('me') ? knownCiv(params.get('me')) : undefined;
  const opp = unique('opp') ? knownCiv(params.get('opp')) : undefined;
  const invalid = NAV_KEYS.some((key) => !unique(key)) || (params.has('ctxReturn') && !back) || (params.has('me') && !me) || (params.has('opp') && !opp);
  return { back, me, opp, invalid };
}

/** Remove navigation before strict calculation decoders; keep all other keys and order. */
export function stripNavigation(search: NavigationSearch): string {
  const params = paramsOf(search);
  NAV_KEYS.forEach((key) => params.delete(key));
  return asSearch(params);
}

export function mergeNavigationSearch(encodedSearch: NavigationSearch, currentSearch: NavigationSearch): string {
  const target = paramsOf(encodedSearch);
  const context = readNavigation(currentSearch);
  for (const [key, value] of [
    ['ctxReturn', context.back],
    ['me', context.me],
    ['opp', context.opp],
  ] as const) {
    if (!target.has(key) && value) target.set(key, value);
  }
  return asSearch(target);
}

export function contextPath(target: string, search: NavigationSearch, source?: string): string {
  const cut = target.indexOf('?');
  const path = cut < 0 ? target : target.slice(0, cut);
  if (!registeredPath(path)) return '/';
  const params = new URLSearchParams(mergeNavigationSearch(cut < 0 ? '' : target.slice(cut + 1), search));
  if (source !== undefined) {
    // An unusable new source remains an explicit unavailable-source state, not a truncated URL.
    params.set('ctxReturn', returnSnapshot(source) ?? '');
  }
  return path + asSearch(params);
}

export function entityPath(
  kind: 'unit' | 'tech' | 'building',
  id: number,
  civ: string | undefined,
  search: NavigationSearch = '',
  source?: string,
  age?: number,
): string {
  const params = new URLSearchParams();
  if (knownCiv(civ)) params.set('civ', civ!);
  if (age !== undefined && [1, 2, 3, 4].includes(age)) params.set('age', String(age));
  return contextPath(`/${kind}/${id}` + asSearch(params), search, source);
}

export function navigationLabel(source: string): string {
  const path = source.split('?')[0]!;
  return PAGES.find((page) => page.label && page.match?.test(path))?.label ?? '上一页';
}
