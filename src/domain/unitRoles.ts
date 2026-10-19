import { hasCls, isArcher, isCA, isInf, isMounted } from './unitClass';
import type { Unit } from './types';

export const UNIT_ROLE_ZH = {
  infantry: '步兵',
  cavalry: '骑兵',
  archer: '弓兵',
  siege: '攻城武器',
  ship: '船只',
  monk: '僧侣',
  other: '其他单位',
} as const;
export type UnitRole = keyof typeof UNIT_ROLE_ZH;

/** 目录分类可交叉：沿用游戏护甲类别，不改变战斗/科技效果的判定。 */
export function unitRoles(u: Unit): UnitRole[] {
  const roles: UnitRole[] = [];
  if (isInf(u)) roles.push('infantry');
  if (isMounted(u) || isCA(u)) roles.push('cavalry');
  if (isArcher(u) || isCA(u)) roles.push('archer');
  if (hasCls(u, 20)) roles.push('siege');
  if (hasCls(u, 16)) roles.push('ship');
  if (hasCls(u, 25)) roles.push('monk');
  return roles.length ? roles : ['other'];
}
