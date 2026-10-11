/** #44 完全重名单位（官方中文名相同、实为不同单位）：从数据自动识别，不手写名单 */
import type { Unit } from './types';

/** 比较前去掉 `<br>` 和首尾空白（War Chariot 的上游字符串是「战<br>车」） */
export const nameKey = (s: string) => s.replace(/<br\s*\/?>/gi, '').trim();

/**
 * 同名不同单位：中文名相同、英文名不同。
 * 英文名也相同的（如城堡/兵营两处生产的近卫军）是同一单位的两个 id，不算重名。
 * 返回 nameKey → 每个英文名取第一个出现的单位（按 units.json 顺序）。
 */
export function dupNameGroups(units: readonly Unit[]): Map<string, Unit[]> {
  const by = new Map<string, Unit[]>();
  for (const u of units) {
    const k = nameKey(u.zh);
    const g = by.get(k) ?? [];
    if (!g.some((x) => x.en === u.en)) g.push(u);
    by.set(k, g);
  }
  for (const [k, g] of by) if (g.length < 2) by.delete(k);
  return by;
}

/** 与 u 完全重名的其他单位（不含 u 自己及其同英文名的其他 id） */
export function dupPeers(u: Unit, units: readonly Unit[]): Unit[] {
  const g = dupNameGroups(units).get(nameKey(u.zh));
  return g ? g.filter((x) => x.en !== u.en) : [];
}

/** 文明小字：取 units.json 中 civs 的第一个（不手挑）；多文明写「{第一个}等 N 个文明」 */
export function civNote(u: Unit, civZh: (en: string) => string | undefined): string {
  const first = u.civs[0];
  if (!first) return '';
  const zh = civZh(first) ?? first;
  return u.civs.length > 1 ? `${zh}等 ${u.civs.length} 个文明` : zh;
}

/** 列表里同时出现的重名单位 id 集合（列表 / 搜索结果 / 对比工具用：同时出现时才加文明小字） */
export function dupIdsIn(list: readonly Unit[]): Set<number> {
  const ids = new Set<number>();
  for (const g of dupNameGroups(list).values()) for (const u of g) ids.add(u.id);
  return ids;
}
