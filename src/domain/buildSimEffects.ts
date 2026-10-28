import type { Res, Stock, EffectRow } from './buildSim';
import {
  MAYAN_RESOURCE_TASKS,
  RES_FORAGER_WOOD,
  RES_LUMBER_FOOD,
  RES_GOLD_PRODUCTIVITY,
  RES_WILD_FOOD_GOLD,
  RES_SHEPHERD_PRODUCTIVITY,
} from './buildSimCivRules';
const START: Stock = { food: 200, wood: 200, gold: 100, stone: 200 };
export const TC_BY_AGE = [109, 71, 141, 142];
export const TC_UNITS = new Set(TC_BY_AGE);
/** 文明修正 */
export interface Mods {
  rate: Record<string, number>;
  carry: Record<string, number>;
  speed: number;
  unitSpeed: Record<string, number>;
  /** 城镇中心工作速度倍率，键为 unit:<TC 单位 id>；计时时取当前时代的 TC（见 TC_BY_AGE） */
  tcRate: Record<string, number>;
  costMul: Record<string, Partial<Record<Res | 'all', number>>>;
  timeMul: Record<string, number>;
  /** 科技费用修正（按资源；all = 全部资源），保留 .dat 的 set/mul/add 语义 */
  techCost: Record<number, Partial<Record<Res | 'all', NumMod>>>;
  /** 全部科技费用倍率（中国 res 85） */
  techCostAll: number;
  /** 科技研究时间修正（.dat 效果 103：set 为绝对秒数，mul 为倍率） */
  techTime: Record<number, NumMod>;
  /** 单位/建筑费用加减（如库曼马厩 -75 木） */
  costAdd: Record<string, Partial<Record<Res, number>>>;
  /** 存放资源时额外比例（丹麦 res 299：食物 +5%） */
  depositBonus: Partial<Record<Res, number>>;
  /** issue197：仅已核马里595的建筑class木费倍率；不扩展其它文明的建筑class支付口径 */
  buildingWoodCost: Record<number, number>;
  /** 到达新时代时直接发放的资源（res 0–3） */
  grant: Stock;
  /** 额外人口上限（匈奴 res 4） */
  popBonus: number;
  /** 农民不需要回仓（高棉）：耕作无走路时间 */
  farmNoWalk: boolean;
  /** 每完成一项科技（含升级时代、单位升级）返还的黄金（西班牙 res 269） */
  techReward: number;
  /** 猎物食物倍率（res 268，哥特 ×1.23）：每采 1 单位猎物，入账 ×倍率 */
  huntFoodMul: number;
  /** 葡萄牙 res267：每单位采果食物的额外木材（百分数 / 100），不改变携带量或主资源率 */
  foragerWood: number;
  /** 蜀 res502：有效伐木收入兼产食物的百分比，不改变木材主收入或携带量 */
  lumberFood: number;
  /** 瓦兰吉 res298：牧羊/狩猎/捕鱼有效食物收入兼产黄金的百分比 */
  varangianGold: number;
  /** 鞑靼res216：与同条牧羊工作率配对的收集产量倍率，不是库存赠送 */
  sheepFoodMul: number;
  /** 玛雅：各原始任务独立读取的产量倍率，不把190叠到其它食物任务。 */
  mayanProductivity: Record<string, number>;
  /** 仅玛雅显式team开关下的完整墙/门类别费用。 */
  mayanWallCost: Record<number, number>;
  start: Stock;
}
/** 数值修正：按 .dat 效果顺序累积，set 覆盖之前的一切，mul/add 依次叠加。值 = (set ?? 原值) × mul + add */
export interface NumMod {
  set?: number;
  mul: number;
  add: number;
}
export function pushMod(cur: NumMod | undefined, op: string | undefined, v: number): NumMod {
  const m = cur ?? { mul: 1, add: 0 };
  if (op === 'set') return { set: v, mul: 1, add: 0 };
  if (op === 'mul') return { set: m.set, mul: m.mul * v, add: m.add * v };
  return { set: m.set, mul: m.mul, add: m.add + v };
}
export const applyMod = (base: number, m?: NumMod): number => (m ? (m.set ?? base) * m.mul + m.add : base);
export const TECH_OPS = new Set(['set', 'mul', 'add']);

