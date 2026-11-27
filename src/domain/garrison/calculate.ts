/** Issue 224/1526: garrison free/toggle tech helpers, projectile firepower calculator, explanation, and strict URL parser. */
import { freeGarrisonTechs } from '../garrisonTechs';
import { DATA_PATCH_BUILD } from '../../data/meta';
import type { Building } from '../types';
import { civStatus } from '../simulator';
import { buildingAge as getGarrisonBuildingAge } from '../availabilityAge';
import { TC_BY_AGE, VILLAGER_UNIT_ID } from '../gameIds';
import type { GeneralGarrisonConfig, GeneralGarrisonRow } from '../garrisonUrl';
import {
  describeUnitGarrisonPower,
  GENERAL_GARRISON_DATA,
  GENERAL_GARRISON_LIMIT,
  relicGarrisonPower,
  technologyData,
  unique,
  type GarrisonContribution,
  type GarrisonExplanation,
  type GarrisonRowResult,
  type GeneralGarrisonContext,
  type GeneralGarrisonData,
  type GeneralGarrisonResult,
} from './types';
import { buildingProductionScope, candidate, getStaticIndex, snapshot } from './snapshot';
import { computeGarrisonTechs } from './techFilter';

export function getFreeGarrisonTechs(ctx: GeneralGarrisonContext, b: Building, config: GeneralGarrisonConfig, data = GENERAL_GARRISON_DATA): number[] {
  return freeGarrisonTechs(ctx, b, config, technologyData(data));
}

export function toggleGeneralGarrisonTech(
  ctx: GeneralGarrisonContext,
  b: Building,
  config: GeneralGarrisonConfig,
  id: number,
  data = GENERAL_GARRISON_DATA,
): number[] {
  const status = civStatus(ctx.trees, config.civ);
  const index = getStaticIndex(data);
  const available = new Set(computeGarrisonTechs(ctx, b, config, data, status).map((t) => t.id));
  const free = new Set(freeGarrisonTechs(ctx, b, config, technologyData(data), status, index.shapeUpgrades));
  const next = new Set([...config.techs, ...free]);
  if (!ctx.core.techById[id] || free.has(id) || !available.has(id)) return unique([...next]);
  const snapFor = (techSet: Set<number>) => snapshot(ctx, b, { ...config, techs: unique([...techSet].filter((tid) => !free.has(tid))) }, data, status, index);
  if (next.has(id)) {
    next.delete(id);
    let changed = true;
    while (changed) {
      changed = false;
      const nextSnap = snapFor(next);
      for (const xid of [...next]) {
        const pre = ctx.core.techById[xid]?.pre;
        if (pre != null && available.has(pre) && !nextSnap.known.has(pre)) {
          next.delete(xid);
          changed = true;
        }
      }
    }
  } else {
    next.add(id);
    let cur = id;
    const seen = new Set<number>([id]);
    while (true) {
      const pre = ctx.core.techById[cur]?.pre;
      if (pre == null || seen.has(pre)) break;
      seen.add(pre);
      if (next.has(pre)) break;
      const nextSnap = snapFor(next);
      if (nextSnap.known.has(pre)) break;
      if (!available.has(pre)) break;
      next.add(pre);
      cur = pre;
    }
  }
  return unique([...next]);
}

export function calculateGeneralGarrison(
  ctx: GeneralGarrisonContext,
  b: Building,
  config: GeneralGarrisonConfig,
  data = GENERAL_GARRISON_DATA,
): GeneralGarrisonResult {
  return calculateGarrison(ctx, b, config, data);
}

export function explainGeneralGarrison(ctx: GeneralGarrisonContext, b: Building, config: GeneralGarrisonConfig, data = GENERAL_GARRISON_DATA) {
  const explanation: GarrisonExplanation = { rows: [], buildingThreshold: null, firingSteps: null };
  return { ...calculateGarrison(ctx, b, config, data, explanation), ...explanation };
}

