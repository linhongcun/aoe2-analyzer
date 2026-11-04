/** Issue 652 两阶段军事账本。追加预算与封建支出独立记账，存量不重购、不退款。 */
import type { Cost } from './types';
import type { Lane } from './startGame';
import { SCENARIO_CIVS, type SceneContext } from './positionScenarios';
import { SCENE_EPS, sceneSignature, supportArrival } from './positionScenarioMath';
import { addCosts, scaleCost, routeWork, routeProfile, FEUDAL_TECHS, ROUTE_VERSION, type RouteProfile } from './routeProfiles';

import type { RouteConfig } from './startGameInputs';
export { DEFAULT_ROUTE, type RouteConfig } from './startGameInputs';
export interface RouteLedger {
  budget: number;
  required: Cost;
  fixedWork: number;
  packagePaid: boolean;
  count: number;
  spent: Cost;
  spentWork: number;
  unused: number;
  shortfall: number;
}
export function militaryLedger(budget: number, required: Cost, cost: Cost, limit: number, wanted: boolean): RouteLedger {
  const fixedWork = routeWork(required),
    unitWork = routeWork(cost);
  const packagePaid = wanted && budget + SCENE_EPS >= fixedWork;
  const count = packagePaid ? Math.min(limit, Math.max(0, Math.floor((budget - fixedWork) / unitWork + SCENE_EPS))) : 0;
  const spent = packagePaid ? addCosts(required, scaleCost(cost, count)) : {};
  const spentWork = routeWork(spent);
  return {
    budget,
    required,
    fixedWork,
    packagePaid,
    count,
    spent,
    spentWork,
    unused: Math.max(0, budget - spentWork),
    shortfall: wanted ? Math.max(0, fixedWork - budget) : 0,
  };
}
export interface AgeRoute {
  ok: true;
  civ: string;
  reference: boolean;
  feudal: RouteProfile;
  castle: RouteProfile;
  retained: RouteProfile;
  feudalLedger: RouteLedger;
  castleLedger: RouteLedger;
  survivors: number;
  upgraded: number;
  newCount: number;
  newTechs: RouteProfile['techs'];
  cumulative: Cost;
  cumulativeWork: number;
  earlySupport: NonNullable<ReturnType<typeof supportArrival>>;
  newSupport: NonNullable<ReturnType<typeof supportArrival>>;
  retainedSupport: { count: number; first: number | null };
  signature: string;
}
export type AgeRouteRow = AgeRoute | { ok: false; civ: string; reason: string };
const bounded = (n: number, max: number, integer = false) => Number.isFinite(n) && n >= 0 && n <= max && (!integer || Number.isInteger(n));
export function ageRoute(ctx: SceneContext, civ: string, lane: Lane, cfg: RouteConfig): AgeRouteRow {
  const fail = (reason: string): AgeRouteRow => ({ ok: false, civ, reason });
  if (!SCENARIO_CIVS[lane]?.includes(civ)) return fail('此路位的两时代样本尚未核验');
  if (
    !bounded(cfg.feudalBudget, 1e6) ||
    !bounded(cfg.castleBudget, 1e6) ||
    !bounded(cfg.survivors, 100, true) ||
    !bounded(cfg.newLimit, 100, true) ||
    !bounded(cfg.distance, 1000) ||
    !bounded(cfg.deadline, 3600) ||
    typeof cfg.husbandry !== 'boolean'
  )
    return fail('路线参数无效或超出范围');
  const fromId = lane === 'flank' ? 4 : 448,
    toId = lane === 'flank' ? 24 : 38;
  const earlyNames = FEUDAL_TECHS[lane];
  const lateNames = [...earlyNames, ...(lane === 'flank' ? ['Bodkin Arrow'] : cfg.husbandry ? ['Husbandry'] : [])];
  const early = routeProfile(ctx, civ, fromId, 2, earlyNames),
    late = routeProfile(ctx, civ, toId, 3, lateNames);
  if (!early.ok) return fail('封建阶段：' + early.reason);
  if (!late.ok) return fail('城堡阶段：' + late.reason);
  const feudal = early.value,
    castle = late.value;
  const feudalLedger = militaryLedger(cfg.feudalBudget, addCosts(...feudal.techs.map((t) => t.cost)), feudal.cost, Number.MAX_SAFE_INTEGER, true);
  const survivors = Math.min(cfg.survivors, feudalLedger.count);
  const paidIds = new Set(feudalLedger.packagePaid ? feudal.techs.map((t) => t.id) : []);
  const neededTechs = castle.techs.filter((t) => !paidIds.has(t.id));
  const wantsTransition = lane === 'flank' ? survivors > 0 || cfg.newLimit > 0 : cfg.newLimit > 0;
  const required = addCosts(...neededTechs.map((t) => t.cost), ...(lane === 'flank' ? [castle.upgrade] : []));
  const castleLedger = militaryLedger(cfg.castleBudget, required, castle.cost, cfg.newLimit, wantsTransition);
  const newTechs = castleLedger.packagePaid ? neededTechs : [];
  const retainedId = lane === 'flank' && castleLedger.packagePaid ? toId : fromId;
  const actualNames = castleLedger.packagePaid ? lateNames : feudalLedger.packagePaid ? earlyNames : [];
  const kept = routeProfile(ctx, civ, retainedId, 3, actualNames);
  if (!kept.ok) return fail('保留部队：' + kept.reason);
  const retained = kept.value,
    upgraded = lane === 'flank' && castleLedger.packagePaid ? survivors : 0;
  const cumulative = addCosts(feudalLedger.spent, castleLedger.spent);
  const earlySupport = supportArrival(feudal.stats.spd, feudal.cycle, feudalLedger.count, cfg.distance, cfg.deadline, 'new')!;
  const newSupport = supportArrival(castle.stats.spd, castle.cycle, castleLedger.count, cfg.distance, cfg.deadline, 'new')!;
  const travel = cfg.distance / retained.stats.spd;
  const retainedSupport = { count: travel <= cfg.deadline + SCENE_EPS ? survivors : 0, first: survivors > 0 ? travel : null };
  return {
    ok: true,
    civ,
    reference: lane === 'flank' ? civ === 'Franks' : civ === 'Britons',
    feudal,
    castle,
    retained,
    feudalLedger,
    castleLedger,
    survivors,
    upgraded,
    newCount: castleLedger.count,
    newTechs,
    cumulative,
    cumulativeWork: routeWork(cumulative),
    earlySupport,
    newSupport,
    retainedSupport,
    signature: sceneSignature({ model: ROUTE_VERSION, cfg, feudal, castle, retained, feudalLedger, castleLedger, survivors }),
  };
}
export const ageRoutes = (ctx: SceneContext, lane: Lane, cfg: RouteConfig) => SCENARIO_CIVS[lane].map((civ) => ageRoute(ctx, civ, lane, cfg));
