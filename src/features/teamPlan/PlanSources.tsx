import { TEAM_PLAN_CHECKED, TEAM_PLAN_COMPATIBILITY, TEAM_PLAN_SOURCES } from '../../domain/teamPlan';

export function Sources() {
  return (
    <section className="tp-sources">
      <h3>范例依据与核对日期</h3>
      <p>
        本站整理，原始资料核对日 <span className="num">{TEAM_PLAN_CHECKED}</span>。网页支持地图条件与协作思路，游戏资格只读固定{' '}
        <span className="num">DE{__DATA_SOURCES__.patch.build}</span> 数据。教学观点不代表胜率证据。
      </p>
      {TEAM_PLAN_COMPATIBILITY && (
        <p>
          本范例保留原始 <span className="num">DE{TEAM_PLAN_COMPATIBILITY.originalPatch}</span> 内容；
          <span className="num">{TEAM_PLAN_COMPATIBILITY.reviewedAt}</span> 已核对固定 <span className="num">DE{TEAM_PLAN_COMPATIBILITY.approvedPatch}</span>{' '}
          的文明资格、时代与生产前置兼容性，未作客户端实测。旧版本保存链接仍需显式重建。
        </p>
      )}
      {TEAM_PLAN_SOURCES.map((source) => (
        <div key={source.id}>
          <a href={source.url} target="_blank" rel="noreferrer">
            {source.title}
          </a>
          <p>
            {source.published} · {source.kind}。{source.claim}
          </p>
        </div>
      ))}
    </section>
  );
}
