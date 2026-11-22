import type { Tech, Trees, Unit } from './types';
import { availableUnitAge, EARLY_MILITARY_TECH_AGES, treeRowAge } from './availabilityAge';

interface AvailabilityData {
  core: { unitById: Record<number, Unit>; techById: Record<number, Tech> };
  trees: Trees;
}

interface UnitAvailabilityData {
  core: { unitById: Record<number, Unit> };
  trees: Trees;
}

function treeAge(data: { trees: Trees }, civ: string, kind: 'u' | 't', id: number): number {
  const cells = (data.trees.t[civ] ?? []).flatMap((block) => block[3]).filter((cell) => cell[2] === kind && cell[3] === id && cell[4] === 1);
  return cells.length ? Math.min(...cells.map((cell) => treeRowAge(cell[0]))) : Infinity;
}

export function unitAvailable(data: UnitAvailabilityData, civ: string, id: number, age: number): boolean {
  const unit = data.core.unitById[id];
  const rowAge = treeAge(data, civ, 'u', id);
  if (!unit?.civs.includes(civ) || !Number.isFinite(rowAge) || ![1, 2, 3, 4].includes(age)) return false;
  // Existing early-unit exceptions override a stale catalogue/tree row. Otherwise use
  // both sources: ordinary spearmen are Feudal; Armenians' actual row is Dark Age.
  return availableUnitAge(civ, id, unit.age, rowAge) <= age;
}

/** 问目录文明与目录/树行时代（含已登记的军事科技提前，不含勃艮第采集科技的生产口径提前）。不代替另外三套。例外见 techAvailability.ts。 */
export function techAvailable(data: AvailabilityData, civ: string, id: number, age: number): boolean {
  const tech = data.core.techById[id];
  const rowAge = treeAge(data, civ, 't', id);
  if (!tech?.civs.includes(civ) || !Number.isFinite(rowAge) || ![1, 2, 3, 4].includes(age)) return false;
  const early = Object.hasOwn(EARLY_MILITARY_TECH_AGES, civ) ? EARLY_MILITARY_TECH_AGES[civ]?.[id] : undefined;
  return (early ?? Math.max(tech.age, rowAge)) <= age;
}
