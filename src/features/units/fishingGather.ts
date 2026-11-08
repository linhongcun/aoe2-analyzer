/**
 * issue 735：只读展示 eco.json fishingShip 的岸鱼 / 深海基准 workRate 与携带量，并对照刺网。
 * 养鱼场没有单独 workRate 时标待确认，不推算。不计算往返，不改 eco.json。
 */
import ecoRaw from '../../data/raw/eco';
import { FISH_TRAP_BUILDING_ID as FISH_TRAP_BUILDING_ID_NUM } from '../../domain/gameIds';
import { formatGatherNumber } from './villagerGather';

export const FISHING_SHIP_UNIT_ID = 13;
export const GILLNETS_TECH_ID = '65';
export const FISH_TRAP_BUILDING_ID = String(FISH_TRAP_BUILDING_ID_NUM);

export interface FishingShipStat {
  unit?: unknown;
  workRate?: unknown;
  carry?: unknown;
  deepFishMultiplier?: unknown;
}

export interface EcoEffectStat {
  kind?: unknown;
  target?: unknown;
  attr?: unknown;
  op?: unknown;
  v?: unknown;
}

export interface FishingEcoSlice {
  meta?: { patch?: unknown; tasks?: unknown };
  fishingShip?: FishingShipStat | null;
  units?: Record<string, { class?: unknown } | null | undefined>;
  ecoTechs?: Record<string, { effects?: unknown } | null | undefined>;
  buildings?: Record<string, { workRate?: unknown } | null | undefined>;
}

export interface FishingGillnets {
  workMul: number;
  carryAdd: number;
}

export interface FishingGatherBaseline {
  shoreWorkRate: number | null;
  deepMultiplier: number | null;
  deepWorkRate: number | null;
  carry: number | null;
  shoreAfter: number | null;
  deepAfter: number | null;
  carryAfter: number | null;
  gillnets: FishingGillnets | null;
  fishTrapWorkRate: number | null;
  patch: string | null;
  tasksNote: string | null;
}

const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);

/** 去掉二进制乘法误差。0.24×1.1、0.24×1.75 的十进制结果保持不变。 */
function scaleGather(base: number, factor: number): number {
  return Math.round(base * factor * 1e6) / 1e6;
}

function shipStats(ship: FishingShipStat | null | undefined) {
  if (!ship || (ship.unit != null && ship.unit !== FISHING_SHIP_UNIT_ID)) return { workRate: null, carry: null, deep: null };
  return { workRate: finite(ship.workRate), carry: finite(ship.carry), deep: finite(ship.deepFishMultiplier) };
}

/** 只接受渔船类别上的 workRate 乘法与携带加法这一对效果；多出来或对不上就不套用。 */
function gillnetsOf(source: FishingEcoSlice): FishingGillnets | null {
  const shipClass = finite(source.units?.[String(FISHING_SHIP_UNIT_ID)]?.class);
  if (shipClass == null) return null;
  const target = `class:${shipClass}`;
  const effects = source.ecoTechs?.[GILLNETS_TECH_ID]?.effects;
  if (!Array.isArray(effects) || effects.length !== 2) return null;
  const rows = effects.filter((item): item is EcoEffectStat => item !== null && typeof item === 'object');
  if (rows.length !== 2) return null;
  const work = rows.find((effect) => effect.kind === 'attr' && effect.target === target && effect.attr === 'workRate' && effect.op === 'mul');
  const carry = rows.find((effect) => effect.kind === 'attr' && effect.target === target && effect.attr === 'carry' && effect.op === 'add');
  const workMul = work ? finite(work.v) : null;
  const carryAdd = carry ? finite(carry.v) : null;
  if (!work || !carry || workMul == null || carryAdd == null) return null;
  return { workMul, carryAdd };
}

/** 只读建筑记录上的 workRate。当前 eco 养鱼场没有该字段，调用方显示待确认。 */
function fishTrapWorkRate(source: FishingEcoSlice): number | null {
  const row = source.buildings?.[FISH_TRAP_BUILDING_ID];
  if (!row || typeof row !== 'object' || !Object.prototype.hasOwnProperty.call(row, 'workRate')) return null;
  return finite(row.workRate);
}

export function fishingShipGatherBaseline(source: FishingEcoSlice = ecoRaw as unknown as FishingEcoSlice): FishingGatherBaseline {
  const ship = shipStats(source.fishingShip);
  const gillnets = gillnetsOf(source);
  const shoreAfter = gillnets && ship.workRate != null ? scaleGather(ship.workRate, gillnets.workMul) : null;
  const deepAfter = shoreAfter != null && ship.deep != null ? scaleGather(shoreAfter, ship.deep) : null;
  return {
    shoreWorkRate: ship.workRate,
    deepMultiplier: ship.deep,
    deepWorkRate: ship.workRate != null && ship.deep != null ? scaleGather(ship.workRate, ship.deep) : null,
    carry: ship.carry,
    shoreAfter,
    deepAfter,
    carryAfter: gillnets && ship.carry != null ? ship.carry + gillnets.carryAdd : null,
    gillnets,
    fishTrapWorkRate: fishTrapWorkRate(source),
    patch: text(source.meta?.patch),
    tasksNote: text(source.meta?.tasks),
  };
}

export { formatGatherNumber };
