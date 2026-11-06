/**
 * issue 735：只读展示 eco.json fishingShip 的岸鱼 / 深海鱼基准 workRate、深海倍率与携带量。
 * 刺网只对照 ecoTechs["65"] 里指向该渔船 DAT 类别的效果。养鱼场没有单独速率字段时标待确认，不推算。
 */
import ecoRaw from '../../data/raw/eco';

export const FISHING_SHIP_UNIT_ID = 13;
export const GILLNETS_TECH_ID = '65';
export const FISH_TRAP_ID = '199';

export interface FishingGatherCell {
  workRate: number | null;
  carry: number | null;
  /** 深海任务倍率。岸鱼和养鱼场没有单独倍率。 */
  multiplier: number | null;
}

export interface FishingGillnetsContrast {
  techId: string;
  /** 效果全部能套到渔船类别时为 true。否则对照格保持待确认。 */
  applied: boolean;
  shore: FishingGatherCell;
  deep: FishingGatherCell;
  fishTrap: FishingGatherCell;
}

export interface FishingEcoSlice {
  meta?: { patch?: unknown; tasks?: unknown };
  fishingShip?: { unit?: unknown; workRate?: unknown; carry?: unknown; deepFishMultiplier?: unknown };
  units?: Record<string, { class?: unknown } | null | undefined>;
  buildings?: Record<string, { en?: unknown; workRate?: unknown; carry?: unknown } | null | undefined>;
  ecoTechs?: Record<string, { effects?: unknown } | null | undefined>;
}

export interface FishingGatherBaseline {
  shore: FishingGatherCell;
  deep: FishingGatherCell;
  fishTrap: FishingGatherCell;
  gillnets: FishingGillnetsContrast;
  patch: string | null;
  tasksNote: string | null;
}

interface AttrEffect {
  attr: 'workRate' | 'carry';
  op: 'mul' | 'add' | 'set';
  v: number;
}

const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

const emptyCell = (): FishingGatherCell => ({ workRate: null, carry: null, multiplier: null });

/** eco_build 的效果值保留 6 位小数。这里同样收口，避免二进制小数直接出现在页面上。 */
export function roundGather(value: number): number {
  return Number(value.toFixed(6));
}

function shipClass(source: FishingEcoSlice): number | null {
  const unit = finite(source.fishingShip?.unit);
  if (unit == null) return null;
  const row = source.units?.[String(unit)];
  if (!row || typeof row !== 'object') return null;
  return finite(row.class);
}

function fishTrapNumber(source: FishingEcoSlice, key: 'workRate' | 'carry'): number | null {
  const row = source.buildings?.[FISH_TRAP_ID];
  if (!row || typeof row !== 'object') return null;
  if (typeof row.en === 'string' && row.en !== 'Fish Trap') return null;
  return finite(row[key]);
}

function readGillnets(source: FishingEcoSlice, unitClass: number | null): AttrEffect[] | null {
  if (unitClass == null) return null;
  const tech = source.ecoTechs?.[GILLNETS_TECH_ID];
  if (!tech || typeof tech !== 'object' || !Array.isArray(tech.effects) || tech.effects.length === 0) return null;
  const target = `class:${unitClass}`;
  const effects: AttrEffect[] = [];
  for (const item of tech.effects) {
    if (!item || typeof item !== 'object') return null;
    const effect = item as Record<string, unknown>;
    const attr = effect.attr === 'workRate' || effect.attr === 'carry' ? effect.attr : null;
    const op = effect.op === 'mul' || effect.op === 'add' || effect.op === 'set' ? effect.op : null;
    const v = finite(effect.v);
    if (effect.kind !== 'attr' || effect.target !== target || !attr || !op || v == null) return null;
    effects.push({ attr, op, v });
  }
  return effects;
}

function applyEffects(base: number | null, effects: AttrEffect[], attr: 'workRate' | 'carry'): number | null {
  if (base == null) return null;
  let current = base;
  for (const effect of effects) {
    if (effect.attr !== attr) continue;
    if (effect.op === 'mul') current = roundGather(current * effect.v);
    else if (effect.op === 'add') current = roundGather(current + effect.v);
    else current = roundGather(effect.v);
  }
  return current;
}

function deepCell(shoreRate: number | null, shoreCarry: number | null, multiplier: number | null): FishingGatherCell {
  return {
    workRate: shoreRate != null && multiplier != null ? roundGather(shoreRate * multiplier) : null,
    carry: shoreCarry,
    multiplier,
  };
}

export function fishingShipGatherBaseline(source: FishingEcoSlice = ecoRaw as unknown as FishingEcoSlice): FishingGatherBaseline {
  const ship = source.fishingShip;
  const shoreRate = finite(ship?.workRate);
  const shoreCarry = finite(ship?.carry);
  const multiplier = finite(ship?.deepFishMultiplier);
  const shore: FishingGatherCell = { workRate: shoreRate, carry: shoreCarry, multiplier: null };
  const deep = deepCell(shoreRate, shoreCarry, multiplier);
  const fishTrap: FishingGatherCell = {
    workRate: fishTrapNumber(source, 'workRate'),
    carry: fishTrapNumber(source, 'carry'),
    multiplier: null,
  };
  const effects = readGillnets(source, shipClass(source));
  const gillnetsShore: FishingGatherCell = effects
    ? { workRate: applyEffects(shoreRate, effects, 'workRate'), carry: applyEffects(shoreCarry, effects, 'carry'), multiplier: null }
    : emptyCell();
  return {
    shore,
    deep,
    fishTrap,
    gillnets: {
      techId: GILLNETS_TECH_ID,
      applied: effects != null,
      shore: gillnetsShore,
      deep: effects ? deepCell(gillnetsShore.workRate, gillnetsShore.carry, multiplier) : emptyCell(),
      // 刺网效果打在渔船类别上。养鱼场没有单独速率时不把岸鱼公式套过去。
      fishTrap: emptyCell(),
    },
    patch: text(source.meta?.patch),
    tasksNote: text(source.meta?.tasks),
  };
}