export function baseMods(): Mods {
  return {
    rate: {},
    carry: {},
    speed: 1,
    unitSpeed: {},
    tcRate: {},
    costMul: {},
    timeMul: {},
    techCost: {},
    techCostAll: 1,
    techTime: {},
    costAdd: {},
    depositBonus: {},
    buildingWoodCost: {},
    grant: { food: 0, wood: 0, gold: 0, stone: 0 },
    popBonus: 0,
    farmNoWalk: false,
    techReward: 0,
    huntFoodMul: 1,
    foragerWood: 0,
    lumberFood: 0,
    varangianGold: 0,
    sheepFoodMul: 1,
    mayanProductivity: {},
    mayanWallCost: {},
    start: { ...START },
  };
}
export const RES_START: Record<number, Res> = { 91: 'food', 92: 'wood', 93: 'stone', 94: 'gold' };
export const COST_ATTR: Record<string, Res | 'all'> = { cost: 'all', foodCost: 'food', woodCost: 'wood', goldCost: 'gold', stoneCost: 'stone' };
/** res 0–3：当前库存 */
export const RES_STOCK: Record<number, Res> = { 0: 'food', 1: 'wood', 2: 'stone', 3: 'gold' };
export const TECH_RES: Record<string, Res | 'all'> = { Food: 'food', Wood: 'wood', Gold: 'gold', Stone: 'stone', '-1': 'all' };
export const RES_DEPOSIT: Record<number, Res> = { 299: 'food' };
/**
 * res 268：猎物所含食物倍率（issue 120 评论 6157775069 解码）。哥特 tech 402 里与狩猎 workRate ×0.813008 成对出现，
 * 每从猎物扣 1 入账 ×1.23，净采集速度 = workRate × 0.813008 × 1.23 ≈ 原值。只作用于狩猎（eco 任务 hunt）；
 * 是否也作用于狩猎以外的采集：未核实（res 268 是玩家级资源，.dat 看不出限定范围），模型只按狩猎算。
 */
export const RES_HUNT_FOOD = 268;
/** 高棉只在完整来源门控下应用本站免回仓连续近似；不声称已证明DE185872选择器的可执行映射。见docs/design/khmer197.md。 */
/**
 * 西班牙 tech 186「C-Bonus, Tech reward」在 .dat 里只有 res 269 set 300 一条命令（#42）。
 * 金额：https://ageofempires.fandom.com/wiki/Spanish_(Age_of_Empires_II) 「Receive 20 gold for each technology researched.」（已打开核对，见 #42 issuecomment-6106638881）
 * 时机：研发完成时到账，https://ageofempires.fandom.com/wiki/Atonement 「receive 20 gold after researching」（wiki 措辞，引擎层面未核实）
 * 300 怎么换算成 20 金：未核实（.dat 定不了），所以金额用常量，不从 300 推算。
 * 升级时代那一次返金由 tech 323/324/326（res 3 −20，到达新时代时发放）抵消，升时代净 0 金（.dat 确认）。
 */
export const SPANISH_TECH_REWARD_GOLD = 20;

