import { cleanBuildingName } from './unitOrder';

interface UnitOptionLike {
  id: number;
  zh: string;
  en: string;
  b: number;
  bz?: string;
}

type BuildingMap = Record<number, { zh: string } | undefined>;
type BuildingLookup = { core: { buildingById: BuildingMap } } | BuildingMap;

/** issue 271：同名但生产建筑和英文名都相同、规则区分不了的单位，写玩家能看懂的专门标签（不显示编号）。 */
const SPECIAL_UNIT_LABELS: Readonly<Record<number, string>> = {
  // 库曼雇佣兵送给队友的免费精锐钦察；另一个 1233 是库曼自己在城堡训练的，显示「精锐钦察」
  1260: '精锐钦察（库曼雇佣兵）',
};

function buildingZh(lookup: BuildingLookup | undefined, unit: UnitOptionLike): string {
  const byId = lookup && 'core' in lookup ? lookup.core.buildingById : lookup;
  const fromMap = byId?.[unit.b]?.zh;
  if (fromMap) return fromMap;
  return unit.bz ? cleanBuildingName(unit.bz) : '';
}

/**
 * issue 271 / issue 1368：同一下拉候选内同名单位区分规则（团队规划与单位 PK 共用）。
 * 先套专门标签；其余同名项优先标生产建筑（如近卫军兵营/城堡），建筑也相同时用英文名；不显示编号。
 * siblings 须传入当前下拉的完整候选列表，不受搜索和筛选影响。
 */
export function unitOptionLabel(lookup: BuildingLookup | undefined, unit: UnitOptionLike, siblings: readonly UnitOptionLike[]): string {
  const special = SPECIAL_UNIT_LABELS[unit.id];
  if (special) return special;
  const same = siblings.filter((s) => s.zh === unit.zh && !SPECIAL_UNIT_LABELS[s.id]);
  if (same.length <= 1) return unit.zh;
  const withBuilding = same.map((s) => {
    const bzh = buildingZh(lookup, s);
    return { id: s.id, label: bzh ? `${s.zh}（${bzh}）` : '' };
  });
  const mine = withBuilding.find((row) => row.id === unit.id);
  if (mine?.label && withBuilding.filter((row) => row.label === mine.label).length === 1) return mine.label;
  if (same.filter((s) => s.en === unit.en).length === 1) return `${unit.zh}（${unit.en}）`;
  return unit.zh;
}
