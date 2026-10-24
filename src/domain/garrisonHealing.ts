/** Issue 229: one already-garrisoned unit, static building healing only. */
import raw from '../data/garrison_healing.json';
import { DATA_PATCH_BUILD } from '../data/meta';
import type { Building, Tech } from './types';
import {
  GENERAL_GARRISON_DATA,
  getFreeGarrisonTechs,
  getGarrisonBuildingAge,
  getGarrisonBuildings,
  getGarrisonCandidates,
  type GeneralGarrisonConfig,
  type GeneralGarrisonContext,
  type GarrisonEntry,
} from './garrisonGeneral';
import { civStatus, makeSimContext, simTechs, simulate } from './simulator';
import { TEAM_BONUSES } from './effects';
import { productionTechAge } from './production';

export type HealingContext = GeneralGarrisonContext;
export interface HealingConfig {
  buildingId: number;
  civ: string;
  age: number;
  unitId: number;
  entry: GarrisonEntry;
  techs: number[];
  currentHp: string;
  targetHp: string;
}
export type HealingStatus = 'valid' | 'complete' | 'invalid' | 'ineligible' | 'zero-rate' | 'unverified';
export interface HealingComparison {
  status: HealingStatus;
  reason: string;
  maxHp: number | null;
  hpPerSecond: number | null;
  hpPerMinute: number | null;
  seconds: number | null;
}
export interface HealingResult extends HealingComparison {
  errors: string[];
  warnings: string[];
  selected: number[];
  free: number[];
  beforeHerbal: HealingComparison;
  afterHerbal: HealingComparison;
}
interface HealingObject {
  hp: number;
  class: number;
  type: number;
  healRate: number | null;
  repairRate: number | null;
  eligibility: 'organic' | 'ineligible' | 'unverified';
}
export interface GarrisonHealingData {
  meta: { patch: string; sha256: string; engineVerifiedInPinnedBuild: boolean };
  units: Record<string, HealingObject>;
  rateTechs: Record<string, { requires: number[]; count: number; effects: { units: number[]; op: 'set' | 'add' | 'mul'; value: number }[] }>;
  hostIds: number[];
}
export const GARRISON_HEALING_DATA = raw as unknown as GarrisonHealingData;
export const DEFAULT_HEALING_CONFIG: HealingConfig = {
  buildingId: 109,
  civ: 'Britons',
  age: 3,
  unitId: 83,
  entry: 'enter',
  techs: [],
  currentHp: '10',
  targetHp: '25',
};
const unique = (ids: number[]) => [...new Set(ids)].sort((a, b) => a - b);
const generalConfig = (c: HealingConfig): GeneralGarrisonConfig => ({
  civ: c.civ,
  age: c.age,
  techs: c.techs,
  rows: [{ unitId: c.unitId, count: '1', entry: c.entry }],
});
const simUnit = (ctx: HealingContext, c: HealingConfig) => ctx.core.unitById[c.unitId === 293 ? 83 : c.unitId];
const emptyComparison = (status: HealingStatus, reason: string, maxHp: number | null = null): HealingComparison => ({
  status,
  reason,
  maxHp,
  hpPerSecond: null,
  hpPerMinute: null,
  seconds: null,
});

export function getHealingBuildings(ctx: HealingContext): Building[] {
  return getGarrisonBuildings(ctx);
}

export function getHealingCandidates(ctx: HealingContext, c: HealingConfig) {
  const building = ctx.core.buildingById[c.buildingId];
  return building ? getGarrisonCandidates(ctx, building, generalConfig(c)) : [];
}

