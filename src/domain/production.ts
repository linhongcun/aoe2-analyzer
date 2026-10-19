/** issue 204 稳态连续训练。游戏数值只读固定 eco / effects；不修改旧真实费用默认口径。 */
import ecoRaw from '../data/eco.json';
import { civs, type Core } from '../data';
import { DAT, type DatEco } from './datEffects';
import { discountedCost, roundHalfPrice } from './costDiscount';
import { gatherModel, type GatherRes } from './realCost';
import type { Cost, Tech, Trees, Unit } from './types';

interface EcoEffect {
  kind: string;
  target?: string;
  attr?: string;
  op?: string;
  v?: number;
  tech?: number;
  res?: number;
}
interface EcoRow {
  age: number;
  name: string;
  source: string;
  tech?: number;
  requires?: number[];
  effects: EcoEffect[];
}
interface EcoUnit {
  at: number[];
  class?: number;
  cost: Cost;
  trainTime: number;
  timeAt?: Record<string, number>;
}
const eco = ecoRaw as unknown as {
  units: Record<string, EcoUnit>;
  villager: { cost: Cost; trainTime: number };
  ecoTechs: Record<string, { effects: EcoEffect[] }>;
  civEco: Record<string, EcoRow[]>;
};
export const PRODUCTION_RES = ['Food', 'Wood', 'Gold', 'Stone'] as const;
export const PRODUCTION_LIMIT = 12;
export const BUILDING_LIMIT = 100;
export interface ProductionRow {
  unit: number;
  building: number;
  count: string;
}
export interface ProductionConfig {
  civ: string;
  age: number;
  techs: number[];
  walk: number;
  farm: number;
  rows: ProductionRow[];
}
export interface ProductionContext {
  core: Core;
  trees: Trees;
}
export const DEFAULT_PRODUCTION: ProductionConfig = { civ: 'Franks', age: 3, techs: [], walk: 3, farm: 1, rows: [{ unit: 83, building: 109, count: '1' }] };
const earlyUnits: Record<string, Record<number, number>> = {
  Armenians: { 75: 1, 77: 2, 473: 3, 358: 2, 359: 3 },
  Cumans: { 1258: 2, 422: 3 },
  Burgundians: { 283: 3 },
  Bohemians: { 5: 3 },
};
const task = { Food: 'farm', Wood: 'wood', Gold: 'gold', Stone: 'stone' } as const;
const costAttrs: Record<number, GatherRes | 'all'> = { 100: 'all', 103: 'Food', 104: 'Wood', 105: 'Gold', 106: 'Stone' };
const change = (base: number, op: string | undefined, v: number) => (op === 'set' ? v : op === 'mul' ? base * v : base + v);
const unique = (s: string[]) => [...new Set(s)];

