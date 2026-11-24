/** 卡头常显的计入 / 未勾选 / 未计入，以及可折叠的一次研究说明。 */
import { costSum } from '../../../domain/duel';
import type { TrainingQuote } from '../../../domain/duelTrainingCost';
import { trainingLines } from '../logic/trainingCostView';

export function TrainingPrice({
  quote,
  sel,
  bud,
  count,
  batches,
  trainCount = 1,
}: {
  quote: TrainingQuote;
  sel: ReadonlySet<number>;
  bud: number;
  count: number | null;
  batches?: number | null;
  trainCount?: number;
}) {
  const { lines, notes } = trainingLines(quote, sel);
  const tc = Number.isInteger(trainCount) && trainCount > 1 ? trainCount : 1;
  const isPair = tc > 1;
  const effectiveBatches = batches !== undefined ? batches : count;
  const spent = (effectiveBatches ?? 0) * costSum(quote.price.cost);
  if (!lines.length && !notes.length && bud <= 0) return null;
  return (
    <div>
      {lines.map((line) =>
        line.kind === 'unsupported' ? (
          <div key={line.id} className="pk-miss" data-t="pk-miss">
            <p>{line.text}</p>
            <p className="pk-miss-state" data-t="pk-miss-state">
              {line.state === 'recorded' ? '已选择，仅记录' : '未选择'}
            </p>
          </div>
        ) : (
          <p
            key={line.id}
            className={line.kind === 'applied' ? (line.partial ? 'pk-bound is-partial' : 'pk-bound') : line.partial ? 'pk-open is-partial' : 'pk-open'}
            data-t={line.kind === 'applied' ? 'pk-accounted' : 'pk-available'}
            data-partial={line.partial ? 'true' : undefined}
          >
            {line.text}
          </p>
        ),
      )}
      {notes.length > 0 && (
        <details className="pk-cost-more" data-t="pk-cost-more">
          <summary>费用说明</summary>
          {notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </details>
      )}
      {bud > 0 && (
        <div className="pk-budget" data-t="pk-budget">
          <div className="pk-brow">
            <span>派出数量</span>
            <span className="pk-count-val" data-t="pk-count">
              <b className="num nw">{count ?? '—'}</b>
              {isPair && effectiveBatches !== null && effectiveBatches > 0 && (
                <span className="pk-count-batches num nw" data-t="pk-batches">
                  {effectiveBatches} 对
                </span>
              )}
              {count === 0 && (
                <span className="pk-under-one num nw" data-t="pk-under-one">
                  {isPair ? `不足 1 对（${tc} 只）` : '不足 1 个'}
                </span>
              )}
            </span>
          </div>
          <div className="pk-brow">
            <span>训练投入</span>
            <span className="num nw" data-t="pk-spent">
              {spent} / {bud}
            </span>
          </div>
          {isPair ? (
            <p className="note">
              按已选科技后的每对（<span className="num nw">{tc} 只</span>）训练价整对购买，不含一次研究费用。游戏里不能单买 <span className="num nw">1 只</span>
              ，派出数量总是偶数。
            </p>
          ) : (
            <p className="note">按已选科技后的每名训练价计算，不含一次研究费用。派出数量与卡头每名训练价是同一笔数。</p>
          )}
        </div>
      )}
    </div>
  );
}
