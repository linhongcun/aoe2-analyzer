import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useCore } from '../../data/hooks';
import { Icon } from './Icon';
import { feedbackUrl } from '../utils/feedback';

type Kind = 'bug' | 'data' | 'feature';

/** 报错/反馈入口：在新标签打开预填好的 GitHub issue */
export default function FeedbackLink({ compact, kind = 'data', label }: { compact?: boolean; kind?: Kind; label?: ReactNode }) {
  const { pathname } = useLocation();
  if (pathname === '/siege' || pathname === '/siege/') return <SiegeFeedbackLink compact={compact} kind={kind} label={label} />;
  return <FeedbackAnchor compact={compact} kind={kind} label={label} />;
}

/** 只在攻城页读取单位表，避免其它页面为了反馈预填去加载单位数据。 */
function SiegeFeedbackLink({ compact, kind, label }: { compact?: boolean; kind: Kind; label?: ReactNode }) {
  const { search } = useLocation();
  const core = useCore();
  const id = Number(new URLSearchParams(search).get('unit'));
  const unitName = Number.isInteger(id) ? core?.unitById[id]?.zh : undefined;
  return <FeedbackAnchor compact={compact} kind={kind} label={label} unitName={unitName} />;
}

function FeedbackAnchor({ compact, kind, label, unitName }: { compact?: boolean; kind: Kind; label?: ReactNode; unitName?: string }) {
  const { pathname, search } = useLocation();
  const href = feedbackUrl(
    {
      pathname,
      search,
      href: typeof location === 'undefined' ? pathname : location.href,
      ua: typeof navigator === 'undefined' ? '' : navigator.userAgent,
      unitName,
    },
    kind,
  );
  return (
    <a
      className={compact ? 'fbbtn' : 'fblink'}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-t={kind === 'feature' ? 'feature' : 'feedback'}
      title={kind === 'feature' ? '功能建议：在 GitHub 提交想法' : '报错/反馈：在 GitHub 提交问题（自动附带页面与数据版本）'}
    >
      <Icon name={kind === 'feature' ? 'lightbulb' : kind === 'data' ? 'message-square-warning' : 'bug'} />
      {label ?? (kind === 'feature' ? '功能建议' : '报错/反馈')}
    </a>
  );
}
