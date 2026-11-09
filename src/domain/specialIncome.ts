import type { EffectRow } from './buildSim';
import type { Mods, RowApplication } from './buildSimEffects';
import {
  RES_FORAGER_WOOD,
  RES_LUMBER_FOOD,
  RES_GOLD_PRODUCTIVITY,
  RES_WILD_FOOD_GOLD,
  RES_SHEPHERD_PRODUCTIVITY,
  foragerWoodIncome,
  lumberFoodIncome,
  varangianGoldIncome,
  hasLumberFoodContext,
  hasMalianGoldContext,
  hasVarangianGoldContext,
  hasTatarShepherdContext,
  hasMayanTreeContext,
} from './buildSimCivRules';
import { mapucheForagerFood, type MapucheContext } from './mapucheEconomy';
import { polishStoneGold, type PolishContext } from './polishEconomy';

export type SpecialRes = 'food' | 'wood' | 'gold' | 'stone';
export type SpecialScope = { poles?: PolishContext; mapuche?: MapucheContext; [key: string]: unknown };
export type SpecialEffect = EffectRow['effects'][number];
export type SpecialIncome = Partial<Record<SpecialRes, number>>;

/**
 * 特殊资源渠道的唯一主表（issue 816）。
 *
 * - 收入：foragerWood / foragerFood / lumberFood / varangianGold / Polish stoneGold
 * - 只修饰：malianGold / tatarShepherd
 * - 行放行：mayanResource
 * 三张派生表（RESOURCE_APPLICATIONS / RESOURCE_HANDLERS / APPLICATION_RULES）只从这里取条目；
 * 非收入/非放行例外集中在 SPECIAL_INCOME_EXCEPTIONS（269/268、buildingWood/mayanWall）。
 */
export interface SpecialIncomeRule {
  flag?: keyof RowApplication;
  res?: number;
  op?: string;
  civ?: string;
  gather?: boolean;
  apply?: (mods: Mods, value: number) => void;
  accepts?: (row: EffectRow, effect: SpecialEffect) => boolean | undefined;
  allows?: (row: EffectRow, scope: SpecialScope) => boolean;
  income?: (mods: Mods, task: string, rate: number, scope: SpecialScope) => SpecialIncome | undefined;
}

const extra = (res: SpecialRes, value: number): SpecialIncome | undefined => (value ? { [res]: value } : undefined);

/** 不属于收入/行放行的显式例外；派生表从这里读取，避免静默分叉。 */
export const SPECIAL_INCOME_EXCEPTIONS = {
  classificationOnly: [
    { res: 269, op: 'set', reason: '西班牙科技返金：只分类，不入账' },
    { res: 268, op: 'mul', reason: '猎物食物倍率：只分类，不入账' },
  ],
  applicationOnly: [
    { flag: 'buildingWood', civ: 'Malians', reason: '马里建筑木费折扣在 attr cost 分支处理，不是资源渠道' },
    { flag: 'mayanWall', civ: 'Mayans', reason: '玛雅墙费折扣在 attr cost 分支处理，不是资源渠道' },
  ],
} as const;

export const SPECIAL_INCOME: readonly SpecialIncomeRule[] = [
  {
    flag: 'foragerWood',
    res: RES_FORAGER_WOOD,
    op: 'add',
    apply: (m, v) => {
      m.foragerWood += v / 100;
    },
    accepts: (row) => row.tech === 453,
    gather: true,
    allows: (row) => row.tech === 453,
    income: (m, task, rate) => (m.foragerWood ? extra('wood', foragerWoodIncome(m, task, rate)) : undefined),
  },
  {
    flag: 'foragerFood',
    res: 215,
    op: 'add',
    civ: 'Mapuche',
    gather: true,
    apply: (m, v) => {
      m.foragerFood += v / 100;
    },
    allows: (row, scope) => scope.mapuche?.admitted.get(1381) === row,
    income: (m, task, rate) => (m.foragerFood ? extra('food', mapucheForagerFood(m, task, rate)) : undefined),
  },
  {
    flag: 'lumberFood',
    res: RES_LUMBER_FOOD,
    op: 'set',
    apply: (m, v) => {
      m.lumberFood = v / 100;
    },
    accepts: hasLumberFoodContext,
    gather: true,
    allows: (row) => hasLumberFoodContext(row) === true,
    income: (m, task, rate) => (m.lumberFood ? extra('food', lumberFoodIncome(m, task, rate)) : undefined),
  },
  {
    flag: 'malianGold',
    res: RES_GOLD_PRODUCTIVITY,
    op: 'add',
    civ: 'Malians',
    gather: true,
    apply: (m, v) => {
      m.depositBonus.gold = (m.depositBonus.gold ?? 0) + v / 100;
    },
    accepts: hasMalianGoldContext,
    allows: (row) => hasMalianGoldContext(row) === true,
  },
  {
    flag: 'varangianGold',
    res: RES_WILD_FOOD_GOLD,
    op: 'set',
    civ: 'Varangians',
    gather: true,
    apply: (m, v) => {
      m.varangianGold = v / 100;
    },
    accepts: (row, effect) => Number.isFinite(effect.v) && effect.v! >= 0 && hasVarangianGoldContext(row),
    allows: (row) => hasVarangianGoldContext(row) === true,
    income: (m, task, rate) => (m.varangianGold ? extra('gold', varangianGoldIncome(m, task, rate)) : undefined),
  },
  {
    flag: 'tatarShepherd',
    res: RES_SHEPHERD_PRODUCTIVITY,
    op: 'mul',
    civ: 'Tatars',
    gather: true,
    apply: (m, v) => {
      m.sheepFoodMul *= v;
    },
    accepts: hasTatarShepherdContext,
    allows: (row) => hasTatarShepherdContext(row) === true,
  },
  {
    flag: 'mayanResource',
    civ: 'Mayans',
    gather: true,
    allows: hasMayanTreeContext,
  },
  {
    income: (_m, task, rate, scope) => extra('gold', polishStoneGold(scope.poles, task, rate)),
  },
];

/** 机器可检查的主表不变量；测试用它证明派生表不会静默丢渠道。 */
export function specialIncomeErrors(rules: readonly SpecialIncomeRule[] = SPECIAL_INCOME): string[] {
  const errors: string[] = [];
  const keys = new Set<string>();
  for (const [index, rule] of rules.entries()) {
    const label = rule.flag ?? `rule-${index}`;
    const key = `${rule.flag ?? ''}:${rule.res ?? ''}:${rule.op ?? ''}`;
    if (keys.has(key)) errors.push(`${label}: 重复渠道 ${key}`);
    keys.add(key);
    if ((rule.res === undefined) !== (rule.op === undefined)) errors.push(`${label}: res/op 必须成对`);
    if (rule.flag && !rule.allows) errors.push(`${label}: flag 条目缺少 allows`);
    if (rule.apply && (rule.res === undefined || rule.op === undefined)) errors.push(`${label}: apply 条目缺少 res/op`);
    if (rule.flag && rule.res !== undefined && rule.op && !rule.apply) errors.push(`${label}: flag+res+op 条目缺少 apply`);
    if (!rule.apply && !rule.accepts && !rule.allows && !rule.income) errors.push(`${label}: 没有任何 apply/accepts/allows/income`);
  }
  return errors;
}
