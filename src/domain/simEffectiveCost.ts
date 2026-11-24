/**
 * 单位与建筑科技模拟器的有效训练/建造价领域计算（issue 1297）。
 * 统一复用 unitCost（内部先 discountedCost），零硬编码特例。
 */
import { civByEn } from '../data';
import { civStatus } from './civStatus';
import { DAT } from './datEffects';
import { RES_ZH } from './ratings';
import type { SimContext, SimTech } from './simulator';
import { unitTrainCount } from './trainBatch';
import type { Cost, Tech } from './types';
import { isUnitCostAttribute, UNIT_COST_RESOURCES, unitCost, type UnitCostResource, type UnitCostTech } from './unitCost';

export interface SimCostTech {
  tech: Tech;
  /** unitCost 已套用至少一条有效费用效果。 */
  supported: boolean;
  /** 已套用有效费用效果，但同科技仍含未解码资源或条件标记。 */
  partial: boolean;
}

export interface CostDelta {
  res: UnitCostResource;
  before: number;
  after: number;
  delta: number;
  /** 资源单向降价时的四舍五入百分比；新增资源或涨价为 null。 */
  pct: number | null;
}

export type SimEffectiveCostKind = 'changed' | 'changed-with-undecoded' | 'undecoded-only' | 'available' | 'plain';

export interface SimEffectiveCostView {
  entityKind: 'unit' | 'building';
  kind: SimEffectiveCostKind;
  base: Cost;
  cost: Cost;
  deltas: CostDelta[];
  appliedSources: string[];
  availableTechNames: string[];
  /** 未选费用科技全部高于当前模拟时代时，记录其中最早起效时代；否则为 null。 */
  availableRequiresAge: number | null;
  availablePartialOnly: boolean;
  availableHint: string | null;
  undecodedTechNames: string[];
  unsupportedDiscountLabels: string[];
  trainCount?: number;
  trainSeconds?: number;
}

export type SimCostBadgeKind = 'cost' | 'partial' | 'undecoded';

export interface CostEntity {
  id: number;
  age: number;
  cost: Cost;
  trainCount?: number;
}

function asCostInput(tech: Tech): UnitCostTech {
  return { id: tech.id, en: tech.en, zh: tech.zh };
}

/** 按固定资源顺位计算前后造价差额，过滤无变化资源。 */
export function diffEntityCost(before: Cost, after: Cost): CostDelta[] {
  const out: CostDelta[] = [];
  for (const res of UNIT_COST_RESOURCES) {
    const prev = before[res] ?? 0;
    const next = after[res] ?? 0;
    const delta = Math.round((next - prev) * 1000) / 1000;
    if (delta === 0) continue;
    const pct = prev > 0 && delta < 0 ? Math.round((Math.abs(delta) / prev) * 100) : null;
    out.push({ res, before: prev, after: next, delta, pct });
  }
  return out;
}

/**
 * 收集某文明对当前单位/建筑生效的全部费用科技（跨全时代探测，避免低时代视角误降级为「仅文本」）。
 * 对完全可解码但净差额全为 0 的目标（如 835 刹帝利命中 0 食物消耗的弓箭手）自动过滤。
 */
export function applicableSimCostTechs(ctx: SimContext, entity: CostEntity, civ: string): SimCostTech[] {
  const lit = civStatus(ctx.trees, civ);
  const found: SimCostTech[] = [];
  for (const tech of ctx.techs) {
    if (!tech.civs.includes(civ) || !lit['t' + tech.id]) continue;
    const eco = DAT.techs[tech.en]?.eco ?? [];
    if (!eco.some((effect) => isUnitCostAttribute(effect.a) && effect.t?.includes(entity.id))) continue;
    const probeAge = Math.max(entity.age, tech.age);
    const baseProbe = unitCost(entity, civ, probeAge, []);
    const withProbe = unitCost(entity, civ, probeAge, [asCostInput(tech)]);
    const supported = withProbe.appliedTechs.some((item) => item.id === tech.id);
    const hasUndecoded = withProbe.undecoded.some((item) => item.techId === tech.id);
    if (!supported && !hasUndecoded) continue;
    if (supported && !hasUndecoded && diffEntityCost(baseProbe.cost, withProbe.cost).length === 0) continue;
    found.push({ tech, supported, partial: supported && hasUndecoded });
  }
  return found;
}

