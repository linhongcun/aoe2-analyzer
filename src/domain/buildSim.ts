import type { GurjaraRawTech } from './gurjaraEconomy';
import type { RomanFarm, RomanRawTech, RomanRawTree, RomanRawTeam } from './romanEconomy';
import { polishStoneGold, type PolishInfrastructure, type PolishRawTech } from './polishEconomy';
export { civSimNotes } from './buildSimNotes';
import {
  civMechanism,
  mechanismAssumptions,
  mechanismFarmRate,
  rowApplication,
  mechanismRowAllowed,
  mechanismTeamRowAllowed,
  mechanismGatherMarkerAllowed,
} from './buildSimMechanisms';
import { TC_BY_AGE, applyMod, baseMods, RES_START, RES_HUNT_FOOD, applyEffects } from './buildSimEffects';
import { foragerWoodIncome, lumberFoodIncome, varangianGoldIncome, hasUniqueMayanTree } from './buildSimCivRules';
import { simScope, techAtomicOk, simSupport } from './buildSimCoverage';
export { pushMod, applyMod, type NumMod } from './buildSimEffects';
export { SHU_KNIGHT_TEMPLATE_NOTE, MAYAN_CAVALRY_TEMPLATE_NOTE } from './buildSimCivRules';
export {
  simScope,
  classifyCivEffect,
  techAtomicOk,
  simSupport,
  unhandledEffects,
  unknownCivEffects,
  IRRELEVANT_RES,
  UNHANDLED_RES,
  SOURCE_PENDING_CIVS,
  type EffectClass,
} from './buildSimCoverage';
/**
 * M2 开局时间线模拟（纯函数、确定性：无随机数，固定 0.1 秒步长，同输入同输出）。
 * 输入：开局（M1 BuildOrder）+ 文明 + 参数；游戏数值全部来自 src/data/eco.json（DE .dat 导出）。
 * 输出字段与 #3 交互稿第 4 节草案对齐（BuildTimeline / TimelineStep / Anomaly），差异见 docs/BUILD-SIM.md。
 */
import type { Action, BuildOrder, Task } from './buildOrder';
import { buildOrders as ALL_BOS } from '../data/buildOrders';
import { roundHalfPrice } from './roundHalfPrice';

import { weiRewardsForCompletedResearch, type WeiSpawnContext } from './weiEconomy';
import { bengaliRewardsForReachedAge, type BengaliSpawnContext } from './bengaliEconomy';
import { armenianResearchBonus, armenianResearchSites, armenianSiteName, type ArmenianInfrastructure, type ArmenianRawTech } from './armenianEconomy';
import { georgianResearchSites, type GeorgianInfrastructure, type GeorgianRawTech } from './georgianEconomy';

import { type SlavicFarm, type SlavicRawTree, type SlavicRawTech } from './slavicEconomy';

import { type KhmerFarm, type KhmerPrerequisites, type KhmerRawTech, type KhmerRawTree, type KhmerRawTeam } from './khmerEconomy';

import type { JurchenRawTech } from './jurchenEconomy';
import type { ChineseRawTech } from './chineseEconomy';
import { mapucheForagerFood, type MapucheInfrastructure, type MapucheRawTech } from './mapucheEconomy';

export type Res = 'food' | 'wood' | 'gold' | 'stone';
export type Stock = Record<Res, number>;
type Cost = Partial<Record<'Food' | 'Wood' | 'Gold' | 'Stone', number>>;
export interface EffectRow {
  source: string;
  age: number;
  tech?: number;
  requires?: number[];
  spawn?: WeiSpawnContext;
  ageSpawn?: BengaliSpawnContext;
  armenianTech?: ArmenianRawTech;
  georgianTech?: GeorgianRawTech;
  slavicTree?: SlavicRawTree;
  slavicTech?: SlavicRawTech;
  khmerTech?: KhmerRawTech;
  jurchenTech?: JurchenRawTech;
  chineseTech?: ChineseRawTech;
  mapucheTech?: MapucheRawTech;
  gurjaraTech?: GurjaraRawTech;
  romanTech?: RomanRawTech;
  romanTree?: RomanRawTree;
  romanTeam?: RomanRawTeam;
  polesTech?: PolishRawTech;
  khmerTree?: KhmerRawTree;
  khmerTeam?: KhmerRawTeam;
  effects: { kind: string; target?: string; attr?: string; op?: string; v?: number; res?: number; tech?: number; techName?: string }[];
}
/** eco.json 中模拟需要的部分 */
export interface EcoData {
  romanFarm?: RomanFarm;
  polesInfrastructure?: PolishInfrastructure;
  mapucheInfrastructure?: MapucheInfrastructure;
  armenianInfrastructure?: ArmenianInfrastructure;
  georgianInfrastructure?: GeorgianInfrastructure;
  slavicFarm?: SlavicFarm;
  khmerFarm?: KhmerFarm;
  khmerPrerequisites?: KhmerPrerequisites;
  fishingShip?: { unit: number; workRate: number; carry: number; speed: number; deepFishMultiplier?: number };
  villager: { trainTime: number; cost: Cost; speed: number; carry: number; tasks: Record<string, { workRate: number; carry: number }> };
  units: Record<string, { trainTime: number; at: number[]; cost: Cost; timeAt?: Record<string, number>; class?: number }>;
  buildings: Record<string, { buildTime: number; cost: Cost; class?: number }>;
  techs: Record<string, { researchTime: number; at: number; cost: Cost }>;
  ecoTechs: Record<string, { effects: EffectRow['effects']; at?: string }>;
  civEco: Record<string, EffectRow[]>;
  /** 升级时代前置建筑条件树（scripts/eco_build.py 从 .dat 时代科技 101/102/103 的前置展开；缺省视为无条件） */
  ageReq?: Record<string, { tech: number; req: AgeReqNode | null }>;
  /** 猎物/家畜所含食物（.dat unit 资源储量；#42 哥特猎物倍率的基数） */
  animals?: Record<string, { unit: number; food: number }>;
}
/** 前置条件树：{n, of} = of 中至少 n 项满足；{b} = 任一建筑已建成；{civ} = 本文明自动满足（如高棉） */
export type AgeReqNode = { n: number; of: AgeReqNode[] } | { b: number[]; zh: string } | { civ: string[] };

/** 条件是否满足 */
export function ageReqOk(node: AgeReqNode | null | undefined, built: ReadonlyMap<number, number>, civ: string): boolean {
  if (!node) return true;
  if ('b' in node) return node.b.some((b) => (built.get(b) ?? 0) > 0);
  if ('civ' in node) return node.civ.includes(civ);
  return node.of.filter((x) => ageReqOk(x, built, civ)).length >= node.n;
}
/** 主干「任 n 种建筑」节点：取叶子最多的 {n, of}（封建/城堡/帝王都是「任两种」），用于提示文案 */
export function ageReqMain(node: AgeReqNode | null | undefined): { n: number; leaves: { b: number[]; zh: string }[] } | null {
  if (!node || !('of' in node)) return null;
  const leaves = (x: AgeReqNode): { b: number[]; zh: string }[] => ('b' in x ? [x] : 'of' in x ? x.of.flatMap(leaves) : []);
  let best: { n: number; leaves: { b: number[]; zh: string }[] } | null = null;
  const walk = (x: AgeReqNode) => {
    if (!('of' in x)) return;
    const direct = x.of.filter((y) => 'b' in y || 'of' in y);
    if (x.n >= 2 && (!best || direct.length > best.leaves.length)) best = { n: x.n, leaves: x.of.flatMap(leaves) };
    x.of.forEach(walk);
  };
  walk(node);
  return best;
}
/** 单位升级（units.json 的 up：[费用, 研究时间]） */
export type UpgradeData = Record<number, [Cost, number]>;

export interface SimParams {
  /** 木/金/石到投放点的格数（1–10），默认 4 */
  walkTiles: number;
  /** 羊、野猪/鹿、浆果、农田按「近」计算的格数，默认 2 */
  nearTiles: number;
  /** TC 闲置超过多少秒计为卡点，默认 2（严格大于） */
  idleThreshold: number;
  /** 是否计入团队加成（默认否，按 1v1） */
  team: boolean;
  /** 人口余量 ≤ 2 时自动补房子（社区开局通常写「按需盖房」）；默认开 */
  autoHouses: boolean;
}
export const WALK = { min: 1, max: 10, presets: { near: 2, mid: 4, far: 7 }, default: 4 } as const;
export const DEFAULT_PARAMS: SimParams = { walkTiles: WALK.default, nearTiles: WALK.presets.near, idleThreshold: 2, team: false, autoHouses: true };

