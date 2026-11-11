/**
 * issue 736：农田与养鱼场的食物总量只读展示。
 * 磨坊科技对资源 36 的 add 来自 eco.json ecoTechs。
 * 通用起始、中国队起始、养鱼场起始来自 UGC 资源表；eco.json 没有这三行起始量。
 * 马来养鱼场读取 civEco.Malay 对资源 88 的 set。
 * 不改 eco.json，不算采集速率，不做配田或补种。
 */
import { ECO } from '../data/eco';

export const FARM_BUILDING_ID = 50;
export { FISH_TRAP_BUILDING_ID } from './gameIds';
export const FARM_FOOD_RES = 36;
export const FISH_TRAP_FOOD_RES = 88;
/** 研究顺序：马轭、重犁、轮作。不是科技编号顺序。 */
export const FARM_FOOD_TECH_IDS = ['14', '13', '12'] as const;
export const MALAY_FISH_TRAP_TECH = 637;

/** UGC Resources，Kent 核 Last-Modified 2026-11-05。eco.json 未导出这些起始行。 */
export const UGC_RESOURCES_HREF = 'https://ugc.aoe2.rocks/general/resources/resources/';
export const UGC_RESOURCES_CHECKED = '2026-11-05';
export const UGC_FARM_FOOD_DEFAULT = 175;
export const UGC_CHINESE_FARM_FOOD = 220;
export const UGC_FISH_TRAP_FOOD_DEFAULT = 710;

export interface FoodEcoEffect {
  kind?: unknown;
  op?: unknown;
  res?: unknown;
  v?: unknown;
}

export interface FoodEcoTech {
  effects?: unknown;
}

export interface FoodCivRow {
  tech?: unknown;
  name?: unknown;
  effects?: unknown;
}

/** UI 视图切片：防御式解析 eco.json，只声明本页读取的字段；不是 EcoData 的整表副本。 */
export interface FoodEcoSlice {
  meta?: { patch?: unknown };
  ecoTechs?: Record<string, FoodEcoTech | null | undefined>;
  civEco?: Record<string, unknown>;
}

export interface FoodAmountStep {
  key: string;
  techId: string | null;
  add: number | null;
  total: number | null;
}

export interface FarmFoodAmount {
  steps: FoodAmountStep[];
  /** civEco.Chinese 存在且没有任何资源 36 效果时，才用 UGC 起始量。 */
  chineseFromUgc: boolean;
  chineseSteps: FoodAmountStep[];
  patch: string | null;
}

export interface MalayFishTrapFood {
  tech: number;
  value: number;
  name: string | null;
  /** 记录值正好等于通用基准的 3 倍时才为 true。 */
  triple: boolean;
}

export interface FishTrapFoodAmount {
  base: number;
  malay: MalayFishTrapFood | null;
  patch: string | null;
}

const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);

export function formatFoodAmount(value: number): string {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

function effectsOf(value: unknown): FoodEcoEffect[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is FoodEcoEffect => item !== null && typeof item === 'object');
}

function civRows(source: FoodEcoSlice, civ: string): FoodCivRow[] | null {
  const rows = source.civEco?.[civ];
  if (!Array.isArray(rows)) return null;
  if (!rows.every((row) => row !== null && typeof row === 'object')) return null;
  return rows as FoodCivRow[];
}

/** 只要恰好一条资源 36 的 add；多一条或操作对不上就不累加。 */
function farmAdd(source: FoodEcoSlice, techId: string): number | null {
  const effects = effectsOf(source.ecoTechs?.[techId]?.effects).filter((effect) => effect.res === FARM_FOOD_RES);
  const effect = effects[0];
  if (effects.length !== 1 || !effect || effect.kind !== 'res' || effect.op !== 'add') return null;
  return finite(effect.v);
}

function chain(start: number, source: FoodEcoSlice): FoodAmountStep[] {
  const steps: FoodAmountStep[] = [{ key: 'base', techId: null, add: null, total: start }];
  let total = start;
  let open = true;
  for (const techId of FARM_FOOD_TECH_IDS) {
    const add = farmAdd(source, techId);
    if (!open || add == null) {
      open = false;
      steps.push({ key: techId, techId, add, total: null });
      continue;
    }
    total += add;
    steps.push({ key: techId, techId, add, total });
  }
  return steps;
}

function chineseFromUgc(source: FoodEcoSlice): boolean {
  const rows = civRows(source, 'Chinese');
  if (!rows) return false;
  return !rows.some((row) => effectsOf(row.effects).some((effect) => effect.res === FARM_FOOD_RES));
}

function malayFishTrap(source: FoodEcoSlice): MalayFishTrapFood | null {
  const rows = civRows(source, 'Malay');
  if (!rows) return null;
  const hits = rows.filter((row) => row.tech === MALAY_FISH_TRAP_TECH);
  const hit = hits[0];
  if (hits.length !== 1 || !hit) return null;
  const effects = effectsOf(hit.effects).filter((effect) => effect.res === FISH_TRAP_FOOD_RES);
  const effect = effects[0];
  if (effects.length !== 1 || !effect || effect.kind !== 'res' || effect.op !== 'set') return null;
  const value = finite(effect.v);
  if (value == null) return null;
  const extra = rows.some((row) => row !== hit && effectsOf(row.effects).some((item) => item.res === FISH_TRAP_FOOD_RES));
  if (extra) return null;
  return { tech: MALAY_FISH_TRAP_TECH, value, name: text(hit.name), triple: value === UGC_FISH_TRAP_FOOD_DEFAULT * 3 };
}

export function farmFoodAmount(source: FoodEcoSlice = ECO): FarmFoodAmount {
  const fromUgc = chineseFromUgc(source);
  return {
    steps: chain(UGC_FARM_FOOD_DEFAULT, source),
    chineseFromUgc: fromUgc,
    chineseSteps: fromUgc ? chain(UGC_CHINESE_FARM_FOOD, source) : [],
    patch: text(source.meta?.patch),
  };
}

export function fishTrapFoodAmount(source: FoodEcoSlice = ECO): FishTrapFoodAmount {
  return {
    base: UGC_FISH_TRAP_FOOD_DEFAULT,
    malay: malayFishTrap(source),
    patch: text(source.meta?.patch),
  };
}