/** Includes HP changes triggered by other technologies (notably Aztec monastery research). */
export function availableHealingTechs(ctx: HealingContext, c: HealingConfig): Tech[] {
  const state = civStatus(ctx.trees, c.civ);
  const disabled = new Set(GENERAL_GARRISON_DATA.civs[c.civ]?.disabled ?? []);
  const unit = simUnit(ctx, c);
  const ids = new Set<number>(Object.keys(GARRISON_HEALING_DATA.rateTechs).map(Number));
  if (unit) for (const item of simTechs(makeSimContext(ctx.core.techs, ctx.trees), unit, c.civ)) if (item.ef?.some((e) => e.s === 'hp')) ids.add(item.t.id);
  // Training relocations/unlocks are relevant for the production leave-in
  // route even when they change no HP (Anarchy, Marauders, Chemistry, etc.).
  const locations = new Set(GENERAL_GARRISON_DATA.buildings[c.buildingId]?.predecessors ?? [c.buildingId]);
  for (const tech of ctx.core.techs)
    if (
      GENERAL_GARRISON_DATA.techs[tech.id]?.trainingLocations?.some((e) => locations.has(e.location)) ||
      (tech.id === 47 && [87, 49].includes(c.buildingId)) ||
      (tech.id === 755 && c.buildingId === 1806)
    )
      ids.add(tech.id);
  const addPre = (id: number) => {
    const pre = ctx.core.techById[id]?.pre;
    if (pre && !ids.has(pre)) {
      ids.add(pre);
      addPre(pre);
    }
  };
  for (const id of [...ids]) addPre(id);
  return ctx.core.techs.filter(
    (t) => ids.has(t.id) && t.civs.includes(c.civ) && state['t' + t.id] === 1 && !disabled.has(t.id) && productionTechAge(t, c.civ) <= c.age,
  );
}

export function freeHealingTechs(ctx: HealingContext, c: HealingConfig): number[] {
  const building = ctx.core.buildingById[c.buildingId];
  if (!building) return [];
  const allowed = new Set(availableHealingTechs(ctx, c).map((t) => t.id));
  return getFreeGarrisonTechs(ctx, building, generalConfig(c)).filter((id) => allowed.has(id));
}

export function toggleHealingTech(ctx: HealingContext, c: HealingConfig, id: number): number[] {
  const allowed = new Set(availableHealingTechs(ctx, c).map((t) => t.id));
  const free = new Set(freeHealingTechs(ctx, c));
  const selected = new Set([...c.techs, ...free]);
  if (!allowed.has(id) || free.has(id)) return unique([...selected]);
  if (selected.has(id)) {
    selected.delete(id);
    let changed = true;
    while (changed) {
      changed = false;
      for (const tid of selected) {
        const pre = ctx.core.techById[tid]?.pre;
        if (pre && allowed.has(pre) && !selected.has(pre) && !free.has(tid)) {
          selected.delete(tid);
          changed = true;
        }
      }
    }
  } else {
    const add = (tid: number) => {
      if (selected.has(tid)) return;
      selected.add(tid);
      const pre = ctx.core.techById[tid]?.pre;
      if (pre && allowed.has(pre)) add(pre);
    };
    add(id);
  }
  return unique([...selected]);
}

export function maxHealingHp(ctx: HealingContext, c: HealingConfig): number | null {
  const unit = simUnit(ctx, c);
  if (unit) {
    const team = new Set(TEAM_BONUSES.flatMap(([civ], i) => (civ === c.civ ? [i] : [])));
    const result = simulate(makeSimContext(ctx.core.techs, ctx.trees), unit, c.civ, c.age, new Set([...c.techs, ...freeHealingTechs(ctx, c)]), team).hp;
    return Number.isFinite(result) && result > 0 ? result : null;
  }
  // King is a normal mode-specific occupant; the pinned file has no HP
  // technology command targeting its id or legacy class 59.
  return c.unitId === 434 ? (GARRISON_HEALING_DATA.units[434]?.hp ?? null) : null;
}

const validHp = (value: string) => /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) && value.length <= 32 && Number.isFinite(Number(value)) && Number(value) > 0;

