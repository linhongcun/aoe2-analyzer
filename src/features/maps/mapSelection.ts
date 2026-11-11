const normalize = (text: string) =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

export function mapMatchesQuery(map: { name: string; en: string; id: string }, query: string): boolean {
  const term = normalize(query);
  if (!term) return true;
  const initials = map.en.match(/[A-Z]/g)?.join('') ?? '';
  return [map.name, map.en, map.id, `rm_${map.id}`, initials].some((name) => normalize(name).includes(term));
}

export interface MapSelectionInput {
  /** `map` 参数原文；地址里没有这个参数时为 null。 */
  raw: string | null;
  filteredIds: readonly string[];
  knownIds: readonly string[];
  implicitId: string;
}

export type MapSelection =
  | {
      kind: 'map';
      id: string;
      /** 只在地址里已经有一张有效地图、而这张又不在当前结果里时，改写成结果第一张。 */
      replaceParam: boolean;
      implicitId: string;
    }
  | { kind: 'missing'; implicitId: string }
  | { kind: 'none'; implicitId: string };

/** 无效 `map` 不改地址、也不改成目录第一张。筛选淘汰的是另一条路径。 */
export function selectMap(input: MapSelectionInput): MapSelection {
  const known = new Set(input.knownIds);
  const implicitId = known.has(input.implicitId) ? input.implicitId : (input.knownIds[0] ?? '');
  const filtered = input.filteredIds.filter((id) => known.has(id));
  if (input.raw != null && !known.has(input.raw)) return { kind: 'missing', implicitId };
  if (input.raw != null) {
    if (filtered.includes(input.raw)) return { kind: 'map', id: input.raw, replaceParam: false, implicitId };
    const next = filtered[0];
    if (!next) return { kind: 'none', implicitId };
    return { kind: 'map', id: next, replaceParam: true, implicitId };
  }
  if (filtered.includes(implicitId)) return { kind: 'map', id: implicitId, replaceParam: false, implicitId };
  const next = filtered[0];
  if (!next) return { kind: 'none', implicitId };
  return { kind: 'map', id: next, replaceParam: false, implicitId: next };
}
