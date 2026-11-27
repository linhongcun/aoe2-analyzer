import type { Tech, Trees, Unit } from './types';
import { availableUnitAge, militaryTechAge, treeNodeEarliestAge } from './availabilityAge';

interface AvailabilityData {
  core: { unitById: Record<number, Unit>; techById: Record<number, Tech> };
  trees: Trees;
}

interface UnitAvailabilityData {
  core: { unitById: Record<number, Unit> };
  trees: Trees;
}

export function unitAvailable(data: UnitAvailabilityData, civ: string, id: number, age: number): boolean {
  const unit = data.core.unitById[id];
  const rowAge = treeNodeEarliestAge(data.trees, civ, 'u', id);
  if (!unit?.civs.includes(civ) || !Number.isFinite(rowAge) || ![1, 2, 3, 4].includes(age)) return false;
  // Existing early-unit exceptions override a stale catalogue/tree row. Otherwise use
  // both sources: ordinary spearmen are Feudal; Armenians' actual row is Dark Age.
  return availableUnitAge(civ, id, unit.age, rowAge) <= age;
}

/** 问目录文明与目录/树行时代（含已登记的军事科技提前，不含勃艮第采集科技的生产口径提前）。不代替另外三套。例外见 techAvailability.ts。 */
export function techAvailable(data: AvailabilityData, civ: string, id: number, age: number): boolean {
  const tech = data.core.techById[id];
  const rowAge = treeNodeEarliestAge(data.trees, civ, 't', id);
  if (!tech?.civs.includes(civ) || !Number.isFinite(rowAge) || ![1, 2, 3, 4].includes(age)) return false;
  return militaryTechAge(civ, id, Math.max(tech.age, rowAge)) <= age;
}
