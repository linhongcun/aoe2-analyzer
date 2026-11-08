import type { Cost, SimStats, Tech, Unit } from './types';
import type { SceneContext, SceneEco } from './positionScenarios';
import type { Lane } from './startGame';
import { isSceneTechPlan, type SceneConfig } from './startGameInputs';
import { TEAM_BONUSES } from './effects';
import { civStatus, makeSimContext, simulate, simTechs } from './simulator';
import { discountedCost } from './costDiscount';
import { gatherModel, realCost } from './realCost';
import { buildingAge } from './availabilityAge';
import review from './routeReview.json';
import { AGE_BY_TECH } from './gameIds';

const BOW: Record<string, readonly string[]> = {
  none: [],
  'attack-1': ['Fletching'],
  'attack-2': ['Fletching', 'Bodkin Arrow'],
  armor: ['Padded Archer Armor'],
  'attack-1-armor': ['Fletching', 'Padded Archer Armor'],
  common: ['Fletching', 'Bodkin Arrow', 'Padded Archer Armor'],
};
const CAV: Record<string, readonly string[]> = {
  none: [],
  'attack-1': ['Forging'],
  armor: ['Scale Barding Armor'],
  common: ['Forging', 'Scale Barding Armor'],
};
export interface CastleProfile {
  unit: Unit;
  stats: SimStats;
  cost: Cost;
  fixed: Cost;
  fixedSeconds: number;
  unitSeconds: number;
  cycle: number;
  techs: Tech[];
  upgrade: Cost;
  upgradeSeconds: number;
}
export type CastleResult = { ok: true; value: CastleProfile } | { ok: false; status: 'blocked' | 'unavailable'; reason: string };
const cost = (value: unknown, keys: readonly string[]): value is Cost =>
  value != null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...keys].sort().join(',') &&
  Object.entries(value).every(([key, n]) => ['Food', 'Wood', 'Gold', 'Stone'].includes(key) && typeof n === 'number' && Number.isFinite(n) && n >= 0);
const validStats = (s: Pick<SimStats, 'hp' | 'atk' | 'ma' | 'pa' | 'rng' | 'spd' | 'rof'>) =>
  ['hp', 'atk', 'ma', 'pa', 'rng', 'spd', 'rof'].every((key) => Number.isFinite(s[key as keyof typeof s]) && s[key as keyof typeof s] >= 0) &&
  s.hp > 0 &&
  s.spd > 0 &&
  s.rof > 0;