function compare(ctx: HealingContext, c: HealingConfig, data: GarrisonHealingData): HealingComparison {
  const maxHp = maxHealingHp(ctx, c);
  const unit = data.units[c.unitId];
  if (c.entry === 'deposit' || unit?.eligibility === 'ineligible') return emptyComparison('ineligible', '该对象没有受伤单位的驻军治疗资格。', maxHp);
  const actual = GENERAL_GARRISON_DATA.buildings[c.buildingId]?.eraForms[c.age - 1] ?? c.buildingId;
  const baseRate = data.units[actual]?.healRate;
  if (baseRate === null || baseRate === undefined || !Number.isFinite(baseRate) || baseRate < 0)
    return emptyComparison('unverified', '建筑基础治疗速率未核实，暂停恢复时间。', maxHp);
  const selected = new Set([...c.techs, ...freeHealingTechs(ctx, c)]);
  let rate = baseRate;
  for (const id of selected)
    for (const effect of data.rateTechs[id]?.effects ?? [])
      if (effect.units.includes(actual)) rate = effect.op === 'set' ? effect.value : effect.op === 'mul' ? rate * effect.value : rate + effect.value;
  if (!Number.isFinite(rate) || rate < 0) return emptyComparison('unverified', '治疗科技结果未核实，暂停恢复时间。', maxHp);
  if (unit?.eligibility === 'organic' && maxHp !== null) {
    if (!validHp(c.currentHp) || !validHp(c.targetHp)) return emptyComparison('invalid', '当前生命和目标生命须为大于 0 的有限数字；0 生命不能复活。', maxHp);
    if (Number(c.currentHp) > maxHp || Number(c.targetHp) > maxHp)
      return emptyComparison('invalid', `当前生命和目标生命均不能超过此配置最大生命 ${maxHp}。`, maxHp);
    if (Number(c.currentHp) >= Number(c.targetHp))
      return { status: 'complete', reason: '当前生命已达到目标，无需恢复。', maxHp, hpPerSecond: rate, hpPerMinute: rate * 60, seconds: 0 };
  }
  if (rate === 0) return { ...emptyComparison('zero-rate', '此建筑的驻军治疗速率为 0；能够驻留不代表会恢复生命。', maxHp), hpPerSecond: 0, hpPerMinute: 0 };
  if (!unit || unit.eligibility !== 'organic' || maxHp === null)
    return emptyComparison('unverified', '该特殊单位的驻军治疗资格尚未核实，暂停恢复时间。', maxHp);
  return {
    status: 'valid',
    reason: '仅按已驻军、没有继续受伤时的建筑静态治疗估算。',
    maxHp,
    hpPerSecond: rate,
    hpPerMinute: rate * 60,
    seconds: (Number(c.targetHp) - Number(c.currentHp)) / rate,
  };
}