/** 城镇中心忙的卡点文案（Steve 定稿；只在这里改） */
export const TC_BUSY_ZH: Record<'vil' | 'research', string> = { vil: '等城镇中心（在造村民）', research: '等城镇中心（在研究）' };

export interface Anomaly {
  type: 'idle_tc' | 'pop_block' | 'prereq_wait' | 'resource_short' | 'tc_busy' | 'timeout';
  /** tc_busy：城镇中心当时在忙什么（造村民 / 研究） */
  busy?: 'vil' | 'research';
  /** prereq_wait：还没建完的前置建筑名 */
  missing?: string[];
  /** prereq_wait：要升的时代 2/3/4 */
  age?: number;
  /** prereq_wait：需要几座前一时代建筑 */
  need?: number;
  /** Source-backed Armenian/Georgian non-TC research-site wait. */
  researchSite?: string;
  resource?: Res;
  shortfall?: number;
  waitSec?: number;
  from: number;
  to: number;
  reasonZh: string;
}
export interface ErrBand {
  /** 比当前参数最多早几秒（近距离跑出的结果） */
  early: number;
  /** 比当前参数最多晚几秒（远距离跑出的结果） */
  late: number;
}
export interface TimelineStep {
  index: number;
  vils: number;
  action: 'train' | 'build' | 'research' | 'assign' | 'ageup';
  entity?: { kind: 'unit' | 'tech' | 'building'; id: string };
  startAt: number;
  /** 研究类步骤（升时代、科技）实际开始研究的时刻；界面行时间用它（#3） */
  researchAt?: number;
  doneAt: number;
  /** 本步第一项训练/建造实际付的费用（含文明折扣；可带 .5，如哥特民兵食物 42.5） */
  cost?: Stock;
  errSec: ErrBand;
  stock: Stock;
  pop: { used: number; cap: number };
  villagers: { food: number; wood: number; gold: number; stone: number; build: number; idle: number };
  anomalies: Anomaly[];
}
export interface VillagerEvent {
  from: number;
  to: number;
  step: number;
}
export interface BonusVillagerEvent {
  at: number;
  tech: number;
  trigger: number;
  count: number;
  step: number;
  pop: { used: number; cap: number };
  /** The existing BO assignment queue; null means idle, mixed can occur in a changed multi-unit raw fixture. */
  task: Task | 'mixed' | null;
}
export interface BuildTimeline {
  /** 实际村民训练事件，仅用于时间线展示，不改变模拟。 */
  villagerEvents?: VillagerEvent[];
  /** Reviewed Wei research and Bengali age grants are instantaneous, never paid TC intervals. */
  bonusVillagerEvents?: BonusVillagerEvent[];
  buildId: string;
  civ: string;
  variant: 'aggr' | 'cons' | null;
  params: SimParams & { carryModel: string };
  ageUps: { age: 'feudal' | 'castle' | 'imperial'; clickAt: number; reachAt: number; errSec: ErrBand }[];
  steps: TimelineStep[];
  /** 每座建筑（不含自动补的房子）建成时刻；格鲁吉亚起始免费骡车记录at0，按时间排序（#3 护栏用） */
  buildingsDone: { building: number; at: number }[];
  /** 全部异常（按优先级：idle_tc > pop_block > resource_short），便于摘要 */
  anomalies: Anomaly[];
  tcIdleTotal: number;
  /** #42：本文明人口不受房子限制（匈奴 Tech tree res 4 +2000），开局里的造房动作已跳过 */
  noHouses: boolean;
  /** 每座房子（含自动补房）付木开工的时刻 */
  housePaidAt: number[];
  /** noHouses 时被跳过造房动作的步骤下标（步骤本身保留，编号不变） */
  skippedHouseSteps: number[];
  model: { version: string; assumptions: string[] };
}

export const MODEL_VERSION = 'm2-0.1';
export const ASSUMPTIONS = [
  '采集收入 = 携带量 ÷（携带量 ÷ 采集速率 + 往返走路时间），走路时间 = 2 × 格数 ÷ 村民移速；资源视为连续流入，不按整趟结算。',
  '羊、野猪/鹿、浆果、农田按「近」距离计；木、金、石按所选走路距离计。',
  '资源点不会耗尽；不计引猪、推鹿、找羊、放置建筑的微操时间；「hunt」（城镇中心下的肉类）按牧羊速率计。',
  '建造时间：n 个村民同建一座建筑用时 = 建造时间 × 3 ÷ (n + 2)；没有指定建造者时借 1 名村民建造，建完回原任务。',
  '自动补房：人口余量 ≤ 2 且没有在建房子时，借 1 名村民（优先伐木者）盖房，木头够 25 才盖（开局文字只写「按需盖房」的部分）。',
  '升级时代须先建完前置建筑（.dat 时代科技前置：封建/城堡/帝王各需前一时代任两种建筑，或城堡/营垒），没建完就等待并记为卡点；第二、三座城镇中心建成后不额外产村民。',
  '文明加成只计采集速率、携带量、移速、费用、训练/研究/建造时间、起始资源、免费科技；团队加成默认不计。',
  '误差带：同一开局分别用近（2 格）和远（7 格）走路距离再跑两次，取早晚差值，前后不对称。',
];

const TICK = 0.1;
const MAX_T = 3600;
const RES_OF: Record<string, Res> = { Food: 'food', Wood: 'wood', Gold: 'gold', Stone: 'stone' };
const ZH: Record<Res, string> = { food: '食物', wood: '木头', gold: '黄金', stone: '石头' };
const FOOD: Task[] = ['sheep', 'boar', 'deer', 'hunt', 'berries', 'farm', 'fish'];
const RES_TASK: Record<Task, Res | null> = {
  sheep: 'food',
  boar: 'food',
  deer: 'food',
  hunt: 'food',
  berries: 'food',
  farm: 'food',
  fish: 'food',
  wood: 'wood',
  gold: 'gold',
  stone: 'stone',
  build: null,
};
/** BO 任务 → eco 任务（采集速率/携带量） */
const ECO_TASK: Record<Task, string> = {
  sheep: 'sheep',
  boar: 'hunt',
  deer: 'hunt',
  hunt: 'sheep',
  berries: 'berries',
  farm: 'farm',
  fish: 'fish',
  wood: 'wood',
  gold: 'gold',
  stone: 'stone',
  build: 'build',
};
const NEAR: Task[] = ['sheep', 'boar', 'deer', 'hunt', 'berries', 'farm', 'fish'];
/** 起始村民数：.dat 中由引擎资源（编号 234 等）控制、含义未完全解码，按文明加成文字手工给出 */
export const START_VILS: Record<string, number> = { Chinese: 6, Mayans: 4 };
const HOUSE = 70;
const TC = 109;
const r1 = (x: number) => Math.round(x * 10) / 10;

/** TC 闲置区间 → 卡点（严格大于阈值；纯函数，便于边界测试） */
export function idleAnomaly(from: number, to: number, cause: 'pop' | 'food' | 'other', threshold = 2): Anomaly | null {
  const sec = r1(to - from);
  if (!(sec > threshold + 1e-9)) return null;
  const why = cause === 'pop' ? '卡人口' : cause === 'food' ? '食物不足' : '等待';
  return { type: 'idle_tc', waitSec: sec, from: r1(from), to: r1(to), reasonZh: `城镇中心闲置 约 ${sec} 秒（${why}）` };
}

interface Pending {
  step: number;
  a: Action;
  /** 已付费 */
  paid?: boolean;
  done?: boolean;
  blockedSince?: number;
  short?: { res: Res; amount: number }[];
  /** 等前置建筑 */
  prereq?: boolean;
  missing?: string[];
  siteBlockedSince?: number;
  siteIds?: number[];
  /** 实际开始研究/训练的时刻 */
  startedAt?: number;
  /** 付清、排进城镇中心研究队列的时刻与当时城镇中心在忙什么 */
  queuedAt?: number;
  queuedBusy?: 'vil' | 'research';
}
interface Construction {
  building: number;
  progress: number;
  bt: number;
  borrowed?: Task;
  step: number;
  p?: Pending;
  auto?: boolean;
}