/** Verified attributes/requirements are independent of the player's military budget. */
export function castleScenarioProfile(ctx: SceneContext, eco: SceneEco, civ: string, lane: Lane, cfg: SceneConfig): CastleResult {
  const fail = (reason: string, status: 'blocked' | 'unavailable' = 'blocked'): CastleResult => ({ ok: false, status, reason });
  if (!isSceneTechPlan(cfg.techPlan, lane)) return fail('科技方案未知或不适用于当前路位');
  const { core, trees } = ctx;
  const blocks = trees.t[civ];
  if (
    !Array.isArray(blocks) ||
    blocks.some(
      (b) =>
        !Array.isArray(b) ||
        !Number.isInteger(b[0]) ||
        !Number.isInteger(b[1]) ||
        b[1] < 0 ||
        !Array.isArray(b[3]) ||
        b[3].some((c) => !Array.isArray(c) || !['u', 't', 'b'].includes(c[2]) || !Number.isInteger(c[3]) || !Number.isFinite(c[4])),
    )
  )
    return fail('科技树关键结构缺失');
  const available = civStatus(trees, civ);
  const checkBuilding = (id: number): CastleResult | null => {
    const b = core.buildingById[id];
    if (!b || b.id !== id || !Array.isArray(b.civs) || !Number.isInteger(b.age) || b.age < 1) return fail('建筑身份或时代资料缺失');
    if (!b.civs.includes(civ) || !blocks.some((block) => block[0] === id) || b.age > cfg.age || buildingAge(b, civ, trees) > cfg.age)
      return fail('当前时代的建筑不可用', 'unavailable');
    return null;
  };
  const id = lane === 'flank' ? 24 : 38;
  const unit = core.unitById[id];
  const shape = review.units[String(id) as '24' | '38'];
  if (!unit || unit.id !== id || unit.age !== shape.age || unit.b !== shape.building || unit.from_ !== shape.from || !Array.isArray(unit.civs))
    return fail('单位身份、时代、建筑或升级谱系变化，需核验');
  if (!unit.civs.includes(civ) || available['u' + id] !== 1 || unit.age > cfg.age) return fail('此路线不可用', 'unavailable');
  const production = checkBuilding(unit.b);
  if (production) return production;
  if (
    !validStats(unit) ||
    !cost(unit.cost, shape.costKeys) ||
    !Array.isArray(unit.atks) ||
    !unit.atks.every((x) => Array.isArray(x) && x.length === 2 && typeof x[0] === 'string' && Number.isFinite(x[1])) ||
    !unit.atks.some((x) => x[0] === (lane === 'flank' ? '穿刺' : '近战'))
  )
    return fail('单位关键属性、攻击结构或费用缺失');

  let upgrade: Cost = {},
    upgradeSeconds = 0;
  if (id === 24) {
    const ancestor = core.unitById[4];
    if (
      !ancestor ||
      ancestor.id !== 4 ||
      ancestor.age !== 2 ||
      ancestor.b !== 87 ||
      ancestor.from_ !== null ||
      ancestor.up !== null ||
      !Array.isArray(ancestor.civs)
    )
      return fail('升级前身结构变化，需核验');
    if (!ancestor.civs.includes(civ) || available.u4 !== 1) return fail('升级前身不可用', 'unavailable');
    if (!Array.isArray(unit.up) || unit.up.length !== 2 || !cost(unit.up[0], review.upgradeCostKeys) || !Number.isFinite(unit.up[1]) || unit.up[1] < 0)
      return fail('单位升级费用或基础研究耗时缺失');
    [upgrade, upgradeSeconds] = unit.up;
  } else if (unit.up !== null) return fail('骑士出现未知升级费用');

  const names = lane === 'flank' ? BOW[cfg.techPlan]! : [...CAV[cfg.techPlan]!, ...(cfg.husbandry ? ['Husbandry'] : [])];
  const techs: Tech[] = [];
  for (const name of names) {
    const expected = review.techs[name as keyof typeof review.techs];
    const matches = core.techs.filter((t) => t.id === expected.id || t.en === name);
    const t = matches[0];
    if (
      matches.length !== 1 ||
      !t ||
      t.id !== expected.id ||
      t.en !== name ||
      t.age !== expected.age ||
      t.b !== expected.building ||
      t.pre !== expected.pre ||
      !Array.isArray(t.civs)
    )
      return fail('科技身份、时代、建筑或前置结构变化，需核验');
    if (t.cost && typeof t.cost === 'object' && !Array.isArray(t.cost) && Object.keys(t.cost).length === 0)
      return fail('此方案所需科技费用不可用', 'unavailable');
    if (!cost(t.cost, expected.costKeys) || !Number.isFinite(t.rt) || t.rt < 0) return fail('科技费用或基础研究耗时缺失');
    if (!t.civs.includes(civ) || available['t' + t.id] !== 1 || t.age > cfg.age) return fail('此方案所需科技不可用', 'unavailable');
    const building = checkBuilding(t.b);
    if (building) return building;
    techs.push(t);
  }
  const ids = new Set(techs.map((t) => t.id));
  if (techs.some((t) => t.pre !== null && !ids.has(t.pre))) return fail('科技方案缺少前置', 'unavailable');
  const sim = makeSimContext(core.techs, trees),
    offered = simTechs(sim, unit, civ);
  if (techs.some((t) => !offered.find((x) => x.t.id === t.id)?.ef)) return fail('此方案科技效果不可用', 'unavailable');
  const ownTeam = new Set(TEAM_BONUSES.flatMap((x, index) => (x[0] === civ ? [index] : [])));
  const stats = simulate(sim, unit, civ, cfg.age, ids, ownTeam);
  if (!validStats(stats)) return fail('有效属性不可核验');
  const discount = discountedCost(unit, civ, cfg.age, { techIds: ids });
  if (discount.unsupported.length || !cost(discount.cost, shape.costKeys)) return fail('折扣费用或机制不可核验');
  const fixed: Cost = { ...upgrade };
  for (const t of techs) for (const [key, value] of Object.entries(t.cost)) fixed[key] = (fixed[key] ?? 0) + value;

  const source = eco.units[id];
  if (!source || !Array.isArray(source.at) || source.at.length !== 1 || source.at[0] !== shape.building || source.class !== shape.class)
    return fail('生产建筑或单位类别来源变化，需核验');
  let cycle: number;
  if (source.timeAt !== undefined) {
    if (
      source.timeAt === null ||
      typeof source.timeAt !== 'object' ||
      Array.isArray(source.timeAt) ||
      Object.keys(source.timeAt).join(',') !== String(unit.b) ||
      !Number.isFinite(source.timeAt[unit.b]) ||
      source.timeAt[unit.b]! <= 0
    )
      return fail('按建筑训练周期缺失或结构变化');
    cycle = source.timeAt[unit.b]!;
  } else cycle = source.trainTime;
  const ages = AGE_BY_TECH;
  for (const entry of eco.civEco[civ] ?? []) {
    if (entry.age > cfg.age || (entry.requires ?? []).some((n) => (ages[n] ? ages[n]! > cfg.age : !ids.has(n)))) continue;
    for (const effect of entry.effects) {
      const train = effect.attr === 'trainTime' && (effect.target === 'unit:' + id || effect.target === 'class:' + source.class);
      const work = effect.attr === 'workRate' && effect.target === 'unit:' + unit.b;
      if (!train && !work) continue;
      if (effect.kind !== 'attr' || effect.op !== 'mul' || !Number.isFinite(effect.v) || effect.v! <= 0) return fail('训练效果数值不可核验');
      cycle = train ? cycle * effect.v! : cycle / effect.v!;
    }
  }
  if (!Number.isFinite(cycle) || cycle <= 0) return fail('训练周期缺失');
  const rates = gatherModel(3, '', { techIds: new Set(), walkTiles: 3, farmTiles: 0 });
  const fixedSeconds = realCost(fixed, rates).total,
    unitSeconds = realCost(discount.cost, rates).total;
  if (!Number.isFinite(fixedSeconds) || !Number.isFinite(unitSeconds) || unitSeconds <= 0) return fail('费用换算不可核验');
  return { ok: true, value: { unit, stats, cost: discount.cost, fixed, fixedSeconds, unitSeconds, cycle, techs, upgrade, upgradeSeconds } };
}
