/** 解析/生成 #unit/<id>/<civ>/<age>/<ids>/<team> */
export interface SimRoute {
  id: number;
  civ?: string;
  age?: number;
  ids: number[];
  team: number[];
}
const nums = (s?: string) =>
  (s ?? '')
    .split(',')
    .filter((x) => x)
    .map(Number);
export function parseUnitPath(path: string): SimRoute | null {
  const m = path.match(/^\/?unit\/(\d+)(?:\/([^/]*))?(?:\/(\d))?(?:\/([\d,]*))?(?:\/([\d,]*))?/);
  if (!m) return null;
  return { id: +m[1]!, civ: m[2] || undefined, age: m[3] ? +m[3] : undefined, ids: nums(m[4]), team: nums(m[5]) };
}
export const unitPath = (id: number, civ: string, age: number, sel: Iterable<number>, team: Iterable<number>) =>
  `/unit/${id}/${civ}/${age}/${[...sel].join(',')}/${[...team].join(',')}`;

const sameNums = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((n, i) => n === b[i]);

function sameSimRoute(a: SimRoute, b: SimRoute): boolean {
  return a.id === b.id && a.civ === b.civ && a.age === b.age && sameNums(a.ids, b.ids) && sameNums(a.team, b.team);
}

/** 路由器会把空段 `//` 折成 `/`。解析结果相同就不要再 replace。 */
function simRoutesMatch(pathname: string, canonical: string): boolean {
  const current = parseUnitPath(pathname);
  const next = parseUnitPath(canonical);
  return !!current && !!next && sameSimRoute(current, next);
}

/** 路径已有文明时查询不能覆盖。查询文明不在该单位可用列表里时，留给模拟器原有回退。 */
export function routeWithQueryCiv(route: SimRoute, queryCiv: string | undefined, available: readonly string[]): SimRoute {
  if (route.civ || !queryCiv || !available.includes(queryCiv)) return route;
  return { ...route, civ: queryCiv };
}

export function unitHashLocation(hash: string): { pathname: string; search: string } {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const decoded = decodeURIComponent(raw);
  const q = decoded.indexOf('?');
  const path = q >= 0 ? decoded.slice(0, q) : decoded;
  const pathname = path ? (path.startsWith('/') ? path : `/${path}`) : '/';
  return { pathname, search: q >= 0 ? decoded.slice(q) : '' };
}

export type SimCanonical = { kind: 'ignore' } | { kind: 'keep' } | { kind: 'replace'; path: string };

/**
 * 地址栏已经是同一模拟器状态时不再 replace。
 * 地址已换成别的单位，或显式路径文明与这次要写回的文明不一致时，放弃回写。
 */
export function decideSimCanonical(livePathname: string, route: SimRoute, resolved: { civ: string; age: number; ids: number[]; team: number[] }): SimCanonical {
  const live = parseUnitPath(livePathname);
  if (live && live.id !== route.id) return { kind: 'ignore' };
  if (live?.civ && live.civ !== route.civ && live.civ !== resolved.civ) return { kind: 'ignore' };
  const path = unitPath(route.id, resolved.civ, resolved.age, resolved.ids, resolved.team);
  if (live && simRoutesMatch(livePathname, path)) return { kind: 'keep' };
  return { kind: 'replace', path };
}
