/**
 * 同文明、同时代的多形态训练总价。
 * 单价只走 unitCost（内部先 discountedCost）；能否训练沿用 productionUnits。
 * 不把研究费、升级费或示意数量写进结果。
 */
import { civs } from '../data';
import { priceAge } from './costDiscount';
import { applicableTrainingTechs, type TrainingCostTech } from './duelTrainingCost';
import {
  DEFAULT_PRODUCTION,
  PRODUCTION_UNLOCK_TECH_IDS,
  freeProductionTechs,
  productionBuildings,
  productionTechAge,
  productionTechs,
  productionUnits,
  type ProductionConfig,
  type ProductionContext,
} from './production';
import { AGE_ZH, RES_ZH } from './ratings';
import { makeSimContext } from './simulator';
import type { Cost, Tech, Unit } from './types';
import { unitCost, type UnitCostTech } from './unitCost';

export const TRAIN_TOTAL_QTY_MAX = 1000;
export const TRAIN_TOTAL_DEFAULT_AGE = 4;
const RES = ['Food', 'Wood', 'Gold', 'Stone'] as const;
const UNLOCK_IDS: readonly number[] = PRODUCTION_UNLOCK_TECH_IDS;

export interface TrainTotalRow {
  unit: number;
  qty: string;
}
export interface TrainTotalConfig {
  civ: string;
  age: number | null;
  /** 链接里显式写出、但不是 1–4 的时代原文。合法或缺失时为 null。 */
  ageRaw: string | null;
  techs: number[];
  rows: TrainTotalRow[];
}
export interface TrainTotalLine {
  unit: Unit | null;
  qty: string;
  qtyValue: number | null;
  status: 'ok' | 'pending' | 'badqty' | 'unavail';
  reason: string;
  /** 右栏原因，已带「第 n 行」。 */
  summary: string;
  needUnlockId: number | null;
  unlockName: string;
  unlockSelectable: boolean;
  cost: Cost | null;
  subtotal: Cost | null;
  notes: string[];
}
export interface TrainTotalTechChoice {
  id: number;
  zh: string;
  tech: Tech | null;
  panel: 'unlock' | 'cost';
  selected: boolean;
  selectable: boolean;
  free: boolean;
  invalidReason: string;
  hint: string;
  appliedSomewhere: boolean;
  supported: boolean;
}
export interface TrainTotalEvaluation {
  blocked: string[];
  lines: TrainTotalLine[];
  total: Cost;
  validCount: number;
  incomplete: boolean;
  techs: TrainTotalTechChoice[];
  invalidTechIds: number[];
}

export function emptyTrainTotal(civ = DEFAULT_PRODUCTION.civ, age = TRAIN_TOTAL_DEFAULT_AGE): TrainTotalConfig {
  return { civ, age, ageRaw: null, techs: [], rows: [] };
}

export function pickNewUnit(availableIds: readonly number[]): number {
  return availableIds[0] ?? 0;
}

export function defaultTrainUnit(ctx: ProductionContext, config: TrainTotalConfig): number {
  if (!civLegal(config.civ) || config.age == null) return 0;
  return pickNewUnit(productionUnits(ctx, shell(config.civ, config.age, config.techs)).map((unit) => unit.id));
}

function shell(civ: string, age: number, techs: number[]): ProductionConfig {
  return { civ, age, techs, walk: 0, farm: 0, rows: [] };
}
function civLegal(civ: string) {
  return civs.some((item) => item.en === civ);
}
function civZh(civ: string) {
  return civs.find((item) => item.en === civ)?.zh ?? civ;
}
function asInput(tech: Tech): UnitCostTech {
  return { id: tech.id, en: tech.en, zh: tech.zh };
}
function qtyOf(raw: string): number | null {
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n <= TRAIN_TOTAL_QTY_MAX ? n : null;
}
function scale(cost: Cost, n: number): Cost {
  const out: Cost = {};
  for (const key of RES) {
    const value = cost[key];
    if (!value) continue;
    out[key] = value * n;
  }
  return out;
}
function addCost(total: Cost, part: Cost) {
  for (const key of RES) {
    const value = (total[key] ?? 0) + (part[key] ?? 0);
    if (value) total[key] = Math.round(value * 1000) / 1000;
  }
}
function formatDelta(n: number) {
  const abs = Math.abs(Math.round(n * 1000) / 1000);
  const text = Number.isInteger(abs) ? String(abs) : String(abs);
  return `${n > 0 ? '+' : '−'}${text}`;
}
function listed(ctx: ProductionContext, civ: string, age: number, id: number) {
  return productionTechs(ctx, { civ, age }).some((tech) => tech.id === id);
}
function unlockNames(ctx: ProductionContext, civ: string, id: number): string[] {
  const tech = ctx.core.techById[id];
  if (!tech || !tech.civs.includes(civ)) return [];
  const probeAge = productionTechAge(tech, civ);
  if (!listed(ctx, civ, probeAge, id)) return [];
  const before = new Set(productionUnits(ctx, shell(civ, probeAge, [])).map((unit) => unit.id));
  return productionUnits(ctx, shell(civ, probeAge, [id]))
    .filter((unit) => !before.has(unit.id))
    .sort((a, b) => a.id - b.id)
    .map((unit) => unit.zh);
}
function ageReason(tech: Tech, civ: string) {
  const need = productionTechAge(tech, civ);
  return `${tech.zh}在当前时代不可用，已停止计入。${AGE_ZH[need] ?? ''}起可研究。`;
}
function rowSummary(index: number, name: string, reason: string, badQty: boolean) {
  if (badQty) return `第 ${index + 1} 行训练数量须为 1–1000 的整数，未计入下面的小计。`;
  return `第 ${index + 1} 行${name ? `（${name}）` : ''}：${reason}`;
}

