import type { ReactNode } from 'react';

/** 摘要四格总包一层，对比行（#42）和文明附注都在结构上排在四格下面，不参与外层 flex */
export function TimelineSummary({ extra, children }: { extra: string | null; children: ReactNode }) {
  return (
    <div className="tl-sum-main">
      {children}
      {extra && (
        <p className="tl-cmp" data-t="sum-compare">
          {extra.split(/(?<=·)\s*/).flatMap((x, i) => [...(i ? [' '] : []), <span key={i}>{x}</span>])}
        </p>
      )}
    </div>
  );
}
