/** issue 652 城堡时代限定情景。无胜率、无文明评分、无跨时代总分。 */
import type { Core } from '../data';
import ecoRaw from '../data/raw/eco';
import { DAT } from './datEffects';
import { TEAM_BONUSES, TECH_SRC, BONUS_SRC } from './effects';
import { civStatus, makeSimContext, simulate, simTechs } from './simulator';
import { discountedCost } from './costDiscount';
import { gatherModel, realCost } from './realCost';
import type { Cost, SimStats, Trees } from './types';
import type { Lane, StartChoice } from './startGame';
import { firstStrike, retreatContact, sceneSignature, supportArrival, SCENE_EPS } from './positionScenarioMath';
import reviewed from './positionScenarioReview.json';

export const SCENARIO_VERSION = 'castle-scenes-1';
export const SCENARIO_CIVS: Record<Lane, readonly string[]> = {
  flank: ['Britons', 'Ethiopians', 'Franks', 'Mayans', 'Vietnamese'],
  pocket: ['Berbers', 'Britons', 'Franks', 'Huns'],
};
export interface SceneConfig {
  age: number;
  budget: number;
  distance: number;
  deadline: number;
  reaction: number;
  room: number;
  mode: 'ready' | 'new';
  husbandry: boolean;
}
export const DEFAULT_SCENE: SceneConfig = { age: 3, budget: 12000, distance: 30, deadline: 120, reaction: 0.5, room: 0, mode: 'new', husbandry: true };
export const DEFAULT_FLANK_SCENE: SceneConfig = { ...DEFAULT_SCENE, distance: 12 };
interface EcoEffect {
  kind: string;
  attr?: string;
  target?: string;
  op?: string;
  v?: number;
}
interface EcoRow {
  age: number;
  requires?: number[];
  effects: EcoEffect[];
  source: string;
}
export interface SceneEco {
  units: Record<string, { trainTime: number; at: number[]; class?: number; timeAt?: Record<string, number> }>;
  civEco: Record<string, EcoRow[]>;
}
export const SCENE_ECO = ecoRaw as unknown as SceneEco;
export interface SceneContext {
  core: Core;
  trees: Trees;
  eco?: SceneEco;
}
export interface SceneRow {
  civ: string;
  status: 'ok' | 'unavailable' | 'blocked' | 'budget';
  reason: string;
  preferred: boolean;
  stats?: SimStats;
  count?: number;
  cost?: Cost;
  fixed?: Cost;
  fixedSeconds?: number;
  unitSeconds?: number;
  technologies?: { id: number; name: string; seconds: number }[];
  cycle?: number;
  opening?: NonNullable<ReturnType<typeof firstStrike>>;
  retreat?: number | null;
  support?: NonNullable<ReturnType<typeof supportArrival>>;
  signature?: string;
}
export function scenarioScope(choice: StartChoice): string | null {
  if (!choice.mode || !choice.mapId || !choice.teamSize || !choice.lane) return '请明确选择组队人数、地图和路位后查看场景建议。';
  if (choice.mode !== 'team' || choice.teamSize !== '4v4' || choice.mapId !== 'arabia') return '此模型仅支持阿拉伯 4v4；当前条件暂无机制建议。';
  return null;
}
const BOW_TECHS = ['Fletching', 'Bodkin Arrow', 'Padded Archer Armor'];
const CAV_TECHS = ['Forging', 'Scale Barding Armor'];
const ALL_TECHS = [...BOW_TECHS, ...CAV_TECHS, 'Husbandry'];
/** 限定运算的数值可更新，tiers时代键/目标/操作变化仍阻断。 */
export function reviewPayload(civ: string, eco = SCENE_ECO) {
  const discounts = (DAT.costDiscounts[civ] ?? []).map((d) => ({
    ...d,
    groups: d.groups.map((g) => ({ ...g, tiers: Object.fromEntries(Object.keys(g.tiers).map((k) => [k, '#number'])) })),
  }));
  return {
    sources: { techs: ALL_TECHS.map((t) => TECH_SRC[t]), bonus: BONUS_SRC[civ] },
    civ: DAT.civs[civ],
    techs: ALL_TECHS.map((t) => DAT.techs[t]),
    generic: DAT.generic,
    discounts,
    production: eco.civEco[civ],
  };
}
export function coverageReason(civ: string, eco = SCENE_ECO): string | null {
  const expected = (reviewed as Record<string, string>)[civ];
  if (!expected) return '机制待核验，暂不参与建议';
  try {
    if (sceneSignature(reviewPayload(civ, eco), true) !== expected) return '效果结构变化，需重新核验';
  } catch {
    return '效果结构不完整，需重新核验';
  }
  return null;
}
const validCost = (cost: Cost | null | undefined): cost is Cost =>
  !!cost &&
  Object.keys(cost).length > 0 &&
  Object.entries(cost).every(([k, v]) => ['Food', 'Wood', 'Gold', 'Stone'].includes(k) && Number.isFinite(v) && v >= 0);