export function productionTechAge(t: Tech, civ: string) {
  if (civ === 'Burgundians' && eco.ecoTechs[t.id] && isGatherTech(t)) return Math.max(1, t.age - 1);
  if (civ === 'Bohemians' && t.id === 47) return 3;
  return t.age;
}
function isGatherTech(t: Tech) {
  return (eco.ecoTechs[t.id]?.effects ?? []).some(
    (e) =>
      e.kind === 'attr' &&
      ['task:farm', 'task:wood', 'task:gold', 'task:stone', 'class:4'].includes(e.target ?? '') &&
      ['workRate', 'carry', 'speed'].includes(e.attr ?? ''),
  );
}
export function productionTechs(ctx: ProductionContext, config: Pick<ProductionConfig, 'civ' | 'age'>): Tech[] {
  return ctx.core.techs.filter((t) => {
    if (!t.civs.includes(config.civ) || productionTechAge(t, config.civ) > config.age) return false;
    const status = ctx.trees.t[config.civ]?.flatMap((b) => b[3]).find((c) => c[2] === 't' && c[3] === t.id);
    if (!status?.[4]) return false;
    const d = DAT.techs[t.en];
    return (
      isGatherTech(t) ||
      [16, 47, 483, 755].includes(t.id) ||
      (!!d &&
        (d.eco.some((e) => e.a !== undefined && (costAttrs[e.a] || (e.a === 13 && e.t?.some((id) => !!ctx.core.buildingById[id])))) ||
          d.rules.some((r) => !r.b && r.fx.some((f) => f.s === 'bt'))))
    );
  });
}
/** “免费”须原费用的每项资源和研究时间全部归零，不能采用 eco 的零单项费用推断。 */
export function freeProductionTechs(ctx: ProductionContext, config: Pick<ProductionConfig, 'civ' | 'age'>): Set<number> {
  const entries = (DAT.civs[config.civ]?.bonus ?? []).filter((r) => r.age <= config.age);
  const zeroes = entries.flatMap((r) => r.eco).filter((e) => e.tid !== undefined && e.op === 'set' && e.v === 0);
  const resName: Record<string, string> = { Food: '食物', Wood: '木材', Gold: '黄金', Stone: '石料' };
  return new Set(
    productionTechs(ctx, config)
      .filter((t) => {
        const zeros = zeroes.filter((e) => e.tid === t.id);
        return (
          zeros.some((e) => e.what === '研究时间') &&
          Object.entries(t.cost)
            .filter(([, v]) => v > 0)
            .every(([r]) => zeros.some((e) => e.what === resName[r]))
        );
      })
      .map((t) => t.id),
  );
}
export function effectiveProductionTechs(ctx: ProductionContext, config: ProductionConfig): Set<number> {
  const available = new Set(productionTechs(ctx, config).map((t) => t.id));
  const selected = new Set([...config.techs.filter((id) => available.has(id)), ...freeProductionTechs(ctx, config)]);
  const add = (id: number) => {
    const pre = ctx.core.techById[id]?.pre;
    if (pre && available.has(pre) && !selected.has(pre)) {
      selected.add(pre);
      add(pre);
    }
  };
  [...selected].forEach(add);
  return selected;
}
export function toggleProductionTech(ctx: ProductionContext, config: ProductionConfig, id: number): number[] {
  const sel = effectiveProductionTechs(ctx, config);
  if (freeProductionTechs(ctx, config).has(id)) return [...sel];
  if (sel.has(id)) {
    sel.delete(id);
    let changed = true;
    while (changed) {
      changed = false;
      for (const tid of sel)
        if (ctx.core.techById[tid]?.pre === id || (ctx.core.techById[tid]?.pre && !sel.has(ctx.core.techById[tid]!.pre!))) {
          sel.delete(tid);
          changed = true;
        }
    }
  } else sel.add(id);
  return [...effectiveProductionTechs(ctx, { ...config, techs: [...sel] })];
}

/** 独立生产地点由该文明树格确认，附加地点还须具有 .dat 的训练记录。 */
export function productionBuildings(ctx: ProductionContext, config: ProductionConfig, u: Unit): number[] {
  const data = eco.units[u.id];
  if (!data || !u.civs.includes(config.civ)) return [];
  const selected = effectiveProductionTechs(ctx, config);
  return (ctx.trees.t[config.civ] ?? [])
    .filter((block) => {
      const b = ctx.core.buildingById[block[0]];
      if (!b || !b.civs.includes(config.civ) || !data.at.includes(b.id)) return false;
      const buildingAge = config.civ === 'Cumans' && b.id === 49 ? 2 : b.age;
      if (buildingAge > config.age) return false;
      const cell = block[3].find((c) => c[2] === 'u' && c[3] === u.id && c[4] === 1);
      if (!cell) return false;
      const unitAge = earlyUnits[config.civ]?.[u.id] ?? u.age;
      // 部分原始目录把长矛兵归为黑暗时代；实际科技树位于封建栏。
      if (Math.max(unitAge, u.id === 93 ? 2 : 1) > config.age) return false;
      if ([759, 761].includes(u.id) && b.id === 12 && !selected.has(16)) return false;
      if ([886, 887].includes(u.id) && b.id === 101 && !selected.has(483)) return false;
      if (u.id === 1699 && !selected.has(755)) return false;
      // 化学的解锁对象来自固定 techs.json #47，单位形态升级不能替代该前置。
      if ([5, 36, 420, 691].includes(u.id) && !selected.has(47)) return false;
      return true;
    })
    .map((b) => b[0]);
}
export function productionUnits(ctx: ProductionContext, config: ProductionConfig): Unit[] {
  return ctx.core.units.filter((u) => productionBuildings(ctx, config, u).length > 0);
}

