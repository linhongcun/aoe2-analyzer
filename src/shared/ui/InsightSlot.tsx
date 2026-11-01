import { useId } from 'react';
import type { InsightPart } from '../../domain/insights';

function InsightParts({ parts }: { parts: readonly InsightPart[] }) {
  return parts.map((part, index) => {
    if (typeof part === 'string') return <span key={index}>{part}</span>;
    if ('num' in part)
      return (
        <span key={index} className="num">
          {part.num}
        </span>
      );
    return (
      <span key={index} className="nw">
        <InsightParts parts={part.nw} />
      </span>
    );
  });
}

/** issue 584 单位页 / 文明页固定槽位。空着也留着这块；加条目只多一行。 */
export function InsightSlot({ items }: { items: readonly { id: string; parts: readonly InsightPart[] }[] }) {
  const headingId = useId();
  const filled = items.length > 0;
  return (
    <section className="insight-slot" data-testid="insight-slot" data-state={filled ? 'filled' : 'empty'} aria-labelledby={headingId}>
      <h2 id={headingId}>鲜为人知</h2>
      {filled ? (
        <ul className="insight-list" role="list">
          {items.map((item) => (
            <li key={item.id} className="insight-item" data-testid="insight-item">
              <InsightParts parts={item.parts} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="insight-empty" data-testid="insight-empty">
          暂无
        </p>
      )}
    </section>
  );
}
