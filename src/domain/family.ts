/**
 * 单位家族：把「普通 + 精锐」合并为一个条目（如 掷斧兵 / 精锐掷斧兵）。
 * 仅合并英文名以 "Elite " 开头、且能找到对应普通单位的一对；
 * 骑士→重骑士→圣骑士 这类有独立名称的升级路线不合并，只在“作用对象”中按路线成组展示。
 */
import type { Unit } from './types';
import { upgradeLine } from './units';

export interface Families {
  /** 普通单位 id → 精锐单位 */
  eliteOf: Record<number, Unit>;
  /** 精锐单位 id → 普通单位 */
  baseOf: Record<number, Unit>;
}

export function buildFamilies(units: readonly Unit[], byId: Record<number, Unit>): Families {
  const eliteOf: Record<number, Unit> = {},
    baseOf: Record<number, Unit> = {};
  units.forEach((e) => {
    if (!e.en.startsWith('Elite ')) return;
    const name = e.en.slice(6);
    let b = e.from_ != null ? byId[e.from_] : undefined;
    if (!b || b.en !== name) b = units.find((x) => x.en === name && x.type === e.type && !eliteOf[x.id]) ?? units.find((x) => x.en === name);
    if (!b) return;
    // 如精锐钦察（库曼雇佣兵版本）：同名精锐有两个 id，只把第一个作为“精锐页”，其余仅归入家族
    eliteOf[b.id] ??= e;
    baseOf[e.id] = b;
  });
  return { eliteOf, baseOf };
}

export const baseUnit = (u: Unit, f: Families): Unit => f.baseOf[u.id] ?? u;
export const isElite = (u: Unit, f: Families) => !!f.baseOf[u.id];

export interface FamilyEntry {
  /** 代表单位（普通版） */
  u: Unit;
  /** 列表中同时出现的精锐版 */
  elite?: Unit;
}

/** 列表去重：精锐版的普通版也在列表中时，合并为一条；否则保留精锐版单独一条 */
export function collapse(list: readonly Unit[], f: Families): FamilyEntry[] {
  const ids = new Set(list.map((u) => u.id));
  const out: FamilyEntry[] = [];
  // 同名不同 id（如城堡/马厩两处生产的答刺罕）只保留第一个
  const seen = new Set<string>();
  list.forEach((u) => {
    const b = f.baseOf[u.id];
    if (b && (ids.has(b.id) || list.some((x) => x.zh === b.zh))) return;
    if (seen.has(u.zh)) return;
    seen.add(u.zh);
    const e = f.eliteOf[u.id];
    out.push(e && ids.has(e.id) ? { u, elite: e } : { u });
  });
  return out;
}

export interface LineEntry {
  /** 同一升级路线中出现在列表里的家族（按升级顺序） */
  members: FamilyEntry[];
}
/** 作用对象：把同一升级路线（骑士→重骑士→圣骑士）的单位合并为一组 */
export function groupLines(list: readonly Unit[], all: Unit[], byId: Record<number, Unit>, f: Families): LineEntry[] {
  const fams = collapse(list, f);
  const order = new Map<string, LineEntry>();
  const pos = new Map<number, number>();
  fams.forEach((fe) => {
    const ln = upgradeLine(fe.u, all, byId).map((x) => baseUnit(x, f));
    const key = String(ln[0]!.id);
    ln.forEach((x, i) => pos.set(x.id, i));
    const g = order.get(key) ?? { members: [] };
    order.set(key, g);
    g.members.push(fe);
  });
  const res = [...order.values()];
  res.forEach((g) => g.members.sort((a, b) => (pos.get(a.u.id) ?? 0) - (pos.get(b.u.id) ?? 0)));
  return res;
}
