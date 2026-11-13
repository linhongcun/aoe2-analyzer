/** issue 204 稳态连续训练。游戏数值只读固定 eco / effects；不修改旧真实费用默认口径。 */
import { ECO as eco } from '../data/eco';
import { civs, type Core } from '../data';
import { DAT, type DatEco } from './datEffects';
import { unitCost } from './unitCost';
import { gatherModel, type GatherRes } from './realCost';
import type { Cost, Tech, Trees, Unit } from './types';
import { buildingAge, trainingUnitAge } from './availabilityAge';
import { isAgeTech, TC_BY_AGE, VILLAGER_CLASS, VILLAGER_UNIT_ID } from './gameIds';
import { trainingCycle, type TrainingCycleOp } from './trainingCycle';
import { ratePerMinute } from './formatTime';
import { toggleSelected } from './prereq';

export const PRODUCTION_RES = ['Food', 'Wood', 'Gold', 'Stone'] as const;
export const PRODUCTION_LIMIT = 12;
export const BUILDING_LIMIT = 100;
/** 只决定能否训练的科技。编号必须与 productionBuildings 里的门槛一致。 */
export const PRODUCTION_UNLOCK_TECH_IDS = [16, 47, 483, 755] as const;
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
export const DEFAULT_PRODUCTION: ProductionConfig = {
  civ: 'Franks',
  age: 3,
  techs: [],
  walk: 3,
  farm: 1,
  rows: [{ unit: VILLAGER_UNIT_ID, building: TC_BY_AGE[0]!, count: '1' }],
};
const task = { Food: 'farm', Wood: 'wood', Gold: 'gold', Stone: 'stone' } as const;
const costAttrs: Record<number, GatherRes | 'all'> = { 100: 'all', 103: 'Food', 104: 'Wood', 105: 'Gold', 106: 'Stone' };
const unique = (s: string[]) => [...new Set(s)];

/** 勃艮第采集科技与波希米亚化学的时代只属于生产口径，须在 techAvailability.ts 点名。 */
export function productionTechAge(t: Tech, civ: string) {
  if (civ === 'Burgundians' && eco.ecoTechs[t.id] && isGatherTech(t)) return Math.max(1, t.age - 1);
  if (civ === 'Bohemians' && t.id === 47) return 3;
  return t.age;
}
function isGatherTech(t: Tech) {
  return (eco.ecoTechs[t.id]?.effects ?? []).some(
    (e) =>
      e.kind === 'attr' &&
      ['task:farm', 'task:wood', 'task:gold', 'task:stone', `class:${VILLAGER_CLASS}`].includes(e.target ?? '') &&
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
  const next = toggleSelected(id, sel, ctx.core.techById, {
    available: new Set(productionTechs(ctx, config).map((t) => t.id)),
    free: freeProductionTechs(ctx, config),
    removeMissing: 'any',
  });
  return [...effectiveProductionTechs(ctx, { ...config, techs: [...next] })];
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
      if (buildingAge(b, config.civ, ctx.trees) > config.age) return false;
      const cell = block[3].find((c) => c[2] === 'u' && c[3] === u.id && c[4] === 1);
      if (!cell) return false;
      // 部分原始目录把长矛兵归为黑暗时代；实际科技树位于封建栏。
      if (trainingUnitAge(config.civ, u.id, u.age) > config.age) return false;
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

interface EcoEffect {
  kind: string;
  target?: string;
  attr?: string;
  op?: string;
  v?: number;
  tech?: number;
  res?: number;
}
function matches(e: EcoEffect, u: Unit) {
  return (
    e.target === `unit:${u.id}` ||
    e.target === `class:${eco.units[u.id]?.class}` ||
    (u.id === VILLAGER_UNIT_ID && ['villager', `class:${VILLAGER_CLASS}`].includes(e.target ?? ''))
  );
}
function buildingTarget(building: number, age: number) {
  if (building === TC_BY_AGE[0]!) return TC_BY_AGE[age - 1] ?? building;
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
    const notes: string[] = [];
    const base = data.timeAt?.[row.building] ?? data.trainTime;
    const cycleOps: TrainingCycleOp[] = [];
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
      const needed = (r.requires ?? []).filter((id) => !!ctx.core.techById[id] && !isAgeTech(id));
      if (needed.some((id) => !sel.has(id))) continue;
      if (relevant.some((e) => e.op !== 'mul' || !Number.isFinite(e.v) || (e.v ?? 0) <= 0)) {
        warnings.push(`${r.name}：训练效果未核实，未计入。`);
        continue;
      }
      for (const e of relevant) cycleOps.push({ kind: e.attr === 'trainTime' ? 'train' : 'work', op: 'mul', v: e.v! });
      notes.push(r.source === 'team' ? '本文明团队训练加成' : r.name);
    }
    const costTechs: { id: number; en: string; zh: string }[] = [];
    for (const t of selectedTechs) {
      const d = DAT.techs[t.en];
      const effects = relevantTechEffects(t).filter((e) => e.t?.includes(u.id) || (e.a === 13 && e.t?.includes(row.building)));
      const time =
        d?.rules
          .filter((r) => !r.b && r.t.includes(u.id))
          .flatMap((r) => r.fx)
          .filter((f) => f.s === 'bt') ?? [];
      if (!effects.length && !time.length) continue;
      // 资源标记可能附带未编码条件；整项排除，避免只实现一半。费用本身由 unitCost 套用。
      if (d?.eco.some((e) => e.res !== undefined) || effects.some((e) => !['set', 'mul', 'add'].includes(e.op))) {
        warnings.push(`${t.zh}：含未解码的资源或条件效果，生产效果整项未计入。`);
        continue;
      }
      for (const e of effects) {
        if (e.a === 13 && e.t?.includes(row.building)) cycleOps.push({ kind: 'work', op: e.op, v: e.v });
        else if (e.a === 101 && e.t?.includes(u.id)) cycleOps.push({ kind: 'train', op: e.op, v: e.v });
      }
      for (const f of time) cycleOps.push({ kind: 'train', op: f.op, v: f.v });
      costTechs.push({ id: t.id, en: t.en, zh: t.zh });
      notes.push(t.zh);
    }
    const priced = unitCost({ id: u.id, cost: data.cost }, config.civ, config.age, costTechs);
    notes.unshift(...priced.discount.applied.map((x) => x.text));
    warnings.push(...priced.discount.unsupported.map((x) => `${x.text || '文明训练费用折扣'}：折扣未计入。`));
    const cost = priced.cost;
    const seconds = trainingCycle(base, cycleOps).seconds;
    if (!Number.isFinite(seconds) || seconds <= 0) {
      errors.push(`${label}：无法核实有效训练时间，未计算。`);
      return;
    }
    const count = +row.count,
      perMinute = ratePerMinute(count, seconds);
    const spend = Object.fromEntries(PRODUCTION_RES.map((r) => [r, (cost[r] ?? 0) * perMinute])) as Record<GatherRes, number>;
    lines.push({ unit: u, building: row.building, count, cost, seconds, perMinute, spend, applied: unique(notes) });
  });
  const resources = PRODUCTION_RES.map((key) => {
    const spend = errors.length ? 0 : lines.reduce((total, l) => total + l.spend[key], 0);
    const income = ratePerMinute(gather.rate[task[key]], 1);
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
