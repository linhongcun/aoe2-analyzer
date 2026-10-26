import type { Unit } from './types';

/** 文明的区域单位路线；每个形态先核对可用性，供说明、数据与战术模块共用。 */
export function regionalUnitLines(civ: string, units: readonly Unit[]): Unit[][] {
  const available = units.filter((u) => u.type === 'RegionalUnit' && u.civs.includes(civ));
  const byId = new Map(available.map((u) => [u.id, u]));
  const lines = new Map<number, { unit: Unit; depth: number }[]>();
  for (const unit of available) {
    let root = unit;
    const seen = new Set([unit.id]);
    while (root.from_ != null && byId.has(root.from_) && !seen.has(root.from_)) {
      root = byId.get(root.from_)!;
      seen.add(root.id);
    }
    const line = lines.get(root.id) ?? [];
    line.push({ unit, depth: seen.size - 1 });
    lines.set(root.id, line);
  }
  return [...lines.values()].map((line) => line.sort((a, b) => a.depth - b.depth).map(({ unit }) => unit));
}
