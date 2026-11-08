/** Issue 652 两时代来源适配。审核见 docs/design/routes-652/REVIEW.md，结构变化必须重新审核。 */
import type { Cost, SimStats, Tech, Unit } from './types';
import { DAT } from './datEffects';
import { TEAM_BONUSES } from './effects';
import { applyEffects, civStatus, makeSimContext, simTechs, simulate } from './simulator';
import { discountedCost } from './costDiscount';
import { gatherModel, realCost } from './realCost';
import { reviewPayload, SCENE_ECO, type SceneContext } from './positionScenarios';
import { sceneSignature } from './positionScenarioMath';
import review from './routeReview.json';
import { AGE_BY_TECH } from './gameIds';

export const ROUTE_VERSION = 'feudal-castle-ledger-1';
export const FEUDAL_TECHS = { flank: ['Fletching', 'Padded Archer Armor'], pocket: ['Forging', 'Scale Barding Armor'] };
export const addCosts = (...costs: Cost[]): Cost => {
  const sum: Cost = {};
  for (const cost of costs) for (const [key, value] of Object.entries(cost)) sum[key] = (sum[key] ?? 0) + value;
  return sum;
};
export const scaleCost = (cost: Cost, n: number): Cost => Object.fromEntries(Object.entries(cost).map(([k, v]) => [k, v * n]));
/** 同一中性标准工秒计价，不是文明经济模拟，也不是跨时代经过时间。 */
export const routeWork = (cost: Cost) => realCost(cost, gatherModel(3, '', { techIds: new Set(), walkTiles: 3, farmTiles: 0 })).total;
const validCost = (cost: Cost | undefined | null, keys: readonly string[]): cost is Cost =>
  !!cost &&
  Object.keys(cost).sort().join(',') === [...keys].sort().join(',') &&
  Object.entries(cost).every(([k, v]) => ['Food', 'Wood', 'Gold', 'Stone'].includes(k) && Number.isFinite(v) && v >= 0);
