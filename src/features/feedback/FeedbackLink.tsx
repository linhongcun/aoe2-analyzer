import { useLocation } from 'react-router-dom';
import { Icon } from '../../shared/ui/Icon';
import { feedbackUrl } from './feedback';

/** 报错/反馈入口：在新标签打开预填好的 GitHub issue */
export default function FeedbackLink({ compact, kind = 'data' }: { compact?: boolean; kind?: 'bug' | 'data' | 'feature' }) {
  const { pathname, search } = useLocation();
  const href = feedbackUrl(
    { pathname, search, href: typeof location === 'undefined' ? pathname : location.href, ua: typeof navigator === 'undefined' ? '' : navigator.userAgent },
    kind,
  );
  return (
    <a
      className={compact ? 'fbbtn' : 'fblink'}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-t="feedback"
      title="报错/反馈：在 GitHub 提交问题（自动附带页面与数据版本）"
    >
      <Icon name={kind === 'feature' ? 'lightbulb' : kind === 'data' ? 'message-square-warning' : 'bug'} />
      {kind === 'feature' ? '功能建议' : '报错/反馈'}
    </a>
  );
}
