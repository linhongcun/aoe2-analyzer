/** issue 652 城堡时代限定情景。无胜率、无文明评分、无跨时代总分。 */
import type { Core } from '../data';
import { ECO } from '../data/eco';
import { DAT } from './datEffects';
import { TECH_SRC, BONUS_SRC } from './effects';
import type { Cost, SimStats, Trees } from './types';
import type { Lane, StartChoice } from './startGame';
import { firstStrike, retreatContact, sceneSignature, supportArrival, SCENE_EPS } from './positionScenarioMath';
import { affordableCount } from './scenarioBudget';
import reviewed from './positionScenarioReview.json';
import { castleScenarioProfile, type CastleProfile, type CastleResult } from './castleScenarioProfile';
import { isSceneTechPlan, sceneTechPlans, type SceneTechPlan } from './startGameInputs';

export const SCENARIO_VERSION = 'castle-scenes-2';
export const SCENARIO_CIVS: Record<Lane, readonly string[]> = {
  flank: ['Britons', 'Ethiopians', 'Franks', 'Mayans', 'Vietnamese'],
  pocket: ['Berbers', 'Britons', 'Franks', 'Huns'],
};
import type { SceneConfig } from './startGameInputs';
export { DEFAULT_SCENE, DEFAULT_FLANK_SCENE, type SceneConfig } from './startGameInputs';
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
export const SCENE_ECO: SceneEco = ECO;
export interface SceneContext {
  core: Core;
  trees: Trees;
  eco?: SceneEco;
}
export interface SceneRow {
  civ: string;
  plan: SceneTechPlan;
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
  funding?: 'fixed-shortfall' | 'no-unit' | 'funded';
  fixedShortfall?: number;
  upgrade?: Cost;
  upgradeSeconds?: number;
  facts?: SceneFact[];
  explanation?: string;
  target?: SceneReference;
  baseline?: SceneReference & { unitSeconds: number; cycle: number };
}
export interface SceneFact {
  kind: string;
  label: string;
  unit: string;
  own: number;
  baseline: number;
  baselineCiv: string;
}
export interface SceneReference {
  civ: string;
  plan: SceneTechPlan;
  stats: Pick<SimStats, 'hp' | 'rng' | 'spd' | 'rof'>;
  signature: string;
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

function profileFor(ctx: SceneContext, civ: string, lane: Lane, cfg: SceneConfig): CastleResult {
  const invalid = (reason: string): CastleResult => ({ ok: false, status: 'blocked', reason });
  if (lane !== 'flank' && lane !== 'pocket') return invalid('路位未知');
  if (cfg.age !== 3) return invalid('仅验证城堡时代');
  if (
    ![cfg.budget, cfg.distance, cfg.deadline, cfg.reaction, cfg.room].every((n) => Number.isFinite(n) && n >= 0) ||
    !['new', 'ready'].includes(cfg.mode) ||
    typeof cfg.husbandry !== 'boolean' ||
    !isSceneTechPlan(cfg.techPlan, lane)
  )
    return invalid('场景参数或科技方案无效');
  const eco = ctx.eco ?? SCENE_ECO;
  const gate = coverageReason(civ, eco);
  return gate ? invalid(gate) : castleScenarioProfile(ctx, eco, civ, lane, cfg);
}
function profileSignature(ctx: SceneContext, civ: string, profile: CastleProfile) {
  return sceneSignature({ profile, source: reviewPayload(civ, ctx.eco ?? SCENE_ECO) });
}
function reference(ctx: SceneContext, civ: string, plan: SceneTechPlan, profile: CastleProfile): SceneReference {
  const { hp, rng, spd, rof } = profile.stats;
  return { civ, plan, stats: { hp, rng, spd, rof }, signature: profileSignature(ctx, civ, profile) };
}
export function scenarioProfile(ctx: SceneContext, civ: string, lane: Lane, cfg: SceneConfig): SceneRow {
  const result = profileFor(ctx, civ, lane, cfg);
  if (!result.ok) return { civ, plan: cfg.techPlan, status: result.status, reason: result.reason, preferred: false };
  const p = result.value;
  const { paid, count } = affordableCount(cfg.budget, p.fixedSeconds, p.unitSeconds);
  const funding = !paid ? 'fixed-shortfall' : count ? 'funded' : 'no-unit';
  const reason = count ? '' : !paid ? '当前方案固定投入不足，预算不足以完成所选科技及单位升级。' : '当前方案可付固定投入，剩余不足一兵。';
  return {
    civ,
    plan: cfg.techPlan,
    status: count ? 'ok' : 'budget',
    reason,
    preferred: false,
    funding,
    fixedShortfall: Math.max(0, p.fixedSeconds - cfg.budget),
    count,
    ...(count ? { stats: p.stats } : {}),
    cost: p.cost,
    fixed: p.fixed,
    fixedSeconds: p.fixedSeconds,
    unitSeconds: p.unitSeconds,
    cycle: p.cycle,
    technologies: p.techs.map((t) => ({ id: t.id, name: t.zh, seconds: t.rt })),
    upgrade: p.upgrade,
    upgradeSeconds: p.upgradeSeconds,
    signature: sceneSignature({ model: SCENARIO_VERSION, cfg, profile: profileSignature(ctx, civ, p), count, funding }),
  };
}
function deriveFacts(own: SceneRow, baselineCiv: string, p: CastleProfile): SceneFact[] {
  if (!own.stats || own.status !== 'ok') return [];
  const facts: SceneFact[] = [];
  const add = (kind: string, label: string, unit: string, a: number, b: number, lower = false) => {
    if (Number.isFinite(a) && Number.isFinite(b) && (lower ? a < b - SCENE_EPS : a > b + SCENE_EPS))
      facts.push({ kind, label, unit, own: a, baseline: b, baselineCiv });
  };
  add('range', '射程', '格', own.stats.rng, p.stats.rng);
  add('unit-cost', '单兵标准费用', '工秒', own.unitSeconds!, p.unitSeconds, true);
  add('attack-period', '攻击周期', '秒', own.stats.rof, p.stats.rof, true);
  add('health', '生命', '', own.stats.hp, p.stats.hp);
  add('production', '训练周期', '秒', own.cycle!, p.cycle, true);
  add('speed', '行军速度', '格/秒', own.stats.spd, p.stats.spd);
  return facts;
}
function explain(row: SceneRow, lane: Lane) {
  if (row.status !== 'ok' || !row.count) return row.reason;
  const kinds = new Set(row.facts?.map((f) => f.kind));
  const parts: string[] = [];
  if (lane === 'flank') {
    if (kinds.has('range')) parts.push('同方案下步弓射程更远，可围绕当前距离展开。');
    if (kinds.has('unit-cost')) parts.push('按标准工秒折算，当前步弓费用更低。');
    if (kinds.has('attack-period')) parts.push('步弓攻击周期更短、射速更快；不等于实际命中伤害。');
    if (kinds.has('health')) parts.push('步弓生命更高，生命未参与人数和机会分组。');
    if (!parts.length) parts.push('当前条件按人数与理论机会比较，不判断整局强度。');
    const chances = row.opening?.opportunities;
    parts.push(chances == null ? '本条件先手机会未核实。' : chances > 0 ? '本条件有理论先手机会。' : '本条件无先手机会。');
  } else {
    if ((row.support?.count ?? 0) === 0) return '当前方案有可负担部队，但本期限到场为零；可调整距离或观察期限。';
    if (kinds.has('unit-cost')) parts.push('按标准工秒折算，当前马厩单位费用更低。');
    if (kinds.has('production')) parts.push('马厩工作更快，当前训练周期更短；不保证每个期限必多一兵。');
    if (kinds.has('speed')) parts.push('当前行军速度更快，收益仍取决于距离和期限。');
    if (kinds.has('health')) parts.push('骑兵生命更高，但到场分组未计耐久。');
    if (!parts.length) parts.push('按当前方案比较可负担部队的到场数量与首兵时间。');
  }
  return parts.join('');
}
export function scenarioRows(ctx: SceneContext, lane: Lane, cfg: SceneConfig): SceneRow[] {
  const target = lane === 'flank' ? profileFor(ctx, 'Franks', lane, { ...cfg, techPlan: 'common' }) : null;
  const baselineCiv = lane === 'flank' ? 'Franks' : 'Britons';
  const neutral = profileFor(ctx, baselineCiv, lane, cfg);
  const rows = SCENARIO_CIVS[lane].map((civ) => {
    let row = scenarioProfile(ctx, civ, lane, cfg);
    if (target?.ok) row.target = reference(ctx, 'Franks', 'common', target.value);
    if (neutral.ok) {
      row.baseline = { ...reference(ctx, baselineCiv, cfg.techPlan, neutral.value), unitSeconds: neutral.value.unitSeconds, cycle: neutral.value.cycle };
      row.facts = deriveFacts(row, baselineCiv, neutral.value);
    }
    if (row.status === 'ok') {
      if (lane === 'flank') {
        if (!target?.ok) row = { ...row, status: 'blocked', reason: '场景参考目标机制不可核验' };
        else {
          const p = target.value.stats;
          const opening = firstStrike(row.stats!.rng, row.stats!.rof, p.rng, p.spd, cfg.distance, cfg.reaction);
          row = opening
            ? { ...row, opening, retreat: retreatContact(row.stats!.rng, p.rng, p.spd, row.stats!.spd, cfg.reaction, cfg.room) }
            : { ...row, status: 'blocked', reason: '先手参数不可核验' };
        }
      } else {
        const support = supportArrival(row.stats!.spd, row.cycle!, row.count!, cfg.distance, cfg.deadline, cfg.mode);
        row = support ? { ...row, support } : { ...row, status: 'blocked', reason: '支援参数不可核验' };
      }
    }
    row.explanation = explain(row, lane);
    if (!neutral.ok) row.explanation += `同方案解释对照不可核验：${neutral.reason}。`;
    row.signature = sceneSignature({
      model: SCENARIO_VERSION,
      config: 'arabia-castle-2',
      cfg,
      own: row.signature,
      target: row.target ?? null,
      baseline: row.baseline ?? null,
      facts: row.facts ?? [],
      baselineStatus: neutral.ok ? 'ok' : neutral.reason,
      status: row.status,
      count: row.count,
      funding: row.funding,
      opening: row.opening ?? null,
      support: row.support ?? null,
    });
    return row;
  });
  const usable = rows.filter((r) => r.status === 'ok' && (lane === 'flank' ? r.count! > 0 : (r.support?.count ?? 0) > 0));
  const metrics = (r: SceneRow) => (lane === 'flank' ? [r.count!, r.opening!.opportunities] : [r.support!.count, -r.support!.first!]);
  for (const row of usable) {
    const mine = metrics(row);
    row.preferred = !usable.some((other) => {
      const theirs = metrics(other);
      return theirs.every((v, i) => v >= mine[i]! - SCENE_EPS) && theirs.some((v, i) => v > mine[i]! + SCENE_EPS);
    });
  }
  return rows.sort((a, b) => Number(b.preferred) - Number(a.preferred) || a.civ.localeCompare(b.civ));
}
export function scenarioComparisons(ctx: SceneContext, lane: Lane, cfg: SceneConfig): Record<string, SceneRow[]> {
  const result = Object.fromEntries(SCENARIO_CIVS[lane].map((civ) => [civ, [] as SceneRow[]]));
  for (const techPlan of sceneTechPlans(lane)) for (const row of scenarioRows(ctx, lane, { ...cfg, techPlan })) result[row.civ]!.push(row);
  return result;
}
export function scenePlanOptions(ctx: SceneContext, lane: Lane): { id: SceneTechPlan; label: string }[] {
  const names: Record<string, readonly number[]> =
    lane === 'flank'
      ? { none: [], 'attack-1': [199], 'attack-2': [199, 200], armor: [211], 'attack-1-armor': [199, 211], common: [199, 200, 211] }
      : { none: [], 'attack-1': [67], armor: [81], common: [67, 81] };
  return sceneTechPlans(lane).map((id) => ({
    id,
    label:
      id === 'none'
        ? lane === 'flank'
          ? '无可选弓线科技'
          : '无锻造/鳞甲，畜牧按所选状态'
        : names[id]!.map((n) => ctx.core.techById[n]?.zh ?? '科技资料待核验').join(' + '),
  }));
}
export function scenarioVersion() {
  return { model: SCENARIO_VERSION, config: 'arabia-castle-2', sources: DAT.meta.sources };
}
