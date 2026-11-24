/**
 * issue 1393：建筑详情「各文明满科技对照」列元数据、格式化、量化、排序与链接构建纯函数。
 */
import { GARRISON_HOST_IDS } from '../data/garrisonHosts';
import { buildingAge } from './availabilityAge';
import { cmpNum, filterCivRankRows, fmtTrim, RANK_EPS, type CivRankFilterResult, type SortDir } from './civRankShared';
import { constructionLink, type ConstructionContext } from './construction';
import { defaultGarrisonRows, writeGeneralGarrison } from './garrisonUrl';
import { formatHp } from './hpFormat';
import type { Building, Trees } from './types';

export type { SortDir };
export type BuildingRankCategory = 'A' | 'B' | 'C' | 'D';
export type BuildingRankMetricCol =
  'hp' | 'atk' | 'rof' | 'rng' | 'ma' | 'pa' | 'barm' | 'gar' | 'baseProj' | 'maxProj' | 'totalCost' | 'stone' | 'gold' | 'bt';
export type BuildingRankSortCol = BuildingRankMetricCol | 'civ';
export type BuildingOpenSlot = 'sim' | 'garrison' | 'construction';

export interface BuildingRankColMeta {
  col: BuildingRankMetricCol;
  shortLabel: string;
  unitLabel?: string;
  fullLabel: string;
  championLabel: string;
  bestDir: SortDir;
  widthPx: number;
}

export const BUILDING_RANK_METRIC_COLS: readonly BuildingRankColMeta[] = [
  { col: 'hp', shortLabel: '生命', fullLabel: '生命值', championLabel: '生命最高', bestDir: 'desc', widthPx: 76 },
  { col: 'atk', shortLabel: '攻击', fullLabel: '攻击力', championLabel: '攻击最高', bestDir: 'desc', widthPx: 52 },
  { col: 'rof', shortLabel: '间隔', unitLabel: '秒', fullLabel: '攻击间隔（秒）', championLabel: '间隔最短', bestDir: 'asc', widthPx: 56 },
  { col: 'rng', shortLabel: '射程', fullLabel: '射程', championLabel: '射程最远', bestDir: 'desc', widthPx: 50 },
  { col: 'ma', shortLabel: '近甲', fullLabel: '近战护甲', championLabel: '近甲最高', bestDir: 'desc', widthPx: 50 },
  { col: 'pa', shortLabel: '远甲', fullLabel: '远程护甲', championLabel: '远甲最高', bestDir: 'desc', widthPx: 50 },
  { col: 'barm', shortLabel: '建筑甲', fullLabel: '建筑护甲', championLabel: '建筑甲最高', bestDir: 'desc', widthPx: 58 },
  { col: 'gar', shortLabel: '驻军', fullLabel: '驻军容量', championLabel: '驻军最多', bestDir: 'desc', widthPx: 50 },
  { col: 'baseProj', shortLabel: '空驻箭', fullLabel: '空驻军箭数', championLabel: '空驻箭最多', bestDir: 'desc', widthPx: 58 },
  { col: 'maxProj', shortLabel: '满驻箭', fullLabel: '满驻军箭数上限', championLabel: '满驻箭最多', bestDir: 'desc', widthPx: 58 },
  { col: 'totalCost', shortLabel: '总价', fullLabel: '有效总价', championLabel: '总价最低', bestDir: 'asc', widthPx: 62 },
  { col: 'stone', shortLabel: '石料', fullLabel: '折后石料', championLabel: '石料最省', bestDir: 'asc', widthPx: 62 },
  { col: 'gold', shortLabel: '黄金', fullLabel: '折后黄金', championLabel: '黄金最省', bestDir: 'asc', widthPx: 58 },
  { col: 'bt', shortLabel: '工期', unitLabel: '秒', fullLabel: '单村民工期（秒）', championLabel: '工期最短', bestDir: 'asc', widthPx: 68 },
] as const;

