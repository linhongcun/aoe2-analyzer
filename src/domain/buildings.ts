import type { Building, BuildingType } from './types';
import { CIV_DLC } from './dlc';

/** 建筑分类（按英文名） */
const TYPE_BY_EN: Record<string, BuildingType> = {
  Barracks: 'military',
  'Archery Range': 'military',
  Stable: 'military',
  'Siege Workshop': 'military',
  Castle: 'military',
  Krepost: 'military',
  Donjon: 'military',
  Dock: 'military',
  Harbor: 'military',
  'Town Center': 'economy',
  House: 'economy',
  Mill: 'economy',
  Farm: 'economy',
  'Lumber Camp': 'economy',
  'Mining Camp': 'economy',
  Market: 'economy',
  Folwark: 'economy',
  Feitoria: 'economy',
  Caravanserai: 'economy',
  'Mule Cart': 'economy',
  Pasture: 'economy',
  'Fish Trap': 'economy',
  Settlement: 'economy',
  'Palisade Wall': 'defense',
  'Palisade Gate': 'defense',
  'Stone Wall': 'defense',
  'Fortified Wall': 'defense',
  Gate: 'defense',
  Outpost: 'defense',
  'Watch Tower': 'defense',
  'Guard Tower': 'defense',
  Keep: 'defense',
  'Bombard Tower': 'defense',
};
export const buildingType = (en: string): BuildingType => TYPE_BY_EN[en] ?? 'other';
export const BUILDING_TYPE_ZH: Record<BuildingType, string> = { military: '军事', economy: '经济', defense: '防御', other: '其他' };

/** 已知由资料片引入、但拥有者跨资料片的建筑 */
const EXPLICIT_DLC: Record<string, number> = { Caravanserai: 8 };
/** DLC：显式表优先；否则仅当所有拥有文明属于同一资料片且不是全体文明通用时标注 */
export function buildingDlc(b: Pick<Building, 'en' | 'civs'>, totalCivs: number): number | null {
  if (b.en in EXPLICIT_DLC) return EXPLICIT_DLC[b.en]!;
  if (!b.civs.length || b.civs.length > totalCivs / 2) return null;
  const s = new Set(b.civs.map((c) => CIV_DLC[c]));
  return s.size === 1 ? ([...s][0] ?? null) : null;
}
export const isUniqueBuilding = (b: Pick<Building, 'civs'>) => b.civs.length > 0 && b.civs.length <= 4;
