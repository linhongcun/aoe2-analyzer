/**
 * issue 1368：单位 PK 排除零造价精锐钦察（1260 → 1233）与等资源/等采集时间零数量、零造价统一口径。
 * 纯函数，不依赖 React。
 */
import { costSum, countForBudget } from './duel';
import type { MixedDuelInput } from './mixedDuelParams';
import { countForTime, fmtClock } from './realCost';
import type { Cost } from './types';

const CUMAN_MERCENARY_KIPCHAK_ID = 1260;
const ELITE_KIPCHAK_ID = 1233;

export function isDuelExcludedUnit(uid: number): boolean {
  return uid === CUMAN_MERCENARY_KIPCHAK_ID;
}

export function replaceDuelUnitId(uid: number): number {
  return uid === CUMAN_MERCENARY_KIPCHAK_ID ? ELITE_KIPCHAK_ID : uid;
}

export const DUEL_UNIT_REPLACED_NOTE =
  '链接里的「精锐钦察（库曼雇佣兵）」是免费召唤单位，没有训练造价，单位 PK 不再提供；已换成城堡训练的精锐钦察，战斗属性相同。地址栏已写成实际使用的参数。';

export function formatMixedUnitReplacedNote(positions: readonly string[]): string {
  return `链接中 ${positions.join('、')} 的「精锐钦察（库曼雇佣兵）」是免费召唤单位，没有训练造价，单位 PK 不再提供；已换成城堡训练的精锐钦察，战斗属性相同。地址栏已写成实际使用的参数。`;
}

/**
 * 将混编链接中无冲突的 1260 行替换为 1233（数量不变），按 A → B、行号升序返回替换位置说明。
 * 若同侧已存在 1233 或出现多行 1260，为避免生成重复 ID 链接或静默改动受击行序，跳过该侧自动替换，交由配置校验明确提示。
 */
export function sanitizeMixedDuelUnits(input: MixedDuelInput): { input: MixedDuelInput; positions: string[] } {
  const positions: string[] = [];
  const excludedUid = String(CUMAN_MERCENARY_KIPCHAK_ID);
  const targetUid = String(ELITE_KIPCHAK_ID);
  const rewriteSide = (side: 'a' | 'b') => {
    const sideInput = input[side];
    const excludedCount = sideInput.rows.filter((row) => row.uid === excludedUid).length;
    if (!excludedCount) return sideInput;
    const hasTarget = sideInput.rows.some((row) => row.uid === targetUid);
    if (hasTarget || excludedCount > 1) return sideInput;
    const label = `${side.toUpperCase()} 方`;
    const rows = sideInput.rows.map((row, index) => {
      if (row.uid !== excludedUid) return row;
      positions.push(`${label}第 ${index + 1} 行`);
      return { ...row, uid: targetUid };
    });
    return { ...sideInput, rows };
  };
  const a = rewriteSide('a');
  const b = rewriteSide('b');
  if (!positions.length) return { input, positions };
  return { input: { ...input, a, b }, positions };
}

export interface DuelBudgetPart {
  text: string;
  num?: boolean;
}

type DuelBudgetErrorKind = 'zero-cost' | 'under-budget' | 'under-time';

interface DuelSideBudgetCount {
  /** 实际派出数量（预算/时间不足时为 0；零造价无法换算时为 null） */
  count: number | null;
  error: DuelBudgetErrorKind | null;
  unitCost: number;
  unitSec: number;
}

export function resolveSideBudgetCount(mode: 'r' | 't', cost: Cost, unitSec: number, budget: { bud: number; vils: number; mins: number }): DuelSideBudgetCount {
  const unitCost = costSum(cost);
  if (mode === 'r') {
    const count = countForBudget(cost, budget.bud);
    if (count === null) return { count: null, error: 'zero-cost', unitCost, unitSec };
    return { count, error: count < 1 ? 'under-budget' : null, unitCost, unitSec };
  }
  if (!Number.isFinite(unitCost) || unitCost <= 0 || !Number.isFinite(unitSec) || unitSec <= 0) {
    return { count: null, error: 'zero-cost', unitCost, unitSec };
  }
  const count = countForTime(unitSec, budget.vils, budget.mins);
  return { count, error: count < 1 ? 'under-time' : null, unitCost, unitSec };
}

interface DuelBudgetErrorSide {
  side: 'A' | 'B';
  unitName: string;
  resolved: DuelSideBudgetCount;
}

/** 构造群战错误框结构化正文（供界面按 .num.nw 渲染及测试逐字断言）；双方均 ≥ 1 时返回 null。 */
export function buildDuelBudgetErrorParts(
  a: DuelBudgetErrorSide,
  b: DuelBudgetErrorSide,
  budget: { bud: number; vils: number; mins: number },
): DuelBudgetPart[] | null {
  const clauses: DuelBudgetPart[][] = [];
  let hasUnderBudget = false;
  let hasUnderTime = false;
  for (const item of [a, b]) {
    const { error, unitCost, unitSec } = item.resolved;
    if (!error) continue;
    if (error === 'zero-cost') {
      clauses.push([{ text: `${item.side} 方的${item.unitName}没有训练造价，不能按资源预算换算` }]);
    } else if (error === 'under-budget') {
      hasUnderBudget = true;
      clauses.push([
        { text: `${item.side} 方预算 ` },
        { text: String(budget.bud), num: true },
        { text: ' 不够训练 ' },
        { text: '1 个', num: true },
        { text: `${item.unitName}（每名 ` },
        { text: String(unitCost), num: true },
        { text: '）' },
      ]);
    } else {
      hasUnderTime = true;
      clauses.push([
        { text: `${item.side} 方 ` },
        { text: `${budget.vils} 个村民`, num: true },
        { text: ' × ' },
        { text: fmtClock(budget.mins * 60), num: true },
        { text: ' 采不够 ' },
        { text: '1 个', num: true },
        { text: `${item.unitName}（` },
        { text: '1 个村民', num: true },
        { text: '需 ' },
        { text: fmtClock(unitSec), num: true },
        { text: '）' },
      ]);
    }
  }
  if (!clauses.length) return null;
  const parts: DuelBudgetPart[] = [];
  clauses.forEach((clause, index) => {
    if (index > 0) parts.push({ text: '；' });
    parts.push(...clause);
  });
  if (hasUnderBudget) {
    parts.push({ text: '。双方都至少要有 ' }, { text: '1 个', num: true }, { text: '单位才能开打，请调高预算。' });
  } else if (hasUnderTime) {
    parts.push({ text: '。双方都至少要有 ' }, { text: '1 个', num: true }, { text: '单位才能开打，请增加村民或分钟数。' });
  } else {
    parts.push({ text: '。' });
  }
  return parts;
}

export function formatDuelBudgetErrorText(parts: readonly DuelBudgetPart[]): string {
  return parts.map((part) => part.text).join('');
}
