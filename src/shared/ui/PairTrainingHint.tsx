import type { ReactNode } from 'react';

/** 成对训练中性胶囊标签（口径说明，不使用强调色或警示色）。 */
export function PairBadge({ children, dataT }: { children: ReactNode; dataT?: string }) {
  return (
    <span className="pair-badge num nw" data-t={dataT}>
      {children}
    </span>
  );
}

/** 通用成对训练说明行：行首胶囊标签 + 正文说明。 */
export function PairHintLine({
  badge = '成对训练',
  children,
  className,
  dataT,
}: {
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
  dataT?: string;
}) {
  return (
    <p className={className ? `pair-hint ${className}` : 'pair-hint'} data-t={dataT}>
      <PairBadge>{badge}</PairBadge>
      <span>{children}</span>
    </p>
  );
}

/** 训练总价与阵容新增费用共用的奇数只向上整对计费提示行。 */
export function PairOddBillingHint({ qty, batches, delivered, dataT }: { qty: number; batches: number; delivered: number; dataT?: string }) {
  return (
    <PairHintLine dataT={dataT}>
      填了 <span className="num nw">{qty} 只</span>：按 <span className="num nw">{batches} 对</span>计费，实得 <span className="num nw">{delivered} 只</span>。
    </PairHintLine>
  );
}
