import type { Tech, Trees, Unit } from './types';
import { EARLY_UNIT_AGES } from './availabilityAge';

interface AvailabilityData {
  core: { unitById: Record<number, Unit>; techById: Record<number, Tech> };
  trees: Trees;
}

function treeAge(data: AvailabilityData, civ: string, kind: 'u' | 't', id: number): number {
  const cells = (data.trees.t[civ] ?? []).flatMap((block) => block[3]).filter((cell) => cell[2] === kind && cell[3] === id && cell[4] === 1);
  return cells.length ? Math.min(...cells.map((cell) => Math.floor(cell[0] / 2) + 1)) : Infinity;
}

export function unitAvailable(data: AvailabilityData, civ: string, id: number, age: number): boolean {
  const unit = data.core.unitById[id];
  const rowAge = treeAge(data, civ, 'u', id);
  if (!unit?.civs.includes(civ) || !Number.isFinite(rowAge) || ![1, 2, 3, 4].includes(age)) return false;
  // Existing early-unit exceptions override a stale catalogue/tree row. Otherwise use
  // both sources: ordinary spearmen are Feudal; Armenians' actual row is Dark Age.
  return (EARLY_UNIT_AGES[civ]?.[id] ?? Math.max(unit.age, rowAge)) <= age;
}

export function techAvailable(data: AvailabilityData, civ: string, id: number, age: number): boolean {
  const tech = data.core.techById[id];
  return !!tech?.civs.includes(civ) && [1, 2, 3, 4].includes(age) && Math.max(tech.age, treeAge(data, civ, 't', id)) <= age;
}