/** 单次模拟（固定参数）：返回每步时间与快照，不含误差带 */
/**
 * PR 127（Steve 口径 PR 评论 6195034241）：白名单（不支持）文明页面标「未计入」并按通用计，但直接调 simulateBuild 时
 * 仍保持 release/v0.7.0 的旧算法：不应用按类别（class:*）的费用/训练时间倍率、折后价按整数取整。
 * 已经完整支持的文明走当前算法（issue 197 葡萄牙、蜀、马里、瓦兰吉、鞑靼、玛雅已迁出）；其余按文明缓存（eco 对象 + 文明）。
 */
const legacyCache = new WeakMap<EcoData, Map<string, boolean>>();
function legacyCiv(eco: EcoData, civ: string): boolean {
  if (civ === 'Generic') return false;
  let c = legacyCache.get(eco);
  if (!c) legacyCache.set(eco, (c = new Map()));
  let v = c.get(civ);
  if (v === undefined) c.set(civ, (v = !simSupport(eco, civ, ALL_BOS, { ignoreSourceGate: true }).supported));
  return v;
}

function runOnce(bo: BuildOrder, civ: string, eco: EcoData, ups: UpgradeData, P: SimParams) {
  const m = baseMods();
  const legacy = legacyCiv(eco, civ);
  // 按 tech 整条判定（#43 Steve）：只要有一条效果是未实现或未分类，这个 tech 的效果一条都不应用，
  // 避免成对效果只生效一半（如鞑靼 704 只有羊 workRate ×0.637 生效，加成变成减益）
  const scope = simScope(eco, [bo], civ);
  const mechanism = civMechanism(civ);
  const builderMultiplier = mechanism.builderMultiplier?.(scope) ?? 1;
  const weiFamily = scope.weiRewards;
  const bengaliFamily = scope.bengaliRewards;
  const armenians = scope.armenians;
  const georgians = scope.georgians;
  m.farmNoWalk = !!civMechanism(civ).farmNoWalk?.(scope);
  const uniqueMayanTree = hasUniqueMayanTree(eco);
  const uniqueMayanTeam = (eco.civEco.Mayans ?? []).filter((row) => row.source === 'team').length === 1;
  const rows = (eco.civEco[civ] ?? []).filter(
    (r) =>
      (P.team || r.source !== 'team') &&
      mechanismRowAllowed(r, scope, uniqueMayanTree) &&
      mechanismTeamRowAllowed(r, scope, uniqueMayanTeam) &&
      techAtomicOk(r, scope),
  );
  const freeByAge: Record<number, string[]> = {};
  let age = 1;
  const applyAge = () => {
    for (const r of rows)
      if (r.age === age && !mechanism.deferAgeTechs?.includes(r.tech ?? -1))
        applyEffects(
          m,
          r.effects.filter((e) => e.kind !== 'freeTech'),
          rowApplication(civ, r, scope, 'timeline', () => true),
        );
    void freeByAge;
  };
  applyAge();
  const buildingTime = (id: number, fallback = 0) => {
    const special = mechanism.buildingTime?.(scope, eco, m, id, age, fallback);
    if (special !== undefined) return special;
    return (eco.buildings[id]?.buildTime ?? fallback) * (m.timeMul['unit:' + id] ?? 1);
  };
  // res 0–3 的黑暗时代条目：若同一文明对该资源也有 res 91–94 条目（波斯、图皮、阿兹特克、西西里），两者是同一加成的两种写法，只算一次；
  // 否则（埃塞俄比亚、德拉威「开局及每次升级时代」）开局直接发放
  const startRes = new Set(
    rows.flatMap((r) => r.effects.filter((e) => e.kind === 'res' && e.res !== undefined && RES_START[e.res]).map((e) => RES_START[e.res!]!)),
  );
  for (const r of Object.keys(m.grant) as Res[]) if (!startRes.has(r)) m.start[r] += m.grant[r];
  m.grant = { food: 0, wood: 0, gold: 0, stone: 0 };
  // 自动免费科技在 eco 里只留名称（研究时间设为 0 的条目收成 freeTech），效果在到达所需时代时自动生效一次。
  // 只免单项资源的科技保留为 techCost，由普通研究动作收费并应用效果（issue 393）。
  const freeNames = new Set(rows.flatMap((r) => r.effects.filter((e) => e.kind === 'freeTech').map((e) => (e.techName ?? '').toLowerCase())));
  const freeIds = new Set<number>();
  for (const [id, et] of Object.entries(eco.ecoTechs)) {
    const row = et as { en?: string; name?: string };
    const names = [row.en, row.name].filter((n): n is string => !!n).map((n) => n.toLowerCase());
    if (names.some((n) => freeNames.has(n))) freeIds.add(Number(id));
  }
  // 法兰克磨坊科技开局会再点一次研究。费用按 0，已经随时代生效的效果不再套第二遍。
  // 其他文明的真正免费科技保持既有研究动作处理，不在本次费用导出修复中扩展。
  const frankMillFree = !!mechanism.freeResearchOnce;
  const freeApplied = new Set<number>();
  const applyEcoTech = (id: number, granted: boolean) => {
    const et = eco.ecoTechs[id];
    if (!et) return;
    if ((granted || frankMillFree) && freeIds.has(id)) {
      if (freeApplied.has(id)) return;
      freeApplied.add(id);
    }
    applyEffects(m, et.effects);
  };
  const stock: Stock = { ...m.start };
  const alloc = Object.fromEntries((Object.keys(RES_TASK) as Task[]).map((t) => [t, 0])) as Record<Task, number>;
  let idleVils = 0;
  // 新村民任务队列
  const queue: Task[] = [];
  for (const st of bo.steps) for (const a of st.actions) if (a.type === 'gather' && !a.from) for (let i = 0; i < a.count; i++) queue.push(a.task);
  let born = 0;
  const assign = () => {
    const t = queue.shift();
    if (t) alloc[t]++;
    else idleVils++;
    born++;
    return t ?? null;
  };
  const startVils = mechanism.startingVillagers?.(scope) ?? START_VILS[civ] ?? 3;
  for (let i = 0; i < startVils; i++) assign();
  const tcPopulation = mechanism.townCenterPopulation?.(scope) ?? 5;
  let popCap = Math.min(200, tcPopulation + m.popBonus);
  let fishingShips = 0;
  let military = 1; // 侦察骑兵
  const built = new Map<number, number>([[TC, 1]]); // building id → 数量
  const constructions: Construction[] = [];
  const buildingsDone: { building: number; at: number }[] = [];
  // The reviewed starting cart is already complete; it consumes no stock, worker, TC time or population.
  if (georgians?.start) {
    built.set(1808, 1);
    buildingsDone.push({ building: 1808, at: 0 });
  }
  /** 每座房子（含自动补房）付木开工的时刻，#42 匈奴对比「省下的木头」用 */
  const housePaidAt: number[] = [];
  const unitQueues = new Map<number, { p: Pending; left: number; unit: number }[]>(); // 训练建筑 → 队列
  const unitBusy = new Map<string, { job: { p: Pending; left: number; unit: number }; left: number }>(); // 训练建筑 → 当前单位剩余时间
  // TC
  let tcState: { kind: 'vil' | 'research'; left: number; p?: Pending; age?: number; tech?: number } | null = null;
  const tcResearch: Pending[] = [];
  const villagerEvents: VillagerEvent[] = [];
  const bonusVillagerEvents: BonusVillagerEvent[] = [];
  const completedResearch = new Set<number>();
  const rewardedWei = new Set<number>();
  const rewardedBengalis = new Set<number>();
  const appliedArmenianResearch = new Set<number>();
  let drainPaidBirth = false;
  let villagerStartedAt = 0;
  let tcIdleFrom: number | null = null;
  let tcIdleCause: 'pop' | 'food' | 'other' = 'other';
  let tcIdleTotal = 0;
  const idleList: { from: number; to: number; cause: 'pop' | 'food' | 'other'; step: number }[] = [];
  // 步骤
  const nSteps = bo.steps.length;
  const startAt: (number | null)[] = Array(nSteps).fill(null);
  const doneAt: (number | null)[] = Array(nSteps).fill(null);
  const snap: (Omit<TimelineStep, 'errSec' | 'anomalies' | 'index' | 'vils' | 'action' | 'entity' | 'startAt' | 'doneAt'> | null)[] = Array(nSteps).fill(null);
  const stepAnoms: Anomaly[][] = bo.steps.map(() => []);
  const stepPending: Pending[][] = bo.steps.map(() => []);
  const payQ: Pending[] = [];
  /** 每步第一项训练/建造实际付的费用（#42 哥特民兵 42.5 显示用） */
  const stepCost: (Stock | undefined)[] = Array(nSteps).fill(undefined);
  let nextStep = 0;
  const finalVils = Math.max(...bo.steps.map((s) => s.vils));
  const clickVils = (a: number) => bo.steps.find((s) => s.actions.some((x) => x.type === 'ageUp' && x.age === a))?.vils;
  const ageUps: { age: number; clickAt: number; reachAt: number }[] = [];
  let researching = false; // 时代研究中（不产村民）

  const costOf = (kind: 'unit' | 'building' | 'tech' | 'up', id: number): Stock => {
    const c: Cost =
      kind === 'unit'
        ? id === 83
          ? eco.villager.cost
          : (eco.units[id]?.cost ?? {})
        : kind === 'building'
          ? (mechanism.buildingCost?.(scope, id) ?? eco.buildings[id]?.cost ?? {})
          : kind === 'tech'
            ? (eco.techs[id]?.cost ?? {})
            : (ups[id]?.[0] ?? {});
    const out: Stock = { food: 0, wood: 0, gold: 0, stone: 0 };
    for (const [k, v] of Object.entries(c)) out[RES_OF[k]!] = v ?? 0;
    if (kind === 'tech') {
      if (frankMillFree && freeIds.has(id)) return { food: 0, wood: 0, gold: 0, stone: 0 };
      const tm = m.techCost[id] ?? {};
      for (const r of Object.keys(out) as Res[])
        out[r] = Math.max(0, Math.round(applyMod(applyMod(out[r] * (civ === 'Chinese' && [101, 102, 103].includes(id) ? 1 : m.techCostAll), tm.all), tm[r])));
      return out;
    }
    // Chinese ordinary technologies include unit upgrades; advancing Age is excluded above.
    if (civ === 'Chinese' && kind === 'up') {
      for (const r of Object.keys(out) as Res[]) out[r] = Math.max(0, Math.round(out[r] * m.techCostAll));
      return out;
    }
    const add = kind !== 'up' ? m.costAdd['unit:' + id] : undefined;
    if (add) for (const r of Object.keys(add) as Res[]) out[r] = Math.max(0, out[r] + add[r]!);
    // 单位折扣：按单位 id 与按类别（哥特步兵 class:6，#42）两种写法相乘
    const cls = !legacy && kind === 'unit' && eco.units[id]?.class !== undefined ? m.costMul['class:' + eco.units[id]!.class] : undefined;
    const mul = m.costMul['unit:' + id];
    const buildingWood = kind === 'building' ? m.buildingWoodCost[eco.buildings[id]?.class ?? -1] : undefined;
    const mayanWall = kind === 'building' ? m.mayanWallCost[eco.buildings[id]?.class ?? -1] : undefined;
    const rnd = legacy ? Math.round : roundHalfPrice;
    if ((mul || cls || buildingWood !== undefined || mayanWall !== undefined) && kind !== 'up')
      for (const r of Object.keys(out) as Res[]) {
        if (r === 'wood' && buildingWood !== undefined) {
          const factor = (mul?.all ?? 1) * (mul?.[r] ?? 1) * (cls?.all ?? 1) * (cls?.[r] ?? 1);
          // 与effects_build.py累计tiers的6位规范一致；仅新马里建筑木费，保留原half-price及其它文明路径。
          const combined = Math.round(factor * buildingWood * 1e6) / 1e6;
          out[r] = rnd(out[r] * combined);
        } else out[r] = rnd(out[r] * (mul?.all ?? 1) * (mul?.[r] ?? 1) * (cls?.all ?? 1) * (cls?.[r] ?? 1) * (mayanWall ?? 1));
      }
    return out;
  };
  /** 科技研究时间：.dat 原值经文明修正（set 为绝对秒数，如哥特织布机 1 s；mul 为倍率，如马来升时代 ×0.6） */
  const techTimeOf = (tech: number) => Math.max(0, applyMod(eco.techs[tech]?.researchTime ?? 0, m.techTime[tech]));
  const afford = (c: Stock) => (Object.keys(c) as Res[]).every((r) => stock[r] + 1e-9 >= c[r]);
  const pay = (c: Stock) => (Object.keys(c) as Res[]).forEach((r) => (stock[r] -= c[r]));
  const popUsed = () => born + military;
  const activeStep = () => Math.max(0, Math.min(nextStep - 1, nSteps - 1));
  const completeResearch = (p: Pending, t: number) => {
    if (p.a.type !== 'research') return;
    if ((armenians || georgians) && completedResearch.has(p.a.tech)) return;
    applyEcoTech(p.a.tech, false);
    if (georgians) completedResearch.add(p.a.tech);
    if (armenians) {
      completedResearch.add(p.a.tech);
      for (const bonus of armenianResearchBonus(armenians, p.a.tech, age, appliedArmenianResearch)) {
        applyEffects(m, bonus.effects);
        appliedArmenianResearch.add(bonus.tech!);
      }
    }
    if (!weiFamily) return;
    completedResearch.add(p.a.tech);
    for (const reward of weiRewardsForCompletedResearch(weiFamily, completedResearch, age, built.get(TC) ?? 0, rewardedWei)) {
      const tasks = Array.from({ length: reward.count }, assign);
      rewardedWei.add(reward.tech);
      bonusVillagerEvents.push({
        at: r1(t),
        tech: reward.tech,
        trigger: reward.trigger,
        count: reward.count,
        step: p.step,
        pop: { used: popUsed(), cap: popCap },
        task: tasks.every((task) => task === tasks[0]) ? tasks[0]! : 'mixed',
      });
      // Only a grant that reaches the final goal can make the old step exit discard an already-paid job.
      if (born >= finalVils && tcState?.kind === 'vil') drainPaidBirth = true;
    }
  };

  const completeBengaliAge = (p: Pending, t: number) => {
    if (p.a.type !== 'ageUp') return;
    for (const reward of bengaliRewardsForReachedAge(bengaliFamily ?? null, p.a.age, built.get(TC) ?? 0, rewardedBengalis)) {
      const tasks = Array.from({ length: reward.count }, assign);
      rewardedBengalis.add(reward.tech);
      bonusVillagerEvents.push({
        at: r1(t),
        tech: reward.tech,
        trigger: reward.trigger,
        count: reward.count,
        step: p.step,
        pop: { used: popUsed(), cap: popCap },
        task: tasks.every((task) => task === tasks[0]) ? tasks[0]! : 'mixed',
      });
    }
  };

  const rate = (t: Task): number => {
    const et = ECO_TASK[t];
    const base = eco.villager.tasks[et]!;
    // 猎物倍率（res 268）只作用于狩猎：每次采集动作入账 ×倍率，等效于 workRate ×倍率
    const wr =
      base.workRate *
      (m.rate[et] ?? 1) *
      (m.rate.villager ?? 1) *
      (et === 'hunt' ? m.huntFoodMul : 1) *
      (et === 'sheep' ? m.sheepFoodMul : 1) *
      (m.mayanProductivity[et] ?? 1);
    const carry = base.carry * (m.carry[et] ?? 1) * (m.carry.villager ?? 1) + (m.carry['add:' + et] ?? 0) + (m.carry['add:villager'] ?? 0);
    const d = t === 'farm' && m.farmNoWalk ? 0 : NEAR.includes(t) ? P.nearTiles : P.walkTiles;
    const walk = (2 * d) / (eco.villager.speed * m.speed);
    const average = carry / (carry / wr + walk);
    return mechanismFarmRate(scope, et, average);
  };
  const actionCost = (a: Action): Stock => {
    if (a.type === 'build') {
      const c = costOf('building', a.building);
      const n = a.count ?? 1;
      return { food: c.food * n, wood: c.wood * n, gold: c.gold * n, stone: c.stone * n };
    }
    if (a.type === 'train') return costOf('unit', a.unit);
    if (a.type === 'research') return costOf('tech', a.tech);
    if (a.type === 'upgrade') return costOf('up', a.unit);
    if (a.type === 'ageUp') return costOf('tech', 100 + a.age - 1);
    return { food: 0, wood: 0, gold: 0, stone: 0 };
  };
  const finish = (p: Pending, t: number) => {
    p.done = true;
    const s = p.step;
    if (stepPending[s]!.every((x) => x.done) && startAt[s] !== null && doneAt[s] === null) doneAt[s] = r1(t);
  };
  const startStep = (i: number, t: number) => {
    const st = bo.steps[i]!;
    // 到达新时代后放行的步骤在下一个模拟 tick 才开始；这 0.1 秒是步长造成的，记成到达时刻，
    // 否则摘要「9:44 到达」和紧接的步骤行「9:45」会对不上（Reid/Steve #53）。只改记录值，不改模拟进程。
    const reached = ageUps.find((x) => x.reachAt > 0 && t - x.reachAt > 1e-9 && t - x.reachAt <= TICK + 1e-9);
    startAt[i] = reached ? reached.reachAt : r1(t);
    for (const a of st.actions) {
      if (a.type === 'gather') {
        if (a.from) {
          const pool: Task[] = a.from === 'hunt' ? ['hunt', 'sheep', 'boar', 'deer'] : [a.from];
          let left = a.count;
          for (const k of pool) {
            const n = Math.min(left, alloc[k]);
            alloc[k] -= n;
            left -= n;
          }
          alloc[a.task] += a.count - left;
        }
        continue;
      }
      if (a.type === 'lure') continue;
      if (a.type === 'train') {
        for (let k = 0; k < (a.count ?? 1); k++) {
          const p: Pending = { step: i, a: { ...a, count: 1 } };
          stepPending[i]!.push(p);
          payQ.push(p);
        }
        continue;
      }
      const p: Pending = { step: i, a };
      stepPending[i]!.push(p);
      payQ.push(p);
    }
    snap[i] = {
      stock: { food: Math.floor(stock.food), wood: Math.floor(stock.wood), gold: Math.floor(stock.gold), stone: Math.floor(stock.stone) },
      pop: { used: popUsed(), cap: popCap },
      villagers: {
        food: FOOD.reduce((s, k) => s + alloc[k], 0),
        wood: alloc.wood,
        gold: alloc.gold,
        stone: alloc.stone,
        build: alloc.build,
        idle: idleVils,
      },
    };
    if (stepPending[i]!.length === 0) doneAt[i] = r1(t);
  };

  let t: number;
  let timedOut = false;
  for (let tick = 0; ; tick++) {
    t = tick * TICK;
    // 1) 步骤推进
    while (nextStep < nSteps) {
      const st = bo.steps[nextStep]!;
      if (born < st.vils) break;
      if (st.phase && !st.phase.endsWith('-click')) {
        const need = { feudal: 2, castle: 3, imperial: 4 }[st.phase as 'feudal' | 'castle' | 'imperial'];
        if (age < need) break;
      }
      // 前一步的付费动作全部完成后才开始下一步（顺序执行）
      if (nextStep > 0 && stepPending[nextStep - 1]!.some((p) => !p.paid)) break;
      startStep(nextStep, t);
      nextStep++;
    }
    // 2) 付费队列（按顺序，队首未付清则阻塞）
    while (payQ.length) {
      const p = payQ[0]!;
      const a = p.a;
      if ((armenians?.infrastructure || georgians?.infrastructure) && a.type === 'research') {
        if (completedResearch.has(a.tech)) {
          p.paid = true;
          p.done = true;
          payQ.shift();
          finish(p, t);
          continue;
        }
        const duplicate = constructions.some((construction) => construction.p?.a.type === 'research' && construction.p.a.tech === a.tech);
        if (duplicate) break;
        const sites = georgians?.infrastructure ? georgianResearchSites(georgians, a.tech) : armenianResearchSites(armenians, a.tech);
        if (sites && !sites.some((building) => (built.get(building) ?? 0) > 0)) {
          p.siteBlockedSince ??= t;
          p.siteIds = sites;
          break;
        }
        if (p.siteBlockedSince !== undefined) {
          const wait = r1(t - p.siteBlockedSince);
          const site = armenianSiteName(p.siteIds ?? []);
          if (wait > 0)
            stepAnoms[p.step]!.push({
              type: 'prereq_wait',
              from: r1(p.siteBlockedSince),
              to: r1(t),
              waitSec: wait,
              missing: [site],
              researchSite: site,
              reasonZh: `等${site}建成 约 ${wait} 秒`,
            });
          p.siteBlockedSince = undefined;
        }
      }
      if (a.type === 'build' && mechanism.buildingReady?.(scope, a.building, age, built) === false) break;
      // 638 exempts prerequisite buildings, not the actual research location.
      if (mechanism.researchSites && a.type === 'research') {
        const sites = mechanism.researchSites(eco, a.tech, scope);
        if (sites.some((site) => site > 0) && !sites.some((site) => (built.get(site) ?? 0) > 0)) break;
      }
      // 训练需要建筑；人口检查
      if (a.type === 'train') {
        const at = eco.units[a.unit]?.at ?? [];
        if (!at.some((b) => (built.get(b) ?? 0) > 0)) break;
        if (popUsed() + 1 > popCap) {
          p.blockedSince ??= t;
          break;
        }
      }
      if (a.type === 'ageUp' && !ageReqOk(eco.ageReq?.[String(a.age)]?.req, built, mechanism.prerequisiteCiv?.(scope, civ) ?? civ)) {
        if (!p.prereq) {
          p.blockedSince ??= t;
          p.prereq = true;
          // 记下开始等待时还没建完的前置建筑：优先列在建/排队中的，否则列全部未建
          const main = ageReqMain(eco.ageReq?.[String(a.age)]?.req);
          const lack = (main?.leaves ?? []).filter((l) => !l.b.some((b) => (built.get(b) ?? 0) > 0));
          const pending = lack.filter(
            (l) => constructions.some((c) => l.b.includes(c.building)) || payQ.some((q) => q.a.type === 'build' && l.b.includes(q.a.building)),
          );
          p.missing = (pending.length ? pending : lack).map((l) => l.zh);
        }
        break;
      }
      if (p.prereq) {
        // 前置建筑刚建完：等前置这段单独记一条卡点，之后若再等资源从此刻另算
        const from = r1(p.blockedSince ?? t);
        const wait = r1(t - (p.blockedSince ?? t));
        if (wait > 1e-9 && a.type === 'ageUp')
          stepAnoms[p.step]!.push({
            type: 'prereq_wait',
            waitSec: wait,
            from,
            to: r1(t),
            age: a.age,
            need: ageReqMain(eco.ageReq?.[String(a.age)]?.req)?.n ?? 2,
            missing: p.missing ?? [],
            reasonZh: `等前置建筑 约 ${wait} 秒`,
          });
        p.prereq = false;
        p.blockedSince = undefined;
      }
      const c = actionCost(a);
      if (!afford(c)) {
        if (p.blockedSince === undefined) {
          p.blockedSince = t;
          p.short = (Object.keys(c) as Res[]).filter((r) => stock[r] < c[r]).map((r) => ({ res: r, amount: Math.ceil(c[r] - stock[r]) }));
        }
        break;
      }
      pay(c);
      p.paid = true;
      if ((a.type === 'train' || a.type === 'build') && !stepCost[p.step]) stepCost[p.step] = c;
      payQ.shift();
      if (p.blockedSince !== undefined && t - p.blockedSince > 1e-9) {
        const from = r1(p.blockedSince);
        const wait = r1(t - p.blockedSince);
        if (p.short && p.short.length) {
          for (const s of p.short)
            stepAnoms[p.step]!.push({
              type: 'resource_short',
              resource: s.res,
              shortfall: s.amount,
              waitSec: wait,
              from,
              to: r1(t),
              reasonZh: `${ZH[s.res]}差 ${s.amount}（等待 约 ${wait} 秒）`,
            });
        } else stepAnoms[p.step]!.push({ type: 'pop_block', waitSec: wait, from, to: r1(t), reasonZh: `卡人口 等房子 约 ${wait} 秒` });
      }
      if (a.type === 'build') {
        const n = a.count ?? 1;
        const bt = buildingTime(a.building);
        for (let k = 0; k < n; k++) constructions.push({ building: a.building, progress: 0, bt, step: p.step, p });
        if (a.building === HOUSE) for (let k = 0; k < n; k++) housePaidAt.push(r1(t));
      } else if (a.type === 'train') {
        military++;
        const at = (eco.units[a.unit]?.at ?? []).find((b) => (built.get(b) ?? 0) > 0)!;
        const q = unitQueues.get(at) ?? [];
        q.push({ p, left: 1, unit: a.unit });
        unitQueues.set(at, q);
      } else if (a.type === 'research' || a.type === 'ageUp') {
        if (a.type === 'research' && eco.techs[a.tech]?.at !== TC) {
          // 非 TC 科技：在对应建筑研究（不占 TC）
          const time = techTimeOf(a.tech);
          p.startedAt = r1(t);
          constructions.push({ building: -a.tech, progress: 0, bt: time, step: p.step, p, borrowed: undefined });
        } else {
          p.queuedAt = t;
          p.queuedBusy = tcState?.kind === 'research' ? 'research' : 'vil';
          tcResearch.push(p);
        }
      } else if (a.type === 'upgrade') {
        p.startedAt = r1(t);
        constructions.push({ building: -100000 - a.unit, progress: 0, bt: ups[a.unit]?.[1] ?? 0, step: p.step, p });
      }
    }
    // 2b) 自动补房
    if (P.autoHouses && popCap < 200 && popCap - popUsed() <= 2 && !constructions.some((c) => c.building === HOUSE)) {
      const c = costOf('building', HOUSE);
      if (afford(c)) {
        pay(c);
        housePaidAt.push(r1(t));
        constructions.push({
          building: HOUSE,
          progress: 0,
          bt: buildingTime(HOUSE, 25),
          step: -1,
          auto: true,
        });
      }
    }
    // 3) 建造 / 非 TC 研究
    const builders = alloc.build;
    const firstBuild = constructions.findIndex((c) => c.building > 0 && !c.auto);
    for (let i = 0; i < constructions.length; i++) {
      const c = constructions[i]!;
      if (c.building > 0) {
        if (builders > 0 && !c.auto) {
          if (i !== firstBuild) continue; // 建造者依次建造
          c.progress += c.bt > 0 ? (TICK * (builders + 2) * builderMultiplier) / (3 * c.bt) : 1;
        } else {
          if (!c.borrowed) {
            const st = c.step >= 0 ? bo.steps[c.step]! : undefined;
            const g = (c.auto ? { task: 'wood' as Task } : st?.actions.find((x) => x.type === 'gather' && !x.from)) as { task: Task } | undefined;
            const cand = (
              g && alloc[g.task] > 0 ? g.task : (Object.keys(alloc) as Task[]).filter((k) => k !== 'build').sort((a, b) => alloc[b] - alloc[a])[0]
            )!;
            if (alloc[cand] > 0) {
              alloc[cand]--;
              c.borrowed = cand;
            } else continue;
          }
          c.progress += c.bt > 0 ? (TICK * 3 * builderMultiplier) / (3 * c.bt) : 1;
        }
      } else c.progress += c.bt > 0 ? TICK / c.bt : 1;
    }
    for (let i = constructions.length - 1; i >= 0; i--) {
      const c = constructions[i]!;
      if (c.progress < 1 - 1e-9) continue;
      constructions.splice(i, 1);
      if (c.borrowed) alloc[c.borrowed]++;
      if (c.building > 0) {
        built.set(c.building, (built.get(c.building) ?? 0) + 1);
        if (!c.auto) buildingsDone.push({ building: c.building, at: r1(t) });
        if (c.building === HOUSE) popCap = Math.min(200, popCap + 5);
        if (c.building === TC) popCap = Math.min(200, popCap + tcPopulation);
        const extraPopulation = mechanism.buildingPopulation?.(scope, c.building) ?? 0;
        if (extraPopulation) popCap = Math.min(200, popCap + extraPopulation);
        if (c.p && !constructions.some((x) => x.p === c.p)) finish(c.p, t);
      } else if (c.p) {
        if (c.building > -100000 && c.p.a.type === 'research') completeResearch(c.p, t);
        stock.gold += m.techReward; // 西班牙：科技/单位升级完成时返金
        finish(c.p, t);
      }
    }
    // 4) 每座训练建筑各有一个队列槽位；费用和人口仍在入队时预留。
    for (const [b, q] of unitQueues) {
      for (let slot = 0; slot < (built.get(b) ?? 0); slot++) {
        const key = b + ':' + slot;
        let active = unitBusy.get(key);
        if (!active) {
          const job = q.shift();
          if (!job) continue;
          const u = eco.units[job.unit]!;
          const clsT = !legacy && u.class !== undefined ? (m.timeMul['class:' + u.class] ?? 1) : 1;
          active = { job, left: ((u.timeAt?.[String(b)] ?? u.trainTime) * (m.timeMul['unit:' + job.unit] ?? 1) * clsT) / (m.rate['unit:' + b] ?? 1) };
          unitBusy.set(key, active);
        }
        active.left -= TICK;
        if (active.left <= 1e-9) {
          unitBusy.delete(key);
          if (active.job.unit === eco.fishingShip?.unit) fishingShips++;
          finish(active.job.p, t);
        }
      }
    }
    // 5) 城镇中心
    if (tcState) {
      tcState.left -= TICK * (m.tcRate['unit:' + TC_BY_AGE[age - 1]!] ?? 1);
      if (tcState.left <= 1e-9) {
        if (tcState.kind === 'vil') {
          villagerEvents.push({ from: villagerStartedAt, to: r1(t), step: activeStep() });
          assign();
        } else if (tcState.p) {
          const a = tcState.p.a;
          if (a.type === 'ageUp') {
            age = a.age;
            researching = false;
            ageUps.find((x) => x.age === a.age)!.reachAt = r1(t);
            applyAge();
            // 西班牙：升级时代完成也返 20 金，由 323/324/326 的 res 3 −20（已在 grant 里）抵消，净 0
            stock.gold += m.techReward;
            for (const r of Object.keys(stock) as Res[]) stock[r] += m.grant[r];
            m.grant = { food: 0, wood: 0, gold: 0, stone: 0 };
            for (const id of freeIds) {
              const ta = (eco.ecoTechs[id] as { age?: number } | undefined)?.age ?? 1;
              if (ta <= age) applyEcoTech(id, true);
            }
            if (bengaliFamily) completeBengaliAge(tcState.p, t);
          } else if (a.type === 'research') {
            completeResearch(tcState.p, t);
            stock.gold += m.techReward;
          }
          finish(tcState.p, t);
        }
        tcState = null;
      }
    }
    if (!tcState) {
      let cause: 'pop' | 'food' | 'other' | null = null;
      if (tcResearch.length) {
        const p = tcResearch.shift()!;
        const a = p.a;
        let time = 0;
        if (a.type === 'ageUp') {
          time = techTimeOf(100 + a.age - 1);
          researching = true;
          ageUps.push({ age: a.age, clickAt: r1(t), reachAt: 0 });
        } else if (a.type === 'research') time = techTimeOf(a.tech);
        p.startedAt = r1(t);
        if (p.queuedAt !== undefined && t - p.queuedAt > 1e-9) {
          // 付清了但城镇中心还在忙（造村民或别的研究）：这段等待也是卡点，避免行时间出现没有解释的跳变（Kent #51）
          const wait = r1(t - p.queuedAt);
          const busy = p.queuedBusy ?? 'vil';
          stepAnoms[p.step]!.push({
            type: 'tc_busy',
            busy,
            waitSec: wait,
            from: r1(p.queuedAt),
            to: r1(t),
            reasonZh: `${TC_BUSY_ZH[busy]} 约 ${wait} 秒`,
          });
        }
        tcState = { kind: 'research', left: time, p };
      } else if (!researching) {
        const nextClick = [2, 3, 4].map((a) => (a > age && !ageUps.some((x) => x.age === a) ? clickVils(a) : undefined)).find((x) => x !== undefined);
        const limit = Math.min(finalVils, nextClick ?? finalVils);
        if (born < limit) {
          const c = costOf('unit', 83);
          if (popUsed() + 1 > popCap) cause = 'pop';
          else if (!afford(c)) cause = 'food';
          else {
            pay(c);
            tcState = { kind: 'vil', left: eco.villager.trainTime * (m.timeMul['unit:83'] ?? 1) };
            villagerStartedAt = r1(t);
          }
        } else if (nextStep < nSteps && born < finalVils) cause = 'other';
      }
      if (cause) {
        if (tcIdleFrom === null) {
          tcIdleFrom = t;
          tcIdleCause = cause;
        } else if (cause === 'pop') tcIdleCause = 'pop';
      }
    }
    if (tcState && tcIdleFrom !== null) {
      idleList.push({ from: tcIdleFrom, to: t, cause: tcIdleCause, step: activeStep() });
      tcIdleTotal += t - tcIdleFrom;
      tcIdleFrom = null;
    }
    // 6) 采集（本 tick 结束时入账）
    for (const k of Object.keys(alloc) as Task[]) {
      const r = RES_TASK[k];
      if (r && alloc[k] > 0) {
        const q = rate(k);
        stock[r] += alloc[k] * q * TICK * (1 + (m.depositBonus[r] ?? 0));
        if (m.foragerWood) stock.wood += alloc[k] * foragerWoodIncome(m, ECO_TASK[k], q) * TICK;
        if (m.foragerFood) stock.food += alloc[k] * mapucheForagerFood(m, ECO_TASK[k], q) * TICK;
        if (m.lumberFood) stock.food += alloc[k] * lumberFoodIncome(m, ECO_TASK[k], q) * TICK;
        if (m.varangianGold) stock.gold += alloc[k] * varangianGoldIncome(m, ECO_TASK[k], q) * TICK;
        if (scope.poles) stock.gold += alloc[k] * polishStoneGold(scope.poles, ECO_TASK[k], q) * TICK;
      }
    }
    if (fishingShips && eco.fishingShip) {
      const fish = eco.fishingShip;
      const key = 'unit:' + fish.unit,
        cls = 'class:' + eco.units[fish.unit]?.class;
      const wr = fish.workRate * (fish.deepFishMultiplier ?? 1) * (m.rate[key] ?? 1) * (m.rate[cls] ?? 1) * (m.mayanProductivity.fish ?? 1);
      const carry = fish.carry * (m.carry[key] ?? 1) * (m.carry[cls] ?? 1) + (m.carry['add:' + key] ?? 0) + (m.carry['add:' + cls] ?? 0);
      const speed = fish.speed * (m.unitSpeed[key] ?? 1) * (m.unitSpeed[cls] ?? 1);
      if (wr > 0 && carry > 0 && speed > 0) {
        const q = (fishingShips * carry) / (carry / wr + (2 * P.walkTiles) / speed);
        stock.food += q * TICK;
        if (m.varangianGold) stock.gold += q * m.varangianGold * TICK;
      }
    }
    if (nextStep >= nSteps && doneAt.every((x) => x !== null) && !(drainPaidBirth && tcState?.kind === 'vil')) break;
    if (t >= MAX_T) {
      timedOut = true;
      break;
    }
  }
  if (tcIdleFrom !== null) idleList.push({ from: tcIdleFrom, to: t, cause: tcIdleCause, step: activeStep() });
  for (const x of idleList) {
    const a = idleAnomaly(x.from, x.to, x.cause, P.idleThreshold);
    if (a) stepAnoms[x.step]!.unshift(a);
    if (a && x.cause === 'pop')
      stepAnoms[x.step]!.push({ type: 'pop_block', waitSec: a.waitSec, from: a.from, to: a.to, reasonZh: `卡人口 等房子 约 ${a.waitSec} 秒` });
  }
  if (timedOut) {
    // 超时前已开始、到最后都没解开的人口阻塞：从阻塞开始记一条 pop_block（卡人口先于超时，摘要据此显示卡在哪一步）
    for (const p of payQ)
      if (p.blockedSince !== undefined && !(p.short && p.short.length)) {
        const wait = r1(t - p.blockedSince);
        stepAnoms[p.step]!.push({ type: 'pop_block', waitSec: wait, from: r1(p.blockedSince), to: r1(t), reasonZh: `卡人口 等房子 约 ${wait} 秒` });
      }
    const i = startAt.findIndex((x, k) => x === null || doneAt[k] === null);
    stepAnoms[Math.max(0, i)]!.push({ type: 'timeout', from: r1(t), to: r1(t), reasonZh: '模拟超过 60 分钟仍未完成（资源或建筑条件无法满足）' });
  }
  // 研究类步骤：实际开始研究的时刻（升时代/科技/单位升级里最晚开始的那项）
  const researchAt = stepPending.map((ps) => {
    const xs = ps.filter((p) => p.a.type === 'ageUp' || p.a.type === 'research' || p.a.type === 'upgrade').map((p) => p.startedAt);
    return xs.length && xs.every((x) => x !== undefined) ? Math.max(...(xs as number[])) : null;
  });
  return {
    villagerEvents,
    ...(mechanism.bonusVillagerEvents ? { bonusVillagerEvents } : {}),
    startAt,
    doneAt,
    snap,
    stepAnoms,
    stepCost,
    ageUps,
    researchAt,
    buildingsDone,
    housePaidAt,
    tcIdleTotal: r1(tcIdleTotal),
    end: r1(t),
    huntFoodMul: m.huntFoodMul,
  };
}

