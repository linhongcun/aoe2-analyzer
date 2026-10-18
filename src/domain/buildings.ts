import type { Building, BuildingType } from './types';
export { buildingDlc } from './introductions';

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

export const isUniqueBuilding = (b: Pick<Building, 'civs'>) => b.civs.length > 0 && b.civs.length <= 4;
