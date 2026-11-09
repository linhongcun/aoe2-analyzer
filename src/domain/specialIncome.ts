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
 * - 行放行：mayanResource（成本类 buildingWood / mayanWall 仍在 APPLICATION_RULES 的显式例外里）
 * 三张派生表（RESOURCE_APPLICATIONS / RESOURCE_HANDLERS / APPLICATION_RULES）只从这里取条目；
 * `classificationOnly` 的 res 269 / 268 也在派生表处显式列出。
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