const PRIO: Record<Anomaly['type'], number> = { idle_tc: 0, timeout: 1, pop_block: 2, prereq_wait: 3, resource_short: 4, tc_busy: 5 };
const primary = (acts: Action[]): Pick<TimelineStep, 'action' | 'entity'> => {
  const a = acts.find((x) => x.type === 'ageUp') ?? acts.find((x) => x.type === 'train' || x.type === 'build' || x.type === 'research' || x.type === 'upgrade');
  if (!a) return { action: 'assign' };
  if (a.type === 'ageUp') return { action: 'ageup', entity: { kind: 'tech', id: String(100 + a.age - 1) } };
  if (a.type === 'train') return { action: 'train', entity: { kind: 'unit', id: String(a.unit) } };
  if (a.type === 'upgrade') return { action: 'research', entity: { kind: 'unit', id: String(a.unit) } };
  if (a.type === 'build') return { action: 'build', entity: { kind: 'building', id: String(a.building) } };
  if (a.type === 'research') return { action: 'research', entity: { kind: 'tech', id: String(a.tech) } };
  return { action: 'assign' };
};

/** 主入口：模拟 + 误差带（近/远走路距离各跑一次） */
export function simulateBuild(bo: BuildOrder, civ: string, eco: EcoData, ups: UpgradeData, params: Partial<SimParams> = {}): BuildTimeline {
  const P: SimParams = { ...DEFAULT_PARAMS, ...params };
  P.walkTiles = Math.min(WALK.max, Math.max(WALK.min, Math.round(P.walkTiles)));
  // #42 匈奴：人口不受房子限制 → 开局里的造房动作不执行、不扣木，自动补房也关掉；步骤数与编号不变
  const noHouses = civNoHouses(eco, civ);
  const input = bo;
  bo = civMechanism(civ).prepare?.(bo, civ, eco) ?? bo;
  if (noHouses) {
    bo = stripHouses(bo);
    P.autoHouses = false;
  }
  const R = runOnce(bo, civ, eco, ups, P);
  const near = runOnce(bo, civ, eco, ups, { ...P, walkTiles: WALK.presets.near });
  const far = runOnce(bo, civ, eco, ups, { ...P, walkTiles: WALK.presets.far });
  const band = (x: number | null, n: number | null, f: number | null): ErrBand => ({
    early: x === null || n === null ? 0 : r1(Math.max(0, x - n)),
    late: x === null || f === null ? 0 : r1(Math.max(0, f - x)),
  });
  const steps: TimelineStep[] = bo.steps.map((st, i) => ({
    index: i,
    vils: st.vils,
    ...primary(st.actions),
    startAt: R.startAt[i] ?? R.end,
    ...(R.researchAt[i] != null && (primary(st.actions).action === 'ageup' || primary(st.actions).action === 'research')
      ? { researchAt: R.researchAt[i]! }
      : {}),
    doneAt: R.doneAt[i] ?? R.end,
    ...(R.stepCost[i] ? { cost: R.stepCost[i]! } : {}),
    errSec: band(R.doneAt[i] ?? null, near.doneAt[i] ?? null, far.doneAt[i] ?? null),
    ...(R.snap[i] ?? {
      stock: { food: 0, wood: 0, gold: 0, stone: 0 },
      pop: { used: 0, cap: 0 },
      villagers: { food: 0, wood: 0, gold: 0, stone: 0, build: 0, idle: 0 },
    }),
    anomalies: [...R.stepAnoms[i]!].sort((a, b) => PRIO[a.type] - PRIO[b.type] || a.from - b.from),
  }));
  const AGE_NAME = { 2: 'feudal', 3: 'castle', 4: 'imperial' } as const;
  const ageUps = R.ageUps.map((a) => {
    const n = near.ageUps.find((x) => x.age === a.age);
    const f = far.ageUps.find((x) => x.age === a.age);
    return { age: AGE_NAME[a.age as 2 | 3 | 4], clickAt: a.clickAt, reachAt: a.reachAt, errSec: band(a.reachAt, n?.reachAt ?? null, f?.reachAt ?? null) };
  });
  return {
    buildId: input.id,
    villagerEvents: R.villagerEvents,
    ...(R.bonusVillagerEvents ? { bonusVillagerEvents: R.bonusVillagerEvents } : {}),
    civ,
    noHouses,
    housePaidAt: R.housePaidAt,
    skippedHouseSteps: noHouses ? input.steps.flatMap((st, i) => (st.actions.some(isHouse) ? [i] : [])) : [],
    variant: null,
    params: { ...P, carryModel: 'continuous-trip' },
    ageUps,
    steps,
    buildingsDone: R.buildingsDone,
    anomalies: steps.flatMap((s) => s.anomalies).sort((a, b) => PRIO[a.type] - PRIO[b.type] || a.from - b.from),
    tcIdleTotal: R.tcIdleTotal,
    model: {
      version: MODEL_VERSION,
      assumptions: [
        ...ASSUMPTIONS,
        ...mechanismAssumptions(civ, { eco, bo, params: P, scope: () => simScope(eco, ALL_BOS, civ) }),
        ...(bo.steps.some((st) => st.actions.some((a) => a.type === 'train' && a.unit === 13))
          ? ['渔船训练完成后按深海鱼任务倍率采集；往返距离使用走路距离参数、速度使用渔船自身速度。不模拟鱼耗尽、转渔网或受袭损失。']
          : []),
      ],
    },
  };
}

