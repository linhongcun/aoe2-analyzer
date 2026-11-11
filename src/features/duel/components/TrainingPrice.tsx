/** 卡头常显的计入 / 未勾选 / 未计入，以及可折叠的一次研究说明。 */
import { costSum } from '../../../domain/duel';
import type { TrainingQuote } from '../../../domain/duelTrainingCost';
import { trainingLines } from '../logic/trainingCostView';

export function TrainingPrice({ quote, sel, bud, count }: { quote: TrainingQuote; sel: ReadonlySet<number>; bud: number; count: number }) {
  const { lines, notes } = trainingLines(quote, sel);
  const spent = count * costSum(quote.price.cost);
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
          <p key={line.id} className={line.kind === 'applied' ? 'pk-bound' : 'pk-open'} data-t={line.kind === 'applied' ? 'pk-accounted' : 'pk-available'}>
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
            <span data-t="pk-count">
              <b className="num nw">{count}</b>
            </span>
          </div>
          <div className="pk-brow">
            <span>训练投入</span>
            <span className="num nw" data-t="pk-spent">
              {spent} / {bud}
            </span>
          </div>
          <p className="note">按已选科技后的每名训练价计算，不含一次研究费用。派出数量与卡头每名训练价是同一笔数。</p>
        </div>
      )}
    </div>
  );
}
