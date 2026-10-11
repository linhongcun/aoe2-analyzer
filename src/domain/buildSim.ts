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

export interface Anomaly {
  type: 'idle_tc' | 'pop_block' | 'resource_short' | 'timeout';
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
  '升级时代所需的前置建筑视为已满足；第二、三座城镇中心建成后不额外产村民。',
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
  techCost: Record<number, Partial<Record<Res, number>> | 'free'>;
  techTime: Record<number, number>;
  start: Stock;
}
function baseMods(): Mods {
  return { rate: {}, carry: {}, speed: 1, tcSpeed: 1, costMul: {}, timeMul: {}, techCost: {}, techTime: {}, start: { ...START } };
}
const RES_START: Record<number, Res> = { 91: 'food', 92: 'wood', 93: 'stone', 94: 'gold' };
const COST_ATTR: Record<string, Res | 'all'> = { cost: 'all', foodCost: 'food', woodCost: 'wood', goldCost: 'gold', stoneCost: 'stone' };

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
      } else if (x.attr === 'trainTime' && x.op === 'mul') mul(m.timeMul, key === 'villager' ? 'unit:83' : key);
    } else if (x.kind === 'res' && x.res !== undefined && RES_START[x.res] && x.op === 'add') m.start[RES_START[x.res]!] += v;
    else if (x.kind === 'techTime' && x.tech !== undefined && x.op === 'set' && v === 0) m.techTime[x.tech] = 0;
    else if (x.kind === 'techCost' && x.tech !== undefined && x.op === 'set' && v === 0) m.techCost[x.tech] = 'free';
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
  const rows = (eco.civEco[civ] ?? []).filter((r) => P.team || r.source !== 'team');
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
  let popCap = 5;
  let military = 1; // 侦察骑兵
  const built = new Map<number, number>([[TC, 1]]); // building id → 数量
  const constructions: Construction[] = [];
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
    let c: Cost = {};
    if (kind === 'unit') c = id === 83 ? eco.villager.cost : (eco.units[id]?.cost ?? {});
    else if (kind === 'building') c = eco.buildings[id]?.cost ?? {};
    else if (kind === 'tech') c = eco.techs[id]?.cost ?? {};
    else c = ups[id]?.[0] ?? {};
    const out: Stock = { food: 0, wood: 0, gold: 0, stone: 0 };
    for (const [k, v] of Object.entries(c)) out[RES_OF[k]!] = v ?? 0;
    if (kind === 'tech' && m.techCost[id] === 'free') return { food: 0, wood: 0, gold: 0, stone: 0 };
    const mul = m.costMul['unit:' + id];
    if (mul && kind !== 'tech' && kind !== 'up') for (const r of Object.keys(out) as Res[]) out[r] = Math.round(out[r] * (mul.all ?? 1) * (mul[r] ?? 1));
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
    const d = NEAR.includes(t) ? P.nearTiles : P.walkTiles;
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
    startAt[i] = r1(t);
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

  let t = 0;
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
          const time = m.techTime[a.tech] === 0 ? 0 : (eco.techs[a.tech]?.researchTime ?? 0);
          constructions.push({ building: -a.tech, progress: 0, bt: time, step: p.step, p, borrowed: undefined });
        } else tcResearch.push(p);
      } else if (a.type === 'upgrade') {
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
        left = (u.timeAt?.[String(b)] ?? u.trainTime) * (m.timeMul['unit:' + cur.unit] ?? 1);
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
          time = eco.techs[100 + a.age - 1]!.researchTime;
          researching = true;
          ageUps.push({ age: a.age, clickAt: r1(t), reachAt: 0 });
        } else if (a.type === 'research') time = m.techTime[a.tech] === 0 ? 0 : (eco.techs[a.tech]?.researchTime ?? 0);
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
      if (r && alloc[k] > 0) stock[r] += alloc[k] * rate(k) * TICK;
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
    const i = startAt.findIndex((x, k) => x === null || doneAt[k] === null);
    stepAnoms[Math.max(0, i)]!.push({ type: 'timeout', from: r1(t), to: r1(t), reasonZh: '模拟超过 60 分钟仍未完成（资源或建筑条件无法满足）' });
  }
  return { startAt, doneAt, snap, stepAnoms, ageUps, tcIdleTotal: r1(tcIdleTotal), end: r1(t) };
}

const PRIO: Record<Anomaly['type'], number> = { idle_tc: 0, timeout: 1, pop_block: 2, resource_short: 3 };
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
    anomalies: steps.flatMap((s) => s.anomalies).sort((a, b) => PRIO[a.type] - PRIO[b.type] || a.from - b.from),
    tcIdleTotal: R.tcIdleTotal,
    model: { version: MODEL_VERSION, assumptions: ASSUMPTIONS },
  };
}
