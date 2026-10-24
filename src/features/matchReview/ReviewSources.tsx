import { matchReviewContent } from '../../domain/matchReview';

function ReviewNote({ text }: { text: string }) {
  return text.split(/(\d{4}-\d{2}-\d{2})/g).map((part, index) =>
    index % 2 ? (
      <span className="mr-number" key={index}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export function ReviewSources() {
  return (
    <details className="mr-panel" data-testid="scope-sources">
      <summary>适用范围与来源</summary>
      <p>{matchReviewContent.scope}</p>
      <p className="mr-boundary">{matchReviewContent.boundary}</p>
      <p>
        核对日期：<span className="mr-number">{matchReviewContent.checkedAt}</span>
        。原始问题来自围绕 YouTube 学习的 Reddit 问答；没有读取 YouTube 评论。引导是本站整理，不采用旧游戏数值或能力承诺。
      </p>
      <ul>
        {matchReviewContent.sources.map((source) => (
          <li key={source.id}>
            <a href={source.url} target="_blank" rel="noopener noreferrer">
              {source.title}
            </a>
            <p className="note">
              <ReviewNote text={source.note} />
            </p>
          </li>
        ))}
      </ul>
      <p>游戏版本由你记录，不默认认定录像使用本站数据版本。可以复盘胜局或败局，不预设你一定犯错，也不自动给出原因。</p>
      <p>自报结果不等于水平提升。未评估和无法判断不会被自动算成失败，不展示成功率。</p>
      <p>不上传或解析录像，不读取游戏、截图或视频，不自动统计闲置/APM/资源，不生成败因、最优打法或 Elo 评价。</p>
    </details>
  );
}