const isHouse = (a: Action) => a.type === 'build' && a.building === HOUSE;
/**
 * #42：文明是否不需要房子——黑暗时代即生效的 res 4（人口余量）加法让 5 + 加成 ≥ 200（人口上限），
 * 数值从 eco.json（.dat 导出）读，匈奴 Tech tree 为 +2000。只看 handled 的条目。
 */
export function civNoHouses(eco: EcoData, civ: string): boolean {
  let bonus = 0;
  for (const r of eco.civEco[civ] ?? [])
    if (r.age === 1 && r.source !== 'team') for (const e of r.effects) if (e.kind === 'res' && e.res === 4 && e.op === 'add') bonus += e.v ?? 0;
  return 5 + bonus >= 200;
}
/**
 * 去掉开局里的造房动作（步骤保留）。只为盖房而去「建造」的村民改成去吃羊（第 1 步的写法未核实，默认羊，见 #42），
 * 之后「从建造回来」的调动相应改为从羊调出。
 */
export function stripHouses(bo: BuildOrder): BuildOrder {
  let freed = 0;
  const steps = bo.steps.map((st) => {
    const builds = st.actions.filter((a) => a.type === 'build');
    const onlyHouses = builds.length > 0 && builds.every(isHouse);
    const actions: Action[] = [];
    for (const a of st.actions) {
      if (isHouse(a)) continue;
      if (onlyHouses && a.type === 'gather' && a.task === 'build' && !a.from) {
        actions.push({ ...a, task: 'sheep' });
        freed += a.count;
      } else if (a.type === 'gather' && a.from === 'build' && freed > 0) {
        const k = Math.min(freed, a.count);
        freed -= k;
        if (a.task !== 'sheep') actions.push({ ...a, count: k, from: 'sheep' });
        if (a.count > k) actions.push({ ...a, count: a.count - k });
      } else actions.push(a);
    }
    return { ...st, actions };
  });
  return { ...bo, steps };
}

