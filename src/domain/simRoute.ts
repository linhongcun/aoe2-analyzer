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
