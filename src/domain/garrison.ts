/** Issue 218: villager garrison arrows, pinned .dat inputs + documented Genie rule. */
import raw from '../data/garrison.json';
import type { Core } from '../data';
import type { Building, Tech, Trees } from './types';
import { civStatus } from './simulator';
import { productionTechAge } from './production';

interface GarrisonUnit {
  attack: number;
  reload: number;
  capacity: number;
  firepower: number;
  total: number;
  max: number;
  projectile: number;
}
interface GarrisonEffect {
  unit: number;
  stat: 'attack' | 'reload' | 'capacity' | 'firepower' | 'total' | 'max';
  op: 'add' | 'mul' | 'set';
  value: number;
}
interface GarrisonRule {
  id: number;
  requires: number[];
  count: number;
  effects: GarrisonEffect[];
}
export interface GarrisonData {
  meta: { patch: string; sha256: string };
  units: Record<string, GarrisonUnit>;
  techs: Record<string, GarrisonRule>;
  conditional: GarrisonRule[];
  civs: Record<string, { automatic: GarrisonRule[]; free: number[] }>;
}
export const GARRISON_DATA = raw as unknown as GarrisonData;
export const GARRISON_BUILDINGS = [109, 79, 234, 235] as const;
export interface GarrisonContext {
  core: Core;
  trees: Trees;
}
export interface GarrisonConfig {
  civ: string;
  age: number;
  techs: number[];
  villagers: string;
}
export interface GarrisonResult {
  errors: string[];
  baseArrows: number;
  extraArrows: number;
  totalArrows: number;
  capacity: number;
  maxArrows: number;
  nextAt: number | null;
  saturationAt: number | null;
  maxAtCapacity: number;
  villagerPower: number;
  buildingPower: number;
  selected: number[];
}

export function garrisonTechs(ctx: GarrisonContext, b: Building, civ: string, age: number): Tech[] {
  const status = civStatus(ctx.trees, civ);
  return ctx.core.techs.filter(
    (t) =>
      t.civs.includes(civ) &&
      status['t' + t.id] === 1 &&
      productionTechAge(t, civ) <= age &&
      GARRISON_DATA.techs[t.id]?.effects.some((e) => e.unit === b.id || e.unit === 83),
  );
}

export function garrisonFreeTechs(ctx: GarrisonContext, b: Building, config: GarrisonConfig): number[] {
  const available = new Set(garrisonTechs(ctx, b, config.civ, config.age).map((t) => t.id));
  return (GARRISON_DATA.civs[config.civ]?.free ?? []).filter((id) => available.has(id));
}

export function toggleGarrisonTech(ctx: GarrisonContext, b: Building, config: GarrisonConfig, id: number): number[] {
  const available = new Set(garrisonTechs(ctx, b, config.civ, config.age).map((t) => t.id));
  const free = new Set(garrisonFreeTechs(ctx, b, config));
  const selected = new Set([...config.techs, ...free]);
  if (free.has(id) || !available.has(id)) return [...selected];
  if (selected.has(id)) {
    selected.delete(id);
    let changed = true;
    while (changed) {
      changed = false;
      for (const t of selected) {
        const pre = ctx.core.techById[t]?.pre;
        if (pre && available.has(pre) && !selected.has(pre)) {
          selected.delete(t);
          changed = true;
        }
      }
    }
  } else {
    const add = (tid: number) => {
      if (selected.has(tid)) return;
      selected.add(tid);
      const pre = ctx.core.techById[tid]?.pre;
      if (pre && available.has(pre)) add(pre);
    };
    add(id);
  }
  return [...selected].sort((a, z) => a - z);
}