function matches(e: EcoEffect, u: Unit) {
  return e.target === `unit:${u.id}` || e.target === `class:${eco.units[u.id]?.class}` || (u.id === 83 && ['villager', 'class:4'].includes(e.target ?? ''));
}
function buildingTarget(building: number, age: number) {
  if (building === 109) return [109, 71, 141, 142][age - 1] ?? building;
  if (building === 45) return [45, 133, 47, 51][age - 1] ?? building;
  return building;
}
function selectedTechEffects(ctx: ProductionContext, sel: Set<number>) {
  return [...sel].map((id) => ctx.core.techById[id]).filter((t): t is Tech => !!t && !isGatherTech(t));
}
function relevantTechEffects(t: Tech): DatEco[] {
  return (DAT.techs[t.en]?.eco ?? []).filter((e) => e.a !== undefined && (costAttrs[e.a] || e.a === 101 || e.a === 13));
}

export interface ProductionLine {
  unit: Unit;
  building: number;
  count: number;
  cost: Cost;
  seconds: number;
  perMinute: number;
  spend: Record<GatherRes, number>;
  applied: string[];
}
export interface ProductionResult {
  lines: ProductionLine[];
  errors: string[];
  warnings: string[];
  applied: string[];
  resources: { key: GatherRes; spend: number; income: number; villagers: number; rounded: number }[];
  total: number;
  techs: Set<number>;
}
export function calculateProduction(ctx: ProductionContext, config: ProductionConfig): ProductionResult {
  const errors: string[] = [],
    warnings: string[] = [],
    applied: string[] = [],
    lines: ProductionLine[] = [];
  const sel = effectiveProductionTechs(ctx, config);
  if (!civs.some((c) => c.en === config.civ)) errors.push('文明不存在，请重新选择。');
  if (![1, 2, 3, 4].includes(config.age)) errors.push('时代无效。');
  if (![config.walk, config.farm].every((n) => Number.isFinite(n) && n >= 0 && n <= 10)) errors.push('采集距离须在 0–10 格之间。');
  if (config.rows.length > PRODUCTION_LIMIT) errors.push(`最多添加 ${PRODUCTION_LIMIT} 条需求。`);
  const availableTechs = new Set(productionTechs(ctx, config).map((t) => t.id));
  if (config.techs.some((id) => !availableTechs.has(id))) errors.push('方案含当前文明或时代不可用的科技，请清除不可用科技。');
  const gather = gatherModel(config.age, config.civ, { techIds: sel, walkTiles: config.walk, farmTiles: config.farm });
  warnings.push(...gather.unsupported.map((x) => `${x.label}：采集加成未计入，使用已支持的基础采集模型。`));
  applied.push(...gather.applied.map((x) => x.label));
  // .dat 还有存放收益等资源指令，不能只扫描旧真实费用支持的属性号而静默漏掉。
  const civ = civs.find((c) => c.en === config.civ);
  const economicText = (s: string) => /采集|农民|农田|伐木|采金|采石|矿工|携带|存放/.test(s) && !/免费|费用|成本/.test(s);
  for (const text of civ?.bon ?? [])
    if (economicText(text) && !gather.applied.some((x) => x.source === text)) warnings.push(`${text}：该文明经济机制未计入（已单独列明的基础属性加成除外）。`);
  if (civ && economicText(civ.tb)) warnings.push(`${civ.tb}：本文明团队经济机制未计入。`);
  const selectedTechs = selectedTechEffects(ctx, sel);
  config.rows.forEach((row, index) => {
    const label = `需求 ${index + 1}`;
    const u = ctx.core.unitById[row.unit];
    if (!/^\d+$/.test(row.count) || +row.count > BUILDING_LIMIT) {
      errors.push(`${label}：建筑数量须为 0–${BUILDING_LIMIT} 的整数。`);
      return;
    }
    if (!u || !productionBuildings(ctx, config, u).includes(row.building)) {
      errors.push(`${label}：单位或生产建筑在当前文明、时代和科技方案下不可用，请重新选择。`);
      return;
    }
    const data = eco.units[u.id]!;
    const discount = discountedCost({ id: u.id, cost: data.cost }, config.civ, config.age);
    const cost: Cost = { ...discount.exact };
    const notes = discount.applied.map((x) => x.text);
    warnings.push(...discount.unsupported.map((x) => `${x.text || '文明训练费用折扣'}：折扣未计入。`));
    let seconds = data.timeAt?.[row.building] ?? data.trainTime;
    let speed = 1;
    const targetBuilding = buildingTarget(row.building, config.age);
    for (const r of eco.civEco[config.civ] ?? []) {
      if (r.age > config.age) continue;
      const relevant = r.effects.filter(
        (e) => e.kind === 'attr' && ((e.attr === 'trainTime' && matches(e, u)) || (e.attr === 'workRate' && e.target === `unit:${targetBuilding}`)),
      );
      if (!relevant.length) continue;
      if (config.civ === 'Mapuche' && [1405, 1406, 1407].includes(r.tech ?? 0)) {
        warnings.push('马普切聚落专用训练倍率未计入；兵营和靶场使用普通训练时间，聚落生产暂不可选。');
        continue;
      }
      const needed = (r.requires ?? []).filter((id) => !!ctx.core.techById[id] && ![101, 102, 103].includes(id));
      if (needed.some((id) => !sel.has(id))) continue;
      if (relevant.some((e) => e.op !== 'mul' || !Number.isFinite(e.v) || (e.v ?? 0) <= 0)) {
        warnings.push(`${r.name}：训练效果未核实，未计入。`);
        continue;
      }
      for (const e of relevant) {
        if (e.attr === 'trainTime') seconds *= e.v!;
        else speed *= e.v!;
      }
      notes.push(r.source === 'team' ? '本文明团队训练加成' : r.name);
    }
    for (const t of selectedTechs) {
      const d = DAT.techs[t.en];
      const effects = relevantTechEffects(t).filter((e) => e.t?.includes(u.id) || (e.a === 13 && e.t?.includes(row.building)));
      const time =
        d?.rules
          .filter((r) => !r.b && r.t.includes(u.id))
          .flatMap((r) => r.fx)
          .filter((f) => f.s === 'bt') ?? [];
      if (!effects.length && !time.length) continue;
      // 资源标记可能附带未编码条件；整项排除，避免只实现一半。
      if (d?.eco.some((e) => e.res !== undefined) || effects.some((e) => !['set', 'mul', 'add'].includes(e.op))) {
        warnings.push(`${t.zh}：含未解码的资源或条件效果，生产效果整项未计入。`);
        continue;
      }
      for (const e of effects) {
        if (e.a === 13 && e.t?.includes(row.building)) speed = change(speed, e.op, e.v);
        else if (e.a === 101 && e.t?.includes(u.id)) seconds = change(seconds, e.op, e.v);
        else if (e.a !== undefined && costAttrs[e.a] && e.t?.includes(u.id)) {
          const res = costAttrs[e.a]!;
          for (const k of res === 'all' ? PRODUCTION_RES : [res]) cost[k] = Math.max(0, change(cost[k] ?? 0, e.op, e.v));
        }
      }
      for (const f of time) seconds = change(seconds, f.op, f.v);
      notes.push(t.zh);
    }
    seconds /= speed;
    if (!Number.isFinite(seconds) || seconds <= 0) {
      errors.push(`${label}：无法核实有效训练时间，未计算。`);
      return;
    }
    PRODUCTION_RES.forEach((r) => {
      if (cost[r] !== undefined) cost[r] = roundHalfPrice(cost[r]!);
    });
    const count = +row.count,
      perMinute = (count * 60) / seconds;
    const spend = Object.fromEntries(PRODUCTION_RES.map((r) => [r, (cost[r] ?? 0) * perMinute])) as Record<GatherRes, number>;
    lines.push({ unit: u, building: row.building, count, cost, seconds, perMinute, spend, applied: unique(notes) });
  });
  const resources = PRODUCTION_RES.map((key) => {
    const spend = errors.length ? 0 : lines.reduce((total, l) => total + l.spend[key], 0);
    const income = gather.rate[task[key]] * 60;
    const villagers = income > 0 && Number.isFinite(income) ? spend / income : 0;
    return { key, spend, income, villagers, rounded: Math.ceil(villagers - 1e-9) };
  });
  if (config.civ === 'Mapuche') warnings.push('聚落生产的训练地点和倍率尚未完整核实，暂不可选。');
  if (sel.has(14) || sel.has(13) || sel.has(12)) warnings.push('磨坊科技的农田食物容量收益未计入；本模型不计农田补种，重犁携带量效果仍按数据计入。');
  return { lines, errors, warnings: unique(warnings), applied: unique(applied), resources, total: resources.reduce((n, r) => n + r.rounded, 0), techs: sel };
}