export interface RouteProfile {
  unit: Unit;
  age: 2 | 3;
  stats: SimStats;
  cost: Cost;
  cycle: number;
  techs: Tech[];
  upgrade: Cost;
  upgradeSeconds: number;
}
type ProfileResult = { ok: true; value: RouteProfile } | { ok: false; reason: string };
export function routeCoverage(ctx: SceneContext, civ: string): string | null {
  const expected = (review.effects as Record<string, string>)[civ];
  if (!expected) return '此文明的两时代机制待核验';
  try {
    if (sceneSignature(reviewPayload(civ, ctx.eco ?? SCENE_ECO), true) !== expected) return '两时代效果结构变化，需重新核验';
  } catch {
    return '两时代效果来源不完整';
  }
  return null;
}
export function routeProfile(ctx: SceneContext, civ: string, unitId: number, age: 2 | 3, names: readonly string[]): ProfileResult {
  const fail = (reason: string): ProfileResult => ({ ok: false, reason });
  const gate = routeCoverage(ctx, civ);
  if (gate) return fail(gate);
  if (age !== 2 && age !== 3) return fail('时代不在本轮核验范围');
  const { core, trees } = ctx,
    eco = ctx.eco ?? SCENE_ECO;
  const unit = core.unitById[unitId],
    available = civStatus(trees, civ);
  const shape = (review.units as Record<string, { age: number; building: number; class: number; from: number | null; costKeys: string[] }>)[unitId];
  if (!unit || !shape || unit.age !== shape.age || unit.b !== shape.building || unit.from_ !== shape.from) return fail('单位时代、建筑或升级谱系变化，需核验');
  const buildingAvailable = (id: number) => {
    const b = core.buildingById[id];
    return !!b && b.civs.includes(civ) && Number.isInteger(b.age) && b.age >= 1 && b.age <= age;
  };
  if (unit.age > age || !unit.civs.includes(civ) || available['u' + unitId] !== 1 || !buildingAvailable(unit.b)) return fail('此时代的单位或生产建筑不可用');
  if (
    !validCost(unit.cost, shape.costKeys) ||
    !Array.isArray(unit.atks) ||
    !unit.atks.every((x) => Array.isArray(x) && x.length === 2 && typeof x[0] === 'string' && Number.isFinite(x[1])) ||
    !unit.atks.some((x) => x[0] === (unitId === 4 || unitId === 24 ? '穿刺' : '近战')) ||
    !Array.isArray(unit.cls) ||
    !['hp', 'atk', 'ma', 'pa', 'rng', 'spd', 'rof', 'acc', 'los', 'minr', 'tt'].every(
      (k) => Number.isFinite(unit[k as keyof Unit]) && Number(unit[k as keyof Unit]) >= 0,
    ) ||
    unit.hp <= 0 ||
    unit.spd <= 0 ||
    unit.rof <= 0
  )
    return fail('单位关键属性或费用缺失');
  const sim = makeSimContext(core.techs, trees),
    offered = simTechs(sim, unit, civ);
  const chosen = names.map((name) => offered.find((x) => x.t.en === name));
  if (new Set(names).size !== names.length || chosen.some((x) => !x?.ef)) return fail('此路线科技包不可用');
  const techs = chosen.map((x) => x!.t),
    ids = new Set(techs.map((t) => t.id));
  for (const t of techs) {
    const expected = (review.techs as Record<string, { id: number; age: number; building: number; pre: number | null; costKeys: string[] }>)[t.en];
    if (!expected || t.id !== expected.id || t.age !== expected.age || t.b !== expected.building || t.pre !== expected.pre)
      return fail('科技时代、建筑或前置结构变化，需核验');
    if (t.age > age || !t.civs.includes(civ) || !buildingAvailable(t.b) || (t.pre != null && !ids.has(t.pre))) return fail('科技时代、建筑或前置不可用');
    if (!validCost(t.cost, expected.costKeys) || !Number.isFinite(t.rt) || t.rt < 0) return fail('科技费用或基础研究耗时缺失');
  }
  let upgrade: Cost = {},
    upgradeSeconds = 0;
  if (unit.from_ != null) {
    const ancestor = core.unitById[unit.from_];
    if (
      !ancestor ||
      ancestor.id !== 4 ||
      ancestor.from_ !== null ||
      ancestor.age !== 2 ||
      ancestor.b !== 87 ||
      !ancestor.civs.includes(civ) ||
      available['u4'] !== 1
    )
      return fail('存量升级前身不可核验');
    if (!unit.up || !validCost(unit.up[0], review.upgradeCostKeys) || !Number.isFinite(unit.up[1]) || unit.up[1] < 0)
      return fail('全军升级费用或基础研究耗时缺失');
    [upgrade, upgradeSeconds] = unit.up;
  } else if (unit.up !== null) return fail('基础兵种出现未知升级费用');
  const source = eco.units[unitId];
  if (!source || !Array.isArray(source.at) || source.at.length !== 1 || source.at[0] !== shape.building || source.class !== shape.class)
    return fail('生产建筑或单位类别变化，需核验');
  if (
    source.timeAt != null &&
    (Object.keys(source.timeAt).join(',') !== String(unit.b) || !Number.isFinite(source.timeAt[unit.b]) || source.timeAt[unit.b]! <= 0)
  )
    return fail('按建筑训练周期缺失或结构变化');
  let cycle = source.timeAt?.[unit.b] ?? source.trainTime;
  const ageTechs = AGE_BY_TECH;
  for (const row of eco.civEco[civ] ?? []) {
    if (row.age > age || (row.requires ?? []).some((id) => (ageTechs[id] ? ageTechs[id]! > age : !ids.has(id)))) continue;
    for (const e of row.effects) {
      const train = e.attr === 'trainTime' && (e.target === `unit:${unitId}` || e.target === `class:${source.class}`);
      const work = e.attr === 'workRate' && e.target === `unit:${unit.b}`;
      if (!train && !work) continue;
      if (e.kind !== 'attr' || e.op !== 'mul' || !Number.isFinite(e.v) || e.v! <= 0) return fail('生产效果不可核验');
      cycle = train ? cycle * e.v! : cycle / e.v!;
    }
  }
  if (!Number.isFinite(cycle) || cycle <= 0) return fail('训练周期缺失');
  const discount = discountedCost(unit, civ, age, { techIds: ids });
  if (discount.unsupported.length || !validCost(discount.cost, shape.costKeys) || routeWork(discount.cost) <= 0) return fail('单位折扣不可核验');
  const team = new Set(TEAM_BONUSES.flatMap((x, i) => (x[0] === civ ? [i] : [])));
  // 侦骑封建自动提速先于城堡畜牧。旧通用模拟器把generic放在科技后，
  // 此已核验路线延后应用畜牧，避免对基础速度乘完再加封建增量。
  const husbandry = unitId === 448 ? chosen.find((x) => x?.t.en === 'Husbandry') : undefined;
  const beforeHusbandry = new Set(ids);
  if (husbandry) beforeHusbandry.delete(husbandry.t.id);
  const stats = simulate(sim, unit, civ, age, beforeHusbandry, team);
  if (husbandry?.ef) applyEffects(stats, husbandry.ef);
  if (
    ![stats.hp, stats.atk, stats.ma, stats.pa, stats.rng, stats.spd, stats.rof].every((x) => Number.isFinite(x) && x >= 0) ||
    stats.hp <= 0 ||
    stats.spd <= 0 ||
    stats.rof <= 0
  )
    return fail('时代与文明属性不可核验');
  return { ok: true, value: { unit, age, stats, cost: discount.cost, cycle, techs, upgrade, upgradeSeconds } };
}
export const routeSources = () => ({ model: ROUTE_VERSION, review: review.version, sources: DAT.meta.sources });