/**
 * #42 匈奴摘要对比行：到达目标时代比通用早多少；木头净值 = 通用在到达前付掉的房子木头 − 起始少的木头。
 * 起始差值与房子单价都从数据读（不写死 100 / 25）。
 */
export function noHouseCompare(
  civTl: BuildTimeline,
  genericTl: BuildTimeline,
  eco: EcoData,
  civ: string,
  age: 'feudal' | 'castle' | 'imperial' = 'feudal',
): { earlierSec: number; startWoodDelta: number; housesSaved: number; woodNet: number } | null {
  if (!civTl.noHouses) return null;
  const c = civTl.ageUps.find((a) => a.age === age);
  const g = genericTl.ageUps.find((a) => a.age === age);
  if (!c || !g) return null;
  let startWoodDelta = 0;
  for (const r of eco.civEco[civ] ?? [])
    if (r.age === 1 && r.source !== 'team') for (const e of r.effects) if (e.kind === 'res' && e.res === 92 && e.op === 'add') startWoodDelta += e.v ?? 0;
  const houseWood = eco.buildings[HOUSE]?.cost.Wood ?? 25;
  const housesSaved = genericTl.housePaidAt.filter((t) => t <= g.reachAt).length;
  return { earlierSec: r1(g.reachAt - c.reachAt), startWoodDelta, housesSaved, woodNet: housesSaved * houseWood + startWoodDelta };
}