/** 将未出现在 avail 里的适用费用科技补入列表（不重复，保持原顺序）。 */
export function mergeSimCostTechs(avail: readonly SimTech[], costTechs: readonly SimCostTech[]): SimTech[] {
  const seen = new Set(avail.map((row) => row.t.id));
  const extra: SimTech[] = [];
  for (const item of costTechs) {
    if (seen.has(item.tech.id)) continue;
    seen.add(item.tech.id);
    extra.push({ t: item.tech, ef: null });
  }
  return extra.length ? [...avail, ...extra] : [...avail];
}

/** 生成科技行徽标映射，供 SimPanel 展示「影响造价 / 含未解码效果」。 */
export function costTechBadgeMap(costTechs: readonly SimCostTech[]): Map<number, SimCostBadgeKind> {
  const map = new Map<number, SimCostBadgeKind>();
  for (const item of costTechs) {
    map.set(item.tech.id, item.partial ? 'partial' : item.supported ? 'cost' : 'undecoded');
  }
  return map;
}

/** 自动预设（满科技 / 时代预设）纳入的费用科技 ID：仅含完全可解码的 supported && !partial。 */
export function presetCostTechIds(costTechs: readonly SimCostTech[], scope: 'all' | number): Set<number> {
  const limit = scope === 'all' ? 4 : scope;
  const ids = new Set<number>();
  for (const item of costTechs) {
    if (item.supported && !item.partial && item.tech.age <= limit) ids.add(item.tech.id);
  }
  return ids;
}

/** 计算模拟器右栏有效训练/建造价视图模型。 */
export function buildSimEffectiveCost(
  entity: CostEntity,
  entityKind: 'unit' | 'building',
  civ: string,
  age: number,
  sel: ReadonlySet<number>,
  costTechs: readonly SimCostTech[],
  trainSeconds?: number,
): SimEffectiveCostView {
  const tier = Math.max(entity.age, age);
  const isActiveSelected = (item: SimCostTech) => sel.has(item.tech.id) && item.tech.age <= age;
  const selectedTechs = costTechs.filter(isActiveSelected).map((item) => asCostInput(item.tech));
  const priced = unitCost(entity, civ, tier, selectedTechs);
  const deltas = diffEntityCost(entity.cost, priced.cost);
  const civZh = civByEn(civ)?.zh ?? civ;
  const appliedSources = [
    ...priced.discount.applied.map(
      (line) => `${civZh}${line.label}（\u2212${line.pct}%${line.res ? `，仅${line.res.map((r) => RES_ZH[r] ?? r).join('、')}` : ''}）`,
    ),
    ...priced.appliedTechs.map((item) => item.zh),
  ];
  const undecodedTechNames = [...new Set(priced.undecoded.map((item) => item.tech))];
  const unsupportedDiscountLabels = [...new Set(priced.discount.unsupported.map((item) => item.label || item.text || `${civZh}未解码文明折扣`))];
  const unselected = costTechs.filter((item) => !isActiveSelected(item));
  const availableNow = unselected.filter((item) => item.tech.age <= age);
  const availableTechNames = unselected.map((item) => item.tech.zh);
  const availableRequiresAge = availableNow.length === 0 && unselected.length > 0 ? Math.min(...unselected.map((item) => item.tech.age)) : null;
  const availablePartialOnly = unselected.length > 0 && unselected.every((item) => item.partial);

  let kind: SimEffectiveCostKind;
  if (deltas.length > 0 && undecodedTechNames.length > 0) kind = 'changed-with-undecoded';
  else if (deltas.length > 0) kind = 'changed';
  else if (undecodedTechNames.length > 0 || unsupportedDiscountLabels.length > 0) kind = 'undecoded-only';
  else if (costTechs.length > 0) kind = 'available';
  else kind = 'plain';

  const availableHint =
    (kind === 'changed' || kind === 'changed-with-undecoded' || kind === 'undecoded-only') && availableTechNames.length > 0
      ? `另有可选降价科技：${availableTechNames.join('、')}（勾选后叠加生效）`
      : null;

  const tc = unitTrainCount(entity);
  const validTrainSeconds = trainSeconds !== undefined && Number.isFinite(trainSeconds) && trainSeconds > 0 ? trainSeconds : undefined;

  return {
    entityKind,
    kind,
    base: entity.cost,
    cost: priced.cost,
    deltas,
    appliedSources,
    availableTechNames,
    availableRequiresAge,
    availablePartialOnly,
    availableHint,
    undecodedTechNames,
    unsupportedDiscountLabels,
    ...(tc > 1 ? { trainCount: tc } : {}),
    ...(validTrainSeconds !== undefined ? { trainSeconds: validTrainSeconds } : {}),
  };
}
