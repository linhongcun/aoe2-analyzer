/** issue 204 稳态连续训练。游戏数值只读固定 eco / effects；不修改旧真实费用默认口径。 */
import { ECO as eco } from '../data/eco';
import { civByEn, type Core } from '../data';
import { DAT, type DatEco } from './datEffects';
import { matchingGenericFx } from './effects';
import { AGE_ZH } from './ratings';
import { unitCost } from './unitCost';
import { gatherModel, gatherUnsupportedSources, hasGatherAttrEffect, type GatherRes } from './realCost';
import { isEconomicBonusText, mergeProductionEcoWarnings, resolveGatherBonusIdx } from './productionWarnings';
export { mergeProductionEcoWarnings, resolveGatherBonusIdx };
import type { Cost, Tech, Trees, Unit } from './types';
import { buildingAge, earlyEcoGatherTechAge, litTreeIds, militaryTechAge, trainingUnitAge } from './availabilityAge';
import { isAgeTech, NON_PRICING_RESOURCE_SET, TC_BY_AGE, VILLAGER_CLASS, VILLAGER_UNIT_ID } from './gameIds';
import { trainingCycle, type TrainingCycleOp } from './trainingCycle';
import { formatProductionNumber, ratePerMinute } from './formatTime';
import { toggleSelected } from './prereq';
import { unitTrainCount } from './trainBatch';
import { MAPUCHE_CIV, MAPUCHE_SETTLEMENT_UNITS, SETTLEMENT, trainingAtBuilding } from './unitTrainingSites';
import { requiredTrainingUnlockTech, TRAINING_UNLOCK_TECH_ID_SET, TRAINING_UNLOCK_TECH_IDS } from './trainingUnlocks';

export const PRODUCTION_RES = ['Food', 'Wood', 'Gold', 'Stone'] as const;
export const PRODUCTION_LIMIT = 12;
export const BUILDING_LIMIT = 100;
export const DEFAULT_PRODUCTION_COUNT = '1';
/** 只决定能否训练的科技。统一派生自 trainingUnlocks 单一真源，保持对外导出兼容。 */
export const PRODUCTION_UNLOCK_TECH_IDS = TRAINING_UNLOCK_TECH_IDS;
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
  rows: [{ unit: VILLAGER_UNIT_ID, building: TC_BY_AGE[0]!, count: DEFAULT_PRODUCTION_COUNT }],
};
const task = { Food: 'farm', Wood: 'wood', Gold: 'gold', Stone: 'stone' } as const;
const costAttrs: Record<number, GatherRes | 'all'> = { 100: 'all', 103: 'Food', 104: 'Wood', 105: 'Gold', 106: 'Stone' };
const unique = (s: string[]) => [...new Set(s)];

/** 文明专属的采集科技（仅由持续生产主工具按需勾选，不并入通用 ecoTechs）。 */
export function isCivEcoTech(id: number): boolean {
  return !!eco.civEcoTechs && Object.hasOwn(eco.civEcoTechs, String(id));
}

