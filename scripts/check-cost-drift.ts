/**
 * #865 轻量防漂移：只读已提交 JSON 与 costPolicy。
 * 不下载 .dat，不跑全文明开局矩阵。
 * 用法：npm run cost:check
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { civDiscountFactors, priceFromRawFactor } from '../src/domain/costPolicy';

type Cost = Record<string, number>;
interface CatalogUnit {
  id: number;
  zh?: string;
  age: number;
  civs: string[];
  cost?: Cost;
  tt?: number;
}
interface EcoUnit {
  class?: number;
  cost?: Cost;
  trainTime?: number;
}
interface EcoEffect {
  kind?: string;
  attr?: string;
  op?: string;
  target?: string;
  v?: number;
}
interface EcoRow {
  source?: string;
  age?: number;
  effects?: EcoEffect[];
}
export interface EcoSlice {
  units: Record<string, EcoUnit>;
  buildings: Record<string, { cost?: Cost }>;
  civEco: Record<string, EcoRow[]>;
}

const RES = ['Food', 'Wood', 'Gold', 'Stone'] as const;
const ATTR: Record<string, readonly string[]> = {
  cost: RES,
  foodCost: ['Food'],
  woodCost: ['Wood'],
  goldCost: ['Gold'],
  stoneCost: ['Stone'],
};

function sameCost(a: Cost | undefined, b: Cost | undefined): boolean {
  const left = Object.fromEntries(Object.entries(a ?? {}).filter(([, v]) => v));
  const right = Object.fromEntries(Object.entries(b ?? {}).filter(([, v]) => v));
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) if (left[key] !== right[key]) return false;
  return true;
}

/** 目录造价、训练时间与 eco.json 不一致的说明。 */
export function baseDrifts(
  catalog: CatalogUnit[],
  ecoUnits: Record<string, EcoUnit>,
  buildings: { id: number; zh?: string; cost?: Cost }[],
  ecoBuildings: Record<string, { cost?: Cost }>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const unit of catalog) {
    seen.add(String(unit.id));
    const eco = ecoUnits[String(unit.id)];
    if (!eco) {
      out.push(`单位 ${unit.id} ${unit.zh ?? ''} 不在 eco.units`);
      continue;
    }
    if (!sameCost(unit.cost, eco.cost)) out.push(`单位 ${unit.id} ${unit.zh ?? ''} 造价 目录 ${JSON.stringify(unit.cost)} eco ${JSON.stringify(eco.cost)}`);
    if (unit.tt !== undefined && eco.trainTime !== undefined && unit.tt !== eco.trainTime)
      out.push(`单位 ${unit.id} ${unit.zh ?? ''} 训练时间 目录 ${unit.tt} eco ${eco.trainTime}`);
  }
  for (const id of Object.keys(ecoUnits)) if (!seen.has(id)) out.push(`eco.units ${id} 不在单位目录`);
  const seenB = new Set<string>();
  for (const building of buildings) {
    seenB.add(String(building.id));
    const eco = ecoBuildings[String(building.id)];
    if (!eco) {
      out.push(`建筑 ${building.id} ${building.zh ?? ''} 不在 eco.buildings`);
      continue;
    }
    if (!sameCost(building.cost, eco.cost))
      out.push(`建筑 ${building.id} ${building.zh ?? ''} 造价 目录 ${JSON.stringify(building.cost)} eco ${JSON.stringify(eco.cost)}`);
  }
  for (const id of Object.keys(ecoBuildings)) if (!seenB.has(id)) out.push(`eco.buildings ${id} 不在建筑目录`);
  return out;
}

function ecoFactor(eco: EcoSlice, civ: string, id: number, age: number, cls: number | undefined): Record<string, number> {
  const fac: Record<string, number> = { Food: 1, Wood: 1, Gold: 1, Stone: 1 };
  for (const row of eco.civEco[civ] ?? []) {
    if (row.source === 'team' || (row.age ?? 1) > age) continue;
    for (const effect of row.effects ?? []) {
      if (effect.kind !== 'attr' || effect.op !== 'mul') continue;
      const resources = ATTR[effect.attr ?? ''];
      if (!resources) continue;
      const target = effect.target ?? '';
      if (target !== `unit:${id}` && target !== `class:${cls}` && !(target === 'villager' && id === 83)) continue;
      for (const res of resources) fac[res] = (fac[res] ?? 1) * (effect.v ?? 1);
    }
  }
  return fac;
}

/** PK/costPolicy 的显示价与 eco 原始乘数的显示价不一致。 */
export function discountDrifts(catalog: CatalogUnit[], eco: EcoSlice): string[] {
  const out: string[] = [];
  const civs = new Set(catalog.flatMap((unit) => unit.civs));
  for (const civ of civs) {
    for (const unit of catalog) {
      if (!unit.civs.includes(civ)) continue;
      const ecoUnit = eco.units[String(unit.id)];
      if (!ecoUnit) continue;
      for (let age = unit.age; age <= 4; age++) {
        const policy = civDiscountFactors(unit.id, civ, age);
        const fromEco = ecoFactor(eco, civ, unit.id, age, ecoUnit.class);
        for (const res of RES) {
          const base = unit.cost?.[res];
          if (!base) continue;
          const decision = policy[res];
          const idle = !decision || (decision.factor === 1 && decision.accumulated === 1);
          if (idle && fromEco[res] === 1) continue;
          const policyPrice = priceFromRawFactor(base, decision?.factor ?? 1);
          const ecoPrice = priceFromRawFactor(base, fromEco[res] ?? 1);
          if (policyPrice !== ecoPrice) out.push(`${civ} ${unit.zh ?? unit.id} 时代${age} ${res}：折后价 ${policyPrice}，eco 乘数价 ${ecoPrice}`);
        }
      }
    }
  }
  return out;
}

function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const read = (path: string) => JSON.parse(readFileSync(resolve(root, path), 'utf8')) as unknown;
  const catalog = read('src/data/units.json') as CatalogUnit[];
  const buildings = read('src/data/buildings.json') as { id: number; zh?: string; cost?: Cost }[];
  const eco = read('src/data/eco.json') as EcoSlice;
  const problems = [...baseDrifts(catalog, eco.units, buildings, eco.buildings), ...discountDrifts(catalog, eco)];
  if (problems.length) {
    for (const line of problems.slice(0, 30)) console.error(line);
    if (problems.length > 30) console.error(`…另有 ${problems.length - 30} 条`);
    console.error(`费用防漂移：${problems.length} 条不一致`);
    return 1;
  }
  console.log(`费用防漂移：${catalog.length} 个单位、${buildings.length} 座建筑基价与训练时间一致；折后价与 eco 乘数一致`);
  return 0;
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) process.exitCode = main();
