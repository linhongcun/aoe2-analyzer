import type { Tech, Trees, Unit } from './types';
import { availableUnitAge, treeRowAge } from './availabilityAge';

interface AvailabilityData {
  core: { unitById: Record<number, Unit>; techById: Record<number, Tech> };
  trees: Trees;
}

function treeAge(data: AvailabilityData, civ: string, kind: 'u' | 't', id: number): number {
  const cells = (data.trees.t[civ] ?? []).flatMap((block) => block[3]).filter((cell) => cell[2] === kind && cell[3] === id && cell[4] === 1);
  return cells.length ? Math.min(...cells.map((cell) => treeRowAge(cell[0]))) : Infinity;
}

export function unitAvailable(data: AvailabilityData, civ: string, id: number, age: number): boolean {
  const unit = data.core.unitById[id];
  const rowAge = treeAge(data, civ, 'u', id);
  if (!unit?.civs.includes(civ) || !Number.isFinite(rowAge) || ![1, 2, 3, 4].includes(age)) return false;
  // Existing early-unit exceptions override a stale catalogue/tree row. Otherwise use
  // both sources: ordinary spearmen are Feudal; Armenians' actual row is Dark Age.
  return availableUnitAge(civ, id, unit.age, rowAge) <= age;
}

/** 问目录文明与目录/树行时代。不代替另外三套，也不读生产口径的手写提前。例外见 techAvailability.ts。 */
export function techAvailable(data: AvailabilityData, civ: string, id: number, age: number): boolean {
  const tech = data.core.techById[id];
  return !!tech?.civs.includes(civ) && [1, 2, 3, 4].includes(age) && Math.max(tech.age, treeAge(data, civ, 't', id)) <= age;
}
