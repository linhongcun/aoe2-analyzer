/** 弹道学（科技 93）弹丸适用性与蓄力限定文案推导（纯函数，无 UI 依赖；Issue 1328 / Issue 1510） */
import { DAT, type DatBallistics } from './datEffects';

type BallisticsScope = 'normal' | 'charge-only';

const DEFAULT_UNITS = new Set(DAT.ballistics?.units ?? []);
const DEFAULT_CHARGE_ONLY = new Set(DAT.ballistics?.chargeOnly ?? []);
const DEFAULT_BUILDINGS = new Set(DAT.ballistics?.buildings ?? []);

export const BALLISTICS_CHARGE_ONLY_NOTE = '仅蓄力远程攻击适用。普通攻击不受影响。';

/** 依据固定 .dat 派生的弹道学弹丸表返回单位适用范围；不适用返回 null。 */
export function ballisticsScope(unitId: number, source: Pick<DatBallistics, 'units' | 'chargeOnly'> | null = DAT.ballistics ?? null): BallisticsScope | null {
  if (!source) return null;
  if (source === DAT.ballistics) {
    if (!DEFAULT_UNITS.has(unitId)) return null;
    return DEFAULT_CHARGE_ONLY.has(unitId) ? 'charge-only' : 'normal';
  }
  if (!source.units.includes(unitId)) return null;
  return source.chargeOnly.includes(unitId) ? 'charge-only' : 'normal';
}

/** 依据固定 .dat 派生的弹道学弹丸表判断攻击建筑是否适用弹道学（Issue 1510）。 */
export function ballisticsAffectsBuilding(buildingId: number, source: Pick<DatBallistics, 'buildings'> | null = DAT.ballistics ?? null): boolean {
  if (!source) return false;
  if (source === DAT.ballistics) return DEFAULT_BUILDINGS.has(buildingId);
  return source.buildings.includes(buildingId);
}

/** 混编共用科技中「仅蓄力远程攻击适用」逐行限定说明。 */
export function formatMixedBallisticsScope(
  rows: readonly number[],
  chargeOnlyRows: readonly number[],
): { kind: 'all' | 'rows'; rowNumbers?: string; text: string } | null {
  if (!chargeOnlyRows.length) return null;
  if (chargeOnlyRows.length === rows.length && rows.length > 1) {
    return { kind: 'all', text: '这些行仅蓄力远程攻击适用。' };
  }
  const rowNumbers = chargeOnlyRows.map((i) => i + 1).join('、');
  return { kind: 'rows', rowNumbers, text: `第 ${rowNumbers} 行仅蓄力远程攻击适用。` };
}
