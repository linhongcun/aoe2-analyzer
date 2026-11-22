/**
 * issue 735 / 1327：只读展示 eco.json fishingShip 的岸鱼 / 深海鱼 / 养鱼场理论工作速率与携带量，
 * 按升级路径依次计算基准 → 钓线后（906）→ 刺网后（906 + 65）。不含往返、上交、等待与文明加成。
 */
import { ECO } from '../data/eco';

export const FISHING_SHIP_UNIT_ID = 13;
export const FISHING_LINES_TECH_ID = '906';
export const GILLNETS_TECH_ID = '65';

interface FishingShipStat {
  unit?: unknown;
  workRate?: unknown;
  carry?: unknown;
  deepFishMultiplier?: unknown;
  fishTrapMultiplier?: unknown;
}

interface EcoEffectStat {
  kind?: unknown;
  target?: unknown;
  attr?: unknown;
  op?: unknown;
  v?: unknown;
}

/** UI 视图切片：防御式解析 eco.json，只声明本页读取的字段；不是 EcoData 的整表副本。 */
export interface FishingEcoSlice {
  meta?: { patch?: unknown };
  fishingShip?: FishingShipStat | null;
  units?: Record<string, { class?: unknown } | null | undefined>;
  ecoTechs?: Record<string, { effects?: unknown } | null | undefined>;
}

interface FishingTechEffect {
  workMul: number;
  carryAdd: number;
}

export interface FishingGatherTier {
  shoreWorkRate: number | null;
  deepWorkRate: number | null;
  fishTrapWorkRate: number | null;
  carry: number | null;
}

export interface FishingGatherBaseline {
  base: FishingGatherTier;
  afterFishingLines: FishingGatherTier;
  afterGillnets: FishingGatherTier;
  deepMultiplier: number | null;
  fishTrapMultiplier: number | null;
  fishingLines: FishingTechEffect | null;
  gillnets: FishingTechEffect | null;
  patch: string | null;
}

const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? (Object.is(value, -0) ? 0 : value) : null);

/** 非负有限数：显式保留已知的数值 0，与缺失/无效 null（待确认）区分。 */
const nonNegativeFinite = (value: unknown): number | null => {
  const num = finite(value);
  return num != null && num >= 0 ? num : null;
};

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** 去掉二进制乘法尾差；保留精确十进制（如 0.24×1.1×1.1×1.45 = 0.42108）供测试核对。 */
function scaleGather(base: number, factor: number): number {
  const out = Math.round(base * factor * 1e6) / 1e6;
  return out === 0 ? 0 : out;
}

function addCarry(base: number, delta: number): number | null {
  const out = Math.round((base + delta) * 1e6) / 1e6;
  if (out < 0) return null;
  return out === 0 ? 0 : out;
}

function shipStats(ship: FishingShipStat | null | undefined) {
  if (!ship || (ship.unit != null && ship.unit !== FISHING_SHIP_UNIT_ID)) {
    return { workRate: null, carry: null, deep: null, trap: null };
  }
  return {
    workRate: nonNegativeFinite(ship.workRate),
    carry: nonNegativeFinite(ship.carry),
    deep: nonNegativeFinite(ship.deepFishMultiplier),
    trap: nonNegativeFinite(ship.fishTrapMultiplier),
  };
}

/** 只接受渔船类别上的 workRate 乘法与携带加法这一对效果；缺失、多出来或目标不符就不套用。 */
function fishingTechOf(source: FishingEcoSlice, techId: string): FishingTechEffect | null {
  const shipClass = finite(source.units?.[String(FISHING_SHIP_UNIT_ID)]?.class);
  if (shipClass == null) return null;
  const target = `class:${shipClass}`;
  const effects = source.ecoTechs?.[techId]?.effects;
  if (!Array.isArray(effects) || effects.length !== 2) return null;
  const rows = effects.filter((item): item is EcoEffectStat => item !== null && typeof item === 'object');
  if (rows.length !== 2) return null;
  const work = rows.find((effect) => effect.kind === 'attr' && effect.target === target && effect.attr === 'workRate' && effect.op === 'mul');
  const carry = rows.find((effect) => effect.kind === 'attr' && effect.target === target && effect.attr === 'carry' && effect.op === 'add');
  const workMul = work ? nonNegativeFinite(work.v) : null;
  const carryAdd = carry ? finite(carry.v) : null;
  if (!work || !carry || workMul == null || carryAdd == null) return null;
  return { workMul, carryAdd };
}

function makeTier(shore: number | null, carry: number | null, deep: number | null, trap: number | null): FishingGatherTier {
  return {
    shoreWorkRate: shore,
    deepWorkRate: shore != null && deep != null ? scaleGather(shore, deep) : null,
    fishTrapWorkRate: shore != null && trap != null ? scaleGather(shore, trap) : null,
    carry,
  };
}

export function fishingShipGatherBaseline(source: FishingEcoSlice = ECO): FishingGatherBaseline {
  const ship = shipStats(source.fishingShip);
  const fishingLines = fishingTechOf(source, FISHING_LINES_TECH_ID);
  const gillnets = fishingTechOf(source, GILLNETS_TECH_ID);

  const base = makeTier(ship.workRate, ship.carry, ship.deep, ship.trap);

  const linesShore = fishingLines && base.shoreWorkRate != null ? scaleGather(base.shoreWorkRate, fishingLines.workMul) : null;
  const linesCarry = fishingLines && base.carry != null ? addCarry(base.carry, fishingLines.carryAdd) : null;
  const afterFishingLines = makeTier(linesShore, linesCarry, ship.deep, ship.trap);

  // 刺网以钓线为前置：钓线异常时不跳过钓线直接对基准套刺网。
  const gillnetsShore = gillnets && afterFishingLines.shoreWorkRate != null ? scaleGather(afterFishingLines.shoreWorkRate, gillnets.workMul) : null;
  const gillnetsCarry = gillnets && afterFishingLines.carry != null ? addCarry(afterFishingLines.carry, gillnets.carryAdd) : null;
  const afterGillnets = makeTier(gillnetsShore, gillnetsCarry, ship.deep, ship.trap);

  return {
    base,
    afterFishingLines,
    afterGillnets,
    deepMultiplier: ship.deep,
    fishTrapMultiplier: ship.trap,
    fishingLines,
    gillnets,
    patch: text(source.meta?.patch),
  };
}