function blocker(ctx: ProductionContext, config: TrainTotalConfig, unit: Unit) {
  if (config.age == null) return null;
  const age = config.age;
  if (productionBuildings(ctx, shell(config.civ, age, config.techs), unit).length) return null;
  for (const id of UNLOCK_IDS) {
    const tech = ctx.core.techById[id];
    if (!tech) continue;
    const need = productionTechAge(tech, config.civ);
    const probeAge = Math.max(age, need);
    const rest = config.techs.filter((item) => item !== id);
    const without = productionBuildings(ctx, shell(config.civ, probeAge, rest), unit);
    const withTech = productionBuildings(ctx, shell(config.civ, probeAge, [...rest, id]), unit);
    if (without.length || !withTech.length) continue;
    return { id, name: tech.zh, selectable: age >= need && listed(ctx, config.civ, age, id), selected: config.techs.includes(id), need };
  }
  return null;
}

function quoteRow(config: TrainTotalConfig, unit: Unit, inputs: UnitCostTech[], selected: TrainTotalTechChoice[]) {
  const tier = priceAge(unit.age, config.age);
  const priced = unitCost({ id: unit.id, cost: unit.cost }, config.civ, tier, inputs);
  const notes: string[] = [];
  const name = civZh(config.civ);
  for (const line of priced.discount.applied) notes.push(`已计入：${name} ${line.text}`);
  for (const line of priced.discount.unsupported) notes.push(`折扣未计入：${line.text || line.label}`);
  const byId = new Map(inputs.map((item) => [item.id, item]));
  const applied = new Set<number>();
  const stepped: UnitCostTech[] = [];
  let prev = unitCost({ id: unit.id, cost: unit.cost }, config.civ, tier, []).cost;
  for (const item of priced.appliedTechs) {
    const tech = byId.get(item.id);
    if (!tech) continue;
    stepped.push(tech);
    const next = unitCost({ id: unit.id, cost: unit.cost }, config.civ, tier, stepped).cost;
    const changes = RES.flatMap((key) => {
      const delta = (next[key] ?? 0) - (prev[key] ?? 0);
      return delta === 0 ? [] : [`${RES_ZH[key]} ${formatDelta(delta)}`];
    });
    notes.push(changes.length ? `已计入：${item.zh}（${changes.join('，')}）` : `已计入：${item.zh}`);
    applied.add(item.id);
    prev = next;
  }
  const undecoded = new Set<number>();
  for (const item of priced.undecoded) {
    undecoded.add(item.techId);
    notes.push(`未能完整计入：${item.tech}，单价未改。`);
  }
  for (const choice of selected) {
    if (choice.panel !== 'cost' || !choice.selected || choice.invalidReason || applied.has(choice.id) || undecoded.has(choice.id)) continue;
    notes.push(`已选${choice.zh}，不作用于该单位，单价未改。`);
  }
  const incomplete = priced.discount.unsupported.length > 0 || priced.undecoded.length > 0;
  return { cost: priced.cost, notes, applied: [...applied], incomplete };
}

