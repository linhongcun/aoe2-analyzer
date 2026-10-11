/**
 * M2 开局时间线模拟（纯函数、确定性：无随机数，固定 0.1 秒步长，同输入同输出）。
 * 输入：开局（M1 BuildOrder）+ 文明 + 参数；游戏数值全部来自 src/data/eco.json（DE .dat 导出）。
 * 输出字段与 #3 交互稿第 4 节草案对齐（BuildTimeline / TimelineStep / Anomaly），差异见 docs/BUILD-SIM.md。
 */
import type { Action, BuildOrder, Task } from './buildOrder';

export type Res = 'food' | 'wood' | 'gold' | 'stone';
export type Stock = Record<Res, number>;
type Cost = Partial<Record<'Food' | 'Wood' | 'Gold' | 'Stone', number>>;
interface EffectRow {
  source: string;
  age: number;
  effects: { kind: string; target?: string; attr?: string; op?: string; v?: number; res?: number; tech?: number; techName?: string }[];
}
/** eco.json 中模拟需要的部分 */
export interface EcoData {
  villager: { trainTime: number; cost: Cost; speed: number; carry: number; tasks: Record<string, { workRate: number; carry: number }> };
  units: Record<string, { trainTime: number; at: number[]; cost: Cost; timeAt?: Record<string, number> }>;
  buildings: Record<string, { buildTime: number; cost: Cost }>;
  techs: Record<string, { researchTime: number; at: number; cost: Cost }>;
  ecoTechs: Record<string, { effects: EffectRow['effects'] }>;
  civEco: Record<string, EffectRow[]>;
  /** 升级时代前置建筑条件树（scripts/eco_build.py 从 .dat 时代科技 101/102/103 的前置展开；缺省视为无条件） */
  ageReq?: Record<string, { tech: number; req: AgeReqNode | null }>;
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
  errSec: ErrBand;
  stock: Stock;
  pop: { used: number; cap: number };
  villagers: { food: number; wood: number; gold: number; stone: number; build: number; idle: number };
  anomalies: Anomaly[];
}
export interface BuildTimeline {
  buildId: string;
  civ: string;
  variant: 'aggr' | 'cons' | null;
  params: SimParams & { carryModel: string };
  ageUps: { age: 'feudal' | 'castle' | 'imperial'; clickAt: number; reachAt: number; errSec: ErrBand }[];
  steps: TimelineStep[];
  /** 每座建筑（不含自动补的房子）建成时刻，按时间排序（#3 护栏用） */
  buildingsDone: { building: number; at: number }[];
  /** 全部异常（按优先级：idle_tc > pop_block > resource_short），便于摘要 */
  anomalies: Anomaly[];
  tcIdleTotal: number;
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
const START: Stock = { food: 200, wood: 200, gold: 100, stone: 200 };
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

/** 文明修正 */
interface Mods {
  rate: Record<string, number>;
  carry: Record<string, number>;
  speed: number;
  tcSpeed: number;
  costMul: Record<string, Partial<Record<Res | 'all', number>>>;
  timeMul: Record<string, number>;
  /** 科技费用倍率（按资源；all = 全部资源） */
  techCost: Record<number, Partial<Record<Res | 'all', number>>>;
  /** 全部科技费用倍率（中国 res 85） */
  techCostAll: number;
  /** 科技研究时间倍率 */
  techTime: Record<number, number>;
  /** 单位/建筑费用加减（如库曼马厩 -75 木） */
  costAdd: Record<string, Partial<Record<Res, number>>>;
  /** 存放资源时额外比例（丹麦 res 299：食物 +5%） */
  depositBonus: Partial<Record<Res, number>>;
  /** 到达新时代时直接发放的资源（res 0–3） */
  grant: Stock;
  /** 额外人口上限（匈奴 res 4） */
  popBonus: number;
  /** 农民不需要回仓（高棉）：耕作无走路时间 */
  farmNoWalk: boolean;
  start: Stock;
}
function baseMods(): Mods {
  return {
    rate: {},
    carry: {},
    speed: 1,
    tcSpeed: 1,
    costMul: {},
    timeMul: {},
    techCost: {},
    techCostAll: 1,
    techTime: {},
    costAdd: {},
    depositBonus: {},
    grant: { food: 0, wood: 0, gold: 0, stone: 0 },
    popBonus: 0,
    farmNoWalk: false,
    start: { ...START },
  };
}
const RES_START: Record<number, Res> = { 91: 'food', 92: 'wood', 93: 'stone', 94: 'gold' };
const COST_ATTR: Record<string, Res | 'all'> = { cost: 'all', foodCost: 'food', woodCost: 'wood', goldCost: 'gold', stoneCost: 'stone' };
/** res 0–3：当前库存 */
const RES_STOCK: Record<number, Res> = { 0: 'food', 1: 'wood', 2: 'stone', 3: 'gold' };
const TECH_RES: Record<string, Res | 'all'> = { Food: 'food', Wood: 'wood', Gold: 'gold', Stone: 'stone', '-1': 'all' };
const RES_DEPOSIT: Record<number, Res> = { 299: 'food' };
/**
 * 高棉 tech 654「C-Bonus, Instant Farmers」在 .dat（185872，effect 690）里只有三条命令：
 * res 33 set 50、农民（214/259）workRate ×0.95。res 33 是各文明加成的标记值（丹麦 35/36、格鲁吉亚 9…），
 * 50 对应「农民直接入库、无需回仓」，引擎按这个标记取消耕作的回仓走路。×0.95 已通过 task:farm 生效。
 */
const RES33_INSTANT_FARMERS = 50;
// 来源：.dat 本身没有定义 res 33=50 的含义（只是 set 50 这一条命令），含义来自玩法说明：
// https://ageofempires.fandom.com/wiki/Civilization_bonus#Khmer 「Farmers don't carry food but rather add it directly to the stockpile without any drop-off, but work 5% slower」
// https://ageofempires.fandom.com/wiki/Farm_(Age_of_Empires_II)（update 34699 起农民无需回仓）。详见 docs/BUILD-SIM.md「文明加成」

function applyEffects(m: Mods, effects: EffectRow['effects']) {
  for (const x of effects) {
    const v = x.v ?? 0;
    if (x.kind === 'attr' && x.target && x.attr && (x.op === 'mul' || x.op === 'add')) {
      const t = x.target;
      const key = t.startsWith('task:') ? t.slice(5) : t === 'villager' || t === 'class:4' || t === 'unit:83' ? 'villager' : t;
      const mul = (o: Record<string, number>, k: string) => {
        if (x.op === 'mul') o[k] = (o[k] ?? 1) * v;
      };
      if (x.attr === 'workRate') {
        if (key === 'unit:109') m.tcSpeed *= x.op === 'mul' ? v : 1;
        else mul(m.rate, key);
      } else if (x.attr === 'carry') {
        if (x.op === 'mul') mul(m.carry, key);
        else m.carry['add:' + key] = (m.carry['add:' + key] ?? 0) + v;
      } else if (x.attr === 'speed' && key === 'villager' && x.op === 'mul') m.speed *= v;
      else if (x.attr in COST_ATTR && x.op === 'mul') {
        const id = key === 'villager' ? 'unit:83' : key;
        const r = COST_ATTR[x.attr]!;
        const o = (m.costMul[id] ??= {});
        o[r] = (o[r] ?? 1) * v;
      } else if (x.attr in COST_ATTR && x.op === 'add' && COST_ATTR[x.attr] !== 'all') {
        const o = (m.costAdd[key] ??= {});
        const r = COST_ATTR[x.attr] as Res;
        o[r] = (o[r] ?? 0) + v;
      } else if (x.attr === 'trainTime' && x.op === 'mul') mul(m.timeMul, key === 'villager' ? 'unit:83' : key);
    } else if (x.kind === 'res' && x.res !== undefined) {
      if (RES_START[x.res] && x.op === 'add') m.start[RES_START[x.res]!] += v;
      else if (RES_STOCK[x.res] && x.op === 'add') m.grant[RES_STOCK[x.res]!] += v;
      else if (RES_DEPOSIT[x.res] && x.op === 'add') m.depositBonus[RES_DEPOSIT[x.res]!] = (m.depositBonus[RES_DEPOSIT[x.res]!] ?? 0) + v / 100;
      else if (x.res === 85 && x.op === 'set') m.techCostAll = v;
      else if (x.res === 4 && x.op === 'add') m.popBonus += v;
      else if (x.res === 33 && x.op === 'set' && v === RES33_INSTANT_FARMERS) m.farmNoWalk = true;
    } else if (x.kind === 'techTime' && x.tech !== undefined && x.op === 'set') m.techTime[x.tech] = v;
    else if (x.kind === 'techCost' && x.tech !== undefined && x.op === 'set') {
      const r = TECH_RES[String(x.res)];
      if (r) (m.techCost[x.tech] ??= {})[r] = v;
    }
  }
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
function runOnce(bo: BuildOrder, civ: string, eco: EcoData, ups: UpgradeData, P: SimParams) {
  const m = baseMods();
  // 按 tech 整条判定（#43 Steve）：只要有一条效果是未实现或未分类，这个 tech 的效果一条都不应用，
  // 避免成对效果只生效一半（如鞑靼 704 只有羊 workRate ×0.637 生效，加成变成减益）
  const scope = simScope(eco, [bo]);
  const rows = (eco.civEco[civ] ?? []).filter((r) => (P.team || r.source !== 'team') && techAtomicOk(r, scope));
  const freeByAge: Record<number, string[]> = {};
  let age = 1;
  const applyAge = () => {
    for (const r of rows)
      if (r.age === age)
        applyEffects(
          m,
          r.effects.filter((e) => e.kind !== 'freeTech'),
        );
    void freeByAge;
  };
  applyAge();
  // res 0–3 的黑暗时代条目：若同一文明对该资源也有 res 91–94 条目（波斯、图皮、阿兹特克、西西里），两者是同一加成的两种写法，只算一次；
  // 否则（埃塞俄比亚、德拉威「开局及每次升级时代」）开局直接发放
  const startRes = new Set(
    rows.flatMap((r) => r.effects.filter((e) => e.kind === 'res' && e.res !== undefined && RES_START[e.res]).map((e) => RES_START[e.res!]!)),
  );
  for (const r of Object.keys(m.grant) as Res[]) if (!startRes.has(r)) m.start[r] += m.grant[r];
  m.grant = { food: 0, wood: 0, gold: 0, stone: 0 };
  const techGold = (eco.civEco[civ] ?? []).some((r) => r.effects.some((e) => e.kind === 'res' && e.res === 269));
  // 免费科技：techCost/techTime=0 已由 tree 行处理；freeTech 行只记录名称，效果在研究时生效——此处视为到达所需时代即自动生效
  const freeNames = new Set(rows.flatMap((r) => r.effects.filter((e) => e.kind === 'freeTech').map((e) => (e.techName ?? '').toLowerCase())));
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
  };
  const startVils = START_VILS[civ] ?? 3;
  for (let i = 0; i < startVils; i++) assign();
  let popCap = Math.min(200, 5 + m.popBonus);
  let military = 1; // 侦察骑兵
  const built = new Map<number, number>([[TC, 1]]); // building id → 数量
  const constructions: Construction[] = [];
  const buildingsDone: { building: number; at: number }[] = [];
  const unitQueues = new Map<number, { p: Pending; left: number; unit: number }[]>(); // 训练建筑 → 队列
  const unitBusy = new Map<number, number>(); // 训练建筑 → 当前单位剩余时间
  // TC
  let tcState: { kind: 'vil' | 'research'; left: number; p?: Pending; age?: number; tech?: number } | null = null;
  const tcResearch: Pending[] = [];
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
          ? (eco.buildings[id]?.cost ?? {})
          : kind === 'tech'
            ? (eco.techs[id]?.cost ?? {})
            : (ups[id]?.[0] ?? {});
    const out: Stock = { food: 0, wood: 0, gold: 0, stone: 0 };
    for (const [k, v] of Object.entries(c)) out[RES_OF[k]!] = v ?? 0;
    if (kind === 'tech') {
      const tm = m.techCost[id] ?? {};
      for (const r of Object.keys(out) as Res[]) out[r] = Math.round(out[r] * m.techCostAll * (tm.all ?? 1) * (tm[r] ?? 1));
      return out;
    }
    const add = kind !== 'up' ? m.costAdd['unit:' + id] : undefined;
    if (add) for (const r of Object.keys(add) as Res[]) out[r] = Math.max(0, out[r] + add[r]!);
    const mul = m.costMul['unit:' + id];
    if (mul && kind !== 'up') for (const r of Object.keys(out) as Res[]) out[r] = Math.round(out[r] * (mul.all ?? 1) * (mul[r] ?? 1));
    return out;
  };
  const afford = (c: Stock) => (Object.keys(c) as Res[]).every((r) => stock[r] + 1e-9 >= c[r]);
  const pay = (c: Stock) => (Object.keys(c) as Res[]).forEach((r) => (stock[r] -= c[r]));
  const popUsed = () => born + military;
  const activeStep = () => Math.max(0, Math.min(nextStep - 1, nSteps - 1));

