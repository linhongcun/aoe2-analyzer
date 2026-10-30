import { reviewNavigationChanges, type ReviewNavigationPreview, type ReviewSourceKey } from '../../domain/reviewNavigation531';
import type { MatchReviewDraft } from '../../domain/matchReview';
import { Icon } from '../../shared/ui/Icon';

interface SourceProps {
  draft: MatchReviewDraft;
  preview: ReviewNavigationPreview;
  blocked: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}
const labels: Record<ReviewSourceKey, string> = { selfCiv: '本方文明', opponentCiv: '对方文明', link: '分析来源链接' };

export function ReviewNavigationSource({ draft, preview, blocked, onConfirm, onCancel }: SourceProps) {
  const changes = reviewNavigationChanges(draft, preview);
  const fields = (Object.keys(labels) as ReviewSourceKey[]).filter((key) => !!preview.context[key]);
  return (
    <section className="mr-panel mr-source-preview" aria-labelledby="mr-source-heading" data-testid="review-source-preview">
      <h2 id="mr-source-heading">
        <Icon name="git-branch" />
        从分析继续记录
      </h2>
      <p>先核对要补入的上下文。文明来自原对局选择，分析方案不代表实战事实；地图、版本和观察仍由你填写。</p>
      <dl className="mr-source-fields">
        {fields.map((key) => (
          <div key={key}>
            <dt>{labels[key]}</dt>
            <dd>
              {key === 'link' ? (
                <a href={preview.context.link} target="_blank" rel="noopener noreferrer">
                  查看来源方案
                </a>
              ) : (
                <span>{preview.context[key]}</span>
              )}
              <small>{changes.includes(key) ? '将补入空白字段' : '已有内容，保留原记录'}</small>
            </dd>
          </div>
        ))}
      </dl>
      {preview.warning && <p className="mr-warning">{preview.warning}</p>}
      <p className="note">确认后只补入上面列出的空白字段。来源链接使用现有“比赛或视频链接”字段；事件、唯一目标和跟进尝试均保留。</p>
      {blocked ? (
        <p className="mr-warning">请先处理本机草稿的保存暂停，再决定带入。来源尚未加入本页草稿。</p>
      ) : (
        !changes.length && <p className="note">没有可补入的空白字段，当前草稿保持不变。</p>
      )}
      <div className="mr-actions">
        <button type="button" disabled={blocked || !changes.length} onClick={onConfirm}>
          仅补入空白上下文字段
        </button>
        <button type="button" onClick={onCancel}>
          取消带入
        </button>
      </div>
    </section>
  );
}