export function evaluateTrainTotal(ctx: ProductionContext, config: TrainTotalConfig): TrainTotalEvaluation {
  const blocked: string[] = [];
  if (!civLegal(config.civ)) blocked.push('文明无效，请重新选择。');
  if (config.age == null) blocked.push('时代无效，请重新选择。');
  const age = config.age;
  const open = blocked.length === 0 && age != null;
  const unlocks: TrainTotalTechChoice[] = [];
  for (const id of UNLOCK_IDS) {
    const tech = ctx.core.techById[id];
    const selected = config.techs.includes(id);
    const names = open ? unlockNames(ctx, config.civ, id) : [];
    if (!selected && !names.length) continue;
    const selectable = open && names.length > 0 && listed(ctx, config.civ, age!, id);
    let invalidReason = '';
    if (selected && !selectable) {
      if (!tech) invalidReason = `科技 ${id} 无法识别，已停止计入。`;
      else if (!civLegal(config.civ) || !tech.civs.includes(config.civ)) invalidReason = `${tech.zh}在当前文明不可用，已停止计入。`;
      else if (age == null || productionTechAge(tech, config.civ) > age) invalidReason = ageReason(tech, config.civ);
      else invalidReason = `${tech.zh}在当前条件下不可用，已停止计入。`;
    }
    const when =
      !selected && !selectable && tech && civLegal(config.civ) && tech.civs.includes(config.civ)
        ? `${AGE_ZH[productionTechAge(tech, config.civ)] ?? ''}起可研究。`
        : '';
    const lead = names.length ? `用于解锁${names.join('、')}，不改变单价。研究费用不含在合计里。` : '这项科技当前不能解锁可训练形态。研究费用不含在合计里。';
    unlocks.push({
      id,
      zh: tech?.zh ?? `科技 ${id}`,
      tech: tech ?? null,
      panel: 'unlock',
      selected,
      selectable,
      free: false,
      invalidReason,
      hint: [lead, when, invalidReason].filter(Boolean).join(''),
      appliedSomewhere: false,
      supported: true,
    });
  }

  const found = new Map<number, TrainingCostTech>();
  if (open) {
    const sim = makeSimContext(ctx.core.techs, ctx.trees);
    const units = productionUnits(ctx, shell(config.civ, age!, [...UNLOCK_IDS]));
    for (const unit of units) {
      for (const item of applicableTrainingTechs(sim, unit, config.civ, age!)) {
        if (UNLOCK_IDS.includes(item.tech.id)) continue;
        const prev = found.get(item.tech.id);
        if (!prev || (item.supported && !prev.supported)) found.set(item.tech.id, item);
      }
    }
  }
  const free = open ? freeProductionTechs(ctx, { civ: config.civ, age: age! }) : new Set<number>();
  const costs: TrainTotalTechChoice[] = [];
  for (const item of found.values()) {
    if (free.has(item.tech.id)) {
      costs.push({
        id: item.tech.id,
        zh: item.tech.zh,
        tech: item.tech,
        panel: 'cost',
        selected: true,
        selectable: false,
        free: true,
        invalidReason: '',
        hint: '免费，已计入。研究费用不计。',
        appliedSomewhere: false,
        supported: item.supported,
      });
      continue;
    }
    costs.push({
      id: item.tech.id,
      zh: item.tech.zh,
      tech: item.tech,
      panel: 'cost',
      selected: config.techs.includes(item.tech.id),
      selectable: true,
      free: false,
      invalidReason: '',
      hint: '',
      appliedSomewhere: false,
      supported: item.supported,
    });
  }
  for (const id of config.techs) {
    if (UNLOCK_IDS.includes(id) || found.has(id)) continue;
    const tech = ctx.core.techById[id];
    let invalidReason = `科技 ${id} 无法识别，已停止计入。`;
    if (tech && (!civLegal(config.civ) || !tech.civs.includes(config.civ))) invalidReason = `${tech.zh}在当前文明不可用，已停止计入。`;
    else if (tech && (age == null || tech.age > age)) invalidReason = `${tech.zh}在当前时代不可用，已停止计入。${AGE_ZH[tech.age] ?? ''}起可研究。`;
    else if (tech) invalidReason = `${tech.zh}在当前条件下不可用，已停止计入。`;
    costs.push({
      id,
      zh: tech?.zh ?? `科技 ${id}`,
      tech: tech ?? null,
      panel: 'cost',
      selected: true,
      selectable: false,
      free: false,
      invalidReason,
      hint: invalidReason,
      appliedSomewhere: false,
      supported: false,
    });
  }
  for (const choice of costs) {
    if (choice.free || choice.invalidReason || choice.hint) continue;
    if (!choice.selected) choice.hint = '可选。只作用于能够完整计入的单位，研究费用不计。';
    else if (!choice.supported) choice.hint = '已选，费用效果未能完整计入，单价未改。研究费用不计。';
    else choice.hint = '已选。研究费用不计。';
  }

  const active: UnitCostTech[] = [];
  for (const choice of costs) if (choice.selected && !choice.invalidReason && choice.tech) active.push(asInput(choice.tech));
  const lines: TrainTotalLine[] = [];
  const total: Cost = {};
  let incomplete = costs.some((choice) => choice.selected && !choice.invalidReason && !choice.supported);
  const appliedSomewhere = new Set<number>();
  config.rows.forEach((row, index) => {
    const unit = row.unit ? (ctx.core.unitById[row.unit] ?? null) : null;
    const base = {
      qty: row.qty,
      qtyValue: qtyOf(row.qty),
      needUnlockId: null as number | null,
      unlockName: '',
      unlockSelectable: false,
      cost: null as Cost | null,
      subtotal: null as Cost | null,
      notes: [] as string[],
    };
    if (!open) {
      const reason = '文明或时代无效，未计入下面的小计。';
      lines.push({ ...base, unit, status: row.unit ? 'unavail' : 'pending', reason, summary: rowSummary(index, unit?.zh ?? '', reason, false) });
      return;
    }
    if (!row.unit) {
      const reason = '请选择当前可训练的单位形态。未计入下面的小计。';
      lines.push({ ...base, unit: null, status: 'pending', reason, summary: rowSummary(index, '', reason, false) });
      return;
    }
    if (!unit) {
      const reason = '无法识别该单位形态，行已保留，未计入下面的小计。';
      lines.push({ ...base, unit: null, status: 'unavail', reason, summary: rowSummary(index, '', reason, false) });
      return;
    }
    const buildings = productionBuildings(ctx, shell(config.civ, age!, config.techs), unit);
    if (!buildings.length) {
      const gate = blocker(ctx, config, unit);
      let reason = '当前条件下不可训练，未计入下面的小计。';
      if (!unit.civs.includes(config.civ)) reason = '本文明没有这个单位形态，未计入下面的小计。';
      else if (gate && gate.selected && !gate.selectable)
        reason = `需要已研究${gate.name}才能训练。${gate.name}在当前时代不可用，已停止计入。${AGE_ZH[gate.need] ?? ''}起可研究。研究费用不计。未计入下面的小计。`;
      else if (gate && gate.selectable) reason = `需要已研究${gate.name}才能训练，研究费用不计。未计入下面的小计。`;
      else if (gate) reason = `需要已研究${gate.name}才能训练。当前还不能研究${gate.name}。研究费用不计。未计入下面的小计。`;
      else if (unit.age > age!) reason = '当前时代尚未到达该形态，未计入下面的小计。';
      lines.push({
        ...base,
        unit,
        status: 'unavail',
        reason,
        summary: rowSummary(index, unit.zh, reason, false),
        needUnlockId: gate && !gate.selected ? gate.id : null,
        unlockName: gate?.name ?? '',
        unlockSelectable: !!gate && !gate.selected && gate.selectable,
      });
      return;
    }
    const count = qtyOf(row.qty);
    if (count == null) {
      const reason = '训练数量须为 1–1000 的整数，未计入下面的小计。';
      lines.push({ ...base, unit, status: 'badqty', reason, summary: rowSummary(index, unit.zh, reason, true) });
      return;
    }
    const quote = quoteRow(config, unit, active, costs);
    if (quote.incomplete) incomplete = true;
    for (const id of quote.applied) appliedSomewhere.add(id);
    const subtotal = scale(quote.cost, count);
    addCost(total, subtotal);
    lines.push({ ...base, unit, qtyValue: count, status: 'ok', reason: '', summary: '', cost: quote.cost, subtotal, notes: quote.notes });
  });
  for (const choice of costs) {
    if (appliedSomewhere.has(choice.id)) {
      choice.appliedSomewhere = true;
      if (choice.selected && !choice.free && choice.supported && !choice.invalidReason) choice.hint = '已计入至少一行。研究费用不计。';
    } else if (choice.selected && !choice.free && choice.supported && !choice.invalidReason) {
      choice.hint = '已选，没有作用到当前已计入的单位。研究费用不计。';
    }
  }
  const techs = [...unlocks, ...costs];
  return {
    blocked,
    lines,
    total,
    validCount: lines.filter((line) => line.status === 'ok').length,
    incomplete: incomplete && lines.some((line) => line.status === 'ok'),
    techs,
    invalidTechIds: techs.filter((tech) => tech.selected && tech.invalidReason).map((tech) => tech.id),
  };
}