export function encodeProduction(config: ProductionConfig): string {
  const p = new URLSearchParams({
    civ: config.civ,
    age: String(config.age),
    walk: String(config.walk),
    farm: String(config.farm),
    techs: [...new Set(config.techs)].sort((a, b) => a - b).join(','),
    rows: config.rows.map((r) => `${r.unit}:${r.building}:${r.count}`).join(','),
  });
  return p.toString();
}
export function decodeProduction(search: string): { config: ProductionConfig; errors: string[] } {
  const p = new URLSearchParams(search),
    errors: string[] = [];
  const config: ProductionConfig = { ...DEFAULT_PRODUCTION, rows: DEFAULT_PRODUCTION.rows.map((r) => ({ ...r })), techs: [] };
  if (!search || search === '?') return { config, errors };
  const civ = p.get('civ');
  if (civ !== null) {
    if (civs.some((c) => c.en === civ)) config.civ = civ;
    else errors.push('链接中的文明无效，已使用法兰克。');
  }
  for (const key of ['age', 'walk', 'farm'] as const) {
    const raw = p.get(key);
    if (raw === null) continue;
    const n = Number(raw),
      ok = raw.trim() !== '' && Number.isFinite(n) && (key === 'age' ? [1, 2, 3, 4].includes(n) : n >= 0 && n <= 10);
    if (ok) config[key] = n;
    else errors.push(`链接中的${key === 'age' ? '时代' : '采集距离'}无效，已使用默认值。`);
  }
  if (p.has('techs')) {
    const raw = p.get('techs')!;
    if (raw && !/^\d+(,\d+)*$/.test(raw)) errors.push('链接中的科技格式无效，已清空。');
    else config.techs = raw ? [...new Set(raw.split(',').map(Number))] : [];
  }
  if (p.has('rows')) {
    const raw = p.get('rows')!;
    if (!raw) config.rows = [];
    else if (raw.split(',').length > PRODUCTION_LIMIT) {
      config.rows = [];
      errors.push('链接的生产需求超过上限，已清空。');
    } else
      config.rows = raw.split(',').flatMap((s) => {
        const m = /^(\d+):(\d+):([^:]*)$/.exec(s);
        if (!m) {
          errors.push('链接中的生产需求格式无效，该项已移除。');
          return [];
        }
        return [{ unit: Number(m[1]), building: Number(m[2]), count: m[3]! }];
      });
  }
  return { config, errors };
}