export function calculateGarrisonHealing(ctx: HealingContext, c: HealingConfig, data = GARRISON_HEALING_DATA): HealingResult {
  const errors: string[] = [];
  const warnings = [`固定 DE ${DATA_PATCH_BUILD} 数据模型，尚未完成该版本客户端实测；不计单位自身再生、主动僧侣、范围治疗、行军及继续受伤。`];
  const building = ctx.core.buildingById[c.buildingId];
  if (!building || !data.hostIds.includes(c.buildingId)) errors.push('建筑参数无效或不是支持的驻军宿主。');
  if (!GENERAL_GARRISON_DATA.civs[c.civ] || !building?.civs.includes(c.civ)) errors.push('此文明不可使用所选建筑。');
  if (!Number.isSafeInteger(c.age) || c.age < (building ? getGarrisonBuildingAge(building, c.civ, ctx.trees) : 1) || c.age > 4)
    errors.push('时代无效或早于此建筑。');
  if (!Number.isSafeInteger(c.unitId) || c.unitId <= 0 || !['enter', 'created', 'deposit'].includes(c.entry)) errors.push('单位或驻留方式无效。');
  const available = new Set(availableHealingTechs(ctx, c).map((t) => t.id));
  if (new Set(c.techs).size !== c.techs.length) errors.push('科技不能重复。');
  for (const id of c.techs)
    if (!Number.isSafeInteger(id) || !available.has(id)) errors.push(`${ctx.core.techById[id]?.zh ?? `科技 ${id}`}不可用或不影响恢复配置。`);
  const free = freeHealingTechs(ctx, c);
  const selected = unique([...c.techs, ...free]);
  for (const id of selected) {
    const tech = ctx.core.techById[id];
    if (tech?.pre && available.has(tech.pre) && !selected.includes(tech.pre)) errors.push(`${tech.zh}缺少前置科技。`);
  }
  if (!validHp(c.currentHp) || !validHp(c.targetHp)) errors.push('当前生命和目标生命须为大于 0 的有限数字；0 生命不能复活。');
  const maxHp = maxHealingHp(ctx, c);
  if (maxHp !== null && (Number(c.currentHp) > maxHp || Number(c.targetHp) > maxHp)) errors.push(`当前生命和目标生命均不能超过最大生命 ${maxHp}。`);
  const unavailable = emptyComparison('unverified', '尚不能比较此配置。', maxHp);
  const result: HealingResult = {
    ...emptyComparison('invalid', errors[0] ?? '', maxHp),
    errors,
    warnings,
    selected,
    free,
    beforeHerbal: unavailable,
    afterHerbal: unavailable,
  };
  if (errors.length) return result;
  const candidate = getHealingCandidates(ctx, c).find((u) => u.id === c.unitId);
  const legal = candidate && (c.entry === 'enter' ? candidate.canEnter : c.entry === 'created' ? candidate.canCreate : candidate.canDeposit);
  if (!legal) return { ...result, ...emptyComparison('ineligible', '该单位不能以所选方式驻留；生产后留驻不允许外部单位重新进入。', maxHp) };
  if (c.entry === 'created') warnings.push('只适用于本建筑训练后一直留驻的单位；离开后无法用此方式重新进入。');
  if (c.unitId === 434) warnings.push('国王只适用于包含国王的对局模式。');
  Object.assign(result, compare(ctx, c, data));
  if (result.status === 'invalid') result.errors.push(result.reason);
  const without = { ...c, techs: c.techs.filter((id) => id !== 441) };
  result.beforeHerbal = free.includes(441)
    ? emptyComparison('ineligible', '草药在此文明与时代自动免费生效，不能构造未研究状态。', maxHp)
    : compare(ctx, without, data);
  result.afterHerbal = available.has(441)
    ? compare(ctx, { ...c, techs: unique([...c.techs, 441]) }, data)
    : emptyComparison('ineligible', '此文明或时代尚不能研究草药。', maxHp);
  return result;
}