function calculateGarrison(
  ctx: GeneralGarrisonContext,
  b: Building,
  config: GeneralGarrisonConfig,
  data: GeneralGarrisonData,
  explanation?: GarrisonExplanation,
): GeneralGarrisonResult {
  const out: GeneralGarrisonResult = {
    errors: [],
    warnings: [],
    mode: 'shelter',
    capacity: 0,
    usedSlots: 0,
    remainingSlots: 0,
    baseProjectiles: 0,
    extraProjectiles: 0,
    totalProjectiles: 0,
    maxProjectiles: 0,
    buildingPower: null,
    garrisonPower: 0,
    rows: [],
    selected: [],
    nextByUnit: {},
    singleUnitId: null,
    thresholds: [],
    singleUnitSaturationAt: null,
    nextAt: null,
    maxAtCapacity: null,
  };
  if (!data.civs[config.civ] || !b.civs.includes(config.civ)) out.errors.push('所选文明不可使用此建筑。');
  if (!data.buildings[b.id]) out.errors.push('该对象不是已核实的可驻军建筑。');
  if (!Number.isSafeInteger(config.age) || config.age < getGarrisonBuildingAge(b, config.civ, ctx.trees) || config.age > 4)
    out.errors.push('时代无效或早于此建筑。');
  if (config.rows.length > GENERAL_GARRISON_LIMIT) out.errors.push(`方案最多包含 ${GENERAL_GARRISON_LIMIT} 种驻军记录。`);
  const status = civStatus(ctx.trees, config.civ);
  const index = getStaticIndex(data);
  let availableSet: Set<number> | null = null;
  const getAvailable = () => (availableSet ??= new Set(computeGarrisonTechs(ctx, b, config, data, status).map((t) => t.id)));
  if (config.techs.length > 0) {
    const available = getAvailable();
    for (const id of config.techs)
      if (!Number.isSafeInteger(id) || !available.has(id)) out.errors.push(`${ctx.core.techById[id]?.zh ?? `科技 ${id}`}不可用或不影响驻军预览。`);
  }
  if (out.errors.length) return out;
  const state = snapshot(ctx, b, config, data, status, index),
    B = state.building;
  out.selected = state.selected;
  for (const id of state.selected) {
    const tech = ctx.core.techById[id];
    if (tech?.pre && !state.known.has(tech.pre) && getAvailable().has(tech.pre)) out.errors.push(`${tech.zh}缺少前置科技。`);
  }
  if (!B || !Number.isSafeInteger(B.capacity) || B.capacity < 0 || B.capacity > 255) out.errors.push('固定版本建筑容量数据无效。');
  if (!B || out.errors.length) return out;
  out.capacity = B.capacity;
  const scope = buildingProductionScope(b, data, index);
  const seen = new Set<string>();
  let power: number | null = 0;
  for (const row of config.rows) {
    const key = row.unitId + ':' + row.entry;
    if (seen.has(key)) out.errors.push('同一单位与入驻方式不能重复，请合并人数。');
    seen.add(key);
    if (!Number.isSafeInteger(row.unitId) || !['enter', 'created', 'deposit'].includes(row.entry)) out.errors.push('驻军单位或入驻方式无效。');
    const unit = state.units[row.unitId],
      item = candidate(ctx, b, config, row.unitId, state, data, scope, status);
    if (!unit || !item || !(row.entry === 'enter' ? item.canEnter : row.entry === 'deposit' ? item.canDeposit : item.canCreate))
      out.errors.push(`${unit?.zh ?? `单位 ${row.unitId}`}不能以所选方式驻军。`);
    const validCount = /^\d+$/.test(row.count) && Number.isSafeInteger(Number(row.count)) && Number(row.count) <= B.capacity;
    if (!validCount) out.errors.push(`驻军数量须为 0–${B.capacity} 的整数。`);
    const countValue = validCount ? Number(row.count) : 0;
    out.usedSlots += countValue;
    const contribution: GarrisonContribution =
      row.entry === 'deposit'
        ? relicGarrisonPower(b.id, B, state.units)
        : unit
          ? describeUnitGarrisonPower(unit, state.units)
          : { power: null, powerSource: 'unknown', reason: '单位数据缺失。' };
    const total = contribution.power === null ? null : contribution.power * countValue;
    if (countValue > 0) power = power === null || total === null ? null : power + total;
    if (total === null && countValue > 0) out.warnings.push(contribution.reason);
    if (unit && countValue > 0 && unit.firepower > 0 && unit.total > 1)
      out.warnings.push(`多弹丸驻军按公开公式估算，未完成 DE ${DATA_PATCH_BUILD} 客户端对账。`);
    if (unit && countValue > 0 && [6, 7].includes(unit.chargeType)) out.warnings.push('充能单位按普通未充能齐射估算，不计临时最大弹丸数与战斗充能状态。');
    if (row.unitId === 434 && countValue > 0) out.warnings.push('国王驻军仅适用于包含国王的对局模式。');
    const rowResult: GarrisonRowResult = {
      ...row,
      zh: unit?.zh ?? `单位 ${row.unitId}`,
      canEnter: item?.canEnter ?? false,
      canCreate: item?.canCreate ?? false,
      canDeposit: item?.canDeposit ?? false,
      countValue,
      powerEach: contribution.power,
      powerTotal: total,
      reason: contribution.reason,
    };
    out.rows.push(rowResult);
    explanation?.rows.push({ ...rowResult, powerSource: contribution.powerSource });
  }
  out.remainingSlots = Math.max(0, B.capacity - out.usedSlots);
  if (out.usedSlots > B.capacity) out.errors.push(`驻军总数 ${out.usedSlots} 超过容量 ${B.capacity}。`);
  if (out.errors.length) return out;
  out.garrisonPower = power;
  out.warnings = [...new Set(out.warnings)];
  const hasPrimary = B.projectile >= 0,
    hasSecondary = B.secondaryProjectile >= 0;
  const shooting = B.attack > 0 && B.reload > 0 && (hasPrimary || hasSecondary);
  if (!shooting) {
    out.mode = data.herdableIds.some((id) => out.rows.some((r) => r.unitId === id)) || out.rows.some((r) => r.entry === 'deposit') ? 'economic' : 'shelter';
    return out;
  }
  if (![B.total, B.max].every((n) => Number.isSafeInteger(n) && n >= 0)) {
    out.warnings.push('弹丸上限数据未核实；容量与兼容性仍有效。');
    out.extraProjectiles = null;
    out.totalProjectiles = null;
    return out;
  }
  out.mode = b.id === 236 ? 'cannon' : 'arrows';
  const secondaryAttack = hasSecondary ? state.units[B.secondaryProjectile]?.attack : undefined;
  const attack = secondaryAttack ?? B.attack;
  const buildingPower = attack / B.reload;
  out.buildingPower = buildingPower;
  if (hasSecondary && state.units[B.secondaryProjectile]?.attack !== B.attack)
    out.warnings.push('建筑副弹丸攻击与建筑面板不同；本模型按副弹丸火力计算阈值，未完成固定版本客户端对账。');
  if (!(out.buildingPower > 0) || !Number.isFinite(out.buildingPower)) {
    out.warnings.push('建筑副弹丸火力未核实；容量与兼容性仍有效。');
    out.extraProjectiles = null;
    out.totalProjectiles = null;
    return out;
  }
  if (explanation)
    explanation.buildingThreshold = { attack, reload: B.reload, source: secondaryAttack !== undefined ? 'secondary' : hasSecondary ? 'building' : 'primary' };
  const wholeSlotsFor = (quotient: number) => Math.floor(quotient + 1e-9);
  const projectilesFor = (slots: number) => (hasPrimary ? Math.max(1, slots) : Math.max(0, slots - 1));
  const cappedProjectiles = (wholeSlots: number) => projectilesFor(Math.min(B.max, B.total + wholeSlots));
  const countShots = (p: number) => cappedProjectiles(wholeSlotsFor(p / buildingPower));
  out.baseProjectiles = countShots(0);
  out.maxProjectiles = hasPrimary ? Math.max(1, B.max) : Math.max(0, B.max - 1);
  if (power === null) {
    out.extraProjectiles = null;
    out.totalProjectiles = null;
    return out;
  }
  const quotient = power / buildingPower;
  const wholeSlots = wholeSlotsFor(quotient);
  out.totalProjectiles = cappedProjectiles(wholeSlots);
  out.extraProjectiles = out.totalProjectiles - out.baseProjectiles;
  if (explanation) {
    // A primary weapon can start at one shot even when its initial slot count is zero.
    // Without a primary weapon, one slot is reserved and does not fire.
    const nextSlots = out.totalProjectiles + (hasPrimary ? 1 : 2) - B.total;
    explanation.firingSteps = {
      quotient,
      wholeSlots,
      uncappedProjectiles: projectilesFor(B.total + wholeSlots),
      primaryMinimum: hasPrimary && B.total === 0,
      nextThreshold: out.totalProjectiles < out.maxProjectiles ? { slots: nextSlots, power: nextSlots * buildingPower } : null,
    };
  }
  if (unique(out.rows.map((r) => r.unitId)).length === 1 && out.rows[0]?.powerEach !== null) {
    const row = out.rows[0]!;
    out.singleUnitId = row.unitId;
    for (let count = 0; count <= B.capacity; count++) {
      const shots = countShots(count * row.powerEach!);
      out.thresholds.push({ count, totalProjectiles: shots });
      if (out.singleUnitSaturationAt === null && shots >= out.maxProjectiles) out.singleUnitSaturationAt = count;
      if (count > out.usedSlots && out.nextAt === null && shots > out.totalProjectiles) out.nextAt = count;
    }
    out.maxAtCapacity = out.thresholds[B.capacity]!.totalProjectiles;
  }
  for (const row of out.rows) {
    out.nextByUnit[row.unitId] = null;
    if (row.powerEach === null || row.powerEach <= 0) continue;
    for (let n = 1; n <= out.remainingSlots; n++) {
      const shots = countShots(power + n * row.powerEach);
      if (shots > out.totalProjectiles) {
        out.nextByUnit[row.unitId] = { additionalUnits: n, totalProjectiles: shots };
        break;
      }
    }
  }
  return out;
}

