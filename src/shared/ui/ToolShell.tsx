import type { ReactNode } from 'react';
import { ToolRelated, type ToolRelatedLink } from './ToolPageHeader';
import './toolShell.css';

/** 首屏双栏：左条件、右结果。≤1023px 改为单栏，条件在前。 */
export function ToolGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={['tool-grid', className].filter(Boolean).join(' ')}>{children}</div>;
}

/** 示例提示。必须带文字标签，不能做成结果卡。 */
export function ToolExample({ children, className, testId }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <aside className={['tool-example', className].filter(Boolean).join(' ')} aria-label="示例" data-testid={testId}>
      <span className="tool-example-tag">示例</span>
      {children}
    </aside>
  );
}

/** 双栏和通栏结果之后的口径说明与相关工具。 */
export function ToolFooter({ children, related }: { children?: ReactNode; related?: { label?: string; links: ToolRelatedLink[] } }) {
  const links = related?.links ?? [];
  if (children == null && links.length === 0) return null;
  return (
    <div className="tool-foot">
      {children != null && children !== false && <div className="tool-foot-notes">{children}</div>}
      {links.length > 0 && <ToolRelated label={related?.label} links={links} />}
    </div>
  );
}
