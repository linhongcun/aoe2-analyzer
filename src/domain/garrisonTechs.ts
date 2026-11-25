/** Technology eligibility shared by construction and garrison previews. */
import raw from '../../data/game/garrison_techs.json';
import type { Core } from '../data';
import type { Building, Trees } from './types';
import { civStatus } from './simulator';
import { productionTechAge } from './production';

export interface GarrisonTechData {
  techs: Record<string, unknown>;
  unitUpgradeTechs?: Record<string, number[]>;
  civs: Record<string, { free: number[]; disabled: number[] }>;
}
interface Context {
  core: Core;
  trees: Trees;
}
interface Config {
  civ: string;
  age: number;
  techs: number[];
  rows: { unitId: number }[];
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export const GARRISON_TECH_DATA: GarrisonTechData = deepFreeze(raw as GarrisonTechData);
const DEFAULT_SHAPE_UPGRADES: ReadonlySet<number> = new Set(Object.values(GARRISON_TECH_DATA.unitUpgradeTechs ?? {}).flat());
const shapeUpgradeSet = (data: GarrisonTechData): ReadonlySet<number> =>
  data === GARRISON_TECH_DATA ? DEFAULT_SHAPE_UPGRADES : new Set(Object.values(data.unitUpgradeTechs ?? {}).flat());

export function implicitShapeTechs(
  ctx: Context,
  b: Building,
  config: Config,
  data: GarrisonTechData,
  shapeUpgrades: ReadonlySet<number> = shapeUpgradeSet(data),
): number[] {
  const found = new Set<number>();
  const add = (id: number) => {
    if (found.has(id)) return;
    found.add(id);
    const pre = ctx.core.techById[id]?.pre;
    if (pre && shapeUpgrades.has(pre)) add(pre);
  };
  for (const id of [b.id, ...config.rows.map((r) => r.unitId)]) for (const tid of data.unitUpgradeTechs?.[id] ?? []) add(tid);
  return [...found];
}

export function freeGarrisonTechs(
  ctx: Context,
  b: Building,
  config: Config,
  data = GARRISON_TECH_DATA,
  status: Record<string, number> = civStatus(ctx.trees, config.civ),
  shapeUpgrades: ReadonlySet<number> = shapeUpgradeSet(data),
): number[] {
  const freeList = data.civs[config.civ]?.free ?? [];
  if (!freeList.length) return [];
  const disabled = new Set(data.civs[config.civ]?.disabled ?? []);
  const availCache = new Map<number, boolean>();
  const isAvailable = (tid: number): boolean => {
    const cached = availCache.get(tid);
    if (cached !== undefined) return cached;
    const t = ctx.core.techById[tid];
    const ok =
      !!t &&
      t.civs.includes(config.civ) &&
      status['t' + t.id] === 1 &&
      !disabled.has(t.id) &&
      productionTechAge(t, config.civ) <= config.age &&
      !!data.techs[t.id];
    availCache.set(tid, ok);
    return ok;
  };
  const known = new Set(config.techs);
  for (const tid of implicitShapeTechs(ctx, b, config, data, shapeUpgrades)) known.add(tid);
  for (const tid of [...known]) {
    let pre = ctx.core.techById[tid]?.pre;
    while (pre && shapeUpgrades.has(pre) && !known.has(pre)) {
      known.add(pre);
      pre = ctx.core.techById[pre]?.pre;
    }
  }
  const accepted: number[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of freeList) {
      const pre = ctx.core.techById[id]?.pre;
      if (accepted.includes(id) || !isAvailable(id) || (shapeUpgrades.has(id) && !known.has(id)) || (pre && isAvailable(pre) && !known.has(pre))) continue;
      accepted.push(id);
      known.add(id);
      changed = true;
    }
  }
  return [...new Set(accepted)].sort((a, b) => a - b);
}