/** 勃艮第采集科技的提前时代只属于生产口径，军事科技提前（含波希米亚化学）共享 EARLY_MILITARY_TECH_AGES，均须在 techAvailability.ts 点名。 */
export function productionTechAge(t: Tech, civ: string) {
  if (eco.ecoTechs[t.id] && isGatherTech(t)) return earlyEcoGatherTechAge(t, civ, true);
  return militaryTechAge(civ, t.id, t.age);
}
function isGatherTech(t: Tech, civ?: string) {
  if (hasGatherAttrEffect(eco.ecoTechs[t.id]?.effects)) return true;
  const civTech = civ ? eco.civEcoTechs?.[t.id] : undefined;
  return !!civTech && civTech.civ === civ && hasGatherAttrEffect(civTech.effects);
}
export function productionTechs(ctx: ProductionContext, config: Pick<ProductionConfig, 'civ' | 'age'>): Tech[] {
  const litTechs = litTreeIds(ctx.trees, config.civ, 't');
  return ctx.core.techs.filter((t) => {
    if (!t.civs.includes(config.civ) || productionTechAge(t, config.civ) > config.age || !litTechs.has(t.id)) return false;
    const d = DAT.techs[t.en];
    return (
      isGatherTech(t, config.civ) ||
      TRAINING_UNLOCK_TECH_ID_SET.has(t.id) ||
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

/** 独立生产地点由该文明树格确认；已按固定文明树登记的替换或条件地点共享 unitTrainingSites，其余地点沿用 .dat 训练记录。 */
export function productionBuildings(ctx: ProductionContext, config: ProductionConfig, u: Unit): number[] {
  const data = eco.units[u.id];
  if (!data || !u.civs.includes(config.civ)) return [];
  const selected = effectiveProductionTechs(ctx, config);
  return (ctx.trees.t[config.civ] ?? [])
    .filter((block) => {
      const b = ctx.core.buildingById[block[0]];
      if (!b || !b.civs.includes(config.civ)) return false;
      const site = trainingAtBuilding(u, b.id);
      if (site ? !site.civs.includes(config.civ) : !data.at.includes(b.id)) return false;
      if (buildingAge(b, config.civ, ctx.trees) > config.age) return false;
      const cell = block[3].find((c) => c[2] === 'u' && c[3] === u.id && c[4] === 1);
      if (!cell) return false;
      // 训练时代包含文明提前解锁与长矛兵下限。
      if (trainingUnitAge(config.civ, u.id, u.age) > config.age) return false;
      // 统一按 trainingUnlocks 核验训练解锁门槛（含条件建筑与化学等全局解锁）。
      const requiredUnlock = site?.tech ?? requiredTrainingUnlockTech(u.id, b.id);
      if (requiredUnlock !== undefined && !selected.has(requiredUnlock)) return false;
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
function selectedTechEffects(ctx: ProductionContext, sel: Set<number>, civ: string) {
  return [...sel].map((id) => ctx.core.techById[id]).filter((t): t is Tech => !!t && !isGatherTech(t, civ));
}
const VALID_PRODUCTION_OPS = new Set(['set', 'mul', 'add']);

function isValidProductionEcoEffect(e: DatEco): boolean {
  if (!VALID_PRODUCTION_OPS.has(e.op) || !Number.isFinite(e.v)) return false;
  if (e.op === 'mul' && e.v <= 0) return false;
  if ((e.a === 13 || e.a === 101) && e.op === 'set' && e.v <= 0) return false;
  return true;
}

function isValidProductionTimeEffect(f: { op?: string; v: number }): boolean {
  const op = f.op ?? 'add';
  if (!VALID_PRODUCTION_OPS.has(op) || !Number.isFinite(f.v)) return false;
  if ((op === 'mul' || op === 'set') && f.v <= 0) return false;
  return true;
}

function relevantTechEffects(t: Tech): DatEco[] {
  return (DAT.techs[t.en]?.eco ?? []).filter((e) => e.a !== undefined && (costAttrs[e.a] || e.a === 101 || e.a === 13));
}

const MAPUCHE_SETTLEMENT_TECH_IDS: readonly number[] = [1405, 1406, 1407];
const CONSCRIPTION_TECH_ID = 315;

function mapucheSettlementMultipliers(
  unitId: number,
  age: number,
  rows = eco.civEco[MAPUCHE_CIV] ?? [],
): { ops: TrainingCycleOp[]; cumulative: number; applied: boolean; invalidNames: string[] } {
  const ops: TrainingCycleOp[] = [];
  const invalidNames: string[] = [];
  let cumulative = 1;
  let applied = false;
  const settlementRows = rows
    .filter((r) => r.tech !== undefined && MAPUCHE_SETTLEMENT_TECH_IDS.includes(r.tech) && r.age <= age)
    .sort((a, b) => a.age - b.age || (a.tech ?? 0) - (b.tech ?? 0));
  for (const r of settlementRows) {
    const relevant = r.effects.filter((e) => e.kind === 'attr' && e.attr === 'trainTime' && e.target === `unit:${unitId}`);
    if (!relevant.length) continue;
    if (relevant.some((e) => e.op !== 'mul' || !Number.isFinite(e.v) || (e.v ?? 0) <= 0)) {
      invalidNames.push(r.name);
      continue;
    }
    for (const e of relevant) {
      ops.push({ kind: 'train', op: 'mul', v: e.v! });
      cumulative *= e.v!;
    }
    applied = true;
  }
  return { ops, cumulative, applied, invalidNames };
}

/** 马普切聚落三时代累计倍率汇总；对全部 5 个聚落单位核验完整一致，缺失、非法或不一致时 fail-closed 返回 null。 */
export function mapucheSettlementFooterSummary(
  rows = eco.civEco[MAPUCHE_CIV] ?? [],
): { feudal: number; castle: number; imperial: number; imperialApproxOne: boolean } | null {
  let ref: [number, number, number] | null = null;
  for (const { id } of MAPUCHE_SETTLEMENT_UNITS) {
    const vals: number[] = [];
    for (const age of [2, 3, 4] as const) {
      const res = mapucheSettlementMultipliers(id, age, rows);
      if (res.invalidNames.length > 0 || !res.applied || res.ops.length !== age - 1 || !Number.isFinite(res.cumulative) || res.cumulative <= 0) {
        return null;
      }
      vals.push(res.cumulative);
    }
    const tuple = vals as [number, number, number];
    if (!ref) ref = tuple;
    else if (tuple.some((v, i) => Math.abs(v - ref![i]!) > 1e-12)) return null;
  }
  if (!ref) return null;
  const [feudal, castle, imperial] = ref;
  return { feudal, castle, imperial, imperialApproxOne: Math.abs(imperial - 1) > 1e-9 && Math.abs(imperial - 1) < 0.005 };
}

/** 马普切聚落各可用时代（不含科技）的实际训练秒数，与持续生产同源同浮点顺序。 */
export function mapucheSettlementUnitTimes(unit: Pick<Unit, 'id' | 'age'>): { age: number; seconds: number }[] {
  const data = eco.units[unit.id];
  if (!data) return [];
  const base = data.timeAt?.[SETTLEMENT] ?? data.trainTime;
  const minAge = trainingUnitAge(MAPUCHE_CIV, unit.id, unit.age);
  const out: { age: number; seconds: number }[] = [];
  for (let age = minAge; age <= 4; age++) {
    const { ops, invalidNames } = mapucheSettlementMultipliers(unit.id, age);
    if (invalidNames.length > 0) continue;
    const seconds = trainingCycle(base, ops).seconds;
    if (Number.isFinite(seconds) && seconds > 0) out.push({ age, seconds });
  }
  return out;
}

export interface ProductionLine {
  unit: Unit;
  building: number;
  count: number;
  /** 每批训练产出数（默认 1，成对训练单位为 2） */
  trainCount: number;
  cost: Cost;
  seconds: number;
  /** 每分钟训练批数（对数）；常规单位等于 perMinute */
  batchesPerMinute: number;
  /** 每分钟实际产出只数（batchesPerMinute × trainCount） */
  perMinute: number;
  spend: Record<GatherRes, number>;
  applied: string[];
  rowWarnings: string[];
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
  if (civByEn(config.civ) === undefined) errors.push('文明不存在，请重新选择。');
  if (![1, 2, 3, 4].includes(config.age)) errors.push('时代无效。');
  if (![config.walk, config.farm].every((n) => Number.isFinite(n) && n >= 0 && n <= 10)) errors.push('采集距离须在 0–10 格之间。');
  if (config.rows.length > PRODUCTION_LIMIT) errors.push(`最多添加 ${PRODUCTION_LIMIT} 条需求。`);
  const availableTechs = new Set(productionTechs(ctx, config).map((t) => t.id));
  if (config.techs.some((id) => !availableTechs.has(id))) errors.push('方案含当前文明或时代不可用的科技，请清除不可用科技。');
  const gather = gatherModel(config.age, config.civ, { techIds: sel, walkTiles: config.walk, farmTiles: config.farm, includeCivEcoTechs: true });
  applied.push(...gather.applied.map((x) => x.label));
  // .dat 还有存放收益等资源指令，不能只扫描旧真实费用支持的属性号而静默漏掉；同源项按 DAT 归属合并为一条。
  const civ = civByEn(config.civ);
  const appliedSources = new Set(gather.applied.map((x) => x.source));
  warnings.push(
    ...mergeProductionEcoWarnings(gatherUnsupportedSources(config.age, config.civ), civ?.bon ?? [], appliedSources, DAT.civs[config.civ]?.bonus ?? []),
  );
  if (civ && isEconomicBonusText(civ.tb)) warnings.push(`${civ.tb}：本文明团队经济机制未计入。`);
  const selectedTechs = selectedTechEffects(ctx, sel, config.civ);
  const selectedTechNames = new Set([...sel].map((id) => ctx.core.techById[id]?.en).filter((en): en is string => !!en));
  const conscriptionTargetsSettlement = DAT.techs.Conscription?.eco.some((e) => e.a === 13 && e.t?.includes(SETTLEMENT)) ?? false;
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
    const rowWarnings: string[] = [];
    const base = data.timeAt?.[row.building] ?? data.trainTime;
    const cycleOps: TrainingCycleOp[] = [];
    const targetBuilding = buildingTarget(row.building, config.age);
    for (const r of eco.civEco[config.civ] ?? []) {
      if (r.age > config.age) continue;
      if (config.civ === MAPUCHE_CIV && r.tech !== undefined && MAPUCHE_SETTLEMENT_TECH_IDS.includes(r.tech)) continue;
      const relevant = r.effects.filter(
        (e) => e.kind === 'attr' && ((e.attr === 'trainTime' && matches(e, u)) || (e.attr === 'workRate' && e.target === `unit:${targetBuilding}`)),
      );
      if (!relevant.length) continue;
      const needed = (r.requires ?? []).filter((id) => !!ctx.core.techById[id] && !isAgeTech(id));
      if (needed.some((id) => !sel.has(id))) continue;
      if (relevant.some((e) => e.op !== 'mul' || !Number.isFinite(e.v) || (e.v ?? 0) <= 0)) {
        warnings.push(`${r.name}：训练效果未核实，未计入。`);
        continue;
      }
      for (const e of relevant) cycleOps.push({ kind: e.attr === 'trainTime' ? 'train' : 'work', op: 'mul', v: e.v! });
      notes.push(r.source === 'team' ? '本文明团队训练加成' : r.name);
    }
    if (config.civ === MAPUCHE_CIV && row.building === SETTLEMENT) {
      const settlement = mapucheSettlementMultipliers(u.id, config.age);
      for (const name of settlement.invalidNames) warnings.push(`${name}：训练效果未核实，未计入。`);
      cycleOps.push(...settlement.ops);
      if (settlement.applied) notes.push(`聚落训练时间 ×${formatProductionNumber(settlement.cumulative)}（马普切，至${AGE_ZH[config.age]}累计）`);
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
      // 按单条效果过滤：非法 op 或非正/非有限倍率仍整项跳过；
      // 仅含白名单非生产/非计价资源标记（如 res:203 地图探索）静默放行；
      // 含白名单外未解码资源标记（如 res:33）但至少一条合法生产/费用效果生效时放行并给出估算告警。
      const hasInvalid = effects.some((e) => !isValidProductionEcoEffect(e)) || time.some((f) => !isValidProductionTimeEffect(f));
      if (hasInvalid) {
        warnings.push(`${t.zh}：含未解码的资源或条件效果，生产效果整项未计入。`);
        continue;
      }
      const hasUnknownRes = d?.eco.some((e) => e.res !== undefined && !NON_PRICING_RESOURCE_SET.has(e.res)) ?? false;
      for (const e of effects) {
        if (e.a === 13 && e.t?.includes(row.building)) cycleOps.push({ kind: 'work', op: e.op, v: e.v });
        else if (e.a === 101 && e.t?.includes(u.id)) cycleOps.push({ kind: 'train', op: e.op, v: e.v });
      }
      for (const f of time) cycleOps.push({ kind: 'train', op: f.op, v: f.v });
      costTechs.push({ id: t.id, en: t.en, zh: t.zh });
      notes.push(t.zh);
      if (hasUnknownRes) {
        warnings.push(`${t.zh}：已按可解码生产或费用效果计入；另含未解码资源或条件效果，结果仅为估算。`);
      }
    }
    for (const g of matchingGenericFx(u, false, config.age, (name) => selectedTechNames.has(name), config.civ)) {
      let appliedGenericBt = false;
      for (const f of g.fx) {
        if (f.s !== 'bt') continue;
        const op = f.op ?? 'add';
        if (!['set', 'mul', 'add'].includes(op) || !Number.isFinite(f.v) || ((op === 'mul' || op === 'set') && f.v <= 0)) {
          warnings.push(`${AGE_ZH[g.age] ?? `时代 ${g.age}`}自动训练时间修正：训练效果未核实，未计入。`);
          continue;
        }
        cycleOps.push({ kind: 'train', op, v: f.v });
        appliedGenericBt = true;
      }
      if (appliedGenericBt) notes.push(`${AGE_ZH[g.age] ?? `时代 ${g.age}`}自动训练时间修正`);
    }
    if (row.building === SETTLEMENT && sel.has(CONSCRIPTION_TECH_ID) && !conscriptionTargetsSettlement) {
      rowWarnings.push('征招不作用于聚落，本行训练时间未加快。');
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
      trainCount = unitTrainCount(u),
      batchesPerMinute = ratePerMinute(count, seconds),
      perMinute = batchesPerMinute * trainCount;
    const spend = Object.fromEntries(PRODUCTION_RES.map((r) => [r, (cost[r] ?? 0) * batchesPerMinute])) as Record<GatherRes, number>;
    lines.push({
      unit: u,
      building: row.building,
      count,
      trainCount,
      cost,
      seconds,
      batchesPerMinute,
      perMinute,
      spend,
      applied: unique(notes),
      rowWarnings: unique(rowWarnings),
    });
  });
  const resources = PRODUCTION_RES.map((key) => {
    const spend = errors.length ? 0 : lines.reduce((total, l) => total + l.spend[key], 0);
    const income = ratePerMinute(gather.rate[task[key]], 1);
    const villagers = income > 0 && Number.isFinite(income) ? spend / income : 0;
    return { key, spend, income, villagers, rounded: Math.ceil(villagers - 1e-9) };
  });
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
    if (civByEn(civ) !== undefined) config.civ = civ;
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