export const BUILDING_RANK_COL_META_BY_KEY: Readonly<Record<BuildingRankMetricCol, BuildingRankColMeta>> = Object.fromEntries(
  BUILDING_RANK_METRIC_COLS.map((item) => [item.col, item]),
) as Record<BuildingRankMetricCol, BuildingRankColMeta>;

export const CAT_A_BUILDING_IDS = new Set<number>([79, 234, 235, 82, 109, 1806]);
export const CAT_B_BUILDING_IDS = new Set<number>([236]);
export const GARRISON_HOST_SET = new Set<number>(GARRISON_HOST_IDS);

export interface BuildingCivRankRowShape {
  civ: string;
  civZh: string;
  hp: number;
  atk: number | null;
  rof: number | null;
  rng: number | null;
  ma: number;
  pa: number;
  barm: number;
  gar: number | null;
  baseProj: number | null;
  maxProj: number | null;
  totalCost: number;
  stone: number | null;
  gold: number | null;
  bt: number | null;
  simTechIds: number[];
  garrisonTechIds: number[];
  constructionTechIds: number[];
}

/** 仅对拥有文明数 >= 2 的多文明建筑开放（全库 38 座命中 32 座，排除 6 座单文明建筑）。 */
export function supportsBuildingCivRank(b: Pick<Building, 'civs'> | null | undefined): boolean {
  return !!b && Array.isArray(b.civs) && b.civs.length >= 2;
}

/** 依建筑真实能力划分四类，彻底屏蔽船坞目录伪攻击参数与炮塔伪箭数列。 */
export function buildingRankCategory(b: Pick<Building, 'id' | 'gar'>): BuildingRankCategory {
  if (CAT_A_BUILDING_IDS.has(b.id)) return 'A';
  if (CAT_B_BUILDING_IDS.has(b.id)) return 'B';
  if (GARRISON_HOST_SET.has(b.id) || b.gar > 0) return 'C';
  return 'D';
}

export function buildingRankVisibleCols(b: Pick<Building, 'id' | 'gar' | 'cost'>): BuildingRankMetricCol[] {
  const cat = buildingRankCategory(b);
  const cols: BuildingRankMetricCol[] = ['hp'];
  if (cat === 'A' || cat === 'B') cols.push('atk');
  if (cat === 'B') cols.push('rof');
  if (cat === 'A' || cat === 'B') cols.push('rng');
  cols.push('ma', 'pa', 'barm');
  if (cat !== 'D') cols.push('gar');
  if (cat === 'A') cols.push('baseProj', 'maxProj');
  cols.push('totalCost');
  if ((b.cost.Stone ?? 0) > 0) cols.push('stone');
  if ((b.cost.Gold ?? 0) > 0) cols.push('gold');
  cols.push('bt');
  return cols;
}

export function buildingRankAgeBounds(
  b: Pick<Building, 'id' | 'age' | 'civs'>,
  trees: Trees,
): { minAge: number; standardAge: number; availableAges: number[] } {
  const ages = b.civs.map((c) => buildingAge(b, c, trees));
  const minAge = ages.length ? Math.min(...ages) : Math.max(1, Math.min(4, b.age));
  const standardAge = ages.length ? Math.max(...ages) : Math.max(1, Math.min(4, b.age));
  const clampedMin = Math.max(1, Math.min(4, minAge));
  const availableAges: number[] = [];
  for (let a = clampedMin; a <= 4; a++) availableAges.push(a);
  return { minAge: clampedMin, standardAge: Math.max(clampedMin, Math.min(4, standardAge)), availableAges };
}

/** 各指标精确格式化（hp 复用 domain/hpFormat，攻/射程至多两位小数，间隔两位小数，护甲/驻军/箭数整数，造价至多一位小数，工期一位小数）。 */
export function formatBuildingRankMetric(col: BuildingRankMetricCol, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (col === 'hp') return formatHp(value);
  if (col === 'atk' || col === 'rng') return fmtTrim(value, 2);
  if (col === 'rof') return value.toFixed(2);
  if (col === 'ma' || col === 'pa' || col === 'barm' || col === 'gar' || col === 'baseProj' || col === 'maxProj') return String(Math.round(value));
  if (col === 'totalCost' || col === 'stone' || col === 'gold') return fmtTrim(value, 1);
  return value.toFixed(1);
}

