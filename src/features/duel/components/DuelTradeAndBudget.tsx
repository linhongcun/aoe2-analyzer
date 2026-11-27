/** 群战结果内的等资源预算摘要与交换比区块（从 DuelResults 抽离，支持成对训练口径 issue 1384）。 */
import { costSum } from '../../../domain/duel';
import { formatTrade, tradeLosses } from '../../../domain/trade';
import { batchesForQty, ceilToBatch, isPairTrained, unitTrainCount } from '../../../domain/trainBatch';
import type { Unit } from '../../../domain/types';
import { CostView } from '../../../shared/ui/art';
import { PairHintLine } from '../../../shared/ui/PairTrainingHint';
import { isUnavail, type Resolved, type SideState } from '../logic/duelSide';

/** N vs M 模式下由非成对单位切入成对单位时向上取最近偶数；其余切换与参数改动保留原数量。 */
export function pairBatchQtyPatch(mode: string, k: 'a' | 'b', prevUnit: Unit, nextUnit: Unit | undefined, qty: number): Record<string, string> {
  if (mode !== 'n' || isPairTrained(prevUnit) || !isPairTrained(nextUnit)) return {};
  return { [k === 'a' ? 'na' : 'nb']: String(ceilToBatch(qty, unitTrainCount(nextUnit), 200)) };
}

/** N vs M 模式下成对单位在场数为奇数时的提示行（不打断输入栏 Tab 序，360px 独立换行）。仅对数量合法的一侧渲染。 */
export function DuelNPairHints({ A, B, na, nb }: { A: SideState; B: SideState; na: number | null; nb: number | null }) {
  const oddSides = (
    [
      ['A', A, na],
      ['B', B, nb],
    ] as const
  ).filter((entry): entry is readonly ['A' | 'B', SideState, number] => {
    const [, side, qty] = entry;
    return qty !== null && !isUnavail(side) && unitTrainCount(side.u) > 1 && Math.floor(qty) % unitTrainCount(side.u) !== 0;
  });
  if (!oddSides.length) return null;
  return (
    <div className="duel-n-pair-hints" data-t="duel-n-pair-hints">
      {oddSides.map(([label, side, qty]) => (
        <PairHintLine key={label} dataT={`duel-n-pair-hint-${label.toLowerCase()}`}>
          {oddSides.length > 1 ? `${label} 方：` : ''}游戏里只能成对训练；带入训练总价时按{' '}
          <span className="num nw">{batchesForQty(Math.floor(qty), unitTrainCount(side.u))} 对</span>计费。
        </PairHintLine>
      ))}
    </div>
  );
}

export function BudgetSummary({ A, B, na, nb, bud }: { A: Resolved; B: Resolved; na: number; nb: number; bud: number }) {
  if (bud <= 0) return null;
  return (
    <p className="note" data-t="pk-budget-summary">
      预算 <span className="num nw">{bud}</span>：
      {(
        [
          ['A', A, na],
          ['B', B, nb],
        ] as const
      ).map(([key, side, count]) => {
        const tc = unitTrainCount(side.u);
        const isPair = tc > 1;
        const unitCost = costSum(side.training.price.cost);
        const batches = isPair ? batchesForQty(count, tc) : count;
        const spent = batches * unitCost;
        return (
          <span key={key}>
            {' '}
            {key} {side.u.zh} <span className="num nw">× {count}</span>（
            {isPair ? (
              <>
                每对 <span className="num nw">{unitCost}</span>，<span className="num nw">{batches} 对</span>，投入 <span className="num nw">{spent}</span>
              </>
            ) : (
              <>
                单价 <span className="num nw">{unitCost}</span>，投入 <span className="num nw">{spent}</span>
              </>
            )}
            ）
          </span>
        );
      })}
    </p>
  );
}

/** issue 107 / issue 1384 交换比：只计阵亡单位，按单只折算价；金按 1:1 计入 */
export function TradeRow({ A, B, na, nb, aAlive, bAlive }: { A: Resolved; B: Resolved; na: number; nb: number; aAlive: number; bAlive: number }) {
  const t = tradeLosses({
    na,
    nb,
    aAlive,
    bAlive,
    costA: A.training.price.cost,
    costB: B.training.price.cost,
    trainCountA: unitTrainCount(A.u),
    trainCountB: unitTrainCount(B.u),
  });
  const f = formatTrade(t);
  return (
    <div className="pk-trade" data-t="pk-trade">
      <p className="pk-trade-main">
        {f.label}{' '}
        <b className="pk-trade-value" data-t="pk-trade-value">
          {f.value}
        </b>
      </p>
      {f.note && <p className="note">{f.note}</p>}
      {(['a', 'b'] as const).map((k) => (
        <p key={k} className="note pk-trade-loss" data-t={`pk-trade-loss-${k}`}>
          <span className="num nw">
            {k.toUpperCase()} 损失 {t[k].total}
          </span>
          （阵亡 <span className="num nw">{t[k].dead}</span>
          {t[k].dead > 0 && (
            <>
              ：<CostView c={t[k].res} />
            </>
          )}
          ）
        </p>
      ))}
      <p className="note">只计阵亡单位，存活单位掉的血不算；金按 1:1 计入。</p>
    </div>
  );
}
