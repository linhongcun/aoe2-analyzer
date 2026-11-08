/**
 * issue 743：人口与房屋。表内数字只读 buildings.json 的 pop，与建筑页「提供人口」同一条件（正整数才显示）。
 * UGC 资源 4 / 11 / 32 只说明剩余空间、当前人口和额外上限，没有各建筑的提供人口；哥特资源 32 的 +10 在经济数据里，
 * 但那是文明加成，不是建筑住房，本页不写。经济数据里标了名称、建筑资料却没有条目的编号保持待确认。
 */
import buildingsRaw from '../../data/raw/buildings';
import { ECO } from '../../data/eco';

export const HOUSING_ANCHOR = 'housing';
export const POP_ANCHOR = 'pop';
export const HOUSING_GUIDE_HREF = `/game-guide#${HOUSING_ANCHOR}`;
export const buildingPopHref = (id: number) => `/building/${id}#${POP_ANCHOR}`;

export const HOUSING_LEAD = '下表是建筑资料里写明提供人口的建筑。数字与建筑页「提供人口」相同。';
export const HOUSING_CAP_NOTE = '房间人口上限来自开房设置。本页不写天梯默认人口上限。';
export const HOUSING_BONUS_NOTE = '文明加成不改这张表。';

/** UGC Resources。lastModified 用响应头 Last-Modified 的日期。checkedAt 是本站阅读日。 */
export const UGC_HOUSING_SOURCE = {
  title: 'UGC Resources',
  url: 'https://ugc.aoe2.rocks/general/resources/resources/',
  lastModified: '2026-11-05',
  checkedAt: '2026-11-07',
} as const;

export const UGC_HEADROOM_RES = 4;
export const UGC_CURRENT_POP_RES = 11;
export const UGC_BONUS_CAP_RES = 32;
export const UGC_HOUSING_NOTE =
  '资源 4 是剩余人口空间，不是人口上限。资源 11 是当前人口。资源 32 是人口上限之外的额外空间。这三条没有写出各建筑提供多少人口，表内数字不取这里。';

export interface HousingSource {
  id?: unknown;
  zh?: unknown;
  en?: unknown;
  pop?: unknown;
  age?: unknown;
}

export interface HousingRow {
  id: number;
  zh: string | null;
  en: string | null;
  pop: number;
}

export interface CatalogGap {
  id: number;
  zh: string;
}

export interface HousingFacts {
  rows: HousingRow[];
  gaps: CatalogGap[];
  patchBuild: string | null;
  patchDate: string | null;
}

/** UI 视图切片：防御式解析 eco.json，只声明本页读取的字段；不是 EcoData 的整表副本。 */
interface EcoAge {
  ageReq?: unknown;
  meta?: { patch?: unknown };
}

export function housingRows(buildings: readonly HousingSource[]): HousingRow[] {
  const rows: (HousingRow & { age: number })[] = [];
  const seen = new Set<number>();
  for (const building of buildings) {
    if (typeof building.id !== 'number' || !Number.isInteger(building.id) || seen.has(building.id)) continue;
    if (typeof building.pop !== 'number' || !Number.isInteger(building.pop) || building.pop <= 0) continue;
    seen.add(building.id);
    const zh = typeof building.zh === 'string' && building.zh.trim() ? building.zh.trim() : null;
    const en = typeof building.en === 'string' && building.en.trim() ? building.en.trim() : null;
    const age = typeof building.age === 'number' && Number.isFinite(building.age) ? building.age : Number.POSITIVE_INFINITY;
    rows.push({ id: building.id, zh, en, pop: building.pop, age });
  }
  rows.sort((a, b) => a.age - b.age || a.id - b.id);
  return rows.map(({ id, zh, en, pop }) => ({ id, zh, en, pop }));
}

function walkGaps(node: unknown, labels: ReadonlySet<string>, shown: ReadonlySet<number>, found: Map<number, string>) {
  if (Array.isArray(node)) {
    for (const item of node) walkGaps(item, labels, shown, found);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const row = node as { zh?: unknown; b?: unknown };
  if (typeof row.zh === 'string' && labels.has(row.zh) && Array.isArray(row.b)) {
    for (const id of row.b) {
      if (typeof id !== 'number' || !Number.isInteger(id) || shown.has(id) || found.has(id)) continue;
      found.set(id, row.zh);
    }
  }
  for (const value of Object.values(row)) walkGaps(value, labels, shown, found);
}

/** 经济数据用住房建筑的中文名标了编号，但建筑资料没有可显示的提供人口。 */
export function catalogGaps(ageReq: unknown, rows: readonly HousingRow[]): CatalogGap[] {
  const labels = new Set(rows.map((row) => row.zh).filter((zh): zh is string => !!zh));
  const shown = new Set(rows.map((row) => row.id));
  const found = new Map<number, string>();
  walkGaps(ageReq, labels, shown, found);
  const order = new Map(rows.map((row, index) => [row.zh, index]));
  return [...found].map(([id, zh]) => ({ id, zh })).sort((a, b) => (order.get(a.zh) ?? 99) - (order.get(b.zh) ?? 99) || a.id - b.id);
}

export function gapText(zh: string, ids: readonly number[]): string {
  const noun = ids.length === 1 ? '这条' : '这些';
  return `经济数据把编号 ${ids.join('、')} 标成${zh}，建筑资料没有${noun}条目。是否提供人口：待确认。`;
}

/** 补丁行来自 eco.meta.patch，与页脚 DE Update 同一条。不引用 dataInfo，避免整份来源清单进主包。 */
export function housingPatch(patch: unknown): { patchBuild: string | null; patchDate: string | null } {
  if (typeof patch !== 'string') return { patchBuild: null, patchDate: null };
  return {
    patchBuild: /DE Update (\d+)/.exec(patch)?.[1] ?? null,
    patchDate: /\((\d{4}-\d{2}-\d{2})\)/.exec(patch)?.[1] ?? null,
  };
}

export function housingFacts(buildings: readonly HousingSource[] = buildingsRaw as HousingSource[], eco: EcoAge = ECO): HousingFacts {
  const rows = housingRows(buildings);
  const patch = housingPatch(eco.meta?.patch);
  return { rows, gaps: catalogGaps(eco.ageReq, rows), patchBuild: patch.patchBuild, patchDate: patch.patchDate };
}