function profile(ctx: SceneContext, civ: string, lane: Lane, cfg: SceneConfig): SceneRow {
  const fail = (status: SceneRow['status'], reason: string): SceneRow => ({ civ, status, reason, preferred: false });
  const { core, trees } = ctx,
    eco = ctx.eco ?? SCENE_ECO;
  if (cfg.age !== 3) return fail('blocked', '仅验证城堡时代');
  if (![cfg.budget, cfg.distance, cfg.deadline, cfg.reaction, cfg.room].every((x) => Number.isFinite(x) && x >= 0)) return fail('blocked', '场景参数无效');
  const unit = core.unitById[lane === 'flank' ? 24 : 38];
  const available = civStatus(trees, civ);
  if (!unit || !unit.civs.includes(civ) || available['u' + unit.id] !== 1) return fail('unavailable', '此路线不可用');
  const gate = coverageReason(civ, eco);
  if (gate) return fail('blocked', gate);
  if (!Number.isInteger(unit.age) || unit.age < 1 || unit.age > cfg.age || !core.buildingById[unit.b]?.civs.includes(civ))
    return fail('unavailable', '单位或建筑尚不可用');
  if (
    !['hp', 'atk', 'ma', 'pa', 'rng', 'spd', 'rof', 'acc'].every((k) => Number.isFinite(unit[k as keyof typeof unit])) ||
    unit.spd <= 0 ||
    unit.rof <= 0 ||
    !validCost(unit.cost)
  )
    return fail('blocked', '单位关键属性或费用缺失');
  if (!Array.isArray(unit.atks) || !(unit.from_ === null || Number.isInteger(unit.from_))) return fail('blocked', '单位结构或升级来源缺失');
  const sim = makeSimContext(core.techs, trees),
    offered = simTechs(sim, unit, civ);
  const names = lane === 'flank' ? BOW_TECHS : [...CAV_TECHS, ...(cfg.husbandry ? ['Husbandry'] : [])];
  const selected = offered.filter((x) => names.includes(x.t.en));
  if (
    selected.length !== names.length ||
    selected.some(
      (x) => !x.ef || !Number.isInteger(x.t.age) || x.t.age < 1 || x.t.age > cfg.age || !validCost(x.t.cost) || !Number.isFinite(x.t.rt) || x.t.rt < 0,
    )
  )
    return fail('unavailable', '共同科技包不可用或费用缺失');
  const ids = new Set(selected.map((x) => x.t.id));
  if (selected.some((x) => x.t.pre != null && !ids.has(x.t.pre))) return fail('unavailable', '科技前置不完整');
  const fixed: Cost = {};
  const add = (c: Cost) => {
    for (const [k, v] of Object.entries(c)) fixed[k] = (fixed[k] ?? 0) + v;
  };
  selected.forEach((x) => add(x.t.cost));
  let ancestor = unit;
  const visited = new Set<number>();
  while (ancestor.from_ != null) {
    if (visited.has(ancestor.id) || !ancestor.up || !validCost(ancestor.up[0]) || !Number.isFinite(ancestor.up[1]) || ancestor.up[1] < 0)
      return fail('blocked', '升级链费用缺失或循环');
    visited.add(ancestor.id);
    add(ancestor.up[0]);
    const previous = core.unitById[ancestor.from_];
    if (
      !previous ||
      available['u' + previous.id] !== 1 ||
      !Number.isInteger(previous.age) ||
      previous.age < 1 ||
      previous.age > cfg.age ||
      !(previous.from_ === null || Number.isInteger(previous.from_))
    )
      return fail('unavailable', '升级路线不可用');
    ancestor = previous;
  }
  const ownTeam = new Set(TEAM_BONUSES.flatMap((x, i) => (x[0] === civ ? [i] : [])));
  const stats = simulate(sim, unit, civ, 3, ids, ownTeam);
  if (![stats.spd, stats.rof, stats.rng].every(Number.isFinite) || stats.spd <= 0 || stats.rof <= 0 || stats.rng < 0)
    return fail('blocked', '有效属性不可核验');
  const discount = discountedCost(unit, civ, 3, { techIds: ids });
  if (discount.unsupported.length || !validCost(discount.cost)) return fail('blocked', '折扣机制不可核验');
  const source = eco.units[unit.id];
  if (!source || !Array.isArray(source.at) || !source.at.includes(unit.b)) return fail('blocked', '训练来源缺失');
  let cycle = source.timeAt?.[unit.b] ?? source.trainTime;
  // 已核验的样本只需这两类生产乘法；与production一致，自身团队仅一次。
  for (const row of eco.civEco[civ] ?? []) {
    if (row.age > 3 || (row.requires ?? []).some((id) => ![101, 102, 103].includes(id) && !ids.has(id))) continue;
    for (const e of row.effects) {
      const train = e.attr === 'trainTime' && (e.target === `unit:${unit.id}` || e.target === `class:${source.class}`);
      const work = e.attr === 'workRate' && e.target === `unit:${unit.b}`;
      if (!train && !work) continue;
      if (e.kind !== 'attr' || e.op !== 'mul' || !Number.isFinite(e.v) || e.v! <= 0) return fail('blocked', '训练效果数值不可核验');
      cycle = train ? cycle * e.v! : cycle / e.v!;
    }
  }
  if (!Number.isFinite(cycle) || cycle <= 0) return fail('blocked', '训练周期缺失');
  const rates = gatherModel(3, '', { techIds: new Set(), walkTiles: 3, farmTiles: 0 });
  const fixedSeconds = realCost(fixed, rates).total,
    unitSeconds = realCost(discount.cost, rates).total;
  if (!Number.isFinite(fixedSeconds) || !Number.isFinite(unitSeconds) || unitSeconds <= 0) return fail('blocked', '成本换算缺失');
  const count = Math.max(0, Math.floor((cfg.budget - fixedSeconds) / unitSeconds));
  return {
    civ,
    status: count ? 'ok' : 'budget',
    reason: count ? '' : '预算不足以完成科技包并购买一兵',
    preferred: false,
    stats,
    count,
    fixed,
    cost: discount.cost,
    fixedSeconds,
    unitSeconds,
    cycle,
    technologies: selected.map((x) => ({ id: x.t.id, name: x.t.zh, seconds: x.t.rt })),
    signature: sceneSignature({ unit, fixed, stats, cycle, cost: discount.cost, rates: rates.rate, cfg, source: reviewPayload(civ, eco) }),
  };
}
export function scenarioRows(ctx: SceneContext, lane: Lane, cfg: SceneConfig): SceneRow[] {
  const target = lane === 'flank' ? profile(ctx, 'Franks', 'flank', cfg) : null;
  const rows = SCENARIO_CIVS[lane].map((civ) => {
    const row = profile(ctx, civ, lane, cfg);
    if (row.status !== 'ok' && row.status !== 'budget') return row;
    if (lane === 'flank') {
      if (!target?.stats || target.status === 'blocked' || target.status === 'unavailable')
        return { ...row, status: 'blocked' as const, reason: '参考目标机制不可核验' };
      const opening = firstStrike(row.stats!.rng, row.stats!.rof, target.stats.rng, target.stats.spd, cfg.distance, cfg.reaction);
      if (!opening) return { ...row, status: 'blocked' as const, reason: '先手参数不可核验' };
      return { ...row, opening, retreat: retreatContact(row.stats!.rng, target.stats.rng, target.stats.spd, row.stats!.spd, cfg.reaction, cfg.room) };
    }
    const support = supportArrival(row.stats!.spd, row.cycle!, row.count!, cfg.distance, cfg.deadline, cfg.mode);
    return support ? { ...row, support } : { ...row, status: 'blocked' as const, reason: '支援参数不可核验' };
  });
  const usable = rows.filter((r) => r.status === 'ok' && (lane === 'flank' ? r.count! > 0 : (r.support?.count ?? 0) > 0));
  const metrics = (r: SceneRow) => (lane === 'flank' ? [r.count!, r.opening!.opportunities] : [r.support!.count, -r.support!.first!]);
  for (const row of usable) {
    const mine = metrics(row);
    row.preferred = !usable.some((other) => {
      const them = metrics(other);
      return them.every((v, i) => v >= mine[i]! - SCENE_EPS) && them.some((v, i) => v > mine[i]! + SCENE_EPS);
    });
  }
  return rows.sort((a, b) => Number(b.preferred) - Number(a.preferred) || a.civ.localeCompare(b.civ));
}
export function scenarioVersion() {
  return { model: SCENARIO_VERSION, config: 'arabia-castle-1', sources: DAT.meta.sources };
}