export interface RowApplication {
  foragerWood?: boolean;
  lumberFood?: boolean;
  malianGold?: boolean;
  buildingWood?: boolean;
  varangianGold?: boolean;
  tatarShepherd?: boolean;
  mayanResource?: boolean;
  mayanWall?: boolean;
}
/** All special scalar resource channels share the same dispatch; context admission lives in the registry. */
const RESOURCE_APPLICATIONS: readonly {
  flag: keyof RowApplication;
  res: number;
  op: string;
  apply: (mods: Mods, value: number) => void;
}[] = [
  {
    flag: 'foragerWood',
    res: RES_FORAGER_WOOD,
    op: 'add',
    apply: (m, v) => {
      m.foragerWood += v / 100;
    },
  },
  {
    flag: 'lumberFood',
    res: RES_LUMBER_FOOD,
    op: 'set',
    apply: (m, v) => {
      m.lumberFood = v / 100;
    },
  },
  {
    flag: 'malianGold',
    res: RES_GOLD_PRODUCTIVITY,
    op: 'add',
    apply: (m, v) => {
      m.depositBonus.gold = (m.depositBonus.gold ?? 0) + v / 100;
    },
  },
  {
    flag: 'varangianGold',
    res: RES_WILD_FOOD_GOLD,
    op: 'set',
    apply: (m, v) => {
      m.varangianGold = v / 100;
    },
  },
  {
    flag: 'tatarShepherd',
    res: RES_SHEPHERD_PRODUCTIVITY,
    op: 'mul',
    apply: (m, v) => {
      m.sheepFoodMul *= v;
    },
  },
];
export function applyEffects(m: Mods, effects: EffectRow['effects'], application: RowApplication = {}) {
  for (const x of effects) {
    const v = x.v ?? 0;
    if (x.kind === 'attr' && x.target && x.attr && (x.op === 'mul' || x.op === 'add')) {
      const t = x.target;
      const key = t.startsWith('task:') ? t.slice(5) : t === 'villager' || t === 'class:4' || t === 'unit:83' ? 'villager' : t;
      const mul = (o: Record<string, number>, k: string) => {
        if (x.op === 'mul') o[k] = (o[k] ?? 1) * v;
      };
      if (x.attr === 'workRate') {
        // 83/293是独立的闲置对象，已核玛雅任务不可再叠乘这条0.87。
        if (application.mayanResource && t === 'villager') continue;
        if (key.startsWith('unit:') && TC_UNITS.has(Number(key.slice(5)))) mul(m.tcRate, key);
        else mul(m.rate, key);
      } else if (x.attr === 'carry') {
        if (x.op === 'mul') mul(m.carry, key);
        else m.carry['add:' + key] = (m.carry['add:' + key] ?? 0) + v;
      } else if (x.attr === 'speed' && key === 'villager' && x.op === 'mul') m.speed *= v;
      else if (x.attr === 'speed' && x.op === 'mul') mul(m.unitSpeed, key);
      else if (x.attr in COST_ATTR && x.op === 'mul') {
        const id = key === 'villager' ? 'unit:83' : key;
        const r = COST_ATTR[x.attr]!;
        const o = (m.costMul[id] ??= {});
        o[r] = (o[r] ?? 1) * v;
        if (application.buildingWood && x.attr === 'woodCost' && key.startsWith('class:')) {
          const cls = Number(key.slice(6));
          m.buildingWoodCost[cls] = (m.buildingWoodCost[cls] ?? 1) * v;
        }
        if (application.mayanWall && x.attr === 'cost' && key.startsWith('class:')) {
          const cls = Number(key.slice(6));
          m.mayanWallCost[cls] = (m.mayanWallCost[cls] ?? 1) * v;
        }
      } else if (x.attr in COST_ATTR && x.op === 'add' && COST_ATTR[x.attr] !== 'all') {
        const o = (m.costAdd[key] ??= {});
        const r = COST_ATTR[x.attr] as Res;
        o[r] = (o[r] ?? 0) + v;
      } else if (x.attr === 'trainTime' && x.op === 'mul') mul(m.timeMul, key === 'villager' ? 'unit:83' : key);
    } else if (x.kind === 'res' && x.res !== undefined) {
      if (application.mayanResource && MAYAN_RESOURCE_TASKS[x.res]) {
        const task = MAYAN_RESOURCE_TASKS[x.res]!;
        m.mayanProductivity[task] = (m.mayanProductivity[task] ?? 1) * v;
        continue;
      }
      if (RES_START[x.res] && x.op === 'add') m.start[RES_START[x.res]!] += v;
      else if (RES_STOCK[x.res] && x.op === 'add') m.grant[RES_STOCK[x.res]!] += v;
      else if (RES_DEPOSIT[x.res] && x.op === 'add') m.depositBonus[RES_DEPOSIT[x.res]!] = (m.depositBonus[RES_DEPOSIT[x.res]!] ?? 0) + v / 100;
      else if (x.res === 85 && x.op === 'set') m.techCostAll = v;
      else if (x.res === 4 && x.op === 'add') m.popBonus += v;
      else if (x.res === 269 && x.op === 'set' && v > 0) m.techReward = SPANISH_TECH_REWARD_GOLD;
      else if (x.res === RES_HUNT_FOOD && x.op === 'mul') m.huntFoodMul *= v;
      else RESOURCE_APPLICATIONS.find((rule) => application[rule.flag] && x.res === rule.res && x.op === rule.op)?.apply(m, v);
    } else if (x.kind === 'techTime' && x.tech !== undefined && TECH_OPS.has(x.op ?? '')) m.techTime[x.tech] = pushMod(m.techTime[x.tech], x.op, v);
    else if (x.kind === 'techCost' && x.tech !== undefined && TECH_OPS.has(x.op ?? '')) {
      const r = TECH_RES[String(x.res)];
      if (r) {
        const o = (m.techCost[x.tech] ??= {});
        o[r] = pushMod(o[r], x.op, v);
      }
    }
  }
}