/** Strict versioned URL; legacy issue 218 links migrate without dropping malformed tokens. */
export function readGeneralGarrison(params: URLSearchParams, b: Building): { config: GeneralGarrisonConfig; errors: string[] } {
  const errors: string[] = [];
  for (const key of ['civ', 'age', 'gtechs', 'garrison', 'gv', 'army']) if (params.getAll(key).length > 1) errors.push(`${key} 参数重复，请重置方案。`);
  const v2 = params.has('gv') || params.has('army');
  if (v2 && params.has('garrison')) errors.push('新旧驻军参数不能混用，请重置方案。');
  if (v2 && params.get('gv') !== '2') errors.push('驻军方案版本无效。');
  const age = params.get('age');
  if (age !== null && (!/^\d+$/.test(age) || !Number.isSafeInteger(Number(age)))) errors.push('时代参数无效。');
  const techs: number[] = [];
  for (const token of (params.get('gtechs') ?? '').split(',').filter((s, index, all) => s !== '' || all.length > 1 || index > 0)) {
    if (!/^\d+$/.test(token) || !Number.isSafeInteger(Number(token)) || Number(token) <= 0 || techs.includes(Number(token)))
      errors.push('科技参数无效或重复。');
    else techs.push(Number(token));
  }
  const rows: GeneralGarrisonRow[] = [];
  if (v2) {
    const army = params.get('army');
    if (army === null) errors.push('驻军列表参数缺失。');
    else if (army !== '')
      for (const token of army.split(',')) {
        const match = /^(\d+):([^:,]*):(e|c|d)$/.exec(token);
        if (!match || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) <= 0) {
          errors.push('驻军列表包含无效记录。');
          continue;
        }
        const row: GeneralGarrisonRow = {
          unitId: Number(match[1]),
          count: match[2]!,
          entry: match[3] === 'e' ? 'enter' : match[3] === 'd' ? 'deposit' : 'created',
        };
        if (rows.some((r) => r.unitId === row.unitId && r.entry === row.entry)) errors.push('驻军列表包含重复记录。');
        rows.push(row);
      }
  } else if (params.has('garrison')) {
    const count = params.get('garrison')!;
    if (!/^\d+$/.test(count) || !Number.isSafeInteger(Number(count))) errors.push('旧版驻军数量参数无效。');
    rows.push({ unitId: VILLAGER_UNIT_ID, count, entry: 'enter' });
  } else if ([TC_BY_AGE[0]!, 79, 234, 235].includes(b.id)) rows.push({ unitId: VILLAGER_UNIT_ID, count: '0', entry: 'enter' });
  if (rows.length > GENERAL_GARRISON_LIMIT) errors.push(`驻军列表最多 ${GENERAL_GARRISON_LIMIT} 项。`);
  return { config: { civ: params.get('civ') ?? b.civs[0]!, age: age === null ? Math.max(3, b.age) : Number(age), techs: unique(techs), rows }, errors };
}
