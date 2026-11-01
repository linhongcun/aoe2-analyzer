import { createElement, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useCore } from '../../data/hooks';
import { Icon } from './Icon';
import { feedbackUrl, siegeFeedbackText } from '../utils/feedback';

type Kind = 'bug' | 'data' | 'feature';

/** 报错/反馈入口：在新标签打开预填好的 GitHub issue */
export default function FeedbackLink({ compact, kind = 'data', label }: { compact?: boolean; kind?: Kind; label?: ReactNode }) {
  const { pathname } = useLocation();
  if (pathname === '/siege' || pathname === '/siege/') return <SiegeFeedbackLink compact={compact} kind={kind} label={label} />;
  return <FeedbackAnchor compact={compact} kind={kind} label={label} />;
}

/** 只在攻城页读取单位表，避免其它页面为了反馈预填去加载单位数据。 */
function useSiegeUnitName(): string | undefined {
  const { search } = useLocation();
  const core = useCore();
  const id = Number(new URLSearchParams(search).get('unit'));
  return Number.isInteger(id) ? core?.unitById[id]?.zh : undefined;
}

function SiegeFeedbackLink({ compact, kind, label }: { compact?: boolean; kind: Kind; label?: ReactNode }) {
  const unitName = useSiegeUnitName();
  return <FeedbackAnchor compact={compact} kind={kind} label={label} unitName={unitName} />;
}

/**
 * issue 581 旁注：离开本站前写出与 issue 555 预填相同的「名 / ID」。
 * 只包住名称和编号；「将附带：」在节点外。没有可附带上下文时不渲染。
 */
export function SiegeFeedbackNote() {
  const { pathname, search } = useLocation();
  const unitName = useSiegeUnitName();
  const label = siegeFeedbackText({ pathname, search, href: '', ua: '', unitName });
  if (!label) return null;
  const id = new URLSearchParams(search).get('unit') ?? '';
  const suffix = ` / ${id}`;
  const name = id && label.endsWith(suffix) ? label.slice(0, -suffix.length) : '';
  // 不用 JSX 换行，避免空白文本节点插进「将附带：」和「名 / ID」之间。
  const value = name ? [name, ' / ', createElement('span', { className: 'num' }, id)] : label;
  const context = createElement('span', { className: 'nw', 'data-testid': 'siege-feedback-context' }, value);
  return createElement('span', { className: 'fbctx' }, '将附带：', context);
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