export function calculateGarrison(ctx: GarrisonContext, b: Building, config: GarrisonConfig, data = GARRISON_DATA): GarrisonResult {
  const result: GarrisonResult = {
    errors: [],
    baseArrows: 0,
    extraArrows: 0,
    totalArrows: 0,
    capacity: 0,
    maxArrows: 0,
    nextAt: null,
    saturationAt: null,
    maxAtCapacity: 0,
    villagerPower: 0,
    buildingPower: 0,
    selected: [],
  };
  const fail = (message: string) => result.errors.push(message);
  if (!(GARRISON_BUILDINGS as readonly number[]).includes(b.id)) fail('首版仅支持城镇中心和箭塔线的村民驻军。');
  if (!data.civs[config.civ] || !b.civs.includes(config.civ)) fail('该文明不可使用此建筑，或驻军规则尚未核实。');
  if (!Number.isSafeInteger(config.age) || config.age < b.age || config.age > 4) fail('时代无效或早于该建筑形态。');
  const available = new Set(garrisonTechs(ctx, b, config.civ, config.age).map((t) => t.id));
  const selected = new Set([...config.techs, ...garrisonFreeTechs(ctx, b, config)]);
  for (const id of selected) {
    const tech = ctx.core.techById[id];
    if (!Number.isSafeInteger(id) || !available.has(id) || !data.techs[id]) {
      fail(`${tech?.zh ?? `科技 ${id}`}：不可用、不影响本预览或规则未核实，请移除。`);
      continue;
    }
    if (tech?.pre && available.has(tech.pre) && !selected.has(tech.pre)) fail(`${tech.zh}缺少前置科技，请先选择前置。`);
  }
  if (result.errors.length) return result;
  const building = data.units[b.id],
    villager = data.units[83];
  if (!building || !villager) {
    fail('固定版本驻军数据缺失，停止计算。');
    return result;
  }
  const B = { ...building },
    V = { ...villager };
  const apply = (r: GarrisonRule) => {
    for (const e of r.effects) {
      const target = e.unit === b.id ? B : e.unit === 83 ? V : null;
      if (target) target[e.stat] = e.op === 'set' ? e.value : e.op === 'mul' ? target[e.stat] * e.value : target[e.stat] + e.value;
    }
  };
  const known = new Set([...selected, 104, ...[101, 102, 103].filter((_, i) => config.age >= i + 2)]);
  // Selecting the exact Guard Tower / Keep shape means its line upgrade has
  // already completed. Shadow Arrowslits technologies retain their n-of rules.
  if (b.id === 234 || b.id === 235) known.add(140);
  if (b.id === 235) known.add(63);
  const ready = (r: GarrisonRule) => r.requires.filter((id) => known.has(id)).length >= r.count;
  for (const r of data.civs[config.civ]!.automatic) if (ready(r)) apply(r);
  for (const id of selected) apply(data.techs[id]!);
  // The relevant conditional rules currently depend on selected technologies
  // and building-line upgrades. Iterate for explicit shadow-tech dependencies.
  const done = new Set<number>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of data.conditional) {
      if (!done.has(r.id) && ready(r)) {
        apply(r);
        done.add(r.id);
        known.add(r.id);
        changed = true;
      }
    }
  }
  const values = [B.attack, B.reload, B.capacity, B.total, B.max, V.firepower, V.attack, V.reload];
  if (
    !values.every(Number.isFinite) ||
    B.attack <= 0 ||
    B.reload <= 0 ||
    V.reload <= 0 ||
    V.firepower >= 0 ||
    ![B.capacity, B.total, B.max].every(Number.isSafeInteger) ||
    B.max < B.total ||
    B.capacity < 0 ||
    B.capacity > 100
  ) {
    fail('该组合的驻军贡献或弹丸规则尚未核实，停止计算。');
    return result;
  }
  result.capacity = B.capacity;
  if (!/^\d+$/.test(config.villagers) || !Number.isSafeInteger(Number(config.villagers)) || Number(config.villagers) > B.capacity) {
    fail(`驻军人数须为 0–${B.capacity} 的整数。`);
    return result;
  }
  const n = Number(config.villagers);
  // A Town Center has a non-firing main-projectile slot (-1); its secondary
  // projectiles are its actual arrows. Towers have a real primary projectile.
  const absentMain = B.projectile < 0 ? 1 : 0;
  const base = B.total - absentMain;
  const max = B.max - absentMain;
  const unitPower = V.attack / V.reload - V.firepower;
  const arrowPower = B.attack / B.reload;
  const arrows = (count: number) => base + Math.min(B.max - B.total, Math.floor((count * unitPower) / arrowPower + 1e-9));
  result.baseArrows = base;
  result.maxArrows = max;
  result.totalArrows = arrows(n);
  result.extraArrows = result.totalArrows - base;
  result.maxAtCapacity = arrows(B.capacity);
  result.villagerPower = unitPower;
  result.buildingPower = arrowPower;
  result.selected = [...selected].sort((a, z) => a - z);
  for (let i = 0; i <= B.capacity; i++) {
    if (result.saturationAt === null && arrows(i) >= max) result.saturationAt = i;
    if (i > n && result.nextAt === null && arrows(i) > result.totalArrows) result.nextAt = i;
  }
  return result;
}

export function readGarrison(params: URLSearchParams, b: Building): { config: GarrisonConfig; errors: string[] } {
  const errors: string[] = [];
  for (const key of ['civ', 'age', 'gtechs', 'garrison']) if (params.getAll(key).length > 1) errors.push(`${key} 参数重复，请重置方案。`);
  const age = params.get('age');
  const tokens = params.get('gtechs');
  const techs: number[] = [];
  if (tokens)
    for (const token of tokens.split(',')) {
      if (!/^\d+$/.test(token) || !Number.isSafeInteger(Number(token)) || Number(token) <= 0) errors.push('科技参数包含无效 ID，请清空科技后重选。');
      else techs.push(Number(token));
    }
  if (age !== null && (!/^\d+$/.test(age) || !Number.isSafeInteger(Number(age)))) errors.push('时代参数无效。');
  return {
    config: {
      civ: params.get('civ') ?? b.civs[0]!,
      age: age === null ? Math.max(3, b.age) : Number(age),
      techs: [...new Set(techs)],
      villagers: params.get('garrison') ?? '0',
    },
    errors,
  };
}

export function writeGarrison(config: GarrisonConfig): URLSearchParams {
  return new URLSearchParams({
    tab: 'garrison',
    civ: config.civ,
    age: String(config.age),
    gtechs: [...new Set(config.techs)].sort((a, b) => a - b).join(','),
    garrison: config.villagers,
  });
}
