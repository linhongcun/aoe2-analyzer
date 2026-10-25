/** Technology eligibility shared by construction and garrison previews. */
import raw from '../data/garrison_techs.json';
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
export const GARRISON_TECH_DATA: GarrisonTechData = raw;

export function implicitShapeTechs(ctx: Context, b: Building, config: Config, data: GarrisonTechData): number[] {
  const all = new Set(Object.values(data.unitUpgradeTechs ?? {}).flat());
  const found = new Set<number>();
  const add = (id: number) => {
    if (found.has(id)) return;
    found.add(id);
    const pre = ctx.core.techById[id]?.pre;
    if (pre && all.has(pre)) add(pre);
  };
  for (const id of [b.id, ...config.rows.map((r) => r.unitId)]) for (const tid of data.unitUpgradeTechs?.[id] ?? []) add(tid);
  return [...found];
}

export function freeGarrisonTechs(ctx: Context, b: Building, config: Config, data = GARRISON_TECH_DATA): number[] {
  const status = civStatus(ctx.trees, config.civ);
  const disabled = new Set(data.civs[config.civ]?.disabled ?? []);
  const available = new Set(
    ctx.core.techs
      .filter(
        (t) =>
          t.civs.includes(config.civ) &&
          status['t' + t.id] === 1 &&
          !disabled.has(t.id) &&
          productionTechAge(t, config.civ) <= config.age &&
          !!data.techs[t.id],
      )
      .map((t) => t.id),
  );
  const known = new Set(config.techs);
  for (const tid of implicitShapeTechs(ctx, b, config, data)) known.add(tid);
  const shapeUpgrades = new Set(Object.values(data.unitUpgradeTechs ?? {}).flat());
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
    for (const id of data.civs[config.civ]?.free ?? []) {
      const pre = ctx.core.techById[id]?.pre;
      if (accepted.includes(id) || !available.has(id) || (shapeUpgrades.has(id) && !known.has(id)) || (pre && available.has(pre) && !known.has(pre))) continue;
      accepted.push(id);
      known.add(id);
      changed = true;
    }
  }
  return [...new Set(accepted)].sort((a, b) => a - b);
}