/** 按展示精度量化指标，确保排序、并列判定、绿标高亮与展示数字 100% 一致。 */
export function quantizeBuildingRankMetric(col: BuildingRankMetricCol, value: number): number {
  if (!Number.isFinite(value)) return 0;
  const parsed = Number(formatBuildingRankMetric(col, value));
  return Number.isFinite(parsed) && !Object.is(parsed, -0) ? parsed : 0;
}

/** 稳定排序：null 沉底；同值按 生命降序 -> 总价升序 -> 文明英文名升序。 */
export function sortBuildingCivRankRows<Row extends BuildingCivRankRowShape>(rows: readonly Row[], col: BuildingRankSortCol, dir: SortDir): Row[] {
  return [...rows].sort((a, b) => {
    let primary: number;
    if (col === 'civ') {
      primary = dir === 'asc' ? a.civ.localeCompare(b.civ) : b.civ.localeCompare(a.civ);
    } else {
      const va = a[col];
      const vb = b[col];
      if (va === null && vb === null) primary = 0;
      else if (va === null) return 1;
      else if (vb === null) return -1;
      else primary = cmpNum(quantizeBuildingRankMetric(col, va), quantizeBuildingRankMetric(col, vb), dir);
    }
    if (primary !== 0) return primary;
    const hpDiff = cmpNum(quantizeBuildingRankMetric('hp', a.hp), quantizeBuildingRankMetric('hp', b.hp), 'desc');
    if (hpDiff !== 0) return hpDiff;
    const costDiff = cmpNum(quantizeBuildingRankMetric('totalCost', a.totalCost), quantizeBuildingRankMetric('totalCost', b.totalCost), 'asc');
    return costDiff !== 0 ? costDiff : a.civ.localeCompare(b.civ);
  });
}

export function isBuildingRankBestCell(
  result: { bestValues: Partial<Record<BuildingRankMetricCol, number>> },
  col: BuildingRankMetricCol,
  value: number | null,
): boolean {
  if (value === null) return false;
  const best = result.bestValues[col];
  return best !== undefined && Math.abs(quantizeBuildingRankMetric(col, value) - best) <= RANK_EPS;
}

export function filterBuildingCivRankRows<Row extends { civ: string; civZh: string }>(
  rows: readonly Row[],
  rawQuery: string,
  b: Pick<Building, 'zh' | 'civs'>,
  age: number,
): CivRankFilterResult<Row> {
  return filterCivRankRows(rows, rawQuery, b, age, '建造');
}

export function buildBuildingRankSimHref(buildingId: number, row: Pick<BuildingCivRankRowShape, 'civ' | 'simTechIds'>, age: number): string {
  const params = new URLSearchParams({
    tab: 'sim',
    civ: row.civ,
    age: String(age),
    techs: row.simTechIds.join(','),
  });
  return `/building/${buildingId}?${params.toString()}`;
}

export function buildBuildingRankGarrisonHref(buildingId: number, row: Pick<BuildingCivRankRowShape, 'civ' | 'garrisonTechIds'>, age: number): string {
  const params = writeGeneralGarrison({
    civ: row.civ,
    age,
    techs: row.garrisonTechIds,
    rows: defaultGarrisonRows(buildingId),
  });
  return `/building/${buildingId}?${params.toString()}`;
}

export function buildBuildingRankConstructionHref(
  ctx: ConstructionContext,
  buildingId: number,
  row: Pick<BuildingCivRankRowShape, 'civ' | 'bt' | 'constructionTechIds'>,
  age: number,
): string | null {
  if (row.bt === null) return null;
  return constructionLink(ctx, { buildingId, civ: row.civ, age, techs: row.constructionTechIds });
}
