/**
 * 单位 PK 的训练价，issue 943。
 *
 * 价格只调用 unitCost（其内部先走 discountedCost）。这里不另写乘数，也不改战斗预设本身：
 * f / c 在原有可数值计入的战斗科技之外，再纳入本站已支持、且对当前文明 / 时代 / 单位适用的费用科技。
 * 适用与是否已支持都在运行时判断：科技树点亮、目录文明、时代，以及 DAT.techs[en].eco
 * 里属性 100 / 103–106 且目标含当前单位。整项能否套用以 unitCost 的 applied / undecoded 为准。
 */
import { civStatus } from './civStatus';
import { priceAge } from './costDiscount';
import { DAT } from './datEffects';
import { presetUpTo, type SimContext, type SimTech } from './simulator';
import type { TechSpec } from './duelState';
import type { Cost, Tech, Unit } from './types';
import { unitCost, type UnitCostResult, type UnitCostTech } from './unitCost';

const COST_ATTRS = new Set([100, 103, 104, 105, 106]);
export const TRAINING_RESOURCES = ['Food', 'Wood', 'Gold', 'Stone'] as const;

export interface TrainingCostTech {
  tech: Tech;
  /** unitCost 能套用。false 表示适用但整项被排除，勾选只作记录。 */
  supported: boolean;
}

export interface TrainingDelta {
  id: number;
  zh: string;
  changes: { res: string; delta: number }[];
}

export interface TrainingQuote {
  costs: TrainingCostTech[];
  price: UnitCostResult;
  /** 未套已选费用科技时的显示价（已含常驻文明折扣） */
  before: Cost;
  deltas: TrainingDelta[];
}

function targetsUnit(tech: Tech, unitId: number) {
  return (DAT.techs[tech.en]?.eco ?? []).some((effect) => effect.a !== undefined && COST_ATTRS.has(effect.a) && effect.t?.includes(unitId));
}

function asInput(tech: Tech): UnitCostTech {
  return { id: tech.id, en: tech.en, zh: tech.zh };
}

/** 当前文明、时代、单位下，效果目标打到这名单位的费用科技。不含写死的科技名单。 */
export function applicableTrainingTechs(ctx: SimContext, unit: Unit, civ: string, age: number): TrainingCostTech[] {
  const tier = priceAge(unit.age, age);
  const lit = civStatus(ctx.trees, civ);
  const found: TrainingCostTech[] = [];
  for (const tech of ctx.techs) {
    if (tech.age > age || !tech.civs.includes(civ) || !lit['t' + tech.id] || !targetsUnit(tech, unit.id)) continue;
    const probe = unitCost(unit, civ, tier, [asInput(tech)]);
    const supported = probe.appliedTechs.some((item) => item.id === tech.id);
    const unsupported = probe.undecoded.some((item) => item.techId === tech.id);
    if (supported || unsupported) found.push({ tech, supported });
  }
  return found;
}

/** f / c 扩展费用科技；显式 id 仍只保留战斗科技或本题适用的费用科技。 */
export function selectTrainingIds(techs: TechSpec, avail: readonly SimTech[], age: number, costs: readonly TrainingCostTech[]): Set<number> {
  if (techs === 'f' || techs === 'c') {
    const sel = presetUpTo(avail, age);
    for (const item of costs) if (item.supported) sel.add(item.tech.id);
    return sel;
  }
  const allowed = new Set([...avail.map((item) => item.t.id), ...costs.map((item) => item.tech.id)]);
  return new Set(techs.filter((id) => allowed.has(id)));
}

function diffCost(before: Cost, after: Cost): { res: string; delta: number }[] {
  return TRAINING_RESOURCES.flatMap((res) => {
    if (before[res] === undefined && after[res] === undefined) return [];
    const delta = (after[res] ?? 0) - (before[res] ?? 0);
    return delta === 0 ? [] : [{ res, delta }];
  });
}

export function quoteTraining(
  unit: Unit,
  civ: string,
  age: number,
  sel: ReadonlySet<number>,
  costs: readonly TrainingCostTech[],
  techIds?: ReadonlySet<number>,
): TrainingQuote {
  const tier = priceAge(unit.age, age);
  const opts = techIds ? { techIds } : {};
  const chosen = costs.filter((item) => sel.has(item.tech.id));
  const price = unitCost(
    unit,
    civ,
    tier,
    chosen.map((item) => asInput(item.tech)),
    opts,
  );
  const before = unitCost(unit, civ, tier, [], opts).cost;
  const byId = new Map(chosen.map((item) => [item.tech.id, item.tech]));
  const applied: UnitCostTech[] = [];
  let prev = before;
  const deltas: TrainingDelta[] = [];
  for (const item of price.appliedTechs) {
    const tech = byId.get(item.id);
    if (!tech) continue;
    applied.push(asInput(tech));
    const next = unitCost(unit, civ, tier, applied, opts).cost;
    deltas.push({ id: item.id, zh: item.zh, changes: diffCost(prev, next) });
    prev = next;
  }
  return { costs: [...costs], price, before, deltas };
}