const QUERY_KEYS = ['hv', 'b', 'civ', 'age', 'u', 'entry', 'techs', 'current', 'target'];
export function readHealingConfig(params: URLSearchParams, ctx: HealingContext, rawQuery = params.toString()): { config: HealingConfig; errors: string[] } {
  const config = { ...DEFAULT_HEALING_CONFIG, techs: [...DEFAULT_HEALING_CONFIG.techs] };
  const errors: string[] = [];
  if (!params.toString()) return { config, errors };
  try {
    if (/%(?![\da-f]{2})/i.test(rawQuery)) throw new URIError('Malformed escape');
    decodeURIComponent(rawQuery.replace(/\+/g, ' '));
  } catch {
    errors.push('恢复方案包含损坏的转义或 UTF-8，请重置。');
  }
  // URLSearchParams already replaces malformed UTF-8 before serialization.
  // None of this contract's ASCII identifiers/numeric fields may contain it.
  for (const [key, value] of params) if (key.includes('\uFFFD') || value.includes('\uFFFD')) errors.push('恢复方案包含损坏的 UTF-8，请重置。');
  if (params.toString().length > 4096) errors.push('恢复方案过长，请重置。');
  for (const key of params.keys()) if (!QUERY_KEYS.includes(key)) errors.push(`未知参数 ${key}，请重置方案。`);
  for (const key of QUERY_KEYS) {
    if (params.getAll(key).length > 1) errors.push(`${key} 参数重复，请重置方案。`);
    if (!params.has(key)) errors.push(`${key} 参数缺失，请重置方案。`);
  }
  if (params.get('hv') !== '1') errors.push('恢复方案版本无效。');
  const integer = (key: string, fallback: number) => {
    const value = params.get(key) ?? '';
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
      errors.push(`${key} 参数无效。`);
      return fallback;
    }
    return Number(value);
  };
  config.buildingId = integer('b', config.buildingId);
  config.unitId = integer('u', config.unitId);
  config.age = integer('age', config.age);
  config.civ = params.get('civ') ?? config.civ;
  const entry = params.get('entry');
  if (entry !== 'enter' && entry !== 'created' && entry !== 'deposit') errors.push('驻留方式参数无效。');
  else config.entry = entry;
  config.currentHp = params.get('current') ?? '';
  config.targetHp = params.get('target') ?? '';
  const tokens = params.get('techs') ?? '';
  if (tokens !== '')
    for (const token of tokens.split(',')) {
      const id = Number(token);
      if (!/^[1-9]\d*$/.test(token) || !Number.isSafeInteger(id) || config.techs.includes(id)) errors.push('科技参数无效或重复。');
      else config.techs.push(id);
    }
  if (!errors.length) {
    const result = calculateGarrisonHealing(ctx, config);
    errors.push(...result.errors);
    if (result.status === 'ineligible' && config.entry !== 'deposit') errors.push(result.reason);
  }
  return { config, errors: [...new Set(errors)] };
}

export function writeHealingConfig(c: HealingConfig): URLSearchParams {
  return new URLSearchParams({
    hv: '1',
    b: String(c.buildingId),
    civ: c.civ,
    age: String(c.age),
    u: String(c.unitId),
    entry: c.entry,
    techs: unique(c.techs).join(','),
    current: c.currentHp,
    target: c.targetHp,
  });
}

/** Transfer an explicit single occupant, or choose a fresh legal default. */
export function healingLink(
  ctx: HealingContext,
  input: { buildingId: number; civ: string; age: number; unitId?: number; entry?: GarrisonEntry; techs?: Iterable<number> },
): string | null {
  let c: HealingConfig = {
    ...DEFAULT_HEALING_CONFIG,
    buildingId: input.buildingId,
    civ: input.civ,
    age: input.age,
    unitId: input.unitId ?? 83,
    entry: input.entry ?? 'enter',
    techs: unique([...(input.techs ?? [])]),
    currentHp: '1',
    targetHp: '1',
  };
  const allowed = new Set(availableHealingTechs(ctx, c).map((t) => t.id));
  c.techs = c.techs.filter((id) => allowed.has(id));
  const candidates = getHealingCandidates(ctx, c);
  if (input.unitId !== undefined) {
    const candidate = candidates.find((u) => u.id === input.unitId);
    if (!candidate) return null;
    if (input.entry === undefined) c.entry = candidate.canEnter ? 'enter' : candidate.canCreate ? 'created' : 'deposit';
  } else {
    const candidate = candidates.find((u) => u.id === 83 && u.canEnter) ?? candidates.find((u) => u.canEnter) ?? candidates.find((u) => u.canCreate);
    if (!candidate) return null;
    c = { ...c, unitId: candidate.id, entry: candidate.canEnter ? 'enter' : 'created' };
    const applicable = new Set(availableHealingTechs(ctx, c).map((t) => t.id));
    c.techs = unique([...(input.techs ?? [])]).filter((id) => applicable.has(id));
  }
  c.targetHp = String(maxHealingHp(ctx, c) ?? GARRISON_HEALING_DATA.units[c.unitId]?.hp ?? 1);
  const result = calculateGarrisonHealing(ctx, c);
  if (result.errors.length || (result.status === 'ineligible' && c.entry !== 'deposit')) return null;
  return '/garrison-healing?' + writeHealingConfig(c).toString();
}