/** #42：猎物所含食物（基数从 eco.animals 读，乘文明的 res 268 倍率；哥特野猪 340 × 1.23） */
export function huntFoodMul(eco: EcoData, civ: string): number {
  const m = baseMods();
  for (const r of eco.civEco[civ] ?? [])
    if (r.age === 1 && r.source !== 'team')
      applyEffects(
        m,
        r.effects.filter((e) => e.kind === 'res' && e.res === RES_HUNT_FOOD),
      );
  return m.huntFoodMul;
}
export function animalFood(eco: EcoData, civ: string, animal: string): number | undefined {
  const base = eco.animals?.[animal]?.food;
  return base === undefined ? undefined : base * huntFoodMul(eco, civ);
}
/**
 * 黑暗时代的采集效率（每秒入账食物/木头…），与 runOnce 的 rate() 同一公式：carry / (carry / workRate + 往返走路)。
 * #42 用例按任务（eco 任务名，如 hunt）核对文明加成。extraIncome是额外收入（含同种资源的交仓加成），不占主资源携带量。
 */
export function gatherRate(
  eco: EcoData,
  civ: string,
  ecoTask: string,
  tiles: number = DEFAULT_PARAMS.nearTiles,
): { carry: number; workRate: number; rate: number; extraIncome: Partial<Stock> } {
  const m = baseMods();
  const scope = simScope(eco, ALL_BOS, civ);
  m.farmNoWalk = !!civMechanism(civ).farmNoWalk?.(scope);
  const uniqueMayanTree = hasUniqueMayanTree(eco);
  for (const r of eco.civEco[civ] ?? [])
    if (
      r.age === 1 &&
      r.source !== 'team' &&
      mechanismRowAllowed(r, scope, uniqueMayanTree) &&
      mechanismGatherMarkerAllowed(r, scope) &&
      (!civMechanism(civ).atomicGather || techAtomicOk(r, scope))
    )
      applyEffects(
        m,
        r.effects,
        rowApplication(civ, r, scope, 'gather', () => techAtomicOk(r, scope)),
      );
  const base = eco.villager.tasks[ecoTask]!;
  const workRate =
    base.workRate *
    (m.rate[ecoTask] ?? 1) *
    (m.rate.villager ?? 1) *
    (ecoTask === 'hunt' ? m.huntFoodMul : 1) *
    (ecoTask === 'sheep' ? m.sheepFoodMul : 1) *
    (m.mayanProductivity[ecoTask] ?? 1);
  const carry = base.carry * (m.carry[ecoTask] ?? 1) * (m.carry.villager ?? 1) + (m.carry['add:' + ecoTask] ?? 0) + (m.carry['add:villager'] ?? 0);
  const walk = (2 * (ecoTask === 'farm' && m.farmNoWalk ? 0 : tiles)) / (eco.villager.speed * m.speed);
  const average = carry / (carry / workRate + walk);
  const rate = mechanismFarmRate(scope, ecoTask, average);
  const wood = foragerWoodIncome(m, ecoTask, rate);
  const food = lumberFoodIncome(m, ecoTask, rate) + mapucheForagerFood(m, ecoTask, rate);
  const gold =
    (ecoTask === 'gold' ? rate * (m.depositBonus.gold ?? 0) : 0) + varangianGoldIncome(m, ecoTask, rate) + polishStoneGold(scope.poles, ecoTask, rate);
  return { carry, workRate, rate, extraIncome: { ...(wood ? { wood } : {}), ...(food ? { food } : {}), ...(gold ? { gold } : {}) } };
}