  const rate = (t: Task): number => {
    const et = ECO_TASK[t];
    const base = eco.villager.tasks[et]!;
    const wr = base.workRate * (m.rate[et] ?? 1) * (m.rate.villager ?? 1);
    const carry = base.carry * (m.carry[et] ?? 1) * (m.carry.villager ?? 1) + (m.carry['add:' + et] ?? 0) + (m.carry['add:villager'] ?? 0);
    const d = t === 'farm' && m.farmNoWalk ? 0 : NEAR.includes(t) ? P.nearTiles : P.walkTiles;
    const walk = (2 * d) / (eco.villager.speed * m.speed);
    return carry / (carry / wr + walk);
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
      // 训练需要建筑；人口检查
      if (a.type === 'train') {
        const at = eco.units[a.unit]?.at ?? [];
        if (!at.some((b) => (built.get(b) ?? 0) > 0)) break;
        if (popUsed() + 1 > popCap) {
          p.blockedSince ??= t;
          break;
        }
      }
      if (a.type === 'ageUp' && !ageReqOk(eco.ageReq?.[String(a.age)]?.req, built, civ)) {
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
        const bt = (eco.buildings[a.building]?.buildTime ?? 0) * (m.timeMul['unit:' + a.building] ?? 1);
        for (let k = 0; k < n; k++) constructions.push({ building: a.building, progress: 0, bt, step: p.step, p });
      } else if (a.type === 'train') {
        military++;
        const at = (eco.units[a.unit]?.at ?? []).find((b) => (built.get(b) ?? 0) > 0)!;
        const q = unitQueues.get(at) ?? [];
        q.push({ p, left: 1, unit: a.unit });
        unitQueues.set(at, q);
      } else if (a.type === 'research' || a.type === 'ageUp') {
        if (a.type === 'research' && eco.techs[a.tech]?.at !== TC) {
          // 非 TC 科技：在对应建筑研究（不占 TC）
          const time = (eco.techs[a.tech]?.researchTime ?? 0) * (m.techTime[a.tech] ?? 1);
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
        constructions.push({
          building: HOUSE,
          progress: 0,
          bt: (eco.buildings[HOUSE]?.buildTime ?? 25) * (m.timeMul['unit:' + HOUSE] ?? 1),
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
          c.progress += c.bt > 0 ? (TICK * (builders + 2)) / (3 * c.bt) : 1;
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
          c.progress += c.bt > 0 ? (TICK * 3) / (3 * c.bt) : 1;
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
        if (c.building === TC) popCap = Math.min(200, popCap + 5);
        if (c.p && !constructions.some((x) => x.p === c.p)) finish(c.p, t);
      } else if (c.p) {
        if (c.building > -100000 && c.p.a.type === 'research') applyEffects(m, eco.ecoTechs[c.p.a.tech]?.effects ?? []);
        finish(c.p, t);
      }
    }
    // 4) 训练建筑
    for (const [b, q] of unitQueues) {
      if (!q.length) continue;
      const cur = q[0]!;
      let left = unitBusy.get(b);
      if (left === undefined) {
        const u = eco.units[cur.unit]!;
        left = ((u.timeAt?.[String(b)] ?? u.trainTime) * (m.timeMul['unit:' + cur.unit] ?? 1)) / (m.rate['unit:' + b] ?? 1);
      }
      left -= TICK;
      if (left <= 1e-9) {
        q.shift();
        unitBusy.delete(b);
        finish(cur.p, t);
      } else unitBusy.set(b, left);
    }
    // 5) 城镇中心
    if (tcState) {
      tcState.left -= TICK * m.tcSpeed;
      if (tcState.left <= 1e-9) {
        if (tcState.kind === 'vil') assign();
        else if (tcState.p) {
          const a = tcState.p.a;
          if (a.type === 'ageUp') {
            age = a.age;
            researching = false;
            ageUps.find((x) => x.age === a.age)!.reachAt = r1(t);
            applyAge();
            // 西班牙的 res 3 −20 是抵消「研发科技返金」（res 269，未建模）里升级时代那份，未建模时一起不算
            for (const r of Object.keys(stock) as Res[]) if (!(r === 'gold' && techGold)) stock[r] += m.grant[r];
            m.grant = { food: 0, wood: 0, gold: 0, stone: 0 };
            for (const [id, et] of Object.entries(eco.ecoTechs))
              if (freeNames.has(((et as { en?: string }).en ?? '').toLowerCase()) || freeNames.has(((et as { name?: string }).name ?? '').toLowerCase())) {
                const ta = (et as { age?: number }).age ?? 1;
                if (ta <= age && !(m as unknown as { _free?: Set<string> })._free?.has(id)) {
                  const mm = m as unknown as { _free?: Set<string> };
                  (mm._free ??= new Set()).add(id);
                  applyEffects(m, et.effects);
                }
              }
          } else if (a.type === 'research') applyEffects(m, eco.ecoTechs[a.tech]?.effects ?? []);
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
          time = eco.techs[100 + a.age - 1]!.researchTime * (m.techTime[100 + a.age - 1] ?? 1);
          researching = true;
          ageUps.push({ age: a.age, clickAt: r1(t), reachAt: 0 });
        } else if (a.type === 'research') time = (eco.techs[a.tech]?.researchTime ?? 0) * (m.techTime[a.tech] ?? 1);
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
      if (r && alloc[k] > 0) stock[r] += alloc[k] * rate(k) * TICK * (1 + (m.depositBonus[r] ?? 0));
    }
    if (nextStep >= nSteps && doneAt.every((x) => x !== null)) break;
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
  return { startAt, doneAt, snap, stepAnoms, ageUps, researchAt, buildingsDone, tcIdleTotal: r1(tcIdleTotal), end: r1(t) };
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
    buildId: bo.id,
    civ,
    variant: null,
    params: { ...P, carryModel: 'continuous-trip' },
    ageUps,
    steps,
    buildingsDone: R.buildingsDone,
    anomalies: steps.flatMap((s) => s.anomalies).sort((a, b) => PRIO[a.type] - PRIO[b.type] || a.from - b.from),
    tcIdleTotal: R.tcIdleTotal,
    model: { version: MODEL_VERSION, assumptions: ASSUMPTIONS },
  };
}

// ───────── 文明加成覆盖（#42）：每条效果必须是 已处理 / 不影响开局（带原因）/ 影响开局但未实现 之一 ─────────

type Effect = EffectRow['effects'][number];
export type EffectClass = { kind: 'handled' } | { kind: 'irrelevant'; reason: string } | { kind: 'unhandled'; reason: string } | { kind: 'unknown' };

/** res 属性：不影响开局（模型层面）的，写明原因 */
export const IRRELEVANT_RES: Record<number, string> = {
  32: '帝王时代人口 +10（哥特），开局只到城堡',
  33: '文明加成标记值，不影响经济（高棉的 50 = 农民无需回仓，已处理）',
  78: '市场交易手续费（萨拉森），开局不交易',
  86: '团队加成，默认不计团队',
  88: '马来非经济属性',
  89: '团队加成（拜占庭僧侣）',
  90: '僧侣转化抗性（条顿）',
  97: '羊不会被敌方转走（凯尔特），单人模拟无关',
  178: '团队加成（条顿）',
  179: '团队加成（条顿）',
  191: '团队加成（阿兹特克圣物）',
  204: '马普切非经济属性',
  209: '开局显示敌方位置（越南）',
  210: '团队加成（缅甸圣物）',
  211: '高地伤害加成（鞑靼）',
  212: '高地伤害加成（鞑靼）',
  218: '封建时代可建城镇中心（库曼），开局不多建城镇中心',
  225: '团队加成（勃艮第）',
  251: '团队加成（孟加拉）',
  266: '帝王时代加成（越南）',
  271: '团队加成（格鲁吉亚）',
  272: '格鲁吉亚修理/建筑属性',
  273: '格鲁吉亚修理/建筑属性',
  283: '亚美尼亚特殊机制开关',
  291: '摧毁建筑抢掠资源（丹麦）',
  295: '图皮非经济属性',
  297: '瓦兰吉非经济属性',
  504: '团队加成（西班牙）',
};
/** res 属性：影响开局但本批未实现（对应文明标为不支持） */
export const UNHANDLED_RES: Record<number, string> = {
  69: '农田食物储量（西西里）：#43 不加新机制，有不确定就先置灰',
  292: '动物尸体不腐烂（女真）：#43 不加新机制，有不确定就先置灰',
  // 下列条目和同一文明的采集 workRate 成对出现：玛雅 ×0.87 配资源 ×1.15，鞑靼羊 ×0.637 配 ×1.57，哥特狩猎 ×0.813 配 ×1.23，乘起来约等于 1。
  // 模型已经算了 workRate 的减速，却没算这一半，到封建的时间会偏慢，所以属于影响开局但未实现
  47: '资源储量倍率，和采集 workRate 成对出现（玛雅），未建模',
  79: '资源储量倍率，和采集 workRate 成对出现（玛雅），未建模',
  189: '资源储量倍率，和采集 workRate 成对出现（玛雅），未建模',
  190: '资源储量倍率，和采集 workRate 成对出现（玛雅），未建模',
  216: '家畜食物倍率，和牧羊 workRate 成对出现（鞑靼 ×0.637/×1.57），未建模',
  219: '资源储量倍率，和采集 workRate 成对出现（玛雅），未建模',
  268: '猎物倍率，和狩猎 workRate 成对出现（哥特 ×0.813/×1.23），未建模',
  296: '资源储量倍率，和采集 workRate 成对出现（玛雅），未建模',
  215: '采果工存放的食物 +25%（马普切 1381），未建模',
  85: '科技费用折扣是否作用于升级时代待 .dat 核实（汉）',
  234: '开局/升级时代/经济科技送村民（孟加拉、魏等）未建模',
  237: '波兰庄园农田加成未建模',
  238: '波兰庄园农田加成未建模',
  239: '波兰庄园农田加成未建模',
  241: '波兰采石换金未建模',
  254: '古尔贾拉家畜机制未建模',
  267: '采浆果同时产木头（葡萄牙）未建模',
  269: '研发科技返金（西班牙）未建模',
  276: '采金加成（马里）未建模',
  298: '羊/猎物/渔船额外产金（瓦兰吉）未建模',
  502: '伐木同时产食物（蜀）未建模',
};
/** 已在 START_VILS 建模送村民的文明 tech（汉 302、玛雅 554） */
const RES234_HANDLED = new Set([302, 554]);
/** 整条待核实的文明 tech → 原因 */
const PENDING_TECH: Record<number, string> = {
  654: '高棉「农民无需回仓」：res 33=50 的含义 .dat 本身没有定义，现有开局里也没能证明它影响结果，先置灰（代码保留）',
};
const FARM_UNITS = new Set([50, 1187]);
const TC_UNITS = new Set([TC, 71, 141, 142]);

const HANDLED_RES = (res: number, op?: string) => ((RES_START[res] || RES_STOCK[res] || RES_DEPOSIT[res] || res === 4) && op === 'add') || false;
const HANDLED_ATTR = new Set(['workRate', 'carry', 'trainTime', ...Object.keys(COST_ATTR)]);

/** 开局涉及的对象：村民、城镇中心（含升级后形态）、房子、时代升级、经济科技 + 所有开局里出现的单位/建筑/科技 */
export function simScope(eco: EcoData, bos: BuildOrder[]) {
  const units = new Set<number>([83]);
  const buildings = new Set<number>([...TC_UNITS, HOUSE, ...FARM_UNITS]);
  const techs = new Set<number>([101, 102, 103, ...Object.keys(eco.ecoTechs).map(Number)]);
  for (const b of bos)
    for (const st of b.steps)
      for (const a of st.actions) {
        if (a.type === 'build') buildings.add(a.building);
        if (a.type === 'train' || a.type === 'upgrade') units.add(a.unit);
        if (a.type === 'research') techs.add(a.tech);
      }
  return { units, buildings, techs };
}

/** tech 是否可以应用：整条 tech 里没有未实现/未分类的效果 */
function techAtomicOk(row: EffectRow, scope: ReturnType<typeof simScope>): boolean {
  return row.effects.every((e) => {
    const k = classifyCivEffect(e, row as { source?: string; tech?: number }, scope).kind;
    return k !== 'unhandled' && k !== 'unknown';
  });
}

/** 判定一条文明效果 */
export function classifyCivEffect(e: Effect, row: { source?: string; tech?: number }, scope: ReturnType<typeof simScope>): EffectClass {
  if (row.source === 'team') return { kind: 'irrelevant', reason: '团队加成，默认不计团队' };
  if (row.tech !== undefined && PENDING_TECH[row.tech]) return { kind: 'unhandled', reason: PENDING_TECH[row.tech]! };
  if (e.kind === 'freeTech') return { kind: 'handled' };
  if (e.kind === 'techCost' || e.kind === 'techTime') {
    if (e.tech === undefined || !scope.techs.has(e.tech)) return { kind: 'irrelevant', reason: '开局不涉及的科技' };
    if (e.op === 'set' && (e.kind === 'techTime' || TECH_RES[String(e.res)])) return { kind: 'handled' };
    return { kind: 'unknown' };
  }
  if (e.kind === 'res') {
    if (e.res === undefined) return { kind: 'unknown' };
    if (HANDLED_RES(e.res, e.op) || (e.res === 33 && e.op === 'set' && e.v === RES33_INSTANT_FARMERS)) return { kind: 'handled' };
    if (e.res === 234 && row.tech !== undefined && RES234_HANDLED.has(row.tech)) return { kind: 'handled' };
    if (UNHANDLED_RES[e.res]) return { kind: 'unhandled', reason: UNHANDLED_RES[e.res]! };
    if (IRRELEVANT_RES[e.res]) return { kind: 'irrelevant', reason: IRRELEVANT_RES[e.res]! };
    return { kind: 'unknown' };
  }
  if (e.kind === 'attr' && e.target) {
    const t = e.target;
    const id = t.startsWith('unit:') ? Number(t.slice(5)) : NaN;
    const vil = t.startsWith('task:') || t === 'villager' || t === 'class:4' || id === 83;
    if (!vil && !scope.units.has(id) && !scope.buildings.has(id)) return { kind: 'irrelevant', reason: '开局不涉及的单位/建筑/类别' };
    if (e.attr === 'speed') return vil && e.op === 'mul' ? { kind: 'handled' } : { kind: 'irrelevant', reason: '非村民移速不影响开局时间' };
    if (FARM_UNITS.has(id) && e.attr === 'workRate')
      return { kind: 'unhandled', reason: '农田单位 workRate 与 task:farm 是否重复待 .dat 核实（罗马、斯拉夫）' };
    if (TC_UNITS.has(id) && id !== TC && e.attr === 'workRate') return { kind: 'unhandled', reason: '升级后城镇中心（71/141/142）工作速度未建模（波斯）' };
    if (FARM_UNITS.has(id) || (TC_UNITS.has(id) && id !== TC)) return { kind: 'irrelevant', reason: '农田/升级后城镇中心的非速度属性不影响开局' };
    if (e.attr && HANDLED_ATTR.has(e.attr) && (e.op === 'mul' || (e.op === 'add' && (e.attr === 'carry' || (e.attr in COST_ATTR && e.attr !== 'cost')))))
      return { kind: 'handled' };
    return { kind: 'unknown' };
  }
  return { kind: 'unknown' };
}

const describeEffect = (civ: string, row: { tech?: number }, e: Effect) =>
  `${civ} tech ${row.tech ?? '?'}: ${e.kind} ${e.kind === 'res' ? 'res ' + e.res : (e.target ?? e.tech ?? '')} ${e.attr ?? ''} ${e.op ?? ''} ${e.v ?? ''}`
    .replace(/\s+/g, ' ')
    .trim();

/** 某文明未处理的效果：影响开局但未实现 + 未分类（Kent #42 草稿接口） */
export function unhandledEffects(eco: EcoData, civ: string, bos: BuildOrder[] = []): { effect: string; kind: 'unhandled' | 'unknown'; reason: string }[] {
  const scope = simScope(eco, bos);
  const out: { effect: string; kind: 'unhandled' | 'unknown'; reason: string }[] = [];
  for (const r of eco.civEco[civ] ?? [])
    for (const e of r.effects) {
      const c = classifyCivEffect(e, r as { source?: string; tech?: number }, scope);
      if (c.kind === 'unhandled') out.push({ effect: describeEffect(civ, r as { tech?: number }, e), kind: 'unhandled', reason: c.reason });
      else if (c.kind === 'unknown') out.push({ effect: describeEffect(civ, r as { tech?: number }, e), kind: 'unknown', reason: '未分类的效果类型' });
    }
  return out;
}

/** 文明是否被开局模拟完整支持：没有「影响开局但未实现」也没有未分类效果；UI（#39）据此置灰 */
export function simSupport(eco: EcoData, civ: string, bos: BuildOrder[] = []): { supported: boolean; reasons: string[] } {
  const u = unhandledEffects(eco, civ, bos);
  return { supported: u.length === 0, reasons: [...new Set(u.map((x) => x.reason))] };
}

/** 所有文明里未分类的效果（bo:check 遇到即失败） */
export function unknownCivEffects(eco: EcoData, bos: BuildOrder[] = []): string[] {
  return Object.keys(eco.civEco).flatMap((c) =>
    unhandledEffects(eco, c, bos)
      .filter((x) => x.kind === 'unknown')
      .map((x) => x.effect),
  );
}
