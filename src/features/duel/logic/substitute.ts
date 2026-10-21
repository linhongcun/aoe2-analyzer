/**
 * issue 124 PK：所选文明造不了这个单位时的区域替代单位。
 * 只做产品定下的两对（issue 133 Steve 决定 3）：骑射手(39) -> 骑马弩兵(2700)，重装骑射手(474) -> 重装骑马弩兵(2701)。
 * 替代单位是否可用完全由 units.json 的 civs 判定，不手写文明清单。
 */
import units from '../../../data/raw/units';

/** 原单位 id → 区域替代单位 id（只做这两对，其他替代关系进 v0.9.0 候选） */
export const SUBSTITUTES: Readonly<Record<number, number>> = { 39: 2700, 474: 2701 };

type CivUnit = { civs: readonly string[] };

/**
 * 返回该文明在这个位置上能用的单位 id：能造就是原单位；造不了时返回能造的替代单位；没有替代返回 null。
 * byId 缺省读打包的 units.json（单测用），页面传 core.unitById。
 */
export function substituteIn(byId: Readonly<Record<number, CivUnit | undefined>>, uid: number, civ: string): number | null {
  const u = byId[uid];
  if (u?.civs.includes(civ)) return uid;
  const s = SUBSTITUTES[uid];
  return s !== undefined && byId[s]?.civs.includes(civ) ? s : null;
}

let bundled: Record<number, CivUnit> | null = null;
export function substituteFor(uid: number, civ: string): number | null {
  bundled ??= Object.fromEntries((units as unknown as { id: number; civs: string[] }[]).map((u) => [u.id, u]));
  return substituteIn(bundled, uid, civ);
}
