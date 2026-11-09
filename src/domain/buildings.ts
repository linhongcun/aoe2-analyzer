import type { Building, BuildingType } from './types';
export { buildingDlc } from './introductions';

/** 建筑分类（按英文名） */
export const TYPE_BY_EN: Readonly<Record<string, BuildingType>> = {
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
/** 当前分类没有研究/宗教/奇观类；这些建筑显式归「其他」，不再静默回退。 */
export const EXPLICIT_OTHER_BUILDINGS: Readonly<Record<string, string>> = {
  Blacksmith: '铁匠铺：军事升级建筑，当前分类无研究类',
  Monastery: '修道院：僧侣生产建筑，当前分类无宗教类',
  University: '大学：科技研究建筑，当前分类无研究类',
  'Fortified Church': '防御教堂：防御建筑，现有「防御」只收墙/塔',
  Wonder: '奇观：胜利建筑，不属于军事/经济/防御',
};

export const buildingType = (en: string): BuildingType => {
  if (Object.hasOwn(TYPE_BY_EN, en)) return TYPE_BY_EN[en]!;
  if (Object.hasOwn(EXPLICIT_OTHER_BUILDINGS, en)) return 'other';
  throw new Error(`未登记建筑类型：${en}`);
};
export const BUILDING_TYPE_ZH: Record<BuildingType, string> = { military: '军事', economy: '经济', defense: '防御', other: '其他' };

export const isUniqueBuilding = (b: Pick<Building, 'civs'>) => b.civs.length > 0 && b.civs.length <= 4;
